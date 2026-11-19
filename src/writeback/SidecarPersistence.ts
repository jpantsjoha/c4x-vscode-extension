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
 * Saves/updates an element layout coordinate in the sidecar file. It reads the
 * sidecar under the same rules as a Save (#443): a missing or empty file starts
 * fresh; a file that cannot be read, or holds invalid JSON, is refused and left
 * untouched.
 */
export function saveSidecarLayout(
    documentUri: SidecarUri,
    elementId: string,
    x: number,
    y: number,
    boundary: SidecarPersistenceBoundary = createDefaultVscodeSidecarPersistenceBoundary(),
): Promise<void> {
    return writeSidecarLayoutEntries(documentUri, [{ id: elementId, x, y }], boundary, () => undefined);
}

/** One staged coordinate destined for the sidecar. */
export interface SidecarLayoutEntry {
    readonly id: string;
    readonly x: number;
    readonly y: number;
}

/**
 * Why a sidecar step refused or failed (#443).
 * - `unreadable`: the file exists (or may exist) but could not be read. Nothing
 *   was written.
 * - `invalid_json`: the file holds text that is not JSON. It may carry other
 *   documents' layouts, so it is never replaced. Nothing was written.
 * - `write_failed`: `writeFile` rejected. The file may or may not hold the new
 *   bytes.
 */
export class SidecarPersistenceError extends Error {
    constructor(
        public readonly kind: 'unreadable' | 'invalid_json' | 'write_failed',
        public readonly sidecarPath: string,
        message: string,
    ) {
        super(message);
        this.name = 'SidecarPersistenceError';
    }
}

/**
 * True for the "file does not exist" rejections of the boundaries in use:
 * VS Code's `FileSystemError.FileNotFound` (code `FileNotFound`, name
 * `EntryNotFound (FileSystemError)`) and Node's `ENOENT`. Every other read
 * failure is treated as a file that exists but could not be read.
 */
export function isSidecarFileNotFound(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) { return false; }
    const { code, name } = error as { code?: unknown; name?: unknown };
    return code === 'FileNotFound' || code === 'ENOENT' ||
        (typeof name === 'string' && name.startsWith('EntryNotFound'));
}

function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Writes several coordinates to the sidecar in one read-modify-write, queued
 * per sidecar file with every other sidecar write and reset. `beforeWrite` runs
 * after the read and synchronously before `writeFile` is called, with no await
 * between them: if it throws, nothing is written and its error is returned
 * (#443). The merged bytes equal those of one main-branch `saveSidecarLayout`
 * call per entry, in order, for any file main could read as JSON.
 */
export function writeSidecarLayoutEntries(
    documentUri: SidecarUri,
    entries: readonly SidecarLayoutEntry[],
    boundary: SidecarPersistenceBoundary,
    beforeWrite: () => void,
): Promise<void> {
    const sidecarUri = getSidecarUri(documentUri, boundary);
    const chainKey = sidecarUri.fsPath;
    const previous = writeChains.get(chainKey) ?? Promise.resolve();
    const write = previous.then(() =>
        writeSidecarLayoutEntriesNow(documentUri, sidecarUri, entries, boundary, beforeWrite),
    );
    // A failed write is returned to its caller but must not block later writes.
    writeChains.set(chainKey, write.catch(() => undefined));
    return write;
}

async function writeSidecarLayoutEntriesNow(
    documentUri: SidecarUri,
    sidecarUri: SidecarUri,
    entries: readonly SidecarLayoutEntry[],
    boundary: SidecarPersistenceBoundary,
    beforeWrite: () => void,
): Promise<void> {
    let data: SidecarLayoutData = {
        $schema: 'https://c4model.com/schemas/c4x-layout.schema.json',
        version: '1.0',
        layouts: {}
    };

    let bytes: Uint8Array | undefined;
    try {
        bytes = await boundary.readFile(sidecarUri);
    } catch (error) {
        if (!isSidecarFileNotFound(error)) {
            throw new SidecarPersistenceError(
                'unreadable',
                sidecarUri.fsPath,
                `The layout file ${sidecarUri.fsPath} could not be read (${describeError(error)}); it was left unchanged.`,
            );
        }
        // The file does not exist: start fresh.
    }

    if (bytes !== undefined) {
        const content = new TextDecoder('utf-8').decode(bytes);
        // An empty or whitespace-only file holds no layouts: start fresh.
        if (content.trim().length > 0) {
            let parsed: unknown;
            try {
                parsed = JSON.parse(content);
            } catch (error) {
                throw new SidecarPersistenceError(
                    'invalid_json',
                    sidecarUri.fsPath,
                    `The layout file ${sidecarUri.fsPath} is not valid JSON (${describeError(error)}); it was left unchanged. Fix or remove it, then save again.`,
                );
            }
            if (parsed && typeof parsed === 'object') {
                data = parsed as SidecarLayoutData;
            }
        }
    }

    const relPath = getRelativePath(documentUri, boundary);
    for (const entry of entries) {
        if (!isPlainRecord(data.layouts)) { data.layouts = {}; }
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
        const existingEntry: unknown = data.layouts[relPath].elements[entry.id];
        data.layouts[relPath].elements[entry.id] = {
            ...(isPlainRecord(existingEntry) ? existingEntry : {}),
            x: normalizeCoordinate(entry.x),
            y: normalizeCoordinate(entry.y),
        };
    }

    // Deterministically serialize (trailing newline is emitted by stringifyDeterministic)
    const writeBytes = new TextEncoder().encode(stringifyDeterministic(data));
    // The commit point (#443): the caller's check, then the write call, with
    // no await between them.
    beforeWrite();
    try {
        await boundary.writeFile(sidecarUri, writeBytes);
    } catch (error) {
        throw new SidecarPersistenceError(
            'write_failed',
            sidecarUri.fsPath,
            `Writing the layout file ${sidecarUri.fsPath} failed (${describeError(error)}). The layout file may or may not hold the new coordinates.`,
        );
    }
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
