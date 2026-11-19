// Zero-configuration registration of the bundled C4X MCP server (#357).
//
// VS Code owns the whole lifecycle: this module only *describes* the server
// (command, arguments) when VS Code asks. It starts no process, reads no
// other tool's configuration or credentials and writes no MCP configuration
// file. VS Code starts the server lazily, when an
// agent session needs it. On the VS Code versions checked (source tags 1.101.0 and 1.105.0, 1.128.0 and `main`) an
// extension-provided server is trusted by default, so there is no separate
// first-start prompt; the setting `c4x.mcp.register` is the off switch.
// Type-only: the host is passed in, so this module loads (and is unit-tested) without VS Code.
import type * as vscode from 'vscode';

export const MCP_PROVIDER_ID = 'c4x.mcpServer';
export const MCP_SETTING = 'c4x.mcp.register';
export const MCP_BUNDLE_SEGMENTS = ['mcp', 'c4x-mcp-server.bundle.cjs'] as const;
export const MCP_SERVER_LABEL = 'C4X';

/** True when this VS Code has the stable extension MCP API (1.101 and later). */
export function mcpApiAvailable(host: typeof vscode): boolean {
  const lm = (host as { lm?: { registerMcpServerDefinitionProvider?: unknown } }).lm;
  return (
    typeof lm?.registerMcpServerDefinitionProvider === 'function' &&
    typeof (host as { McpStdioServerDefinition?: unknown }).McpStdioServerDefinition === 'function'
  );
}

export function mcpRegistrationEnabled(host: typeof vscode): boolean {
  return host.workspace.getConfiguration('c4x.mcp').get<boolean>('register', true) !== false;
}

/**
 * Why the server must not be offered in this environment, or undefined when it may be.
 * A process definition is only meaningful where a local process can run and the
 * workspace is trusted: not in the web host, not in a virtual workspace
 * (any folder whose scheme is not `file`), and not in Restricted Mode.
 */
export function mcpWithheldReason(host: typeof vscode): 'web' | 'virtual-workspace' | 'untrusted-workspace' | undefined {
  if (host.env.uiKind === host.UIKind.Web) {
    return 'web';
  }
  if ((host.workspace.workspaceFolders ?? []).some((folder) => folder.uri.scheme !== 'file')) {
    return 'virtual-workspace';
  }
  if (host.workspace.isTrusted === false) {
    return 'untrusted-workspace';
  }
  return undefined;
}

export interface McpRegistration extends vscode.Disposable {
  /** What the provider returns right now (empty when the setting is off). */
  definitions(): vscode.McpServerDefinition[];
}

/**
 * Registers the provider when the host has the API; returns undefined on an
 * older host so activation proceeds exactly as before.
 */
export function registerMcpServer(
  context: Pick<vscode.ExtensionContext, 'extensionUri' | 'subscriptions'> & { extension: { packageJSON: { version?: string } } },
  host: typeof vscode,
): McpRegistration | undefined {
  if (!mcpApiAvailable(host)) {
    return undefined;
  }
  const serverPath = host.Uri.joinPath(context.extensionUri, ...MCP_BUNDLE_SEGMENTS).fsPath;
  const changed = new host.EventEmitter<void>();

  const definitions = (): vscode.McpServerDefinition[] => {
    if (!mcpRegistrationEnabled(host) || mcpWithheldReason(host) !== undefined) {
      return [];
    }
    return [
      new host.McpStdioServerDefinition(
        MCP_SERVER_LABEL,
        // The editor's own Node.js; ELECTRON_RUN_AS_NODE makes the Electron binary act as plain Node.
        process.execPath,
        [serverPath],
        { ELECTRON_RUN_AS_NODE: '1' },
        context.extension.packageJSON.version,
      ),
    ];
  };

  const provider: vscode.McpServerDefinitionProvider = {
    onDidChangeMcpServerDefinitions: changed.event,
    provideMcpServerDefinitions: () => definitions(),
  };

  const registration = host.lm.registerMcpServerDefinitionProvider(MCP_PROVIDER_ID, provider);
  // Honour the setting without a reload: tell VS Code to ask again.
  const listener = host.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration(MCP_SETTING)) {
      changed.fire();
    }
  });
  // The answer depends on the workspace: ask VS Code again when it changes.
  const environmentListeners = [
    host.workspace.onDidGrantWorkspaceTrust(() => changed.fire()),
    host.workspace.onDidChangeWorkspaceFolders(() => changed.fire()),
  ];
  const disposable: McpRegistration = {
    definitions,
    dispose: () => {
      environmentListeners.forEach((l) => l.dispose());
      listener.dispose();
      registration.dispose();
      changed.dispose();
    },
  };
  context.subscriptions.push(disposable);
  return disposable;
}
