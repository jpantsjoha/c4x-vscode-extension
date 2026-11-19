import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * #357: the extension offers its bundled MCP server to VS Code with no user
 * configuration. This does not start a chat session; it reads what the
 * provider would hand VS Code.
 */
describe('MCP server registration (#357)', () => {
  const EXTENSION_ID = 'jpantsjoha.c4x';
  const hostHasApi = typeof (vscode as { lm?: { registerMcpServerDefinitionProvider?: unknown } }).lm?.registerMcpServerDefinitionProvider === 'function';

  async function api(): Promise<{ __mcp: { registered: boolean; definitions(): Array<{ command: string; args: string[]; label: string; version?: string; env: Record<string, unknown> }> } }> {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, 'Extension not found');
    return (await extension.activate()) as never;
  }

  it('declares the provider and the setting in package.json', () => {
    const pkg = vscode.extensions.getExtension(EXTENSION_ID)!.packageJSON;
    assert.deepStrictEqual(pkg.contributes.mcpServerDefinitionProviders, [{ id: 'c4x.mcpServer', label: 'C4X' }]);
    assert.strictEqual(pkg.contributes.configuration.properties['c4x.mcp.register'].default, true);
  });

  it('registers a provider whose definition runs the packaged bundle', async function () {
    if (!hostHasApi) { this.skip(); }
    const { __mcp } = await api();
    assert.strictEqual(__mcp.registered, true);
    const [definition] = __mcp.definitions();
    assert.ok(definition, 'no definition returned with the setting on');
    const extension = vscode.extensions.getExtension(EXTENSION_ID)!;
    assert.strictEqual(definition.command, process.execPath);
    assert.deepStrictEqual(definition.args, [path.join(extension.extensionPath, 'mcp', 'c4x-mcp-server.bundle.cjs')]);
    assert.ok(fs.existsSync(definition.args[0]), 'the bundle the definition names does not exist');
    assert.strictEqual(definition.version, extension.packageJSON.version);
  });

  it('returns no definition when the setting is off, without a reload', async function () {
    if (!hostHasApi) { this.skip(); }
    const { __mcp } = await api();
    const config = vscode.workspace.getConfiguration('c4x.mcp');
    try {
      await config.update('register', false, vscode.ConfigurationTarget.Global);
      assert.deepStrictEqual(__mcp.definitions(), []);
    } finally {
      await config.update('register', undefined, vscode.ConfigurationTarget.Global);
    }
    assert.strictEqual(__mcp.definitions().length, 1);
  });
});
