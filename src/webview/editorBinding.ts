/**
 * Persistence for the Visual C4 Editor panel binding.
 *
 * The WebviewPanelSerializer must be able to reconstruct a panel's document
 * context after an extension-host reload: which document the panel was bound
 * to, and for Markdown editing, which fenced block ordinal. VS Code does not
 * provide this — it only restores the raw webview — so the binding is stored
 * in the workspace Memento whenever a panel is constructed and cleared when
 * it is disposed (#100).
 */

export type EditorPanelBinding =
    | { kind: 'markdown'; uri: string; blockOrdinal: number }
    | { kind: 'native'; uri: string };

/** Minimal Memento-shaped surface so the module stays Node-testable. */
export interface BindingStore {
    get<T>(key: string): T | undefined;
    update(key: string, value: unknown): Thenable<void>;
}

const BINDING_KEY = 'c4x.editorPanelBinding';

export function saveBinding(store: BindingStore, binding: EditorPanelBinding): Thenable<void> {
    return store.update(BINDING_KEY, binding);
}

export function clearBinding(store: BindingStore): Thenable<void> {
    return store.update(BINDING_KEY, undefined);
}

/**
 * Reads and validates the persisted binding. Malformed entries (wrong shape,
 * out-of-range values) are treated as absent so a stale or hand-edited
 * Memento can never resurrect a half-bound panel.
 */
export function loadBinding(store: BindingStore): EditorPanelBinding | undefined {
    const raw = store.get<unknown>(BINDING_KEY);
    if (typeof raw !== 'object' || raw === null) {
        return undefined;
    }
    const candidate = raw as Record<string, unknown>;
    if (candidate.kind === 'markdown') {
        return typeof candidate.uri === 'string' && candidate.uri.length > 0 &&
            typeof candidate.blockOrdinal === 'number' &&
            Number.isInteger(candidate.blockOrdinal) && candidate.blockOrdinal >= 0
            ? { kind: 'markdown', uri: candidate.uri, blockOrdinal: candidate.blockOrdinal }
            : undefined;
    }
    if (candidate.kind === 'native') {
        return typeof candidate.uri === 'string' && candidate.uri.length > 0
            ? { kind: 'native', uri: candidate.uri }
            : undefined;
    }
    return undefined;
}
