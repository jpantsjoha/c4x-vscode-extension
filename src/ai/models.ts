// Model ID constants for the C4X extension.
//
// Centralises all Gemini model references so that GeminiService, FallbackStrategy,
// and configuration defaults share a single source of truth.
//
// Extracted from GeminiService.ts as part of WS-5 decomposition.
// Model registry, validation, and sunset alerting added as part of G3/G4.

// Every default below MUST be a generally available id. Preview ids are
// retired on short notice and Google's model list publishes no lifecycle
// state, so a retired preview keeps being listed and served long after it
// stops being supported. Shipping one as a default is how v1.6.2 ended up
// defaulting to an image model that had been retired for three weeks.
// scripts/verify-doc-claims.ts enforces this.

/** Default text-generation model. GA. */
export const DEFAULT_MODEL = 'gemini-3.6-flash';

/**
 * Pro-tier text-generation model used as failover.
 *
 * Knowingly a preview id: no generally available Pro model exists in the
 * Gemini 3.x line as of 2026-08-07, so there is no GA alternative at this
 * tier. Kept out of the default position for that reason.
 */
export const PRO_MODEL = 'gemini-3.1-pro-preview';

/** Budget text-generation model (user-selectable). GA. */
export const LITE_MODEL = 'gemini-3.1-flash-lite';

/** Default image-generation model (Nano Banana 2). GA. */
export const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image';

/** Pro-quality image-generation model (opt-in). GA. */
export const PRO_IMAGE_MODEL = 'gemini-3-pro-image';

/** Low-latency, low-cost image model (Nano Banana 2 Lite). GA. */
export const LITE_IMAGE_MODEL = 'gemini-3.1-flash-lite-image';

// ---------------------------------------------------------------------------
// Model Registry — known models with metadata for validation & sunset alerts
// ---------------------------------------------------------------------------

/** Metadata for a known Gemini model. */
export interface ModelInfo {
    /** The model identifier string passed to the Gemini API. */
    id: string;
    /** Human-readable description of the model's intended use. */
    purpose: string;
    /** ISO date string (YYYY-MM-DD) when the model will be sunset, if known. */
    sunsetDate?: string;
    /** Whether this model is a current default in the extension. */
    isDefault?: boolean;
    /**
     * Release channel. Only `ga` ids may occupy a default position; the
     * doc-claim linter fails the build otherwise. Retired entries stay in the
     * registry so a user who pinned one still gets a warning.
     */
    channel: 'ga' | 'preview' | 'retired';
}

/** Registry of all known models the extension has been tested with. */
export const MODEL_REGISTRY: ModelInfo[] = [
    // ── Text, generally available ────────────────────────────────────────────
    { id: DEFAULT_MODEL, purpose: 'Primary DSL generation (newest GA flash)', channel: 'ga', isDefault: true },
    { id: 'gemini-3.5-flash', purpose: 'Previous default (still GA)', channel: 'ga' },
    { id: LITE_MODEL, purpose: 'Budget option (user-selectable)', channel: 'ga' },
    { id: 'gemini-3.5-flash-lite', purpose: 'Budget option, newer but priced above 3.1-flash-lite', channel: 'ga' },

    // ── Text, preview ────────────────────────────────────────────────────────
    // No GA Pro exists in the Gemini 3.x line, so the failover is a preview id
    // by necessity rather than by choice. Revisit when a GA Pro ships.
    { id: PRO_MODEL, purpose: 'Failover DSL generation (best reasoning). No GA equivalent exists', channel: 'preview' },

    // ── Image, generally available ───────────────────────────────────────────
    { id: DEFAULT_IMAGE_MODEL, purpose: 'Default visual generation (Nano Banana 2)', channel: 'ga', isDefault: true },
    { id: PRO_IMAGE_MODEL, purpose: 'Pro visual generation', channel: 'ga' },
    { id: LITE_IMAGE_MODEL, purpose: 'Low-latency visual generation (Nano Banana 2 Lite)', channel: 'ga' },

    // ── Retired. Kept so a user pinned to one is warned rather than confused ──
    { id: 'gemini-3.1-flash-image-preview', purpose: 'Retired: use gemini-3.1-flash-image', channel: 'retired', sunsetDate: '2026-07-17' },
    { id: 'gemini-3-pro-image-preview', purpose: 'Retired: use gemini-3-pro-image', channel: 'retired', sunsetDate: '2026-07-17' },
    { id: 'gemini-3.1-flash-lite-preview', purpose: 'Retired: use gemini-3.1-flash-lite', channel: 'retired', sunsetDate: '2026-07-09' },
    { id: 'gemini-3-flash-preview', purpose: 'Retired: use gemini-3.6-flash', channel: 'retired', sunsetDate: '2026-07-17' },
    { id: 'gemini-3-pro-preview', purpose: 'Retired: use gemini-3.1-pro-preview', channel: 'retired', sunsetDate: '2026-03-09' },

    // Gemini 2.5 retires 2026-10-16. An earlier registry recorded 2026-06-17,
    // which was wrong; the family is still live. Verified 2026-08-07.
    { id: 'gemini-2.5-pro', purpose: 'Legacy user option', channel: 'ga', sunsetDate: '2026-10-16' },
    { id: 'gemini-2.5-flash', purpose: 'Legacy budget option', channel: 'ga', sunsetDate: '2026-10-16' },
    { id: 'gemini-2.5-flash-image', purpose: 'Legacy image generation', channel: 'ga', sunsetDate: '2026-10-16' },
];

/** Ids that may occupy a default position: generally available only. */
export function isGenerallyAvailable(modelId: string): boolean {
    return MODEL_REGISTRY.some(entry => entry.id === modelId && entry.channel === 'ga');
}

/** True when a model is past its recorded sunset date. */
export function isRetired(modelId: string): boolean {
    const entry = MODEL_REGISTRY.find(e => e.id === modelId);
    if (!entry) {
        return false;
    }
    if (entry.channel === 'retired') {
        return true;
    }
    return entry.sunsetDate !== undefined && new Date(entry.sunsetDate).getTime() < Date.now();
}

/**
 * Check whether a model ID is in the known registry.
 * Unknown models are still allowed but the user gets a warning.
 */
export function isKnownModel(modelId: string): boolean {
    return MODEL_REGISTRY.some(entry => entry.id === modelId);
}

/**
 * Look up the sunset date for a known model.
 * Returns `undefined` if the model is not in the registry or has no sunset date.
 */
export function getSunsetDate(modelId: string): Date | undefined {
    const entry = MODEL_REGISTRY.find(e => e.id === modelId);
    if (entry?.sunsetDate) {
        return new Date(entry.sunsetDate);
    }
    return undefined;
}

/**
 * Calculate how many days remain until a model's sunset.
 * Returns `undefined` if the model has no sunset date.
 * Returns a negative number if the model is already past its sunset date.
 */
export function getDaysUntilSunset(modelId: string): number | undefined {
    const sunset = getSunsetDate(modelId);
    if (!sunset) {
        return undefined;
    }
    const now = new Date();
    const diffMs = sunset.getTime() - now.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}
