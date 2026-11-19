// Common SVG paths for C4 Model Sprites
// Viewbox assumed to be 0 0 100 100 for normalization unless specified

import { GCP_SPRITES } from './gcp-icons';
import { loadCloudIcons } from './cloudIcons';
import { BUNDLED_SPRITE_IDS } from './spriteIds';

export interface Sprite {
    body: string;
    viewBox?: string;
    preserveColor?: boolean;
}

/** The generic sprites, compiled into every bundle with the Google Cloud set. */
const GENERIC_SPRITES: Record<string, string | Sprite> = {
    // User / Person (Standard C4)
    'person': '<circle cx="50" cy="25" r="15" fill="currentColor"/><path d="M 25 80 Q 25 45 50 45 Q 75 45 75 80 Z" fill="currentColor"/>',
    'user': '<circle cx="50" cy="25" r="15" fill="currentColor"/><path d="M 25 80 Q 25 45 50 45 Q 75 45 75 80 Z" fill="currentColor"/>',

    // Frameworks
    'react': '<circle cx="0" cy="0" r="2.05" fill="#61dafb"/><g stroke="#61dafb" stroke-width="1" fill="none"><ellipse rx="11" ry="4.2"/><ellipse rx="11" ry="4.2" transform="rotate(60)"/><ellipse rx="11" ry="4.2" transform="rotate(120)"/></g>',

    // Database (Cylinder)
    'database': '<path d="M20,30 L20,70 A30,15 0 0,0 80,70 L80,30 A30,15 0 0,0 20,30 A30,15 0 0,0 80,30 A30,15 0 0,0 20,30 Z M20,30 A30,15 0 0,1 80,30" fill="none" stroke="currentColor" stroke-width="8"/>',
    'db': '<path d="M20,30 L20,70 A30,15 0 0,0 80,70 L80,30 A30,15 0 0,0 20,30 A30,15 0 0,0 80,30 A30,15 0 0,0 20,30 Z M20,30 A30,15 0 0,1 80,30" fill="none" stroke="currentColor" stroke-width="8"/>',

    // Cloud (AWS-ish)
    'cloud': '<path d="M25,60 A15,15 0 0,1 25,30 A20,20 0 0,1 55,30 A15,15 0 0,1 55,60 Z" stroke="currentColor" stroke-width="5" fill="none" transform="scale(1.5) translate(-15, 0)"/>',

    // Server / Node
    'node': '<rect x="20" y="20" width="60" height="60" rx="5" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="30" cy="30" r="3" fill="currentColor"/><circle cx="30" cy="45" r="3" fill="currentColor"/>',
    'server': '<rect x="20" y="20" width="60" height="60" rx="5" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="30" cy="30" r="3" fill="currentColor"/><circle cx="30" cy="45" r="3" fill="currentColor"/>',

    // Docker
    'container': '<path d="M10,50 L30,50 L30,70 L10,70 Z M35,50 L55,50 L55,70 L35,70 Z M60,50 L80,50 L80,70 L60,70 Z M35,25 L55,25 L55,45 L35,45 Z" fill="currentColor"/>',
    'docker': '<path d="M10,50 L30,50 L30,70 L10,70 Z M35,50 L55,50 L55,70 L35,70 Z M60,50 L80,50 L80,70 L60,70 Z M35,25 L55,25 L55,45 L35,45 Z" fill="currentColor"/>',

    // Fallback/Generic
    'component': '<rect x="25" y="25" width="50" height="50" fill="none" stroke="currentColor" stroke-width="5"/><rect x="15" y="35" width="20" height="10" fill="currentColor"/><rect x="15" y="55" width="20" height="10" fill="currentColor"/>'
};

/**
 * The sprites compiled into every bundle: Google Cloud and the generic set.
 * The AWS and Azure sprites are a data file read on first use (#534).
 */
const LOCAL_SPRITES: Record<string, string | Sprite> = { ...GCP_SPRITES, ...GENERIC_SPRITES };

/**
 * Every sprite: Google Cloud, Azure, AWS, then the generic set, filled on the
 * first read of a sprite body. That read loads the icon data file and throws a
 * CloudIconDataError when the file is missing or altered (src/assets/cloudIcons.ts).
 */
const filled: Record<string, string | Sprite> = {};
let isFilled = false;
function fill(): void {
    if (isFilled) { return; }
    const cloud = loadCloudIcons();
    Object.assign(filled, GCP_SPRITES, cloud.azure, cloud.aws, GENERIC_SPRITES);
    isFilled = true;
}

const BUNDLED_ID_SET: ReadonlySet<string> = new Set(BUNDLED_SPRITE_IDS);
const isBundledId = (key: string | symbol): key is string => typeof key === 'string' && BUNDLED_ID_SET.has(key);

/**
 * Enumerating and testing sprite ids (`Object.keys`, `in`, `hasOwnProperty`) answers from the
 * generated id list (src/assets/spriteIds.ts) and never reads the icon data file, so the extension's
 * activation and the completion and write-back paths cannot fail on it. Only fetching a sprite body
 * fills the table, and that is where a CloudIconDataError surfaces. A test keeps the id list equal
 * to the data file's keys.
 */
export const SPRITES: Record<string, string | Sprite> = new Proxy(filled, {
    get: (target, key, receiver) => { fill(); return Reflect.get(target, key, receiver); },
    has: (target, key) => isFilledOrListed(target, key, Reflect.has),
    ownKeys: target => (isFilled ? Reflect.ownKeys(target) : [...BUNDLED_SPRITE_IDS]),
    getOwnPropertyDescriptor: (target, key) => {
        if (isFilled || !isBundledId(key)) { return Reflect.getOwnPropertyDescriptor(target, key); }
        // Present and enumerable without a read; the body is fetched when the property is read.
        return { configurable: true, enumerable: true, get: () => { fill(); return target[key]; } };
    },
    set: (target, key, value, receiver) => { fill(); return Reflect.set(target, key, value, receiver); },
    deleteProperty: (target, key) => { fill(); return Reflect.deleteProperty(target, key); },
    defineProperty: (target, key, attributes) => { fill(); return Reflect.defineProperty(target, key, attributes); },
});

function isFilledOrListed(target: Record<string, string | Sprite>, key: string | symbol, reflectHas: (t: object, k: string | symbol) => boolean): boolean {
    return isFilled ? reflectHas(target, key) : isBundledId(key) || reflectHas(target, key);
}

/**
 * Smart sprite lookup.
 * 1. Exact match
 * 2. Vendor prefix match (aws-s3 -> s3)
 * 3. Suffix match (simple-storage-service-s3 -> s3)
 */
export function getSprite(name?: string): string | Sprite | undefined {
    if (!name) { return undefined; }
    const key = name.toLowerCase();
    // Own keys only: `constructor` or `__proto__` must not resolve to an
    // Object.prototype member and reach the SVG as a "sprite" (#362).
    const own = (candidate: string) => Object.prototype.hasOwnProperty.call(SPRITES, candidate) ? SPRITES[candidate] : undefined;

    // 1. Exact match. A name in the sprites every bundle carries (person, database, gcp-*)
    //    resolves without reading the AWS and Azure data file.
    if (!isFilled && Object.prototype.hasOwnProperty.call(LOCAL_SPRITES, key)) {
        return LOCAL_SPRITES[key];
    }
    const exact = own(key);
    if (exact) {
        return exact;
    }

    // 2. Try adding vendor prefixes if user typed simplified name like "s3"
    const vendors = ['aws', 'azure', 'gcp', 'google'];
    for (const vendor of vendors) {
        const prefixed = own(`${vendor}-${key}`);
        if (prefixed) {
            return prefixed;
        }
    }

    // 3. Fuzzy match / Suffix search (expensive but convenient)
    // Find key that ends with "-key" or is "*-key"
    // Search the filled table, never the sorted id list: the first match must be the same on every
    // call, in the table's precedence order (GCP, Azure, AWS, generic), whatever was looked up before.
    const suffix = `-${key}`;
    fill();
    const found = Object.keys(filled).find(k => k.endsWith(suffix));
    if (found) {
        return filled[found];
    }

    return undefined;
}
