#!/usr/bin/env node
'use strict';
// Smoke test of the npm package `c4x` (#356). Packs the tarball, installs it into a temporary project
// from the tarball path (npm --offline: the registry is never contacted), then:
//   1. starts the installed `c4x-mcp` over stdio and gets tools/list including render_c4x;
//   2. runs the installed `c4x render` on a sample and checks the SVG;
//   3. runs the bundle contract test (src/__tests__/security/bundle-contract.test.ts) against the
//      installed package's files (C4X_BUNDLE_ROOT), so the files a user runs are the files tested.
// Nothing is published; no npm login. Usage: node scripts/test-npm-package.js [--keep]
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert');
const { spawn, spawnSync } = require('node:child_process');
const { stage, pack, npmInvocation, binScript, PACKAGE_FILES } = require('./npm-package');

const ROOT = path.resolve(__dirname, '..');
// An AWS and an Azure icon: the data file ships once in the package and the bundles read it (#534).
const ICON_SAMPLE = 'graph TB\nSystem(files, "File store", "Uploads", $sprite="aws-simple-storage-service-s3-standard")\nSystem(db, "Orders", "Orders", $sprite="azure-sql-database")\nfiles -->|Loads| db\n';
const ICON_TITLES = ['Res_Amazon-Simple-Storage-Service_S3-Standard_48', 'Icon-databases-130'];
const SAMPLE = 'graph TB\nPerson(user, "User", "A person")\nSystem(app, "App", "A system")\nuser -->|Uses| app\n';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 300000, ...options });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} exited ${result.status}${result.signal ? ` (${result.signal})` : ''}${result.error ? `\n${result.error}` : ''}\n--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}`);
  }
  return result;
}

/** Sends the MCP handshake and tools/list to a stdio server; resolves with the tool names. */
function listTools(bin, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error(`no tools/list reply in 20 s; stderr: ${err}`)); }, 20000);
    child.stderr.on('data', d => { err += d; });
    child.stdout.on('data', d => {
      out += d;
      for (const line of out.split('\n')) {
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (message.id === 2) {
          clearTimeout(timer);
          child.stdin.end();
          child.kill();
          resolve(message.result.tools.map(t => t.name));
        }
      }
    });
    child.on('error', reject);
    const send = m => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...m })}\n`);
    send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'npm-smoke', version: '0' } } });
    send({ method: 'notifications/initialized' });
    send({ id: 2, method: 'tools/list' });
  });
}

/** One render_c4x call over stdio; resolves with the SVG, or rejects with the tool's text when it drew none. */
function renderOverMcp(bin, cwd, code) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('no render_c4x reply in 30 s')); }, 30000);
    child.stdout.on('data', d => {
      out += d;
      for (const line of out.split('\n')) {
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (message.id === 2) {
          clearTimeout(timer);
          child.stdin.end();
          child.kill();
          const svg = message.result.content.find(c => c.type === 'resource');
          if (svg) resolve(svg.resource.text); else reject(new Error(message.result.content[0].text));
        }
      }
    });
    child.on('error', reject);
    const send = m => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...m })}\n`);
    send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'npm-smoke', version: '0' } } });
    send({ method: 'notifications/initialized' });
    send({ id: 2, method: 'tools/call', params: { name: 'render_c4x', arguments: { code } } });
  });
}

async function main() {
  // Real path: macOS temp directories sit behind a symlink, and the contract's sandbox compares a Worker's real script path.
  const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-npm-smoke-')));
  try {
    const staged = path.join(scratch, 'stage');
    stage(staged);
    const tarball = pack(staged, path.join(scratch, 'tarball'));
    const project = path.join(scratch, 'project');
    fs.mkdirSync(project);
    fs.writeFileSync(path.join(project, 'package.json'), '{"name":"smoke","version":"1.0.0","private":true}\n');
    // The registry is unreachable on purpose: a package with no dependencies installs from the tarball alone.
    const npmCli = npmInvocation();
    run(npmCli.command, [...npmCli.args, 'install', tarball, '--offline', '--no-audit', '--no-fund', '--registry', 'http://127.0.0.1:9/'], { cwd: project });

    const installed = path.join(project, 'node_modules', 'c4x');
    const files = [];
    const walk = rel => {
      for (const e of fs.readdirSync(path.join(installed, rel), { withFileTypes: true })) {
        const child = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) walk(child); else files.push(child);
      }
    };
    walk('');
    assert.deepStrictEqual(files.sort(), [...PACKAGE_FILES].sort(), 'installed package holds exactly the allowlist');
    assert.deepStrictEqual(fs.readdirSync(path.join(project, 'node_modules')).filter(n => !n.startsWith('.')), ['c4x'], 'installing pulled in no other package');

    // The real bundle each bin entry names (read from the installed package.json), run with this Node:
    // node_modules/.bin holds shims on Windows.
    const script = name => binScript(installed, name);
    const tools = await listTools(script('c4x-mcp'), project);
    for (const tool of ['validate_c4x', 'lint_c4x', 'render_c4x']) assert.ok(tools.includes(tool), `tools/list lacks ${tool}: ${tools}`);
    console.log(`ok  c4x-mcp over stdio: tools/list = ${tools.join(', ')}`);

    const sample = path.join(project, 'sample.c4x');
    fs.writeFileSync(sample, SAMPLE);
    const rendered = run(process.execPath, [script('c4x'), 'render', sample], { cwd: project });
    assert.match(rendered.stdout, /^(<\?xml[^>]*>\s*)?<svg[\s\S]*<\/svg>\s*$/, 'c4x render wrote an SVG');
    assert.ok(rendered.stdout.includes('User') && rendered.stdout.includes('App'), 'the SVG carries the sample labels');
    console.log(`ok  c4x render: ${rendered.stdout.length} bytes of SVG`);

    const iconSample = path.join(project, 'icons.c4x');
    fs.writeFileSync(iconSample, ICON_SAMPLE);
    const withIcons = run(process.execPath, [script('c4x'), 'render', iconSample], { cwd: project });
    for (const title of ICON_TITLES) assert.ok(withIcons.stdout.includes(title), `c4x render from the installed package drew no ${title} icon`);
    const viaServer = await renderOverMcp(script('c4x-mcp'), project, ICON_SAMPLE);
    for (const title of ICON_TITLES) assert.ok(viaServer.includes(title), `render_c4x from the installed package drew no ${title} icon`);
    assert.ok(fs.existsSync(path.join(installed, 'data', 'cloud-icons.json')), 'the package carries data/cloud-icons.json');
    console.log(`ok  AWS and Azure icons drawn by c4x render and render_c4x from the installed package: ${withIcons.stdout.length} bytes of SVG`);

    const lint = run(process.execPath, [script('c4x-lint'), sample, '--max-severity', 'error', '--quiet'], { cwd: project, allowFailure: true });
    assert.ok(lint.status === 0 || lint.status === 1, `c4x-lint ran (exit ${lint.status}): ${lint.stderr}`);
    console.log(`ok  c4x-lint ran (exit ${lint.status})`);

    const contract = run(process.execPath, [
      path.join(ROOT, 'node_modules', 'mocha', 'bin', 'mocha.js'),
      '--no-config', '--require', './scripts/register-unit-ts.js', '--ui', 'bdd', '--timeout', '120000',
      'src/__tests__/security/bundle-contract.test.ts',
    ], { cwd: ROOT, env: { ...process.env, C4X_BUNDLE_ROOT: installed, FORCE_COLOR: '0' } });
    const summary = contract.stdout.split('\n').filter(l => /passing|failing|pending/.test(l)).join(' ').trim();
    console.log(`ok  bundle contract against the installed package: ${summary}`);
  } finally {
    if (process.argv.includes('--keep')) console.log(`kept ${scratch}`);
    else fs.rmSync(scratch, { recursive: true, force: true });
  }
}

main().then(() => console.log('npm package smoke test passed'), e => { console.error(e.stack || e); process.exit(1); });
