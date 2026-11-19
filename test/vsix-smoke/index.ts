/**
 * Installed-package journeys (#368). Runs inside a VS Code host whose only C4X
 * is the extension installed from the packaged VSIX into an isolated profile.
 * Every journey step appends a token-bound receipt line AFTER its assertions
 * pass; the launcher (scripts/test-vsix-smoke.js) requires every expected step
 * to be present, so a launch that exits 0 without running a step fails.
 */
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { spawn } from 'node:child_process';

const EXTENSION_ID = 'jpantsjoha.c4x';
const THEMES = ['classic', 'c4-model', 'c4-standard', 'modern', 'muted', 'high-contrast', 'auto'];

interface RenderedNode { id: string; x: number; y: number; w: number; h: number; fill: string; stroke: string }
interface Rendered { nodeCount: number; text: string; nodes: RenderedNode[]; theme: string; revision: string }
interface SmokeApi {
  __test?: {
    whenPreviewRendered(uri: string, timeoutMs: number): Promise<Rendered>;
    snapshot(uri: string): { revision: string; nodes: Array<{ id: string; x: number; y: number }> } | undefined;
    webviewMessage(uri: string, message: unknown): Promise<void>;
    exportSvg(): string | undefined;
    quiet(uri: string, timeoutMs: number): Promise<void>;
    act(uri: string, action: 'stage' | 'discard' | 'probe', id: string): Promise<{ staged: number; editMode: boolean; nodes: RenderedNode[] }>;
  };
  extendMarkdownIt?(md: unknown): unknown;
  __mcp?: { registered: boolean; definitions(): Array<{ command: string; args: string[]; env: Record<string, string | number | null> }> };
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

function env(name: string): string {
  const value = process.env[name];
  assert.ok(value, `${name} was not supplied`);
  return value;
}

function normalizedPath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/** Element ids and labels declared in C4X source, read independently of the extension. */
function declaredElements(source: string): Array<{ id: string; label: string }> {
  const found: Array<{ id: string; label: string }> = [];
  for (const line of source.split(/\r?\n/)) {
    const match = /^\s*(?:Person|System|Container|Component|Deployment)\w*\(\s*([A-Za-z_]\w*)\s*,\s*"([^"]+)"/.exec(line);
    if (match) { found.push({ id: match[1], label: match[2] }); }
  }
  return found;
}

function receiptWriter(): (step: string, evidence: Record<string, unknown>) => void {
  const file = env('C4X_SMOKE_RECEIPT');
  const token = env('C4X_SMOKE_RECEIPT_TOKEN');
  return (step, evidence) => {
    fs.appendFileSync(file, JSON.stringify({ token, step, ...evidence }) + '\n');
  };
}

const QUICK_INPUT_SETTLE_MS = 1500;
const closeQuickInput = (): Thenable<unknown> => vscode.commands.executeCommand('workbench.action.closeQuickOpen');
const acceptQuickInput = (): Thenable<unknown> => vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem');

/**
 * Starts `command`, which opens a QuickPick, selects row `index` and accepts it.
 * A QuickInput cannot be observed from an extension, so this waits for it to
 * appear; any leftover input is closed first so an attempt cannot inherit one.
 */
async function pickRow(command: string, index: number): Promise<void> {
  await closeQuickInput();
  const pending = Promise.resolve(vscode.commands.executeCommand(command));
  await sleep(QUICK_INPUT_SETTLE_MS);
  for (let step = 0; step < index; step++) {
    await vscode.commands.executeCommand('workbench.action.quickOpenSelectNext');
    await sleep(120);
  }
  await acceptQuickInput();
  await Promise.race([pending, sleep(15000)]);
}


/**
 * Launches the MCP server exactly as the registered definition specifies and
 * returns the replies to the JSON-RPC lines sent. The harness may spawn a
 * child; the product itself never does (VS Code starts the server).
 */
function talkToServer(definition: { command: string; args: string[]; env: Record<string, string | number | null> }, requests: object[]): Promise<Array<Record<string, any>>> {
  return new Promise((resolve, reject) => {
    const childEnv: NodeJS.ProcessEnv = { ...process.env };
    for (const [key, value] of Object.entries(definition.env)) {
      if (value === null) { delete childEnv[key]; } else { childEnv[key] = String(value); }
    }
    const child = spawn(definition.command, definition.args, { env: childEnv, stdio: ['pipe', 'pipe', 'pipe'] });
    const replies: Array<Record<string, any>> = [];
    let buffer = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error(`MCP server answered ${replies.length} of ${requests.length} requests in 20 s`)); }, 20000);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) { replies.push(JSON.parse(line)); }
        if (replies.length === requests.length) { clearTimeout(timer); child.kill(); resolve(replies); }
      }
    });
    for (const request of requests) { child.stdin.write(JSON.stringify(request) + '\n'); }
  });
}

export async function run(): Promise<void> {
  const receipt = receiptWriter();
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(extension, `Installed extension ${EXTENSION_ID} was not discovered`);
  const expectedVersion = process.env.C4X_EXPECTED_VERSION;
  assert.strictEqual(extension.packageJSON.version, expectedVersion, 'Installed VSIX version mismatch');
  const relativeExtensionPath = path.relative(
    normalizedPath(env('C4X_EXPECTED_EXTENSION_ROOT')),
    normalizedPath(extension.extensionPath),
  );
  assert.ok(
    relativeExtensionPath !== '..' && !relativeExtensionPath.startsWith(`..${path.sep}`),
    `Extension loaded outside the clean VSIX profile: ${extension.extensionPath}`,
  );

  // ── a. activation and every contributed command ─────────────────────────
  const api = await extension.activate() as SmokeApi;
  assert.strictEqual(extension.isActive, true, 'Installed extension did not activate');
  const contributed: string[] = (extension.packageJSON.contributes.commands as Array<{ command: string }>).map(c => c.command);
  assert.ok(contributed.length >= 19, `Manifest contributes only ${contributed.length} commands`);
  const registered = new Set(await vscode.commands.getCommands(true));
  const missing = contributed.filter(command => !registered.has(command));
  assert.deepStrictEqual(missing, [], `Contributed commands not registered by the installed extension: ${missing.join(', ')}`);
  const test = api.__test;
  assert.ok(test, 'Packaged webview render test API was not enabled');
  receipt('activation', { version: expectedVersion, commands: contributed.length });

  // ── a2. the packaged MCP server (#357): registered, present, answers ─────
  assert.ok(api.__mcp, 'Packaged MCP registration probe was not enabled');
  assert.strictEqual(api.__mcp.registered, true, 'MCP provider was not registered on a host with the MCP API');
  const [mcpDefinition] = api.__mcp.definitions();
  assert.ok(mcpDefinition, 'MCP provider returned no definition');
  const bundlePath = mcpDefinition.args[0];
  assert.ok(fs.existsSync(bundlePath), `Packaged MCP bundle is missing: ${bundlePath}`);
  assert.ok(normalizedPath(bundlePath).startsWith(normalizedPath(extension.extensionPath) + path.sep), 'MCP bundle is outside the installed extension');
  const [initialised, listed] = await talkToServer(mcpDefinition, [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'c4x-smoke', version: '0' } } },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  ]);
  assert.strictEqual(initialised.result?.serverInfo?.version, expectedVersion, 'MCP server version differs from the package version');
  const toolNames: string[] = (listed.result?.tools ?? []).map((tool: { name: string }) => tool.name).sort();
  assert.deepStrictEqual(toolNames, ['lint_c4x', 'render_c4x', 'validate_c4x']);
  const initialise = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'c4x-smoke', version: '0' } } };
  const [, resourceList] = await talkToServer(mcpDefinition, [initialise, { jsonrpc: '2.0', id: 2, method: 'resources/list', params: {} }]);
  const resourceUris: string[] = (resourceList.result?.resources ?? []).map((resource: { uri: string }) => resource.uri);
  assert.ok(resourceUris.includes('c4x://syntax') && resourceUris.includes('c4x://guidelines'), `The packaged server does not advertise the resources its instructions name: ${resourceUris.join()}`);
  const [, ...resourceReads] = await talkToServer(mcpDefinition, [initialise, ...resourceUris.map((uri, index) => ({ jsonrpc: '2.0', id: index + 2, method: 'resources/read', params: { uri } }))]);
  resourceReads.forEach((reply, index) => {
    assert.ok(!reply.error, `Packaged resource ${resourceUris[index]} could not be read: ${JSON.stringify(reply.error)}`);
    assert.ok(String(reply.result?.contents?.[0]?.text).length > 200, `Packaged resource ${resourceUris[index]} is empty`);
  });
  receipt('mcp-server', { resources: resourceUris.length, name: initialised.result.serverInfo.name, version: initialised.result.serverInfo.version, tools: toolNames });

  const workspace = vscode.workspace.workspaceFolders?.[0];
  assert.ok(workspace, 'Missing isolated smoke workspace');
  const samplesDir = env('C4X_SAMPLES_DIR');
  const stage = async (relative: string, name: string): Promise<{ uri: vscode.Uri; source: string }> => {
    const source = fs.readFileSync(path.join(samplesDir, relative), 'utf8');
    const uri = vscode.Uri.joinPath(workspace.uri, name);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(source));
    return { uri, source };
  };
  const openStandalone = async (uri: vscode.Uri): Promise<{ document: vscode.TextDocument; rendered: Rendered }> => {
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, { preview: false });
    assert.strictEqual(await vscode.commands.executeCommand<boolean>('c4x.openPreview'), true, 'c4x.openPreview did not open');
    assert.strictEqual(await vscode.commands.executeCommand<boolean>('c4x.refreshPreview'), true, 'c4x.refreshPreview did not refresh');
    // Includes starting Chromium's isolated webview process on cold hosts.
    return { document, rendered: await test.whenPreviewRendered(document.uri.toString(), 30000) };
  };
  const closeAll = async (): Promise<void> => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await sleep(300);
  };

  // ── b. render receipts: C1, C2, C3 from samples/ ────────────────────────
  const diagrams: Array<[string, string, string]> = [
    ['render-system-context', 'visual-layout/c1-refined-metadata.c4x', 'c1.c4x'],
    ['render-container', 'visual-layout/c2-nested-locked.c4x', 'c2.c4x'],
    ['render-component', 'visual-layout/c3-relationship-routing.c4x', 'c3.c4x'],
  ];
  for (const [step, relative, name] of diagrams) {
    const { uri, source } = await stage(relative, name);
    const expected = declaredElements(source);
    assert.ok(expected.length >= 3, `${relative} declares too few elements to prove a render`);
    const { rendered } = await openStandalone(uri);
    assert.strictEqual(rendered.nodeCount, expected.length, `${relative}: webview drew ${rendered.nodeCount} nodes, source declares ${expected.length}`);
    for (const element of expected) {
      assert.ok(rendered.nodes.some(node => node.id === element.id), `${relative}: no rendered node for ${element.id}`);
      assert.ok(rendered.text.includes(element.label), `${relative}: webview omitted the label "${element.label}"`);
    }
    receipt(step, { file: relative, nodeCount: rendered.nodeCount, labels: expected.map(e => e.label) });
    await closeAll();
  }

  // ── b. Markdown entry: the c4x fence editor and the Markdown preview plugin ──
  const md = await stage('container/grpc-microservices.md', 'grpc.md');
  const mdElements = declaredElements(md.source.slice(md.source.indexOf('```c4x'), md.source.indexOf('```', md.source.indexOf('```c4x') + 6)));
  assert.ok(mdElements.length >= 5, 'Markdown sample fence declares too few elements');
  const mdDocument = await vscode.workspace.openTextDocument(md.uri);
  await vscode.window.showTextDocument(mdDocument, { preview: false });
  const lensOpen = vscode.commands.executeCommand('c4x.editMarkdownBlock', md.uri, 0);
  await lensOpen;
  const mdRendered = await test.whenPreviewRendered(md.uri.toString(), 30000);
  assert.strictEqual(mdRendered.nodeCount, mdElements.length, 'Markdown fence editor drew a different node count from the fence');
  for (const element of mdElements) {
    assert.ok(mdRendered.nodes.some(node => node.id === element.id), `Markdown fence editor drew no node for ${element.id}`);
    assert.ok(mdRendered.text.includes(element.label), `Markdown fence editor omitted "${element.label}"`);
  }
  assert.ok(api.extendMarkdownIt, 'Installed extension did not return extendMarkdownIt');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const MarkdownIt = require('markdown-it');
  const html: string = (api.extendMarkdownIt(new MarkdownIt()) as { render(source: string): string }).render(md.source);
  assert.match(html, /<svg[\s>]/, 'Installed Markdown plugin produced no SVG for the c4x fence');
  for (const element of mdElements.slice(0, 5)) {
    assert.ok(html.includes(element.label), `Installed Markdown plugin omitted "${element.label}"`);
  }
  receipt('render-markdown', { file: 'container/grpc-microservices.md', fenceNodeCount: mdRendered.nodeCount, markdownPluginSvg: true });
  await closeAll();

  // ── b2. AWS and Azure icons (#534): the one data file ships in the VSIX; the preview and the packaged server read it ──
  const iconDataFile = path.join(extension.extensionPath, 'data', 'cloud-icons.json');
  assert.ok(fs.existsSync(iconDataFile), `The VSIX ships no ${iconDataFile}`);
  assert.ok(path.resolve(path.dirname(bundlePath), '..', 'data', 'cloud-icons.json') === path.resolve(iconDataFile), 'The MCP bundle does not sit beside the icon data file it reads');
  const iconSource = [
    'graph TB',
    'System(files, "File store", "Uploads", $sprite="aws-simple-storage-service-s3-standard")',
    'System(db, "Orders", "Orders", $sprite="azure-sql-database")',
    'files -->|Loads| db',
    '',
  ].join('\n');
  const iconTitles = ['Res_Amazon-Simple-Storage-Service_S3-Standard_48', 'Icon-databases-130'];
  const iconUri = vscode.Uri.joinPath(workspace.uri, 'icons.c4x');
  await vscode.workspace.fs.writeFile(iconUri, Buffer.from(iconSource));
  const iconPreview = await openStandalone(iconUri);
  assert.strictEqual(iconPreview.rendered.nodeCount, 2, 'The preview drew the icon diagram with the wrong node count');
  const previewIconSvg = test.exportSvg();
  assert.ok(previewIconSvg, 'No export SVG held by the preview for the icon diagram');
  const [, rendering] = await talkToServer(mcpDefinition, [initialise, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'render_c4x', arguments: { code: iconSource } } }]);
  const serverIconSvg: string = rendering.result?.content?.find((item: { type: string }) => item.type === 'resource')?.resource?.text ?? '';
  assert.ok(serverIconSvg, `The packaged server drew no icon diagram: ${JSON.stringify(rendering.result?.content?.[0])}`);
  for (const title of iconTitles) {
    assert.ok(previewIconSvg.includes(title), `The preview SVG lacks the ${title} icon`);
    assert.ok(serverIconSvg.includes(title), `render_c4x from the VSIX lacks the ${title} icon`);
  }
  receipt('cloud-icons', { dataBytes: fs.statSync(iconDataFile).size, previewSvgBytes: Buffer.byteLength(previewIconSvg), serverSvgBytes: Buffer.byteLength(serverIconSvg) });
  await closeAll();

  // ── c. theme switch through the real Change Theme command ────────────────
  const themeDoc = await stage('visual-layout/c1-refined-metadata.c4x', 'theme.c4x');
  const signatures = new Map<string, string>();
  const applied: Array<{ requested: string; applied: string; configured: unknown; attempts: number }> = [];
  await openStandalone(themeDoc.uri);
  for (let index = 0; index < THEMES.length; index++) {
    const requested = THEMES[index];
    // The list is in THEME_NAMES order. A mis-timed QuickInput is retried (and
    // counted in the receipt); the final applied theme must still match.
    let attempts = 0;
    let themed: Rendered;
    do {
      attempts++;
      await pickRow('c4x.changeTheme', index);
      themed = await test.whenPreviewRendered(themeDoc.uri.toString(), 30000);
    } while (!themed.theme.startsWith(requested) && attempts < 3);
    assert.ok(themed.theme === requested || themed.theme.startsWith(`${requested}`), `Requested ${requested}, packaged host applied ${themed.theme}`);
    assert.strictEqual(themed.nodeCount, 3, `${requested}: webview drew ${themed.nodeCount} nodes`);
    const signature = JSON.stringify(themed.nodes.map(node => [node.id, node.fill, node.stroke]));
    signatures.set(requested, signature);
    applied.push({ requested, applied: themed.theme, configured: vscode.workspace.getConfiguration('c4x').get('theme'), attempts });
  }
  assert.strictEqual(new Set(THEMES.filter(name => name !== 'auto').map(name => signatures.get(name))).size, 6,
    'Six fixed themes must draw six distinct sets of node colours in the packaged webview');
  for (const row of applied) { assert.strictEqual(row.configured, row.requested, `c4x.theme was not persisted for ${row.requested}`); }
  receipt('theme-switch', { themes: applied });

  // Writing the c4x.theme setting restyles the open preview (#390, fixed in #398).
  // No forced render: the step waits for the render the setting change itself schedules.
  await vscode.workspace.getConfiguration('c4x').update('theme', 'muted', vscode.ConfigurationTarget.Workspace);
  let live: string | undefined;
  for (let poll = 0; poll < 40 && live !== signatures.get('muted'); poll++) {
    await sleep(200);
    live = JSON.stringify((await test.act(themeDoc.uri.toString(), 'probe', 'email')).nodes.map(node => [node.id, node.fill, node.stroke]));
  }
  assert.strictEqual(live, signatures.get('muted'), 'Writing c4x.theme did not restyle the open preview within 8 s');
  assert.ok(signatures.get('muted') !== signatures.get('auto'), 'The muted signature must differ from the previous theme for this step to prove anything');
  receipt('theme-setting-live', { requested: 'muted', appliedWithoutForcedRender: true });
  await closeAll();

  // ── d. visual edit journey: stage, Save, re-open, discard ────────────────
  const edit = await stage('visual-layout/c1-refined-metadata.c4x', 'edit.c4x');
  const uri = edit.uri.toString();
  const first = await openStandalone(edit.uri);
  const before = first.rendered.nodes.find(node => node.id === 'email');
  assert.ok(before, 'No rendered node for the element being moved');
  const snapshot = test.snapshot(uri);
  assert.ok(snapshot, 'Host has no layout snapshot after render');
  const node = snapshot.nodes.find(candidate => candidate.id === 'email');
  assert.ok(node && node.x === 560 && node.y === 290, `Unexpected starting position ${JSON.stringify(node)}`);
  const target = { x: 640, y: 330 };
  await test.webviewMessage(uri, { type: 'dirtyStateChanged', dirty: true });
  await test.webviewMessage(uri, {
    type: 'visualLayout.applySemanticEdits', protocolVersion: 1, revision: snapshot.revision,
    edits: [{ id: 'email', ...target }],
  });
  const savedText = first.document.getText();
  assert.match(savedText, /Email System[^\n]*\$x="640(\.0)?"[^\n]*\$y="330(\.0)?"/, 'Save did not write the moved position into the source');
  assert.strictEqual(savedText.replace(/\$x="640(\.0)?", \$y="330(\.0)?"/, '$x="560.0", $y="290.0"'), edit.source,
    'Save changed source outside the moved element');
  assert.ok(await first.document.save(), 'Saved document was not written to disk');
  const onDisk = fs.readFileSync(edit.uri.fsPath, 'utf8');
  assert.strictEqual(onDisk, savedText, 'Disk content differs from the saved buffer');
  await test.webviewMessage(uri, { type: 'dirtyStateChanged', dirty: false });
  await closeAll();
  // Re-open from disk in a fresh panel and read the position back from the DOM.
  const second = await openStandalone(edit.uri);
  const after = second.rendered.nodes.find(candidate => candidate.id === 'email');
  assert.ok(after, 'Moved node missing after re-open');
  const reopened = test.snapshot(uri)?.nodes.find(candidate => candidate.id === 'email');
  assert.deepStrictEqual({ x: reopened?.x, y: reopened?.y }, target, 'Re-opened layout did not keep the saved position');
  assert.ok(Math.abs((after.x - before.x) - (target.x - 560)) < 1 && Math.abs((after.y - before.y) - (target.y - 290)) < 1,
    `Rendered node moved by (${after.x - before.x}, ${after.y - before.y}), expected (${target.x - 560}, ${target.y - 290})`);
  receipt('edit-save-reopen', { id: 'email', from: { x: 560, y: 290 }, to: target, renderedDelta: { x: after.x - before.x, y: after.y - before.y } });

  // Discard through the packaged webview's own handlers: a real arrow-key press
  // stages a move on the canvas, then the real Discard button reverts it.
  const bytesBefore = fs.readFileSync(edit.uri.fsPath);
  const versionBefore = second.document.version;
  const original = second.rendered.nodes.find(candidate => candidate.id === 'email');
  assert.ok(original, 'No rendered node for the discard step');
  // The host's render ack, then no debounced render pending for a quiet interval: staging starts from a settled canvas.
  await test.whenPreviewRendered(uri, 30000);
  await test.quiet(uri, 10000);
  const staged = await test.act(uri, 'stage', 'email');
  const moved = staged.nodes.find(candidate => candidate.id === 'email');
  assert.ok(moved && staged.staged >= 1 && staged.editMode, 'The webview did not stage the move');
  assert.ok(moved.x - original.x >= 10, `Staging did not move the drawn node (${original.x} -> ${moved.x})`);
  // Only Discard may revert the move: a stray host re-render would also reset the canvas and mask a broken Discard.
  await sleep(300);
  const held = (await test.act(uri, 'probe', 'email')).nodes.find(candidate => candidate.id === 'email');
  assert.ok(held && held.x === moved.x, `The staged move did not hold before Discard (${moved.x} -> ${held?.x}); a re-render intervened`);
  assert.ok(bytesBefore.equals(fs.readFileSync(edit.uri.fsPath)), 'Staging alone changed the file');
  const discarded = await test.act(uri, 'discard', 'email');
  const reverted = discarded.nodes.find(candidate => candidate.id === 'email');
  assert.ok(reverted, 'Node missing after Discard');
  assert.deepStrictEqual({ x: reverted.x, y: reverted.y, staged: discarded.staged, editMode: discarded.editMode },
    { x: original.x, y: original.y, staged: 0, editMode: false }, 'Discard did not revert the staged move');
  assert.strictEqual(second.document.version, versionBefore, 'Discard changed the document');
  assert.strictEqual(second.document.isDirty, false, 'Discard left the document dirty');
  assert.ok(bytesBefore.equals(fs.readFileSync(edit.uri.fsPath)), 'Discard changed the file bytes');
  receipt('edit-discard', { fileBytes: bytesBefore.length, byteIdentical: true, stagedX: moved.x, revertedX: reverted.x, originalX: original.x });

  // ── e. export: SVG, PNG and HTML through the real commands and a real file dialog ──
  // The source lives in a subfolder, so a suggestion that falls back to the workspace
  // root, or nests an absolute path under it (#435), saves to a different directory.
  const exportSource = await stage('visual-layout/c1-refined-metadata.c4x', path.join('diagrams', 'arch', 'export-src.c4x'));
  await closeAll();
  const exportRendered = (await openStandalone(exportSource.uri)).rendered;
  const expectedSvg = test.exportSvg();
  assert.ok(expectedSvg, 'No export SVG held by the preview');
  const ids = (svg: string): string[] => [...svg.matchAll(/<g class="node[^"]*" data-id="([^"]+)"/g)].map(m => m[1]).sort();
  // The simple file dialog needs a variable number of accepts: the first can complete the typed path
  // rather than save (observed with an unfocused host window, vscode.window.state.focused === false).
  // So accept, then watch for the file, and accept again until it appears. The file on disk is the oracle.
  // The directory of the file is asserted too: the dialog's suggested path is what the user accepts.
  const exportFile = async (extension: string, expectedDir: string, command: string, ...args: unknown[]): Promise<string> => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      await closeQuickInput();
      const known = listFiles(workspace.uri.fsPath);
      const find = (): string | undefined => [...listFiles(workspace.uri.fsPath)].find(file => !known.has(file) && file.endsWith(extension));
      // Not awaited: some export commands wait on an "Open file" notification after the file is written.
      void Promise.resolve(vscode.commands.executeCommand(command, ...args)).catch(() => undefined);
      await sleep(QUICK_INPUT_SETTLE_MS);
      for (let accepts = 0; accepts < 4; accepts++) {
        await acceptQuickInput();
        for (let poll = 0; poll < 15; poll++) {
          await sleep(200);
          const created = find();
          if (created) {
            await sleep(300);
            assert.strictEqual(normalizedPath(path.dirname(created)), normalizedPath(expectedDir),
              `${command} saved ${path.relative(workspace.uri.fsPath, created)}; expected the folder ${path.relative(workspace.uri.fsPath, expectedDir) || '.'}`);
            return created;
          }
        }
      }
    }
    throw new Error(`${command} produced no ${extension} file; workspace now: ${[...listFiles(workspace.uri.fsPath)].join(', ')}`);
  };
  const exportDir = path.dirname(exportSource.uri.fsPath);
  const relativeToWorkspace = (file: string): string => path.relative(workspace.uri.fsPath, file).split(path.sep).join('/');
  // The suggestion follows the active text editor, so make the source the active editor for SVG and PNG.
  await vscode.window.showTextDocument(exportSource.uri, { preview: false, viewColumn: vscode.ViewColumn.One });

  const svgPath = await exportFile('.svg', exportDir, 'c4x.exportSvg');
  const exported = fs.readFileSync(svgPath, 'utf8');
  assert.deepStrictEqual(ids(exported), ids(expectedSvg), 'Exported SVG nodes differ from the rendered diagram');
  assert.deepStrictEqual(ids(exported), exportRendered.nodes.map(n => n.id).sort(), 'Exported SVG nodes differ from the webview DOM nodes');
  for (const label of ['Customer', 'Banking System', 'Email System']) {
    assert.ok(exported.includes(label), `Exported SVG omitted "${label}"`);
  }
  assert.ok(exported.startsWith('<?xml'), 'Exported SVG is not standalone');
  receipt('export-svg', { path: relativeToWorkspace(svgPath), bytes: Buffer.byteLength(exported), nodes: ids(exported).length });

  // The PNG command requires a diagram text editor to be active, not the webview.
  await vscode.window.showTextDocument(exportSource.uri, { preview: false, viewColumn: vscode.ViewColumn.One });
  const pngPath = await exportFile('.png', exportDir, 'c4x.exportPng');
  const png = fs.readFileSync(pngPath);
  assert.ok(png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'Exported PNG has no PNG signature');
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.ok(width >= 1400 && height > 100 && png.length > 5000, `Exported PNG is implausible: ${width}x${height}, ${png.length} bytes`);
  receipt('export-png', { path: relativeToWorkspace(pngPath), bytes: png.length, width, height });

  const htmlPath = await exportFile('.html', path.dirname(md.uri.fsPath), 'c4x.exportHtml', md.uri);
  const exportedHtml = fs.readFileSync(htmlPath, 'utf8');
  assert.match(exportedHtml, /<svg[\s>]/, 'Exported HTML has no diagram SVG');
  for (const element of mdElements.slice(0, 5)) {
    assert.ok(exportedHtml.includes(element.label), `Exported HTML omitted "${element.label}"`);
  }
  receipt('export-html', { path: relativeToWorkspace(htmlPath), bytes: Buffer.byteLength(exportedHtml), svgInline: true });
  // PDF (c4x.exportPdf) hands the page to the system browser's print dialog; this harness cannot drive it, so it is a person's step.
  await closeAll();
}

function listFiles(root: string): Set<string> {
  const files = new Set<string>();
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { stack.push(full); } else { files.add(full); }
    }
  }
  return files;
}
