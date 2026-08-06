export type LiveRegionPoliteness = 'polite' | 'assertive';

export interface LiveRegions {
    readonly polite: { textContent: string | null } | null;
    readonly assertive: { textContent: string | null } | null;
}

/**
 * Announces text through the requested live region without interpreting it as
 * markup. A missing region is intentionally a no-op so the preview remains
 * usable while its DOM is being recreated.
 */
export function emitLiveRegion(
    liveRegions: LiveRegions,
    politeness: LiveRegionPoliteness,
    message: string
): void {
    const liveRegion = liveRegions[politeness];
    if (!liveRegion) {
        return;
    }
    liveRegion.textContent = message;

    const otherPoliteness: LiveRegionPoliteness = politeness === 'polite' ? 'assertive' : 'polite';
    const otherLiveRegion = liveRegions[otherPoliteness];
    if (otherLiveRegion) {
        otherLiveRegion.textContent = '';
    }
}
