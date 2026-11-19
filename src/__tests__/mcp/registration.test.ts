import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import type * as vscode from 'vscode';
import {
  MCP_PROVIDER_ID,
  MCP_SETTING,
  mcpApiAvailable,
  registerMcpServer,
} from '../../mcp/registration';

class FakeStdio {
  label: string;
  command: string;
  args: string[];
  env: Record<string, string | number | null>;
  version?: string;
  constructor(label: string, command: string, args: string[] = [], env: Record<string, string | number | null> = {}, version?: string) {
    this.label = label;
    this.command = command;
    this.args = args;
    this.env = env;
    this.version = version;
  }
}

function fakeHost(opts: { api: boolean; setting?: boolean; web?: boolean; schemes?: string[]; trusted?: boolean }) {
  const state = { setting: opts.setting ?? true, registered: [] as Array<{ id: string; provider: vscode.McpServerDefinitionProvider }>, listeners: [] as Array<(e: { affectsConfiguration(s: string): boolean }) => void>, disposed: 0, spawned: 0, trustListeners: [] as Array<() => void>, folderListeners: [] as Array<() => void> };
  const host = {
    Uri: { joinPath: (base: { fsPath: string }, ...parts: string[]) => ({ fsPath: path.join(base.fsPath, ...parts) }) },
    EventEmitter: class {
      private handlers: Array<() => void> = [];
      event = (h: () => void) => { this.handlers.push(h); return { dispose() {} }; };
      fire() { this.handlers.forEach(h => h()); }
      dispose() {}
    },
    env: { uiKind: opts.web ? 2 : 1 },
    UIKind: { Desktop: 1, Web: 2 },
    workspace: {
      workspaceFolders: opts.schemes?.length === 0 ? undefined : (opts.schemes ?? ['file']).map((scheme) => ({ uri: { scheme } })),
      isTrusted: opts.trusted ?? true,
      onDidGrantWorkspaceTrust: (l: () => void) => { state.trustListeners.push(l); return { dispose() {} }; },
      onDidChangeWorkspaceFolders: (l: () => void) => { state.folderListeners.push(l); return { dispose() {} }; },
      getConfiguration: () => ({ get: (_k: string, d: boolean) => (state.setting === undefined ? d : state.setting) }),
      onDidChangeConfiguration: (l: (e: { affectsConfiguration(s: string): boolean }) => void) => { state.listeners.push(l); return { dispose() {} }; },
    },
    ...(opts.api ? {
      McpStdioServerDefinition: FakeStdio,
      lm: { registerMcpServerDefinitionProvider: (id: string, provider: vscode.McpServerDefinitionProvider) => { state.registered.push({ id, provider }); return { dispose: () => { state.disposed++; } }; } },
    } : { lm: {} }),
  };
  return { host: host as unknown as typeof vscode, state };
}

const context = () => ({
  extensionUri: { fsPath: '/ext' } as vscode.Uri,
  subscriptions: [] as vscode.Disposable[],
  extension: { packageJSON: { version: '9.9.9' } },
});

describe('MCP registration (#357)', () => {
  it('detects the API only when both the provider function and the definition class exist', () => {
    assert.strictEqual(mcpApiAvailable(fakeHost({ api: true }).host), true);
    assert.strictEqual(mcpApiAvailable(fakeHost({ api: false }).host), false);
  });

  it('does nothing and does not throw on a host without the API', () => {
    const { host, state } = fakeHost({ api: false });
    const ctx = context();
    assert.strictEqual(registerMcpServer(ctx, host), undefined);
    assert.strictEqual(state.registered.length, 0);
    assert.strictEqual(ctx.subscriptions.length, 0);
  });

  it('registers one provider whose definition runs the packaged bundle with the package version', () => {
    const { host, state } = fakeHost({ api: true });
    const ctx = context();
    const registration = registerMcpServer(ctx, host);
    assert.ok(registration);
    assert.strictEqual(state.registered.length, 1);
    assert.strictEqual(state.registered[0].id, MCP_PROVIDER_ID);
    const [definition] = state.registered[0].provider.provideMcpServerDefinitions!({} as vscode.CancellationToken) as unknown as FakeStdio[];
    assert.strictEqual(definition.command, process.execPath);
    assert.deepStrictEqual(definition.args, [path.join('/ext', 'mcp', 'c4x-mcp-server.bundle.cjs')]);
    assert.strictEqual(definition.env.ELECTRON_RUN_AS_NODE, '1');
    assert.strictEqual(definition.version, '9.9.9');
    assert.strictEqual(ctx.subscriptions.length, 1);
  });

  it('returns no definition when the setting is off, and asks VS Code again when it changes', () => {
    const { host, state } = fakeHost({ api: true, setting: false });
    registerMcpServer(context(), host);
    const provider = state.registered[0].provider;
    assert.deepStrictEqual(provider.provideMcpServerDefinitions!({} as vscode.CancellationToken), []);
    let refreshed = 0;
    provider.onDidChangeMcpServerDefinitions!(() => { refreshed++; });
    state.listeners[0]({ affectsConfiguration: (s) => s === MCP_SETTING });
    state.listeners[0]({ affectsConfiguration: () => false });
    assert.strictEqual(refreshed, 1);
    state.setting = true;
    assert.strictEqual((provider.provideMcpServerDefinitions!({} as vscode.CancellationToken) as unknown[]).length, 1);
  });

  it('unregisters on dispose', () => {
    const { host, state } = fakeHost({ api: true });
    registerMcpServer(context(), host)!.dispose();
    assert.strictEqual(state.disposed, 1);
  });

  describe('environments where no process definition is offered', () => {
    const provide = (state: ReturnType<typeof fakeHost>['state']) => state.registered[0].provider.provideMcpServerDefinitions!({} as vscode.CancellationToken) as unknown[];

    it('offers one definition in a local, trusted workspace and with no folder open', () => {
      const local = fakeHost({ api: true, schemes: ['file'] });
      registerMcpServer(context(), local.host);
      assert.strictEqual(provide(local.state).length, 1);
      const empty = fakeHost({ api: true, schemes: [] });
      registerMcpServer(context(), empty.host);
      assert.strictEqual(provide(empty.state).length, 1);
    });

    it('offers none in a virtual workspace, including one virtual folder among local ones', () => {
      for (const schemes of [['vscode-vfs'], ['file', 'vscode-vfs']]) {
        const { host, state } = fakeHost({ api: true, schemes });
        registerMcpServer(context(), host);
        assert.deepStrictEqual(provide(state), [], schemes.join());
      }
    });

    it('offers none in the web host', () => {
      const { host, state } = fakeHost({ api: true, web: true });
      registerMcpServer(context(), host);
      assert.deepStrictEqual(provide(state), []);
    });

    it('offers none in an untrusted workspace, and asks again when trust is granted or folders change', () => {
      const { host, state } = fakeHost({ api: true, trusted: false });
      registerMcpServer(context(), host);
      assert.deepStrictEqual(provide(state), []);
      let refreshed = 0;
      state.registered[0].provider.onDidChangeMcpServerDefinitions!(() => { refreshed++; });
      state.trustListeners[0]();
      state.folderListeners[0]();
      assert.strictEqual(refreshed, 2);
    });
  });

  it('imports no process-spawning module: VS Code starts the server, the extension never does', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '..', '..', 'mcp', 'registration.ts'), 'utf8');
    assert.ok(!/child_process|\bspawn\b|\bexec(File)?\b|\bfork\b/.test(source.replace(/\/\/.*$/gm, '')));
  });
});
