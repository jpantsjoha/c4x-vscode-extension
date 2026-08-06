import * as path from 'path';
import { C4Model, C4Element } from '../model/C4Model';
import { createDefaultVscodeSidecarPersistenceBoundary } from './VscodeWritebackBoundary';

/** Minimal URI shape shared by the pure persistence service and its adapter. */
export interface SidecarUri {
    readonly fsPath: string;
    readonly scheme: string;
}

export interface SidecarWorkspaceFolder {
    readonly uri: SidecarUri;
}

/** The VS Code-specific API shape consumed only by the boundary adapter. */
export interface VscodeSidecarApi {
    readonly workspace: {
        getWorkspaceFolder(uri: SidecarUri): SidecarWorkspaceFolder | undefined;
        readonly workspaceFolders?: readonly SidecarWorkspaceFolder[];
        readonly fs: {
            readFile(uri: SidecarUri): PromiseLike<Uint8Array>;
            writeFile(uri: SidecarUri, content: Uint8Array): PromiseLike<void>;
            delete(uri: SidecarUri): PromiseLike<void>;
        };
    };
    readonly ['Uri']: {
        joinPath(base: SidecarUri, ...paths: string[]): SidecarUri;
        file(filePath: string): SidecarUri;
    };
}

/**
 * Filesystem and workspace operations used by sidecar persistence.
 *
 * Implementations may delegate to VS Code, but the persistence logic itself
 * remains executable in a normal Node unit-test process.
 */
export interface SidecarPersistenceBoundary {
    getWorkspaceFolder(uri: SidecarUri): SidecarWorkspaceFolder | undefined;
    getWorkspaceFolders(): readonly SidecarWorkspaceFolder[];
    readFile(uri: SidecarUri): PromiseLike<Uint8Array>;
    writeFile(uri: SidecarUri, content: Uint8Array): PromiseLike<void>;
    deleteFile(uri: SidecarUri): PromiseLike<void>;
    joinPath(base: SidecarUri, ...paths: string[]): SidecarUri;
    file(filePath: string): SidecarUri;
    getWorkingDirectory(): string;
}

export interface SidecarLayoutData {
    $schema?: string;
    version?: string;
    layouts: {
        [filePath: string]: {
            elements: {
                [elementId: string]: {
                    x: number;
                    y: number;
                    locked?: boolean;
                }
            }
        }
    };
}

/**
 * True only for plain non-array objects. Sidecar content is user-editable JSON,
 * so arrays or primitives must never flow into spreads or string-keyed writes
 * (array indices would leak into persisted element records).
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Returns the repository-relative path of the document URI relative to its workspace folder.
 * If not in a workspace, returns the basename of the file.
 */
export function getRelativePath(
    uri: SidecarUri,
    boundary: SidecarPersistenceBoundary = createDefaultVscodeSidecarPersistenceBoundary(),
): string {
    const folder = boundary.getWorkspaceFolder(uri);
    if (folder) {
        // Use relative path with forward slashes for cross-platform compatibility
        return path.relative(folder.uri.fsPath, uri.fsPath).split(path.sep).join('/');
    }
    return path.basename(uri.fsPath);
}

/**
 * Finds the workspace root or document directory Uri where .c4x-layout.json should live.
 */
export function getSidecarUri(
    documentUri: SidecarUri,
    boundary: SidecarPersistenceBoundary = createDefaultVscodeSidecarPersistenceBoundary(),
): SidecarUri {
    const folder = boundary.getWorkspaceFolder(documentUri);
    if (folder) {
        return boundary.joinPath(folder.uri, '.c4x-layout.json');
    }
    
    const workspaceFolders = boundary.getWorkspaceFolders();
    if (workspaceFolders.length > 0) {
        return boundary.joinPath(workspaceFolders[0].uri, '.c4x-layout.json');
    }
    
    const dir = path.dirname(documentUri.fsPath);
    if (!dir || dir === '/' || dir === '.' || documentUri.scheme === 'untitled') {
        return boundary.joinPath(
            boundary.file(boundary.getWorkingDirectory()),
            '.c4x-layout.json',
        );
    }
    return boundary.joinPath(boundary.file(dir), '.c4x-layout.json');
}

/**
 * Normalizes a coordinate for deterministic sidecar persistence.
 *
 * Two decimal places remove browser drag floating-point artifacts while still
 * preserving the precision exposed by the visual editor. Negative zero is
 * canonicalized so persisted coordinates have a single zero representation.
 */
export function normalizeCoordinate(value: number): number {
    if (!Number.isFinite(value)) { return value; }

    const rounded = Math.round(value * 100) / 100;
    return rounded === 0 ? 0 : rounded;
}

/**
 * Deterministically stringifies an object by sorting its keys recursively.
 */
export function stringifyDeterministic(obj: unknown): string {
    const sortObject = (val: unknown): unknown => {
        if (val === null) { return null; }
        if (Array.isArray(val)) {
            return val.map(sortObject);
        }
        if (typeof val === 'object') {
            const sorted: Record<string, unknown> = {};
            const objVal = val as Record<string, unknown>;
            Object.keys(objVal).sort().forEach(k => {
                sorted[k] = sortObject(objVal[k]);
            });
            return sorted;
        }
        return val;
    };

    return JSON.stringify(sortObject(obj), null, 2) + '\n';
}

/**
 * Loads layout overrides from the sidecar file.
 */
export async function loadSidecarLayout(
    documentUri: SidecarUri,
    boundary: SidecarPersistenceBoundary = createDefaultVscodeSidecarPersistenceBoundary(),
): Promise<Record<string, { x: number; y: number; locked?: boolean }> | null> {
    const sidecarUri = getSidecarUri(documentUri, boundary);
    try {
        const bytes = await boundary.readFile(sidecarUri);
        const content = new TextDecoder('utf-8').decode(bytes);
        const data = JSON.parse(content) as SidecarLayoutData;
        if (!data || !data.layouts) { return null; }
        const relPath = getRelativePath(documentUri, boundary);
        const fileLayout = data.layouts[relPath];
        return fileLayout ? fileLayout.elements : null;
    } catch {
        return null;
    }
}

/**
 * Serializes sidecar read-modify-write operations per sidecar file so
 * concurrent moves cannot overwrite one another after reading the same prior
 * file contents. Keyed by the resolved sidecar `fsPath` so writes targeting
 * different sidecars still run in parallel.
 */
const writeChains: Map<string, Promise<void>> = new Map();

/**
 * Saves/updates an element layout coordinate in the sidecar file.
 */
export async function saveSidecarLayout(
    documentUri: SidecarUri,
    elementId: string,
    x: number,
    y: number,
    boundary: SidecarPersistenceBoundary = createDefaultVscodeSidecarPersistenceBoundary(),
): Promise<void> {
    const sidecarUri = getSidecarUri(documentUri, boundary);
    const chainKey = sidecarUri.fsPath;
    const previous = writeChains.get(chainKey) ?? Promise.resolve();
    const write = previous.then(() =>
        writeSidecarLayoutEntry(documentUri, sidecarUri, elementId, x, y, boundary),
    );
    // A failed write is returned to its caller but must not block later writes.
    writeChains.set(chainKey, write.catch(() => undefined));
    return write;
}

async function writeSidecarLayoutEntry(
    documentUri: SidecarUri,
    sidecarUri: SidecarUri,
    elementId: string,
    x: number,
    y: number,
    boundary: SidecarPersistenceBoundary,
): Promise<void> {
    let data: SidecarLayoutData = {
        $schema: 'https://c4model.com/schemas/c4x-layout.schema.json',
        version: '1.0',
        layouts: {}
    };

    try {
        const bytes = await boundary.readFile(sidecarUri);
        const content = new TextDecoder('utf-8').decode(bytes);
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === 'object') {
            data = parsed as SidecarLayoutData;
        }
    } catch {
        // File does not exist or is malformed, start fresh
    }

    if (!isPlainRecord(data.layouts)) { data.layouts = {}; }
    const relPath = getRelativePath(documentUri, boundary);
    if (!isPlainRecord(data.layouts[relPath])) {
        data.layouts[relPath] = { elements: {} };
    }
    if (!isPlainRecord(data.layouts[relPath].elements)) {
        data.layouts[relPath].elements = {};
    }

    // Preserve any existing fields (notably `locked`) so a coordinate update
    // does not silently strip metadata written by another code path. A
    // malformed or array entry is coerced to {} so array indices never leak
    // into the persisted record.
    const existingEntry: unknown = data.layouts[relPath].elements[elementId];
    data.layouts[relPath].elements[elementId] = {
        ...(isPlainRecord(existingEntry) ? existingEntry : {}),
        x: normalizeCoordinate(x),
        y: normalizeCoordinate(y),
    };

    // Deterministically serialize (trailing newline is emitted by stringifyDeterministic)
    const jsonStr = stringifyDeterministic(data);
    const writeBytes = new TextEncoder().encode(jsonStr);
    await boundary.writeFile(sidecarUri, writeBytes);
}

/** Removes one document's sidecar entry and deletes an empty sidecar file. */
export async function resetSidecarLayout(
    documentUri: SidecarUri,
    boundary: SidecarPersistenceBoundary = createDefaultVscodeSidecarPersistenceBoundary(),
): Promise<void> {
    const sidecarUri = getSidecarUri(documentUri, boundary);
    const chainKey = sidecarUri.fsPath;
    const previous = writeChains.get(chainKey) ?? Promise.resolve();
    const write = previous.then(() =>
        resetSidecarLayoutEntry(documentUri, sidecarUri, boundary),
    );
    // A failed reset is returned to its caller but must not block later writes.
    writeChains.set(chainKey, write.catch(() => undefined));
    return write;
}

async function resetSidecarLayoutEntry(
    documentUri: SidecarUri,
    sidecarUri: SidecarUri,
    boundary: SidecarPersistenceBoundary,
): Promise<void> {
    try {
        const bytes = await boundary.readFile(sidecarUri);
        const content = new TextDecoder('utf-8').decode(bytes);
        const parsed: unknown = JSON.parse(content);
        // Shape discipline: only a plain non-array `layouts` object may be
        // deleted from or rewritten (matches the save path).
        if (!isPlainRecord(parsed) || !isPlainRecord(parsed.layouts)) { return; }

        const relPath = getRelativePath(documentUri, boundary);
        if (!parsed.layouts[relPath]) { return; }

        delete parsed.layouts[relPath];
        if (Object.keys(parsed.layouts).length === 0) {
            await boundary.deleteFile(sidecarUri);
            return;
        }

        const writeBytes = new TextEncoder().encode(stringifyDeterministic(parsed));
        await boundary.writeFile(sidecarUri, writeBytes);
    } catch {
        // A missing or malformed sidecar is already equivalent to a reset.
    }
}

/**
 * Merges visual layout coordinates from the sidecar file into the C4Model elements.
 */
export async function applySidecarLayoutOverrides(
    model: C4Model,
    documentUri: SidecarUri,
    boundary: SidecarPersistenceBoundary = createDefaultVscodeSidecarPersistenceBoundary(),
): Promise<void> {
    const overrides = await loadSidecarLayout(documentUri, boundary);
    if (!overrides) { return; }

    const applyToElements = (elements: C4Element[]) => {
        for (const el of elements) {
            const override = overrides[el.id];
            if (override) {
                if (!el.metadata) { el.metadata = {}; }
                el.metadata.x = String(override.x);
                el.metadata.y = String(override.y);
                if (override.locked !== undefined) {
                    el.metadata.locked = String(override.locked);
                }
            }
            if (el.children) {
                applyToElements(el.children);
            }
        }
    };

    for (const view of model.views) {
        if (view.elements) {
            applyToElements(view.elements);
        }
    }
}
