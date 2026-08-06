// Model ID constants for the C4X extension.
//
// Centralises all Gemini model references so that GeminiService, FallbackStrategy,
// and configuration defaults share a single source of truth.
//
// Extracted from GeminiService.ts as part of WS-5 decomposition.
// Model registry, validation, and sunset alerting added as part of G3/G4.

/** Default text-generation model (fast, latest Gemini 3.5 Flash). */
export const DEFAULT_MODEL = 'gemini-3.5-flash';

/** Pro-tier text-generation model used as failover (best reasoning, 1M context). */
export const PRO_MODEL = 'gemini-3.1-pro-preview';

/** Default image-generation model (Nano Banana 2). */
export const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';

/** Pro-quality image-generation model (opt-in). */
export const PRO_IMAGE_MODEL = 'gemini-3-pro-image-preview';

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
}

/** Registry of all known models the extension has been tested with. */
export const MODEL_REGISTRY: ModelInfo[] = [
    { id: DEFAULT_MODEL, purpose: 'Primary DSL generation (fast, latest frontier performance)', isDefault: true },
    { id: 'gemini-3-flash-preview', purpose: 'Legacy primary model (previous default)' },
    { id: PRO_MODEL, purpose: 'Failover DSL generation (best reasoning)' },
    { id: 'gemini-3.1-flash-lite-preview', purpose: 'Budget option (user-selectable)' },
    { id: DEFAULT_IMAGE_MODEL, purpose: 'Default visual generation', isDefault: true },
    { id: PRO_IMAGE_MODEL, purpose: 'Pro visual generation' },
    { id: 'gemini-2.5-pro', purpose: 'Legacy user option', sunsetDate: '2026-06-17' },
    { id: 'gemini-2.5-flash', purpose: 'Legacy budget option', sunsetDate: '2026-06-17' },
    { id: 'gemini-2.5-flash-image', purpose: 'Legacy image generation', sunsetDate: '2026-06-17' },
];

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
