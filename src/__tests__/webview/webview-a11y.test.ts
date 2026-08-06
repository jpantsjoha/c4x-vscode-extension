import * as assert from 'assert';
import { emitLiveRegion, LiveRegions } from '../../webview/webviewA11y';

function makeLiveRegions(): LiveRegions {
    return {
        polite: { textContent: null },
        assertive: { textContent: null },
    };
}

describe('webview live-region announcements', () => {
    it('writes routine updates to the polite live region', () => {
        const liveRegions = makeLiveRegions();
        if (liveRegions.assertive) {
            liveRegions.assertive.textContent = 'Previous error.';
        }

        emitLiveRegion(liveRegions, 'polite', 'Layout saved.');

        assert.strictEqual(liveRegions.polite?.textContent, 'Layout saved.');
        assert.strictEqual(liveRegions.assertive?.textContent, '');
    });

    it('writes failures to the assertive live region', () => {
        const liveRegions = makeLiveRegions();
        if (liveRegions.polite) {
            liveRegions.polite.textContent = 'Previous status.';
        }

        emitLiveRegion(liveRegions, 'assertive', 'Layout was rejected.');

        assert.strictEqual(liveRegions.polite?.textContent, '');
        assert.strictEqual(liveRegions.assertive?.textContent, 'Layout was rejected.');
    });

    it('does not throw when the requested live region is unavailable', () => {
        const liveRegions: LiveRegions = { polite: { textContent: 'Preview mode.' }, assertive: null };

        assert.doesNotThrow(() => emitLiveRegion(liveRegions, 'assertive', 'Preview error.'));
        assert.strictEqual(liveRegions.polite?.textContent, 'Preview mode.');
    });
});
