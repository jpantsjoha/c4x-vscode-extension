#!/usr/bin/env node

// Installed-VSIX acceptance journey (#79).
//
// Drives the packaged c4x-<version>.vsix -- not the dev build -- through the
// installed acceptance journeys tracked in #79:
//
//   1. install the VSIX into an isolated VS Code profile (pinned version);
//   2. launch that VS Code through Playwright's Electron driver, with a
//      test-only bridge extension (test/vsix-uat/host) that reads document
//      text and runs commands, and nothing else;
//   3. click, drag and type in the real workbench and the real C4X webview;
//   4. close and relaunch the same profile to check persistence;
//   5. write a JSON receipt and screenshots for every step.
//
// What this cannot judge -- visual quality, keyboard feel, OS print dialogs,
// architect and technical-writer opinion -- is reported as NEEDS HUMAN with
// the exact manual instruction, never as a pass.
//
// Known product defects are listed in KNOWN_FAILURES and reported as
// KNOWN FAIL. The run exits 0 when every other step passes, and non-zero on
// an unexpected FAIL, on an UNEXPECTED PASS of a known failure (delete its
// entry: the defect looks fixed), or on a HARNESS ERROR. receipt.json is
// written in every case, including Ctrl+C (SIGINT), SIGHUP and SIGTERM, and the
// VS Code process tree and the temporary profile are removed.
//
// Linux needs a display: xvfb-run -a -s "-screen 0 1920x1080x24" make test-vsix-uat
//
// Environment:
//   C4X_UAT_VSIX         the .vsix to install (default ./c4x-<version>.vsix,
//                        which `make test-vsix-uat` rebuilds first); run
//                        `node scripts/test-vsix-installed-uat.js` directly to
//                        test a downloaded package without rebuilding
//   C4X_UAT_OUTPUT_DIR   where the receipt and screenshots go
//                        (default .tmp/installed-uat/<timestamp>)
//   C4X_VSCODE_VERSION   override the pinned VS Code version
//   C4X_KEEP_UAT_PROFILE=1  keep the temporary profile for inspection

'use strict';

const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { downloadAndUnzipVSCode, runVSCodeCommand } = require('@vscode/test-electron');
const { _electron: electron } = require('@playwright/test');

const projectRoot = path.resolve(__dirname, '..');
const packageJson = require(path.join(projectRoot, 'package.json'));
// C4X_UAT_VSIX points at a different package, for example the Marketplace
// download, so the walkthrough can run against the artefact users install.
const vsixPath = path.resolve(process.env.C4X_UAT_VSIX
  || path.join(projectRoot, `${packageJson.name}-${packageJson.version}.vsix`));
const vscodeVersion = process.env.C4X_VSCODE_VERSION || packageJson.c4xToolchain.vscode;
const cachePath = process.env.C4X_VSCODE_TEST_CACHE || path.join(os.tmpdir(), 'c4x-vscode-test-cache');
const extensionId = `${packageJson.publisher}.${packageJson.name}`;

// The version under test is the version of the VSIX that gets installed, which
// is not the checkout's version when C4X_UAT_VSIX points at another package.
function readVsixVersion(file) {
  let raw;
  try {
    raw = execFileSync('unzip', ['-p', file, 'extension/package.json'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  } catch {
    raw = execFileSync('tar', ['-xOf', file, 'extension/package.json'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  }
  const manifest = JSON.parse(raw);
  assert.ok(typeof manifest.version === 'string' && manifest.version, `${file} has no extension/package.json version`);
  return manifest.version;
}
let expectedVersion;
const bridgeHost = path.join(projectRoot, 'test', 'vsix-uat', 'host');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = path.resolve(process.env.C4X_UAT_OUTPUT_DIR
  || path.join(projectRoot, '.tmp', 'installed-uat', stamp));

const NATIVE_SOURCE = [
  '%%{ c4: container }%%',
  'graph TB',
  'Person(Customer, "Customer", "Browser")',
  'SoftwareSystem(Identity, "Identity service", "Go", "Authenticates customers")',
  'subgraph Portal {',
  '    Container(Web, "Web application", "React", "Customer-facing UI")',
  '    Container(Api, "API", "Node.js", "Application API", $tags="Internal")',
  '    ContainerDb(Database, "Customer database", "PostgreSQL", "Stores customer data")',
  '}',
  'Customer -->|Uses| Web',
  'Web -->|Calls| Api',
  'Api -->|Reads and writes| Database',
  'Api -->|Authenticates with| Identity',
  '',
].join('\n');

const MARKDOWN_SOURCE = [
  '# Architecture',
  '',
  'The first diagram is context only and must not change.',
  '',
  '```c4x',
  '%%{ c4: system-context }%%',
  'graph TB',
  'Person(Reader, "Reader", "Reads the docs")',
  'System(Docs, "Docs site", "Publishes architecture")',
  'Reader -->|Reads| Docs',
  '```',
  '',
  'The second diagram is the one the journey edits.',
  '',
  '```c4x',
  '%%{ c4: container }%%',
  'graph TB',
  'Person(Author, "Author", "Writes docs")',
  'Container(Editor, "Editor", "VS Code", "Edits Markdown")',
  'ContainerDb(Store, "Store", "Git", "Keeps history")',
  'Author -->|Uses| Editor',
  'Editor -->|Commits to| Store',
  '```',
  '',
  'Closing paragraph that must not change.',
  '',
].join('\n');

// ── Known product defects ───────────────────────────────────────────────────

// Steps that fail today because of an open C4X issue, not because of this
// harness. They are reported as KNOWN FAIL and do not fail the run. When the
// fix lands the step passes, the run reports UNEXPECTED PASS and exits
// non-zero: delete that step's line here in the same pull request.
// `expect` is the failure message the defect produces. A step that fails with
// any other message is a plain FAIL: a known defect must not hide a new one.
const KNOWN_FAILURES = {
  // 'J1.3c': { issue: 250, expect: /message the defect produces/, note: 'what is wrong' },
};

// ── Receipt ─────────────────────────────────────────────────────────────────

const results = [];
const harnessErrors = [];
let shotCounter = 0;
let finalized = false;

function record(entry) {
  if (finalized) { return; }
  results.push(entry);
  const tag = entry.status.padEnd(15);
  let detail = '';
  if (entry.status === 'FAIL') { detail = ` -- ${entry.observed}`; }
  if (entry.status === 'KNOWN FAIL') { detail = ` -- #${entry.issue}: ${entry.observed}`; }
  if (entry.status === 'UNEXPECTED PASS') { detail = ` -- ${entry.action}`; }
  if (entry.status === 'HARNESS ERROR') { detail = ` -- ${entry.observed}`; }
  console.log(`[${tag}] ${entry.id} ${entry.title}${detail}`);
}

function errorText(error) {
  return error instanceof Error ? error.message.split('\n').slice(0, 6).join(' ') : String(error);
}

/** An error outside any step: the run cannot vouch for what it skipped. */
function harnessError(where, error) {
  const message = errorText(error);
  harnessErrors.push({ where, message });
  record({ id: 'HARNESS', journey: null, title: `Harness error during ${where}`, status: 'HARNESS ERROR', how: 'harness', observed: message });
}

function needsHuman(id, journey, title, instructions, automatedEvidence) {
  record({ id, journey, title, status: 'NEEDS HUMAN', how: 'manual', observed: automatedEvidence || '', instructions });
}

// Capture failures of the step now running. A screenshot is the evidence for a
// step, so a capture that fails is never silently dropped: `step` reads this.
let captureErrors = [];

async function shoot(win, name) {
  shotCounter += 1;
  if (!win) {
    captureErrors.push(`${name}: no window to capture`);
    return undefined;
  }
  const file = `${String(shotCounter).padStart(2, '0')}-${name}.png`;
  try {
    await win.screenshot({ path: path.join(outputDir, file) });
    return file;
  } catch (error) {
    captureErrors.push(`${name}: ${errorText(error)}`);
    return undefined;
  }
}

async function step(ctx, id, journey, title, how, fn, { windowless = false } = {}) {
  const known = KNOWN_FAILURES[id];
  captureErrors = [];
  try {
    const outcome = await fn();
    const screenshot = outcome && outcome.screenshot ? outcome.screenshot : (windowless ? undefined : await shoot(ctx.win, id));
    const observed = outcome && outcome.observed ? outcome.observed : '';
    if (captureErrors.length > 0) {
      // The step's assertions held but its evidence is missing: the run
      // cannot vouch for it, whatever else is true.
      const missing = `screenshot capture failed (${captureErrors.join('; ')})`;
      harnessErrors.push({ where: `step ${id}`, message: missing });
      record({ id, journey, title, status: 'HARNESS ERROR', how, observed: `${observed ? `${observed}; ` : ''}${missing}`, screenshot, screenshotMissing: [...captureErrors] });
      return true;
    }
    if (known) {
      record({
        id, journey, title, status: 'UNEXPECTED PASS', how, observed, screenshot, issue: known.issue,
        action: `listed as a known failure of #${known.issue}, but it passed. If #${known.issue} is fixed, delete the '${id}' line from KNOWN_FAILURES in scripts/test-vsix-installed-uat.js`,
      });
    } else {
      record({ id, journey, title, status: 'PASS', how, observed, screenshot });
    }
    return true;
  } catch (error) {
    const screenshot = windowless ? undefined : await shoot(ctx.win, `${id}-failure`);
    let observed = errorText(error);
    // The original result stands; a missing capture is noted next to it.
    const missingShots = captureErrors.length > 0 ? [...captureErrors] : undefined;
    const extra = missingShots ? { screenshotMissing: missingShots } : {};
    const note = missingShots ? ` [screenshot capture failed: ${missingShots.join('; ')}]` : '';
    if (known && known.expect.test(observed)) {
      record({ id, journey, title, status: 'KNOWN FAIL', how, observed: observed + note, screenshot, issue: known.issue, note: known.note, ...extra });
    } else if (known) {
      observed = `${observed} (not the expected failure of #${known.issue}, which matches ${known.expect})`;
      record({ id, journey, title, status: 'FAIL', how, observed: observed + note, screenshot, ...extra });
    } else {
      record({ id, journey, title, status: 'FAIL', how, observed: observed + note, screenshot, ...extra });
    }
    return false;
  }
}

// ── VS Code, profile and bridge ─────────────────────────────────────────────

async function runCli(args) {
  const result = await runVSCodeCommand(args, { version: vscodeVersion, cachePath, spawn: { cwd: projectRoot } });
  return result.stdout;
}

function writeSettings(userDataDir) {
  const userDir = path.join(userDataDir, 'User');
  fs.mkdirSync(userDir, { recursive: true });
  fs.writeFileSync(path.join(userDir, 'settings.json'), JSON.stringify({
    // In-workbench file dialogs instead of the OS dialog, so export and
    // save locations can be typed by the driver. The C4X code path is the
    // same showSaveDialog call either way.
    'files.simpleDialog.enable': true,
    'security.workspace.trust.enabled': false,
    'workbench.startupEditor': 'none',
    'workbench.secondarySideBar.defaultVisibility': 'hidden',
    'chat.disableAIFeatures': true,
    'update.mode': 'none',
    'extensions.autoCheckUpdates': false,
    'extensions.autoUpdate': false,
    'telemetry.telemetryLevel': 'off',
    'window.restoreWindows': 'none',
    'files.hotExit': 'off',
    'editor.codeLens': true,
    'git.enabled': false,
  }, null, 2));
}

async function launch(ctx, label) {
  if (fs.existsSync(ctx.bridgeFile)) { fs.rmSync(ctx.bridgeFile); }
  const args = [
    '--disable-gpu',
    '--skip-welcome',
    '--skip-release-notes',
    '--disable-workspace-trust',
    `--extensions-dir=${ctx.extensionsDir}`,
    `--user-data-dir=${ctx.userDataDir}`,
    `--extensionDevelopmentPath=${bridgeHost}`,
    ctx.workspaceDir,
  ];
  if (process.platform === 'linux' && typeof process.getuid === 'function' && process.getuid() === 0) {
    args.unshift('--no-sandbox');
  }
  const app = await electron.launch({
    executablePath: ctx.vscodeExecutablePath,
    args,
    env: { ...process.env, C4X_UAT_BRIDGE_FILE: ctx.bridgeFile },
    timeout: 90_000,
  });
  // Recorded before anything else can throw, so cleanup can always find it.
  ctx.app = app;
  ctx.vscodePids.add(app.process().pid);
  const win = await app.firstWindow();
  await win.waitForSelector('.monaco-workbench', { timeout: 90_000 });
  // A bigger window keeps the editor and the preview side by side readable.
  await app.evaluate(({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();
    if (window) { window.setSize(1900, 1060); window.setPosition(0, 0); }
  }).catch(() => undefined);
  const deadline = Date.now() + 60_000;
  while (!fs.existsSync(ctx.bridgeFile)) {
    if (Date.now() > deadline) { throw new Error(`UAT bridge did not start (${label})`); }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  ctx.bridge = JSON.parse(fs.readFileSync(ctx.bridgeFile, 'utf8'));
  ctx.app = app;
  ctx.win = win;
  await win.waitForTimeout(1500);
  await dismissNotifications(ctx);
}

async function bridge(ctx, endpoint, body = {}) {
  const response = await fetch(`http://127.0.0.1:${ctx.bridge.port}/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-c4x-uat-token': ctx.bridge.token },
    body: JSON.stringify(body),
    // A modal dialog blocks a command; fail the step instead of hanging.
    signal: AbortSignal.timeout(60_000),
  });
  const payload = await response.json();
  if (!payload.ok) { throw new Error(`bridge ${endpoint}: ${payload.error}`); }
  return payload.value;
}

/** Closes VS Code; if it does not close within 20 s, kills its process tree. */
async function closeApp(ctx) {
  if (!ctx.app) { return; }
  const app = ctx.app;
  ctx.app = undefined;
  ctx.win = undefined;
  const closed = await Promise.race([
    app.close().then(() => true),
    new Promise(resolve => setTimeout(() => resolve(false), 20_000)),
  ]).catch(() => false);
  if (!closed) { console.warn('VS Code did not close within 20 s; killing its process tree.'); }
  // Also sweeps helpers that outlived a clean close, before a relaunch or
  // the profile removal: a surviving process would recreate the profile.
  killVSCode(ctx);
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Every live process as { pid, ppid, pgid, args }; zombies are dead. */
function listProcesses() {
  const out = execFileSync('ps', ['-A', '-ww', '-o', 'pid=,ppid=,pgid=,stat=,args='], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return out.split('\n').flatMap(line => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(line);
    if (!match || match[4].startsWith('Z')) { return []; }
    return [{ pid: Number(match[1]), ppid: Number(match[2]), pgid: Number(match[3]), args: match[5] }];
  });
}

/**
 * True for a VS Code process of this run's profile. Matches the profile's own
 * --user-data-dir= / --extensions-dir= argument (the main process, helpers and
 * the install CLI all carry one), or a process of the VS Code executable's
 * directory (the crash handler) whose command line names the profile. A bare
 * substring match would also catch an editor or shell that merely has a file
 * of the profile open on its command line.
 */
function isRunProcess(args, ctx) {
  if (!ctx.tempRoot) { return false; }
  for (const [flag, dir] of [['--user-data-dir=', ctx.userDataDir], ['--extensions-dir=', ctx.extensionsDir]]) {
    if (!dir) { continue; }
    const needle = `${flag}${dir}`;
    for (let from = args.indexOf(needle); from !== -1; from = args.indexOf(needle, from + 1)) {
      const next = args[from + needle.length];
      // The path must end here: not a longer sibling directory.
      if (next === undefined || /[\s/]/.test(next)) { return true; }
    }
  }
  const vscodeDir = ctx.vscodeExecutablePath ? path.dirname(ctx.vscodeExecutablePath) + path.sep : undefined;
  return Boolean(vscodeDir) && args.startsWith(vscodeDir) && args.includes(ctx.tempRoot);
}

/**
 * Kills every VS Code process this run started -- the Electron main process,
 * its process group (Playwright launches it as a group leader), its
 * descendants, and any VS Code process of this run's temporary
 * profile (the install CLI, helpers that re-parented) -- and waits until
 * they are gone. Synchronous, so the signal handlers can use it.
 * Returns the number of processes it had to kill.
 */
function killVSCode(ctx) {
  if (process.platform === 'win32') {
    for (const pid of ctx.vscodePids) {
      try { execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ }
    }
    ctx.vscodePids.clear();
    return 0;
  }
  const known = new Set(ctx.vscodePids);
  const killed = new Set();
  const deadline = Date.now() + 15_000;
  for (;;) {
    let procs;
    try { procs = listProcesses(); } catch (error) {
      console.warn(`Could not list processes: ${errorText(error)}`);
      return killed.size;
    }
    // Grow the set: group members, children of known processes, and
    // processes naming the profile. Repeat until it stops growing.
    let grew = true;
    while (grew) {
      grew = false;
      for (const proc of procs) {
        if (proc.pid === process.pid || known.has(proc.pid)) { continue; }
        if (ctx.vscodePids.has(proc.pgid) || known.has(proc.ppid) || isRunProcess(proc.args, ctx)) {
          known.add(proc.pid);
          grew = true;
        }
      }
    }
    const alive = procs.filter(proc => known.has(proc.pid));
    if (alive.length === 0) {
      // All gone: forget the ids so a later sweep cannot hit a reused one.
      ctx.vscodePids.clear();
      return killed.size;
    }
    if (Date.now() > deadline) {
      throw new Error(`VS Code processes survived SIGKILL: ${alive.map(proc => proc.pid).join(', ')}`);
    }
    for (const pgid of ctx.vscodePids) {
      try { process.kill(-pgid, 'SIGKILL'); } catch { /* no such group */ }
    }
    for (const proc of alive) {
      try { process.kill(proc.pid, 'SIGKILL'); killed.add(proc.pid); } catch { /* already gone */ }
    }
    sleepSync(200);
  }
}

/**
 * Removes the temporary profile once nothing can write to it. Retries on
 * ENOTEMPTY/EBUSY, then checks that no surviving process recreated it.
 */
function removeProfile(ctx) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    killVSCode(ctx);
    try {
      fs.rmSync(ctx.tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (error) {
      lastError = error;
    }
    sleepSync(500);
    if (!fs.existsSync(ctx.tempRoot)) { return; }
  }
  throw new Error(`could not remove the temporary profile ${ctx.tempRoot}${lastError ? `: ${errorText(lastError)}` : ''}`);
}

async function dismissNotifications(ctx) {
  await runPalette(ctx, 'Notifications: Clear All Notifications').catch(() => undefined);
}

async function runPalette(ctx, title) {
  const { win } = ctx;
  await win.keyboard.press('Escape');
  await win.keyboard.press('F1');
  const input = win.locator('.quick-input-widget input');
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  await input.fill(`>${title}`);
  const row = win.locator('.quick-input-widget .monaco-list-row', { hasText: title }).first();
  await row.waitFor({ state: 'visible', timeout: 10_000 });
  await win.keyboard.press('Enter');
}

// ── Webview helpers ─────────────────────────────────────────────────────────

/** All live C4X preview frames, newest last. */
async function previewFrames(win) {
  const frames = [];
  for (const frame of win.frames()) {
    if (!frame.url().startsWith('vscode-webview://')) { continue; }
    const count = await frame.locator('#toggle-layout').count().catch(() => 0);
    if (count > 0) { frames.push(frame); }
  }
  return frames;
}

async function waitForPreview(win, { exclude = [], timeout = 30_000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const frames = (await previewFrames(win)).filter(frame => !exclude.includes(frame));
    for (const frame of frames.reverse()) {
      const nodes = await frame.locator('#svg-container svg g.node').count().catch(() => 0);
      if (nodes > 0) { return frame; }
    }
    await win.waitForTimeout(250);
  }
  throw new Error('No rendered C4X preview webview appeared');
}

async function until(fn, message, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) { return value; }
    } catch (error) {
      last = error;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`${message}${last ? ` (${last.message})` : ''}`);
}

async function text(locator) {
  return ((await locator.textContent()) || '').replace(/\s+/g, ' ').trim();
}

async function nodeIds(frame) {
  return frame.locator('#svg-container svg g.node').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-id')));
}

async function nodeLabels(frame) {
  return frame.locator('#svg-container svg g.node').evaluateAll(nodes => nodes.map(node => (node.textContent || '').replace(/\s+/g, ' ').trim()));
}

async function nodePosition(frame, id) {
  const node = frame.locator(`g.node[data-id="${id}"]`);
  return {
    x: Number(await node.getAttribute('data-current-x')),
    y: Number(await node.getAttribute('data-current-y')),
  };
}

async function drag(win, frame, id, dx, dy) {
  const { x: startX, y: startY } = await clickablePoint(frame, id);
  await win.mouse.move(startX, startY);
  await win.mouse.down();
  for (let i = 1; i <= 8; i += 1) {
    await win.mouse.move(startX + (dx * i) / 8, startY + (dy * i) / 8);
  }
  await win.mouse.up();
}

/**
 * A save is confirmed when the source text changes and the webview leaves
 * edit mode (visualLayout.batchAccepted). The status line is a live region
 * that the following re-render may overwrite, so it is recorded, not required.
 */
async function waitForSave(ctx, frame, file, before) {
  const doc = await until(async () => {
    const value = await bridge(ctx, 'document', { file });
    return value.text !== before && value;
  }, 'source document did not change after Save', 20_000);
  await until(async () => (await frame.locator('#toggle-layout').getAttribute('aria-pressed')) === 'false', 'webview did not leave edit mode after Save', 10_000);
  const status = await frame.locator('#layout-status').getAttribute('title');
  return { doc, status };
}

async function arrangeEditors(ctx, previewShare = 0.68) {
  await bridge(ctx, 'exec', { command: 'workbench.action.closeSidebar' }).catch(() => undefined);
  await bridge(ctx, 'exec', {
    command: 'vscode.setEditorLayout',
    args: [{ orientation: 0, groups: [{ size: 1 - previewShare }, { size: previewShare }] }],
  }).catch(() => undefined);
  await ctx.win.waitForTimeout(500);
}

async function closeAllEditors(ctx) {
  await bridge(ctx, 'exec', { command: 'workbench.action.files.saveAll' });
  await bridge(ctx, 'exec', { command: 'workbench.action.closeAllEditors' });
  await ctx.win.waitForTimeout(500);
}

async function stagedText(frame) {
  return text(frame.locator('#staged-changes-list'));
}

/** The staged list as { title, detail } rows; the empty placeholder is not a row. */
async function stagedItems(frame) {
  return frame.locator('#staged-changes-list li:not(.empty-changes-text)').evaluateAll(items => items.map(item => ({
    title: ((item.querySelector('.change-title') || {}).textContent || '').trim(),
    detail: ((item.querySelector('.change-detail') || {}).textContent || '').trim(),
  })));
}

async function enterEditMode(frame) {
  const toggle = frame.locator('#toggle-layout');
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') {
    await toggle.click();
  }
  await until(async () => (await toggle.getAttribute('aria-pressed')) === 'true', 'Edit mode did not engage');
}

/**
 * Finds a point on the node a user could click: the centre when nothing is
 * drawn over it, otherwise the first uncovered point on a 5x5 grid inside
 * the box. Returns page coordinates and what covers the centre, if anything.
 */
async function clickablePoint(frame, id) {
  const node = frame.locator(`g.node[data-id="${id}"]`);
  // Wait for a stable target before reading page coordinates for real mouse input.
  // Direct DOM scrolling can leave the following bounding box stale.
  await node.scrollIntoViewIfNeeded();
  const box = await node.boundingBox();
  assert.ok(box, `${id} has no bounding box`);
  const local = await node.evaluate(el => {
    const rect = el.getBoundingClientRect();
    const describe = hit => hit ? `${hit.tagName}${hit.closest('g') ? `(${hit.closest('g').getAttribute('class')} ${hit.closest('g').getAttribute('data-id') || ''})` : ''}` : 'nothing';
    const centre = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const centreCovered = centre && el.contains(centre) ? null : describe(centre);
    for (const fy of [0.5, 0.3, 0.7, 0.2, 0.8]) {
      for (const fx of [0.5, 0.3, 0.7, 0.2, 0.8]) {
        const hit = document.elementFromPoint(rect.left + rect.width * fx, rect.top + rect.height * fy);
        if (hit && el.contains(hit)) { return { fx, fy, centreCovered }; }
      }
    }
    return { fx: -1, fy: -1, centreCovered };
  });
  assert.ok(local.fx >= 0, `no clickable point on ${id}; centre covered by ${local.centreCovered}`);
  return { x: box.x + box.width * local.fx, y: box.y + box.height * local.fy, centreCovered: local.centreCovered };
}

async function clickNode(ctx, frame, id, modifier) {
  const point = await clickablePoint(frame, id);
  if (modifier) { await ctx.win.keyboard.down(modifier); }
  await ctx.win.mouse.click(point.x, point.y);
  if (modifier) { await ctx.win.keyboard.up(modifier); }
  return point;
}

async function selectNode(ctx, frame, id) {
  const node = frame.locator(`g.node[data-id="${id}"]`);
  await clickNode(ctx, frame, id);
  await until(async () => (await node.getAttribute('aria-selected')) === 'true', `${id} was not selected`);
}

function lineDiff(before, after) {
  const a = before.split('\n');
  const b = after.split('\n');
  const changed = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    if (a[i] !== b[i]) { changed.push({ line: i + 1, before: a[i], after: b[i] }); }
  }
  return changed;
}

/**
 * Splits Markdown into fences and the prose between them. A fence keeps its
 * delimiter lines: { open, body, close }, so a change to the fence marker or
 * its info string (```c4x) is visible. `close` is undefined for a fence that
 * never closes.
 */
function markdownParts(source) {
  const fences = [];
  const prose = [];
  let current = [];
  let open;
  for (const line of source.split('\n')) {
    if (open === undefined && /^```/.test(line)) {
      prose.push(current.join('\n'));
      open = line;
      current = [];
    } else if (open !== undefined && /^```\s*$/.test(line)) {
      fences.push({ open, body: current.join('\n'), close: line });
      open = undefined;
      current = [];
    } else {
      current.push(line);
    }
  }
  if (open !== undefined) { fences.push({ open, body: current.join('\n'), close: undefined }); } else { prose.push(current.join('\n')); }
  return { fences, prose };
}

async function typeIntoSimpleDialog(win, targetPath) {
  const input = win.locator('.quick-input-widget input');
  await input.waitFor({ state: 'visible', timeout: 15_000 });
  // The simple dialog fills in its default path asynchronously; replace it
  // only once it is there, and check the result before accepting.
  await until(async () => (await input.inputValue()).length > 0, 'save dialog never showed a default path');
  await win.waitForTimeout(300);
  await until(async () => {
    await input.fill(targetPath);
    await win.waitForTimeout(300);
    return (await input.inputValue()) === targetPath;
  }, `save dialog path did not settle on ${targetPath}`);
  await win.keyboard.press('Enter');
}

async function pickQuickItem(win, label) {
  const row = win.locator('.quick-input-widget .monaco-list-row', { hasText: label }).first();
  await row.waitFor({ state: 'visible', timeout: 15_000 });
  await row.click();
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function pngSize(file) {
  const buffer = fs.readFileSync(file);
  assert.strictEqual(buffer.subarray(1, 4).toString('latin1'), 'PNG', `${file} is not a PNG`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

// ── Journeys ────────────────────────────────────────────────────────────────

async function journeyNative(ctx) {
  const nativeFile = path.join(ctx.workspaceDir, 'architecture.c4x');
  let frame;
  let afterSave;

  await step(ctx, 'J1.1', 1, 'Open the native fixture and C4X Preview', 'palette "C4X: Open Preview" on architecture.c4x', async () => {
    await bridge(ctx, 'open', { file: nativeFile });
    await runPalette(ctx, 'C4X: Open Preview');
    frame = await waitForPreview(ctx.win);
    await arrangeEditors(ctx);
    const ids = await nodeIds(frame);
    assert.deepStrictEqual([...ids].sort(), ['Api', 'Customer', 'Database', 'Identity', 'Web']);
    const boundaries = await frame.locator('#svg-container svg g.boundary').count();
    assert.ok(boundaries >= 1, 'Portal boundary not rendered');
    return { observed: `webview rendered nodes ${ids.join(', ')}; ${boundaries} boundary; zoom ${await text(frame.locator('#zoom-reset'))}` };
  });
  if (!frame) { return; }

  await step(ctx, 'J1.2', 1, 'Enter Edit mode', 'click #toggle-layout', async () => {
    await enterEditMode(frame);
    assert.ok(await frame.locator('#editor-sidebar').isVisible(), 'inspector sidebar not visible');
    return { observed: `aria-pressed=true; sidebar visible; status "${await text(frame.locator('#layout-status'))}"` };
  });

  const coveredToolbarButtons = () => frame.evaluate(() => ['zoom-in', 'zoom-out', 'zoom-reset', 'zoom-fit', 'connect-mode'].flatMap(id => {
    const button = document.getElementById(id);
    if (!button) { return []; }
    const rect = button.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    if (hit === button || button.contains(hit)) { return []; }
    const owner = hit ? (hit.closest('[id]') || hit) : null;
    return [`#${id} covered by ${owner ? `#${owner.id || owner.tagName}` : 'nothing (off-screen)'}`];
  }));
  const canvasWidth = () => frame.locator('#content').evaluate(el => Math.round(el.getBoundingClientRect().width));

  let toolbarCovered = [];
  await step(ctx, 'J1.3a', 1, 'Canvas toolbar is clickable with the inspector open (wide preview)', 'edit mode, preview group 68% of a 1900 px window; elementFromPoint at the centre of each canvas toolbar button', async () => {
    toolbarCovered = await coveredToolbarButtons();
    assert.deepStrictEqual(toolbarCovered, [], `canvas toolbar obscured: ${toolbarCovered.join('; ')}`);
    return { observed: `all five canvas toolbar buttons receive pointer hits; canvas ${await canvasWidth()} px wide` };
  });

  await step(ctx, 'J1.3c', 1, 'Canvas toolbar is clickable with the inspector open (half-width preview)', 'edit mode, window 1200 px, editor groups 50/50; elementFromPoint at the centre of each canvas toolbar button', async () => {
    await ctx.app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].setSize(1200, 1000); });
    await arrangeEditors(ctx, 0.5);
    try {
      await ctx.win.waitForTimeout(500);
      const covered = await coveredToolbarButtons();
      const width = await canvasWidth();
      const shot = await shoot(ctx.win, 'narrow-preview-toolbar');
      assert.deepStrictEqual(covered, [], `canvas toolbar obscured at a ${width} px canvas: ${covered.join('; ')}`);
      return { observed: `all five canvas toolbar buttons receive pointer hits at a ${width} px canvas`, screenshot: shot };
    } finally {
      await ctx.app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].setSize(1900, 1060); });
      await arrangeEditors(ctx);
    }
  });

  // A covered button is activated the way a keyboard user would.
  const pressToolbar = async id => {
    if (toolbarCovered.length > 0) {
      await frame.locator(`#${id}`).focus();
      await ctx.win.keyboard.press('Enter');
    } else {
      await frame.locator(`#${id}`).click();
    }
  };
  const zoomPercent = async () => Number((await text(frame.locator('#zoom-reset'))).replace('%', ''));
  const geometry = async () => {
    const content = await frame.locator('#content').evaluate(el => {
      const rect = el.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    });
    const boxes = await frame.locator('#svg-container svg g.node').evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect();
      return { id: node.getAttribute('data-id'), width: rect.width, height: rect.height, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    }));
    const union = {
      width: Math.max(...boxes.map(b => b.right)) - Math.min(...boxes.map(b => b.left)),
      height: Math.max(...boxes.map(b => b.bottom)) - Math.min(...boxes.map(b => b.top)),
    };
    return { content, boxes, union };
  };

  await step(ctx, 'J1.3', 1, 'Zoom to fit restores readable geometry after zooming in', 'press #zoom-in three times, then #zoom-fit (twice); measure zoom and node boxes', async () => {
    const startZoom = await zoomPercent();
    const start = await geometry();
    for (let i = 0; i < 3; i += 1) { await pressToolbar('zoom-in'); }
    await until(async () => (await zoomPercent()) > startZoom, `zoom-in did not raise the zoom from ${startZoom}%`);
    await ctx.win.waitForTimeout(300);
    const zoomedIn = await zoomPercent();
    const zoomed = await geometry();
    assert.ok(zoomed.union.width > start.union.width, 'the diagram did not grow after zooming in');

    await pressToolbar('zoom-fit');
    await until(async () => (await zoomPercent()) < zoomedIn, `Fit did not change the zoom from ${zoomedIn}%`);
    await ctx.win.waitForTimeout(500);
    const fitZoom = await zoomPercent();
    const { content, boxes, union } = await geometry();
    const tooSmall = boxes.filter(box => box.width < 60 || box.height < 30);
    assert.strictEqual(tooSmall.length, 0, `nodes rendered below 60x30 px after fit: ${JSON.stringify(tooSmall)} at zoom ${fitZoom}%`);
    const outside = boxes.filter(box => box.left < content.left - 1 || box.top < content.top - 1 || box.right > content.right + 1 || box.bottom > content.bottom + 1);
    assert.strictEqual(outside.length, 0, `nodes outside the canvas after fit: ${outside.map(box => box.id).join(', ')}`);
    // Fit leaves 32 px padding on each side and fills the tighter axis.
    const fill = Math.max(union.width / (content.width - 64), union.height / (content.height - 64));
    assert.ok(fill >= 0.8, `Fit left the diagram at ${Math.round(fill * 100)}% of the canvas on its tighter axis`);

    // Fit is a state, not a step: pressing it again changes nothing.
    await pressToolbar('zoom-fit');
    await ctx.win.waitForTimeout(500);
    assert.strictEqual(await zoomPercent(), fitZoom, 'a second Fit changed the zoom');
    return { observed: `zoom ${startZoom}% -> ${zoomedIn}% after 3 x zoom-in -> ${fitZoom}% after Fit (a second Fit kept ${fitZoom}%); diagram fills ${Math.round(fill * 100)}% of the canvas on its tighter axis; smallest node ${Math.round(Math.min(...boxes.map(b => b.width)))}x${Math.round(Math.min(...boxes.map(b => b.height)))} px; all ${boxes.length} nodes inside the ${Math.round(content.width)}x${Math.round(content.height)} canvas` };
  });

  await step(ctx, 'J1.3b', 1, 'Selecting a node with a plain click stages nothing', 'click Identity once without moving the mouse; read #staged-changes-list', async () => {
    const before = await nodePosition(frame, 'Identity');
    await selectNode(ctx, frame, 'Identity');
    await ctx.win.waitForTimeout(400);
    const staged = await stagedText(frame);
    const after = await nodePosition(frame, 'Identity');
    if (!/No changes staged/.test(staged)) {
      // Leave a clean draft for the following steps.
      await frame.locator('#staged-changes-list .change-remove-btn').first().click().catch(() => undefined);
    }
    assert.ok(/No changes staged/.test(staged), `a click without movement staged "${staged}" (node at ${before.x},${before.y} -> ${after.x},${after.y})`);
    return { observed: 'selection only; staged list still "No changes staged"' };
  });

  let customerStart;
  await step(ctx, 'J1.4', 1, 'Move a node by mouse drag', 'drag g.node[Customer] by (+140, +60) px', async () => {
    customerStart = await nodePosition(frame, 'Customer');
    await drag(ctx.win, frame, 'Customer', 140, 60);
    const moved = await nodePosition(frame, 'Customer');
    assert.ok(moved.x !== customerStart.x || moved.y !== customerStart.y, 'Customer did not move');
    const staged = await until(async () => { const t = await stagedText(frame); return /Moved to/.test(t) && t; }, 'move was not staged');
    return { observed: `Customer ${customerStart.x},${customerStart.y} -> ${moved.x},${moved.y}; staged "${staged.slice(0, 120)}"` };
  });

  await step(ctx, 'J1.5', 1, 'Change a label in the inspector', 'select Api, fill #inspector-label "Public API"', async () => {
    await selectNode(ctx, frame, 'Api');
    await frame.locator('#inspector-label').fill('Public API');
    await until(async () => /Label updated/.test(await stagedText(frame)), 'label change was not staged');
    const canvas = await nodeLabels(frame);
    assert.ok(canvas.some(label => label.includes('Public API')), 'canvas did not show the staged label');
    return { observed: 'staged "Label updated"; canvas shows "Public API" before save' };
  });

  await step(ctx, 'J1.6', 1, 'Rename an identifier', 'select Database, #rename-element, type CustomerDb, confirm', async () => {
    await selectNode(ctx, frame, 'Database');
    await frame.locator('#rename-element').click();
    await frame.locator('#rename-dialog').waitFor({ state: 'visible' });
    const impact = await text(frame.locator('#rename-impact'));
    await frame.locator('#rename-new-id').fill('CustomerDb');
    await until(async () => !(await frame.locator('#rename-confirm').isDisabled()), 'rename confirm stayed disabled');
    await frame.locator('#rename-confirm').click();
    await until(async () => /CustomerDb/.test(await stagedText(frame)), 'rename was not staged');
    return { observed: `impact "${impact}"; rename staged` };
  });

  // Group drag: select Web, Shift+click Identity, then drag one member.
  const groupDrag = async (dragged, other, dx, dy) => {
    const before = { [dragged]: await nodePosition(frame, dragged), [other]: await nodePosition(frame, other) };
    await selectNode(ctx, frame, 'Web');
    await clickNode(ctx, frame, 'Identity', 'Shift');
    await until(async () => /visual-layout-selected/.test(await frame.locator('g.node[data-id="Identity"]').getAttribute('class')), 'Shift+click did not add Identity to the selection', 5000);
    await drag(ctx.win, frame, dragged, dx, dy);
    const after = { [dragged]: await nodePosition(frame, dragged), [other]: await nodePosition(frame, other) };
    // Auto-layout starts are fractional and a moved node lands on
    // round(start) + delta, so measure each movement from the rounded start. A
    // correct group move then agrees exactly; a squashed group differs by 1+.
    const moveFrom = name => [after[name].x - Math.round(before[name].x), after[name].y - Math.round(before[name].y)];
    const dDragged = moveFrom(dragged);
    const dOther = moveFrom(other);
    assert.ok(dDragged[0] !== 0 || dDragged[1] !== 0, `${dragged} did not move`);
    assert.ok(Math.abs(dOther[0] - dDragged[0]) < 1 && Math.abs(dOther[1] - dDragged[1]) < 1, `group members moved by different deltas: dragged ${dragged} ${dDragged.map(Math.round)}, ${other} ${dOther.map(Math.round)}`);
    return { observed: `${dragged} and ${other} both moved by ${dDragged.map(Math.round).join(', ')}` };
  };

  await step(ctx, 'J1.7', 1, 'Move a multi-selection by dragging the first-selected node', 'click Web, Shift+click Identity, drag Web by (-80, +50) px', async () => groupDrag('Web', 'Identity', -80, 50));

  await step(ctx, 'J1.7b', 1, 'Move a multi-selection by dragging the last-selected node', 'click Web, Shift+click Identity, drag Identity by (+60, -40) px', async () => groupDrag('Identity', 'Web', 60, -40));

  let beforeSave;
  await step(ctx, 'J2.1', 2, 'Review staged changes and the source diff', 'open #source-diff-toggle', async () => {
    beforeSave = (await bridge(ctx, 'document', { file: nativeFile })).text;
    const staged = await stagedText(frame);
    const items = await stagedItems(frame);
    const expectations = [
      ['the Customer move', item => item.title === 'Customer' && /Moved to/.test(item.detail)],
      ['the label change', item => /Label updated/.test(item.detail)],
      ['the rename', item => /Rename Database → CustomerDb/.test(item.detail)],
    ];
    for (const [what, matches] of expectations) {
      assert.ok(items.some(matches), `staged list is missing ${what}: ${JSON.stringify(items)}`);
    }
    await frame.locator('#source-diff-toggle').click();
    const diff = await until(async () => {
      const value = await text(frame.locator('#source-diff-body'));
      return /Public API/.test(value) && value;
    }, 'source diff did not show the label change');
    assert.ok(/CustomerDb/.test(diff), 'source diff did not show the rename');
    const shot = await shoot(ctx.win, 'staged-changes-and-source-diff');
    return { observed: `staged list "${staged.slice(0, 160)}..."; diff shows Public API and CustomerDb`, screenshot: shot };
  });

  await step(ctx, 'J2.2', 2, 'Save writes the source and the preview re-renders it', 'click #save-staged-changes; read document through the bridge', async () => {
    await frame.locator('#save-staged-changes').click();
    const saved = await waitForSave(ctx, frame, nativeFile, beforeSave);
    afterSave = saved.doc;
    const source = afterSave.text;
    assert.ok(source.includes('"Public API"'), 'label not written');
    assert.ok(/ContainerDb\(CustomerDb,/.test(source), 'identifier not renamed at its declaration');
    assert.ok(/Api -->\|Reads and writes\| CustomerDb/.test(source), 'relationship reference not renamed');
    assert.ok(!/\bDatabase\b(?! *")/.test(source.replace(/"[^"]*"/g, '""')), 'old identifier still referenced');
    assert.ok(/Person\(Customer,[^\n]*\$x=/.test(source), 'Customer move not written as $x/$y');
    assert.ok(/Container\(Web,[^\n]*\$x=/.test(source) && /SoftwareSystem\(Identity,[^\n]*\$x=/.test(source), 'group move not written');
    const rendered = await until(async () => {
      const ids = await nodeIds(frame);
      return ids.includes('CustomerDb') && ids;
    }, 'preview did not re-render the saved source');
    const labels = await nodeLabels(frame);
    assert.ok(labels.some(label => label.includes('Public API')), 'rendered preview lacks the saved label');
    const changed = lineDiff(beforeSave, source);
    return { observed: `status "${saved.status}"; document dirty=${afterSave.isDirty}; ${changed.length} source lines changed (${changed.map(c => c.line).join(', ')}); preview nodes ${rendered.join(', ')}` };
  });

  await step(ctx, 'J2.3', 2, 'Undo the save from the source editor', 'focus architecture.c4x, run the `undo` command (Ctrl+Z) until the text matches the original, then `redo`', async () => {
    await bridge(ctx, 'open', { file: nativeFile });
    let doc;
    let undos = 0;
    // Up to three, so a failure can say how many a user would need.
    while (undos < 3) {
      await bridge(ctx, 'exec', { command: 'undo' });
      undos += 1;
      doc = await bridge(ctx, 'document', { file: nativeFile });
      if (doc.text === beforeSave) { break; }
    }
    assert.strictEqual(doc.text, beforeSave, `${undos} undo commands did not restore the pre-save source`);
    // One Save is one edit; needing more undos than that is a regression.
    assert.strictEqual(undos, 1, `restoring the pre-save source took ${undos} undo commands, expected 1`);
    const ids = await until(async () => {
      const value = await nodeIds(frame);
      return value.includes('Database') && !value.includes('CustomerDb') && value;
    }, 'preview did not follow the undo');
    // Put the saved version back for the following journeys.
    await bridge(ctx, 'exec', { command: 'redo' });
    const redone = await bridge(ctx, 'document', { file: nativeFile });
    assert.strictEqual(redone.text, afterSave.text, 'Redo did not restore the saved source');
    // Wait for the preview to follow the redo: its re-render would otherwise
    // land in the next step and drop it out of edit mode.
    const redoneIds = await until(async () => {
      const value = await nodeIds(frame);
      return value.includes('CustomerDb') && !value.includes('Database') && value;
    }, 'preview did not follow the redo');
    await ctx.win.waitForTimeout(500);
    return { observed: `${undos} undo command restored the original text; preview back to ${ids.join(', ')}; redo restored the saved text and the preview showed ${redoneIds.join(', ')}` };
  });

  await step(ctx, 'J2.4', 2, 'Discard a second edit', 'edit description of Web, click #discard-staged-changes', async () => {
    const before = (await bridge(ctx, 'document', { file: nativeFile })).text;
    await enterEditMode(frame);
    await selectNode(ctx, frame, 'Web');
    const originalDesc = await frame.locator('#inspector-desc').inputValue();
    await frame.locator('#inspector-desc').fill('Draft that must be discarded');
    await until(async () => /Description updated/.test(await stagedText(frame)), 'description edit not staged');
    await frame.locator('#discard-staged-changes').click();
    const banner = frame.locator('#exit-edit-banner');
    if (await banner.isVisible().catch(() => false)) {
      await frame.locator('#exit-edit-discard').click();
    }
    await until(async () => /No changes staged/.test(await stagedText(frame)) || !(await frame.locator('#staged-changes-list').isVisible()), 'staged list not cleared');
    // Hidden is not empty: re-enter edit mode and check the draft is gone.
    await enterEditMode(frame);
    const items = await stagedItems(frame);
    assert.deepStrictEqual(items, [], `staged edits survived Discard: ${JSON.stringify(items)}`);
    assert.strictEqual(await stagedText(frame), 'No changes staged');
    // Select by keyboard: a click would stage a zero-distance move (#251).
    const web = frame.locator('g.node[data-id="Web"]');
    await web.focus();
    await ctx.win.keyboard.press('Enter');
    await until(async () => (await web.getAttribute('aria-selected')) === 'true', 'Web was not selected by keyboard');
    const desc = await frame.locator('#inspector-desc').inputValue();
    assert.strictEqual(desc, originalDesc, 'the inspector still shows the discarded description');
    const after = (await bridge(ctx, 'document', { file: nativeFile })).text;
    assert.strictEqual(after, before, 'Discard changed the source');
    assert.ok(!after.includes('Draft that must be discarded'));
    return { observed: `after re-entering edit mode the staged list is "No changes staged" with 0 rows and Web's description is "${desc}" again; source text byte-identical to before the edit` };
  });

  await step(ctx, 'J2.5', 2, 'Source conflict feedback', 'stage a move, then insert a comment line into the source through a WorkspaceEdit', async () => {
    await enterEditMode(frame);
    await drag(ctx.win, frame, 'Customer', 60, 0);
    await until(async () => /Moved to/.test(await stagedText(frame)), 'move not staged');
    await bridge(ctx, 'insert', { file: nativeFile, line: 2, text: '%% edited elsewhere\n' });
    const banner = frame.locator('#conflict-banner');
    await until(async () => (await banner.getAttribute('data-active')) === 'true', 'conflict banner did not appear');
    const message = await text(frame.locator('#conflict-banner-message'));
    const saveDisabled = await frame.locator('#save-staged-changes').isDisabled();
    assert.ok(saveDisabled, 'Save stayed enabled while in conflict');
    const shot = await shoot(ctx.win, 'source-conflict-feedback');
    await frame.locator('#conflict-reload').click();
    await until(async () => (await banner.getAttribute('data-active')) !== 'true', 'conflict banner did not clear after reload');
    const doc = await bridge(ctx, 'document', { file: nativeFile });
    assert.ok(doc.text.includes('%% edited elsewhere'), 'the external edit was lost');
    return { observed: `banner "${message}"; Save disabled; "Reload source and discard draft" cleared it and kept the external edit`, screenshot: shot };
  });

  await step(ctx, 'J2.6', 2, 'Saved layout survives a VS Code restart', 'save file to disk, close VS Code, relaunch the same profile, reopen preview', async () => {
    const saved = await bridge(ctx, 'save', { file: nativeFile });
    assert.ok(saved.saved, 'file save failed');
    const onDisk = fs.readFileSync(nativeFile, 'utf8');
    assert.ok(onDisk.includes('"Public API"') && onDisk.includes('$x='), 'disk does not hold the saved layout');
    const expected = await nodePosition(frame, 'Customer');
    await closeApp(ctx);
    await launch(ctx, 'restart');
    await bridge(ctx, 'open', { file: nativeFile });
    await runPalette(ctx, 'C4X: Open Preview');
    frame = await waitForPreview(ctx.win);
    await arrangeEditors(ctx);
    const actual = await nodePosition(frame, 'Customer');
    assert.deepStrictEqual(actual, expected, 'Customer position changed across restart');
    const ids = await nodeIds(frame);
    assert.ok(ids.includes('CustomerDb'));
    const labels = await nodeLabels(frame);
    assert.ok(labels.some(label => label.includes('Public API')));
    return { observed: `after relaunch Customer at ${actual.x},${actual.y} (same as before), CustomerDb and "Public API" rendered` };
  });

  ctx.nativeFrame = () => frame;
}

async function journeyKeyboard(ctx) {
  const nativeFile = path.join(ctx.workspaceDir, 'architecture.c4x');
  let frame = await waitForPreview(ctx.win).catch(() => undefined);
  if (!frame) {
    await bridge(ctx, 'open', { file: nativeFile });
    await runPalette(ctx, 'C4X: Open Preview');
    frame = await waitForPreview(ctx.win);
  }
  const focusInfo = () => frame.evaluate(() => {
    const el = document.activeElement;
    const style = el ? getComputedStyle(el) : null;
    return el ? {
      id: el.id || el.getAttribute('data-id') || el.tagName,
      outline: style.outlineStyle !== 'none' && style.outlineWidth !== '0px' ? `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}` : 'none',
      boxShadow: style.boxShadow,
      stroke: el.tagName === 'g' ? getComputedStyle(el.querySelector('rect, path, ellipse, circle') || el).stroke : '',
    } : null;
  });

  await step(ctx, 'J5.1', 5, 'Keyboard: enter edit mode, select a node, nudge it', 'focus #toggle-layout, Enter; Tab to a node, Enter; ArrowRight x3', async () => {
    const toggle = frame.locator('#toggle-layout');
    if ((await toggle.getAttribute('aria-pressed')) === 'true') {
      await toggle.focus();
      await ctx.win.keyboard.press('Enter');
      await ctx.win.waitForTimeout(300);
    }
    await toggle.focus();
    const toggleFocus = await focusInfo();
    await ctx.win.keyboard.press('Enter');
    await until(async () => (await toggle.getAttribute('aria-pressed')) === 'true', 'Enter on the toggle did not enter edit mode');
    let reached;
    for (let i = 0; i < 40; i += 1) {
      await ctx.win.keyboard.press('Tab');
      const info = await focusInfo();
      if (info && ['Customer', 'Identity', 'Web', 'Api', 'CustomerDb'].includes(info.id)) { reached = info; break; }
    }
    assert.ok(reached, 'Tab never reached a diagram node');
    await ctx.win.keyboard.press('Enter');
    const node = frame.locator(`g.node[data-id="${reached.id}"]`);
    await until(async () => (await node.getAttribute('aria-selected')) === 'true', 'Enter did not select the focused node');
    const before = await nodePosition(frame, reached.id);
    for (let i = 0; i < 3; i += 1) { await ctx.win.keyboard.press('ArrowRight'); }
    const after = await nodePosition(frame, reached.id);
    assert.strictEqual(after.x - before.x, 30, `ArrowRight x3 moved ${after.x - before.x}, expected 30`);
    ctx.keyboardNode = reached.id;
    return { observed: `toggle focus outline ${toggleFocus.outline}; Tab reached node ${reached.id} (focus outline ${reached.outline}); Enter selected it; 3 x ArrowRight moved +30` };
  });

  await step(ctx, 'J5.2', 5, 'Keyboard: inspector entry with actionable validation', 'Tab into #inspector-label, clear it, then type a valid label', async () => {
    const label = frame.locator('#inspector-label');
    await label.focus();
    await ctx.win.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await ctx.win.keyboard.press('Backspace');
    const errorText = await until(async () => {
      const invalid = await label.getAttribute('aria-invalid');
      const message = await text(frame.locator('#element-inspector .field-error'));
      return invalid === 'true' && message;
    }, 'empty label did not raise an inline validation error');
    const saveDisabled = await frame.locator('#save-staged-changes').isDisabled();
    assert.ok(saveDisabled, 'Save enabled while a field is invalid');
    const shot = await shoot(ctx.win, 'inspector-validation');
    await ctx.win.keyboard.type('Keyboard Label');
    await until(async () => (await label.getAttribute('aria-invalid')) !== 'true', 'error did not clear after a valid label');
    return { observed: `aria-invalid=true with message "${errorText}"; Save disabled; typing a valid label cleared it`, screenshot: shot };
  });

  await step(ctx, 'J5.3', 5, 'Keyboard: save and exit edit mode', 'focus #save-staged-changes, Enter; then focus #toggle-layout, Enter twice', async () => {
    const nativeBefore = (await bridge(ctx, 'document', { file: nativeFile })).text;
    const save = frame.locator('#save-staged-changes');
    await save.focus();
    const saveFocus = await focusInfo();
    await ctx.win.keyboard.press('Enter');
    const { doc, status } = await waitForSave(ctx, frame, nativeFile, nativeBefore);
    assert.ok(doc.text.includes('"Keyboard Label"'), 'keyboard label not written');
    // Saving leaves edit mode; re-enter and leave again with the keyboard.
    const toggle = frame.locator('#toggle-layout');
    await toggle.focus();
    await ctx.win.keyboard.press('Enter');
    await until(async () => (await toggle.getAttribute('aria-pressed')) === 'true', 'Enter on the toggle did not re-enter edit mode');
    await ctx.win.keyboard.press('Enter');
    await until(async () => (await toggle.getAttribute('aria-pressed')) === 'false', 'Enter on the toggle did not leave edit mode');
    await bridge(ctx, 'save', { file: nativeFile });
    return { observed: `Save focus outline ${saveFocus.outline}; Enter saved "Keyboard Label" into source (status "${status}") and left edit mode; Enter on the toggle re-entered and left edit mode` };
  });

  await step(ctx, 'J6.4', 6, 'Screenshot: repositioned legend', 'focus #legend-overlay, ArrowUp x6 and ArrowLeft x10', async () => {
    const legend = frame.locator('#legend-overlay');
    await legend.waitFor({ state: 'visible' });
    const before = await legend.boundingBox();
    await legend.focus();
    for (let i = 0; i < 6; i += 1) { await ctx.win.keyboard.press('ArrowUp'); }
    for (let i = 0; i < 10; i += 1) { await ctx.win.keyboard.press('ArrowLeft'); }
    const after = await legend.boundingBox();
    assert.ok(after.x < before.x && after.y < before.y, 'legend did not move');
    const shot = await shoot(ctx.win, 'repositioned-legend');
    return { observed: `legend moved from ${Math.round(before.x)},${Math.round(before.y)} to ${Math.round(after.x)},${Math.round(after.y)}; status "${await text(frame.locator('#layout-status'))}"`, screenshot: shot };
  });
}

async function journeyMarkdown(ctx) {
  const markdownFile = path.join(ctx.workspaceDir, 'architecture.md');
  let frame;
  let before;

  await step(ctx, 'J3.1', 3, 'Open the Markdown fixture through its C4X CodeLens', 'open architecture.md, click the second "Edit C4 diagram in visual editor" CodeLens', async () => {
    await closeAllEditors(ctx);
    const existing = await previewFrames(ctx.win);
    const doc = await bridge(ctx, 'open', { file: markdownFile });
    before = doc.text;
    const lenses = ctx.win.locator('.contentWidgets .codelens-decoration a, .codelens-decoration a');
    await until(async () => (await lenses.count()) >= 2, 'fewer than two C4X CodeLenses appeared', 20_000);
    const titles = await lenses.allTextContents();
    assert.ok(titles.every(title => /Edit C4 diagram in visual editor/.test(title)), `unexpected CodeLens titles: ${titles}`);
    const shot = await shoot(ctx.win, 'markdown-codelens-entry');
    await lenses.nth(1).click();
    frame = await waitForPreview(ctx.win, { exclude: existing });
    await arrangeEditors(ctx);
    const ids = await nodeIds(frame);
    assert.deepStrictEqual([...ids].sort(), ['Author', 'Editor', 'Store']);
    return { observed: `${titles.length} CodeLenses "${titles[0].trim()}"; second opened a panel with nodes ${ids.join(', ')}`, screenshot: shot };
  });
  if (!frame) { return; }

  await step(ctx, 'J3.2', 3, 'Edit properties and save; only the intended fence changes', 'edit Editor technology and description, move Store, save; compare fences and prose', async () => {
    await enterEditMode(frame);
    await selectNode(ctx, frame, 'Editor');
    await frame.locator('#inspector-tech').fill('VS Code + C4X');
    await frame.locator('#inspector-desc').fill('Edits diagrams visually');
    await drag(ctx.win, frame, 'Store', 100, 0);
    await until(async () => /Moved to/.test(await stagedText(frame)), 'move not staged');
    await frame.locator('#save-staged-changes').click();
    const { doc } = await waitForSave(ctx, frame, markdownFile, before);
    const a = markdownParts(before);
    const b = markdownParts(doc.text);
    assert.deepStrictEqual(b.prose, a.prose, 'prose outside the fences changed');
    assert.strictEqual(b.fences.length, 2, 'fence count changed');
    assert.deepStrictEqual(b.fences[0], a.fences[0], 'the first (untouched) fence changed');
    // The delimiters, including the c4x info string, must survive the save.
    assert.strictEqual(a.fences[1].open, '```c4x', `fixture fence opens with ${a.fences[1].open}`);
    assert.strictEqual(b.fences[1].open, a.fences[1].open, `the edited fence's opening line changed to ${b.fences[1].open}`);
    assert.ok(b.fences[1].close !== undefined, 'the edited fence lost its closing line');
    assert.strictEqual(b.fences[1].close, a.fences[1].close, `the edited fence's closing line changed to ${b.fences[1].close}`);
    assert.notStrictEqual(b.fences[1].body, a.fences[1].body, 'the edited fence did not change');
    assert.ok(b.fences[1].body.includes('"VS Code + C4X"') && b.fences[1].body.includes('"Edits diagrams visually"'), 'properties not written');
    assert.ok(/ContainerDb\(Store,[^\n]*\$x=/.test(b.fences[1].body), 'Store move not written');
    await bridge(ctx, 'save', { file: markdownFile });
    const changed = lineDiff(before, doc.text);
    return { observed: `changed lines ${changed.map(c => c.line).join(', ')} all inside fence 2; fence 1 and prose byte-identical` };
  });
}

async function journeyExports(ctx) {
  const nativeFile = path.join(ctx.workspaceDir, 'architecture.c4x');
  const markdownFile = path.join(ctx.workspaceDir, 'architecture.md');
  const exportDir = path.join(ctx.workspaceDir, 'exports');
  fs.mkdirSync(exportDir, { recursive: true });

  const notification = async pattern => until(async () => {
    const toasts = await ctx.win.locator('.notification-toast .notification-list-item-message').allTextContents();
    return toasts.find(toast => pattern.test(toast));
  }, `no notification matching ${pattern}`, 30_000);

  await step(ctx, 'J4.1', 4, 'Export SVG', 'palette "C4X: Export SVG" on architecture.c4x, type path in the save dialog', async () => {
    await closeAllEditors(ctx);
    await bridge(ctx, 'open', { file: nativeFile });
    // SVG and PNG export take the diagram from the open preview; without one
    // C4X says "No diagram to export. Open the C4X preview first."
    await runPalette(ctx, 'C4X: Open Preview');
    await waitForPreview(ctx.win);
    await bridge(ctx, 'open', { file: nativeFile });
    await dismissNotifications(ctx);
    const target = path.join(exportDir, 'architecture.svg');
    await runPalette(ctx, 'C4X: Export SVG');
    await typeIntoSimpleDialog(ctx.win, target);
    await until(() => fs.existsSync(target), 'SVG file was not written', 20_000);
    const svg = fs.readFileSync(target, 'utf8');
    for (const label of ['Customer', 'Public API', 'Identity service', 'Customer database', 'Portal']) {
      assert.ok(svg.includes(label), `SVG lacks label ${label}`);
    }
    assert.ok(/<marker|marker-end/.test(svg), 'SVG has no arrowheads');
    assert.ok(/class="[^"]*boundary/.test(svg) || /stroke-dasharray/.test(svg), 'SVG has no boundary');
    const toast = await notification(/SVG exported/);
    ctx.exports.svg = target;
    return { observed: `${path.basename(target)} ${svg.length} bytes; labels, marker-end arrows and boundary present; toast "${toast.trim().slice(0, 80)}"` };
  });

  await step(ctx, 'J4.2', 4, 'Export PNG', 'palette "C4X: Export Diagram as PNG", pick 2x, type path', async () => {
    await dismissNotifications(ctx);
    await bridge(ctx, 'open', { file: nativeFile });
    const target = path.join(exportDir, 'architecture.png');
    await runPalette(ctx, 'C4X: Export Diagram as PNG');
    await pickQuickItem(ctx.win, '2x (Retina)');
    await typeIntoSimpleDialog(ctx.win, target);
    await until(() => fs.existsSync(target) && fs.statSync(target).size > 0, 'PNG file was not written', 45_000);
    const size = pngSize(target);
    assert.ok(size.width >= 1400, `PNG narrower than the 1400 px minimum: ${size.width}`);
    const toast = await notification(/PNG exported/);
    ctx.exports.png = target;
    return { observed: `${path.basename(target)} ${size.width}x${size.height} px, ${fs.statSync(target).size} bytes; toast "${toast.trim().slice(0, 80)}"` };
  });

  await step(ctx, 'J4.3', 4, 'Export Markdown to HTML', 'palette "C4X: Export Markdown to HTML" on architecture.md, type path', async () => {
    await dismissNotifications(ctx);
    await bridge(ctx, 'open', { file: markdownFile });
    const target = path.join(exportDir, 'architecture.html');
    await runPalette(ctx, 'C4X: Export Markdown to HTML');
    await typeIntoSimpleDialog(ctx.win, target);
    await until(() => fs.existsSync(target), 'HTML file was not written', 20_000);
    const html = fs.readFileSync(target, 'utf8');
    const svgCount = (html.match(/<svg[\s>]/g) || []).length;
    assert.ok(svgCount >= 2, `HTML has ${svgCount} diagrams, expected 2`);
    for (const label of ['Reader', 'Docs site', 'VS Code + C4X', 'Closing paragraph']) {
      assert.ok(html.includes(label), `HTML lacks ${label}`);
    }
    ctx.exports.html = target;
    return { observed: `${path.basename(target)} ${html.length} bytes with ${svgCount} inline SVG diagrams and the prose` };
  });

  await step(ctx, 'J4.4', 4, 'Export Markdown to PDF: print source', 'palette "C4X: Export - Preview" on architecture.md', async () => {
    await dismissNotifications(ctx);
    await bridge(ctx, 'open', { file: markdownFile });
    const target = path.join(ctx.workspaceDir, 'preview-architecture.html');
    await runPalette(ctx, 'C4X: Export - Preview');
    await until(() => fs.existsSync(target), 'print HTML was not written', 20_000);
    const toast = await notification(/Save as PDF/);
    const html = fs.readFileSync(target, 'utf8');
    const svgCount = (html.match(/<svg[\s>]/g) || []).length;
    assert.ok(svgCount >= 2, `print HTML has ${svgCount} diagrams`);
    ctx.exports.print = target;
    return { observed: `wrote ${path.basename(target)} with ${svgCount} diagrams; toast "${toast.trim().slice(0, 90)}". The PDF itself is produced by the browser print dialog.` };
  });
}

// ── Main ────────────────────────────────────────────────────────────────────

const run = {
  ctx: undefined,
  vsix: { file: path.basename(vsixPath), bytes: undefined, sha256: undefined },
  bridgeState: undefined,
  interrupted: undefined,
  cleanup: undefined,
};

function addNeedsHumanRows() {
  // The parts a machine cannot judge.
  needsHuman('H1', 1, 'Readable geometry and label fit', 'Open the native fixture preview, Fit, and judge whether every label and description is legible and stays inside its box (long descriptions are a known overflow). Record any clipped text.', 'J1.3 measured zoom, box sizes and containment only.');
  needsHuman('H2', 4, 'Export visual inspection', 'Open the exported SVG and PNG (copies saved next to this receipt as export-svg.svg / export-png.png) and the exported HTML in a browser. Check labels are legible, arrows point the right way, the Portal boundary encloses Web/API/database, and nothing is clipped.', 'J4.1-J4.3 checked file contents only.');
  needsHuman('H3', 4, 'Markdown PDF output', 'Run "C4X: Export - Preview" on a Markdown file, choose "Open in Browser", print to PDF from the OS dialog, and inspect the PDF pages: both diagrams present, nothing split across pages, labels legible.', 'J4.4 verified the print HTML only; the PDF is produced by the browser print dialog.');
  needsHuman('H4', 5, 'Keyboard feel and visible focus', 'Without a mouse: Tab from the editor into the preview, enter Edit mode, select and nudge nodes, open the inspector, save, and exit. Judge whether the focus ring is visible on every stop against your theme, the Tab order is sensible, and nothing traps focus.', 'J5.1-J5.3 confirmed reachability, key handling and that a focus outline style is set.');
  needsHuman('H5', 5, 'Screen reader announcements', 'With a screen reader (VoiceOver, NVDA or Orca) confirm that edit mode, selection, staged changes, validation errors and save outcomes are announced.', '');
  needsHuman('H6', 6, 'Architect UAT observations', 'An architect uses the installed build on a real model for ten minutes and records what helped, what blocked, and any defect.', '');
  needsHuman('H7', 6, 'Technical-writer UAT observations', 'A technical writer edits a diagram inside a real Markdown document through the CodeLens and records what helped, what blocked, and any defect.', '');
}

/**
 * Stops VS Code, keeps copies of the exports and removes the temporary
 * profile. Synchronous and idempotent, so the normal path and the signal
 * handlers share it; a failure becomes a harness error, not a lost receipt.
 */
function cleanupSync() {
  const ctx = run.ctx;
  if (!ctx || run.cleanup) { return; }
  run.cleanup = { killedProcesses: 0, profileRemoved: false };
  try {
    run.cleanup.killedProcesses = killVSCode(ctx);
  } catch (error) {
    harnessError('cleanup (stopping VS Code)', error);
  }
  for (const [kind, file] of Object.entries(ctx.exports)) {
    try {
      if (fs.existsSync(file)) { fs.copyFileSync(file, path.join(outputDir, `export-${kind}${path.extname(file)}`)); }
    } catch (error) {
      harnessError(`cleanup (copying the ${kind} export)`, error);
    }
  }
  if (process.env.C4X_KEEP_UAT_PROFILE === '1') {
    console.log(`Preserved UAT profile: ${ctx.tempRoot}`);
    run.cleanup.profilePreserved = ctx.tempRoot;
    return;
  }
  try {
    removeProfile(ctx);
    run.cleanup.profileRemoved = true;
  } catch (error) {
    harnessError('cleanup (removing the temporary profile)', error);
  }
}

/** Writes receipt.json and sets the exit code. Runs once, on every path. */
function finalize() {
  if (finalized) { return; }
  addNeedsHumanRows();
  const totals = results.reduce((acc, entry) => { acc[entry.status] = (acc[entry.status] || 0) + 1; return acc; }, {});
  const unexpected = results.filter(entry => ['FAIL', 'UNEXPECTED PASS', 'HARNESS ERROR'].includes(entry.status));
  let exitCode = unexpected.length > 0 ? 1 : 0;
  if (run.interrupted) { exitCode = { SIGHUP: 129, SIGINT: 130, SIGTERM: 143 }[run.interrupted]; }
  const { bridgeState } = run;
  const receipt = {
    generated: new Date().toISOString(),
    vsix: run.vsix,
    vscode: { version: bridgeState ? bridgeState.vscodeVersion : vscodeVersion, pinned: vscodeVersion, platform: `${process.platform}-${process.arch}` },
    extension: bridgeState && bridgeState.c4x ? { id: extensionId, version: bridgeState.c4x.version } : null,
    knownFailures: KNOWN_FAILURES,
    interrupted: run.interrupted || null,
    harnessErrors,
    cleanup: run.cleanup || null,
    results,
    totals,
    unexpected: unexpected.map(entry => `${entry.id} ${entry.status}`),
    exitCode,
  };
  finalized = true;
  try {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(`\nReceipt and screenshots: ${outputDir}`);
  } catch (error) {
    console.error(`Could not write the receipt to ${outputDir}: ${errorText(error)}`);
    exitCode = exitCode || 1;
  }
  console.log(`Totals: ${JSON.stringify(totals)}`);
  for (const entry of results.filter(item => item.status === 'UNEXPECTED PASS')) {
    console.log(`${entry.id} passed: ${entry.action}.`);
  }
  if (exitCode === 0) {
    console.log('No unexpected result: every step passed except the known failures listed in KNOWN_FAILURES.');
  } else if (!run.interrupted) {
    console.log(`Unexpected: ${receipt.unexpected.join('; ')}`);
  }
  process.exitCode = exitCode;
}

function onSignal(signal) {
  if (run.interrupted) { return; }
  run.interrupted = signal;
  console.error(`\n${signal} received: stopping VS Code, removing the temporary profile and writing the receipt.`);
  harnessError(`the run (interrupted by ${signal})`, new Error(`interrupted by ${signal}; the remaining steps did not run`));
  // All synchronous: nothing else runs before process.exit, and Playwright's
  // own exit handler then removes its artifacts folder.
  cleanupSync();
  finalize();
  process.exit(process.exitCode);
}

/** Runs one journey; an error outside its steps is recorded and the next journey still runs. */
async function runJourney(ctx, name, journey) {
  if (!ctx.app) {
    harnessError(name, new Error('skipped: VS Code is not running'));
    return;
  }
  try {
    await journey(ctx);
  } catch (error) {
    harnessError(name, error);
  }
}

async function main() {
  // Registered before Playwright's own handlers, so these run first.
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGHUP', () => onSignal('SIGHUP'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));
  fs.mkdirSync(outputDir, { recursive: true });

  try {
    if (!fs.existsSync(vsixPath)) {
      throw new Error(`Packaged extension not found: ${vsixPath}. Run make package first.`);
    }
    if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
      throw new Error('No display. On Linux run: xvfb-run -a -s "-screen 0 1920x1080x24" make test-vsix-uat');
    }
    expectedVersion = readVsixVersion(vsixPath);
    run.vsix.sha256 = sha256(vsixPath);
    run.vsix.bytes = fs.statSync(vsixPath).size;

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-installed-uat-'));
    const ctx = {
      tempRoot,
      extensionsDir: path.join(tempRoot, 'extensions'),
      userDataDir: path.join(tempRoot, 'user-data'),
      workspaceDir: path.join(tempRoot, 'workspace'),
      bridgeFile: path.join(tempRoot, 'bridge.json'),
      vscodePids: new Set(),
      exports: {},
    };
    run.ctx = ctx;
    for (const dir of [ctx.extensionsDir, ctx.userDataDir, ctx.workspaceDir]) { fs.mkdirSync(dir, { recursive: true }); }
    fs.writeFileSync(path.join(ctx.workspaceDir, 'architecture.c4x'), NATIVE_SOURCE);
    fs.writeFileSync(path.join(ctx.workspaceDir, 'architecture.md'), MARKDOWN_SOURCE);
    writeSettings(ctx.userDataDir);

    console.log(`VSIX ${run.vsix.file} ${run.vsix.bytes} bytes sha256 ${run.vsix.sha256}`);
    ctx.vscodeExecutablePath = await downloadAndUnzipVSCode({ version: vscodeVersion, cachePath });

    await step(ctx, 'J0.1', 0, 'Install the packaged VSIX into an isolated profile', '`code --install-extension c4x-<version>.vsix` with fresh --extensions-dir/--user-data-dir', async () => {
      await runCli([`--extensions-dir=${ctx.extensionsDir}`, `--user-data-dir=${ctx.userDataDir}`, '--install-extension', vsixPath, '--force']);
      const listed = await runCli([`--extensions-dir=${ctx.extensionsDir}`, `--user-data-dir=${ctx.userDataDir}`, '--list-extensions', '--show-versions']);
      const lines = listed.split(/\r?\n/).filter(Boolean);
      assert.deepStrictEqual(lines, [`${extensionId}@${expectedVersion}`], `profile holds ${lines.join(', ')}`);
      return { observed: `--list-extensions: ${lines.join(', ')}` };
    }, { windowless: true }); // runs before VS Code launches: there is no window to capture

    await launch(ctx, 'first launch');
    await step(ctx, 'J0.2', 0, 'The window runs the installed package, not the dev build', 'bridge reads vscode.extensions.getExtension(jpantsjoha.c4x)', async () => {
      await bridge(ctx, 'open', { file: path.join(ctx.workspaceDir, 'architecture.c4x') });
      run.bridgeState = await bridge(ctx, 'state');
      const c4x = run.bridgeState.c4x;
      assert.ok(c4x, 'C4X is not loaded');
      assert.strictEqual(c4x.version, expectedVersion, `the window runs C4X ${c4x.version}; the selected VSIX is ${expectedVersion}`);
      const relative = path.relative(ctx.extensionsDir, c4x.extensionPath);
      assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative), `C4X loaded from ${c4x.extensionPath}`);
      assert.ok(!c4x.extensionPath.startsWith(projectRoot), 'C4X loaded from the repository');
      return { observed: `VS Code ${run.bridgeState.vscodeVersion}; C4X ${c4x.version} from <profile>/extensions/${relative}` };
    });

    await runJourney(ctx, 'journey 1-2 (native editing)', journeyNative);
    await runJourney(ctx, 'journey 5 (keyboard)', journeyKeyboard);
    await runJourney(ctx, 'journey 3 (Markdown)', journeyMarkdown);
    await runJourney(ctx, 'journey 4 (exports)', journeyExports);
  } catch (error) {
    harnessError('setup', error);
  } finally {
    if (run.ctx) { await closeApp(run.ctx).catch(error => harnessError('closing VS Code', error)); }
    cleanupSync();
    finalize();
  }
}

main().catch(error => {
  console.error('Installed UAT journey failed to run:', error);
  process.exitCode = 1;
});
