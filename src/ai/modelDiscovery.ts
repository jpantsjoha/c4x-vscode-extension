// Runtime model discovery.
//
// Model ids were shipped constants, so every retirement needed a release. That
// is how v1.6.3 shipped an image model Google had retired three weeks earlier.
//
// Two things about the Gemini API shape this design, both verified against the
// live service on 2026-08-07:
//
//   1. `models.list` publishes NO lifecycle state. The retired
//      `gemini-3.1-flash-image-preview` was byte-for-byte comparable to its GA
//      replacement — same displayName, same limits, same methods — and was
//      still listed and still served. Discovery therefore cannot detect
//      deprecation. Only the docs and the changelog carry that, which is why
//      the maintained registry in models.ts does not go away.
//
//   2. The `-latest` aliases (gemini-flash-latest, gemini-flash-lite-latest,
//      gemini-pro-latest) exist and work, but Google's own documentation warns
//      an alias "can be a stable, preview or experimental release" and
//      recommends a specific stable model for production. So they are offered,
//      never defaulted to.
//
// What discovery CAN do reliably is tell us what a given key can actually
// reach, and which of those is newest. That is enough to stop shipping a
// release for every new model, without ever drifting onto a preview build.
//
// Everything here is pure. The network call lives in GeminiService.

/** One model as returned by GET /v1beta/models. */
export interface DiscoveredModel {
    /** Bare id, e.g. "gemini-3.6-flash" — the `models/` prefix removed. */
    id: string;
    displayName?: string;
    supportedGenerationMethods?: string[];
}

/** The role a model plays in the extension. */
export type ModelTier = 'flash' | 'flash-lite' | 'pro' | 'flash-image' | 'flash-lite-image' | 'pro-image';

export interface ParsedModelId {
    id: string;
    family: string;
    /**
     * Comparable version. Major and minor are parsed as separate integers and
     * recombined, because `Number("3.10")` is 3.1 and would sort a 3.10 model
     * BELOW a 3.5 one. Google has not shipped a double-digit minor yet; this
     * is here so the day it does is not a silent downgrade.
     */
    version: number;
    major: number;
    minor: number;
    tier: ModelTier | undefined;
    /** True when the model may be chosen manually but never selected automatically. */
    specialist: boolean;
    /** True for anything not generally available: preview, exp, or an alias. */
    unstable: boolean;
}

const ALIAS = /-latest$/;
const UNSTABLE = /-(preview|exp|experimental)\b|-preview-|-exp-/;

/**
 * Parse a model id into something rankable.
 *
 * Returns `tier: undefined` for ids we do not recognise as one of our roles
 * (embeddings, TTS, custom-tools variants), which excludes them from selection
 * without having to enumerate every model Google ships.
 */
export function parseModelId(id: string): ParsedModelId {
    const unstable = UNSTABLE.test(id) || ALIAS.test(id);
    const specialist = /^gemini-omni\b/.test(id);

    const familyMatch = id.match(/^([a-z]+)-(\d+)(?:\.(\d+))?/);
    const family = familyMatch?.[1] ?? id.split('-')[0];
    const major = familyMatch ? Number(familyMatch[2]) : 0;
    const minor = familyMatch?.[3] ? Number(familyMatch[3]) : 0;
    // Minor is scaled so 3.10 (3.010) outranks 3.5 (3.005).
    const version = major + minor / 1000;

    let tier: ModelTier | undefined;
    // Order matters: the longer, more specific suffixes must win.
    if (/-flash-lite-image\b/.test(id)) {
        tier = 'flash-lite-image';
    } else if (/-pro-image\b/.test(id)) {
        tier = 'pro-image';
    } else if (/-flash-image\b/.test(id)) {
        tier = 'flash-image';
    } else if (/-flash-lite\b/.test(id)) {
        tier = 'flash-lite';
    } else if (/-flash\b/.test(id)) {
        tier = 'flash';
    } else if (/-pro\b/.test(id)) {
        tier = 'pro';
    }

    // Anything carrying an extra capability suffix is not a general-purpose
    // model for our purposes: -tts, -customtools, -thinking and friends.
    if (tier && /-(tts|customtools|audio|native-audio|dialog)\b/.test(id)) {
        tier = undefined;
    }

    // The omni line is a multimodal streaming specialist, not a general-purpose
    // automatic upgrade. It keeps its flash tier so the picker can offer it,
    // while `specialist` gives automatic selection an independent exclusion.
    return { id, family, version, major, minor, tier, specialist, unstable };
}

/**
 * Pick the best generally available model for a tier from a discovered list.
 *
 * Never returns an unstable id: preview and experimental builds are the ones
 * that get retired at short notice, which is the whole problem this exists to
 * avoid. Returns undefined when the key can reach nothing suitable, and the
 * caller keeps its shipped default.
 */
export function selectBestModel(
    models: DiscoveredModel[],
    tier: ModelTier,
    options: { requireMethod?: string } = {},
): string | undefined {
    const method = options.requireMethod ?? 'generateContent';

    const candidates = models
        .filter(m => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes(method))
        .map(m => parseModelId(m.id))
        .filter(p => p.tier === tier && !p.unstable && !p.specialist);

    if (candidates.length === 0) {
        return undefined;
    }

    candidates.sort((a, b) => b.version - a.version || a.id.localeCompare(b.id));
    return candidates[0].id;
}

/**
 * Decide what a discovery result means for a shipped default.
 *
 * Deliberately conservative. The pinned default is a tested contract, so it is
 * kept whenever the key can still reach it. A newer model is adopted only when
 * the caller asks for `auto-ga`; a retirement is healed in every mode, because
 * a default nobody can call is worse than a surprise upgrade.
 */
export function resolveModelChoice(
    pinned: string,
    models: DiscoveredModel[],
    strategy: 'pinned' | 'auto-ga',
): { model: string; reason: 'pinned' | 'healed' | 'upgraded' } {
    const reachable = new Set(models.map(m => m.id));
    const parsedPinned = parseModelId(pinned);
    const tier = parsedPinned.tier;

    if (!reachable.has(pinned)) {
        // The pinned id is gone or was never granted to this key.
        const replacement = tier ? selectBestModel(models, tier) : undefined;
        if (replacement) {
            return { model: replacement, reason: 'healed' };
        }
        return { model: pinned, reason: 'pinned' };
    }

    // A reachable specialist was deliberately selected in the picker. Auto-GA
    // must neither choose a specialist nor undo that explicit user choice.
    if (strategy === 'auto-ga' && tier && !parsedPinned.specialist) {
        const best = selectBestModel(models, tier);
        if (best && best !== pinned) {
            return { model: best, reason: 'upgraded' };
        }
    }

    return { model: pinned, reason: 'pinned' };
}

/**
 * Message shown when the extension changes model underneath the user.
 * Silent substitution is not acceptable: a different model can mean different
 * output quality and a different bill.
 */
export function describeModelChange(from: string, to: string, reason: 'healed' | 'upgraded'): string {
    if (reason === 'healed') {
        return (
            `C4X: "${from}" is no longer available to your API key, so "${to}" was used instead. ` +
            'Set c4x.ai.model to choose a different one.'
        );
    }
    return `C4X: using "${to}", a newer model than "${from}". Set c4x.ai.modelStrategy to "pinned" to stop this.`;
}
