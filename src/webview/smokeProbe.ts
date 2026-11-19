/**
 * Test-only probe API, returned from activate() only under C4X_VSIX_SMOKE=1.
 * It reaches the panel's private state through a narrow cast so that the
 * production class carries no test-only methods. Exercised by the packaged-VSIX
 * smoke (test/vsix-smoke), not by the unit tier.
 */
import { randomUUID } from 'node:crypto';
import { PreviewPanel } from './PreviewPanel';
import type { SmokeRenderResult } from './smokeTypes';

interface PanelInternals {
    activeDocument: { uri: { toString(): string }; version: number } | undefined;
    currentLayoutSnapshot: { revision: string; nodes: Array<{ id: string; x: number; y: number }> } | undefined;
    smokeWaiter: { token: string; uri: string; revision: number; finish: (result?: SmokeRenderResult, error?: Error) => void } | undefined;
    smokeActWaiter: { token: string; finish: (result: { staged: number; editMode: boolean; nodes: SmokeRenderResult['nodes'] }) => void } | undefined;
    smokeSession: string | undefined;
    debounceTimer: unknown;
    renderInFlight: number;
    panel: { webview: { postMessage(message: unknown): Thenable<boolean> } };
    render(): Promise<void>;
    handleWebviewMessage(message: unknown): Promise<void>;
}

interface PanelStatics { instance?: PanelInternals; markdownInstance?: PanelInternals }

/** The open panel (standalone or Markdown-bound) showing `uri`; nothing outside C4X_VSIX_SMOKE=1. */
function smokePanel(uri: string): PanelInternals | undefined {
    if (process.env.C4X_VSIX_SMOKE !== '1') { return undefined; }
    const statics = PreviewPanel as unknown as PanelStatics;
    return [statics.markdownInstance, statics.instance].find(panel => panel?.activeDocument?.uri.toString() === uri);
}

/** Forces a render and resolves with what the webview's DOM reports once it has drawn it. */
export function whenPreviewRendered(uri: string, timeoutMs: number): Promise<SmokeRenderResult> {
    const panel = smokePanel(uri);
    if (!panel) {
        return Promise.reject(new Error('Packaged webview probe requires the matching open document'));
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000 || panel.smokeWaiter) {
        return Promise.reject(new Error('Invalid or overlapping packaged webview probe'));
    }
    return new Promise((resolve, reject) => {
        let finished = false;
        const timer = setTimeout(() => finish(undefined, new Error('Packaged webview did not acknowledge a rendered SVG before timeout')), timeoutMs);
        const finish = (result?: SmokeRenderResult, error?: Error): void => {
            if (finished) { return; }
            finished = true;
            clearTimeout(timer);
            panel.smokeWaiter = undefined;
            if (error) { reject(error); } else if (result) { resolve(result); }
        };
        panel.smokeWaiter = { token: randomUUID(), uri, revision: panel.activeDocument!.version, finish };
        void panel.render();
    });
}

/** The revision and node positions the host last sent to the webview for `uri`. */
export function snapshot(uri: string): { revision: string; nodes: Array<{ id: string; x: number; y: number }> } | undefined {
    const current = smokePanel(uri)?.currentLayoutSnapshot;
    return current ? { revision: current.revision, nodes: current.nodes.map(node => ({ id: node.id, x: node.x, y: node.y })) } : undefined;
}

/** Delivers `message` to the host handler exactly as the webview's postMessage does, and waits for it to finish. */
export async function webviewMessage(uri: string, message: unknown): Promise<void> {
    const panel = smokePanel(uri);
    if (!panel) { throw new Error('No open C4X panel for ' + uri); }
    await panel.handleWebviewMessage(message);
}

/** Resolves once no debounced render is pending, none is running, and none has started for a quiet interval. */
export async function quiet(uri: string, timeoutMs: number): Promise<void> {
    const panel = smokePanel(uri);
    if (!panel) { throw new Error('No open C4X panel for ' + uri); }
    const deadline = Date.now() + timeoutMs;
    let quietSince: number | undefined;
    while (Date.now() < deadline) {
        if (panel.debounceTimer === undefined && panel.renderInFlight === 0) {
            quietSince ??= Date.now();
            if (Date.now() - quietSince >= 400) { return; }
        } else {
            quietSince = undefined;
        }
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Preview did not go quiet before the timeout');
}

/**
 * Asks the packaged webview to run its own handler for a staged move ('stage': a real
 * arrow-key press on the node in edit mode) or for Discard ('discard': a click on the
 * real Discard button); 'probe' only reads. Resolves with the node boxes and staged-edit
 * count the webview reports afterwards.
 */
export function act(uri: string, action: 'stage' | 'discard' | 'probe', id: string): Promise<{ staged: number; editMode: boolean; nodes: SmokeRenderResult['nodes'] }> {
    const panel = smokePanel(uri);
    if (!panel || panel.smokeActWaiter) { return Promise.reject(new Error('No matching open panel, or an action is already pending')); }
    return new Promise((resolve, reject) => {
        const token = randomUUID();
        const timer = setTimeout(() => { panel.smokeActWaiter = undefined; reject(new Error('Packaged webview did not answer the ' + action + ' action')); }, 15000);
        panel.smokeActWaiter = { token, finish: result => { clearTimeout(timer); panel.smokeActWaiter = undefined; resolve(result); } };
        void panel.panel.webview.postMessage({ type: 'smoke.act', session: panel.smokeSession, token, action, id });
    });
}

/** The text of the export-theme SVG the Export SVG command would write. */
export function exportSvg(): string | undefined {
    return process.env.C4X_VSIX_SMOKE === '1' ? PreviewPanel.getCurrentExportSvg() : undefined;
}
