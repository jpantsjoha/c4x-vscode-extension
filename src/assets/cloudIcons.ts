/**
 * The AWS and Azure icon data (#534). About 2.9 MB of sprites ship once per
 * package as data/cloud-icons.json (scripts/cloud-icon-data.js generates it)
 * instead of being compiled into every bundle that draws icons: the extension,
 * the MCP server and the render CLI read the one file at first use.
 *
 * Fail closed. Each bundle is built against the file's SHA-256 and checks the
 * bytes it reads before parsing them. A missing, unreadable, altered or
 * malformed file throws a CloudIconDataError whose message says what is wrong
 * and what to do; the renderers report it through their normal error path
 * (a C4X-RENDER finding in `render_c4x` and `c4x render`, a preview error in
 * the extension). A placeholder icon is never drawn in its place, so the
 * preview and `render_c4x` cannot differ without a message.
 *
 * Where the file is read from is fixed by the running code, never by the
 * working directory or the repository: a bundle (dist/, mcp/, cli/, server/)
 * reads ../data/cloud-icons.json beside its own directory; source run in
 * tests reads the checkout's data/ directory.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { Sprite } from './icons';
import { CLOUD_ICONS_SHA256 } from './cloudIconsDigest';

/** Defined by esbuild.config.js in every bundle: the SHA-256 of data/cloud-icons.json at build time. */
declare const __C4X_CLOUD_ICONS_SHA256__: string | undefined;

export const CLOUD_ICONS_FILE = 'cloud-icons.json';

export type CloudIconDataFault = 'missing' | 'unreadable' | 'mismatch' | 'malformed';

export class CloudIconDataError extends Error {
    constructor(readonly fault: CloudIconDataFault, message: string) {
        super(message);
        this.name = 'CloudIconDataError';
    }
}

export interface CloudIcons {
    readonly aws: Record<string, Sprite>;
    readonly azure: Record<string, Sprite>;
}

/** The digest this build expects: stamped into a bundle at build time; the generated module when running source. */
export function expectedCloudIconsSha256(): string {
    return typeof __C4X_CLOUD_ICONS_SHA256__ === 'string' ? __C4X_CLOUD_ICONS_SHA256__ : CLOUD_ICONS_SHA256;
}

/** Where the running code reads the icon data from. */
export function cloudIconsPath(moduleDir: string = __dirname): string {
    // Unbundled (src/assets, or out/src/assets once compiled): the checkout's data/.
    if (path.basename(moduleDir) === 'assets') {
        const compiled = path.basename(path.resolve(moduleDir, '..', '..')) === 'out';
        return path.join(path.resolve(moduleDir, ...(compiled ? ['..', '..', '..'] : ['..', '..'])), 'data', CLOUD_ICONS_FILE);
    }
    // Bundled (dist/, mcp/, cli/, a plugin's server/): beside the bundle's directory.
    return path.join(path.resolve(moduleDir, '..'), 'data', CLOUD_ICONS_FILE);
}

const REINSTALL = 'Reinstall the package; AWS and Azure icons cannot be drawn without this file.';

/** Read, verify and parse one icon data file. Throws CloudIconDataError. */
export function readCloudIcons(file: string, expectedSha256: string): CloudIcons {
    let bytes: Buffer;
    try {
        bytes = fs.readFileSync(file);
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT' || code === 'ENOTDIR') {
            throw new CloudIconDataError('missing', `C4X icon data is missing: expected ${file}. ${REINSTALL}`);
        }
        throw new CloudIconDataError('unreadable', `C4X icon data cannot be read at ${file} (${code ?? 'error'}). ${REINSTALL}`);
    }
    const actual = crypto.createHash('sha256').update(bytes).digest('hex');
    if (actual !== expectedSha256) {
        throw new CloudIconDataError('mismatch', `C4X icon data failed its integrity check: ${file} has SHA-256 ${actual}, this build expects ${expectedSha256}. ${REINSTALL}`);
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(bytes.toString('utf8'));
    } catch {
        throw new CloudIconDataError('malformed', `C4X icon data is not valid JSON: ${file}. ${REINSTALL}`);
    }
    const sections = parsed as Partial<CloudIcons> | null;
    const isRecord = (value: unknown): value is Record<string, Sprite> => typeof value === 'object' && value !== null && !Array.isArray(value);
    if (!isRecord(sections) || !isRecord(sections.aws) || !isRecord(sections.azure)) {
        throw new CloudIconDataError('malformed', `C4X icon data has no aws and azure sections: ${file}. ${REINSTALL}`);
    }
    return { aws: sections.aws, azure: sections.azure };
}

let cached: CloudIcons | CloudIconDataError | undefined;

/**
 * The AWS and Azure sprites, read on first use and kept. A failure is kept
 * too and thrown again, so a damaged install costs one read, not one per icon.
 */
export function loadCloudIcons(): CloudIcons {
    if (cached === undefined) {
        try {
            cached = readCloudIcons(cloudIconsPath(), expectedCloudIconsSha256());
        } catch (error) {
            cached = error instanceof CloudIconDataError ? error : new CloudIconDataError('unreadable', `C4X icon data could not be loaded: ${String(error)}`);
        }
    }
    if (cached instanceof CloudIconDataError) { throw cached; }
    return cached;
}
