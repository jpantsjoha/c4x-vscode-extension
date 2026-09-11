/**
 * Shared field-level validation constants and pure validator functions for the
 * Properties Inspector. This module is the single source of truth: it is
 * consumed by NativeMutationPlanner (extension-host, compile-time) and
 * embedded verbatim into the client script (webview, runtime). No business
 * logic may duplicate these bounds or regexes.
 */

// ── Bounds ────────────────────────────────────────────────────────────────────

/** Maximum length for label and technology fields (inclusive). */
export const INSPECTOR_LABEL_MAX = 120;

/** Maximum length for a technology field (inclusive). Technology may be empty. */
export const INSPECTOR_TECH_MAX = 120;

/** Maximum number of tags per element (inclusive). */
export const INSPECTOR_TAG_COUNT_MAX = 20;

/** Maximum character length per individual tag (inclusive). */
export const INSPECTOR_TAG_LENGTH_MAX = 40;

// ── Regexes ───────────────────────────────────────────────────────────────────

/**
 * Legal characters for a single tag: letters, digits, hyphens, underscores.
 * Matches the full string (anchored).
 */
export const INSPECTOR_TAG_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Legal C4X element identifier: starts with letter or underscore, followed by
 * letters, digits, or underscores. Matches the full string (anchored).
 */
export const INSPECTOR_ID_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

// ── Allowlisted sprite catalogue reference ────────────────────────────────────

/**
 * Callback type for the sprite allowlist check. The caller must supply a
 * function that returns true when the name is a known sprite. This decouples
 * the validator from the asset bundle and makes the module side-effect-free.
 */
export type SpriteExistsCheck = (name: string) => boolean;

// ── Pure validator functions ──────────────────────────────────────────────────

/**
 * Validate a label value. Returns null when valid, or an error message string.
 * Label must be 1–120 non-whitespace-only characters with no `"` or newlines.
 */
export function validateLabel(value: string): string | null {
    if (typeof value !== 'string') {
        return 'Label must be a string.';
    }
    if (value.trim().length === 0) {
        return 'Label must not be empty.';
    }
    if (value.length > INSPECTOR_LABEL_MAX) {
        return `Label must be at most ${INSPECTOR_LABEL_MAX} characters.`;
    }
    if (value.includes('"') || /[\r\n]/.test(value)) {
        return 'Label must not contain quotation marks or line breaks.';
    }
    return null;
}

/**
 * Validate a technology value. Returns null when valid.
 * Technology is optional; an empty string is accepted (means "clear").
 * When non-empty, it must be ≤120 characters with no `"` or newlines.
 */
export function validateTechnology(value: string): string | null {
    if (typeof value !== 'string') {
        return 'Technology must be a string.';
    }
    if (value.length > INSPECTOR_TECH_MAX) {
        return `Technology must be at most ${INSPECTOR_TECH_MAX} characters.`;
    }
    if (value.length > 0 && (value.includes('"') || /[\r\n]/.test(value))) {
        return 'Technology must not contain quotation marks or line breaks.';
    }
    return null;
}

/**
 * Validate a comma-separated tags string. Returns null when valid.
 * Rules: ≤20 tags, each 1–40 chars, charset [A-Za-z0-9_-], no duplicates.
 * An empty string (no tags) is always valid.
 */
export function validateTagsString(raw: string): string | null {
    if (typeof raw !== 'string') {
        return 'Tags must be a string.';
    }
    if (raw.trim() === '') {
        return null; // No tags — valid.
    }
    const tags = raw.split(',').map(t => t.trim());
    if (tags.length > INSPECTOR_TAG_COUNT_MAX) {
        return `At most ${INSPECTOR_TAG_COUNT_MAX} tags are allowed.`;
    }
    for (const tag of tags) {
        if (tag.length === 0) {
            return 'Tags must not contain empty entries (check for stray commas).';
        }
        if (tag.length > INSPECTOR_TAG_LENGTH_MAX) {
            return `Each tag must be at most ${INSPECTOR_TAG_LENGTH_MAX} characters.`;
        }
        if (!INSPECTOR_TAG_RE.test(tag)) {
            return 'Tags may only contain letters, digits, hyphens, and underscores.';
        }
    }
    const seen = new Set<string>();
    for (const tag of tags) {
        if (seen.has(tag)) {
            return `Duplicate tag: "${tag}".`;
        }
        seen.add(tag);
    }
    return null;
}

/**
 * Validate a sprite field value. Returns null when valid.
 * An empty string (clear sprite) is always valid.
 * When non-empty, the name must exist in the allowlist.
 *
 * @param value     The sprite name as typed by the user.
 * @param spriteExists  Caller-supplied allowlist lookup.
 */
export function validateSprite(value: string, spriteExists: SpriteExistsCheck): string | null {
    if (typeof value !== 'string') {
        return 'Sprite must be a string.';
    }
    if (value.trim() === '') {
        return null; // Clear/empty — valid.
    }
    if (!spriteExists(value.trim())) {
        return 'Unknown sprite name. Check the sprite catalogue.';
    }
    return null;
}

/**
 * Validate a C4X element identifier. Returns null when valid.
 * The id must match INSPECTOR_ID_RE.
 */
export function validateElementId(value: string): string | null {
    if (typeof value !== 'string' || !INSPECTOR_ID_RE.test(value)) {
        return 'Identifier must start with a letter or underscore and contain only letters, digits, or underscores.';
    }
    return null;
}
