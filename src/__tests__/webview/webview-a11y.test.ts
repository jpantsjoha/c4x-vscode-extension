import * as assert from 'assert';
import { emitLiveRegion, LiveRegions } from '../../webview/webviewA11y';
import * as fs from 'fs';
import * as path from 'path';
import { PREVIEW_CLIENT_SCRIPT } from '../../webview/previewClientScript';

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

/**
 * The key is reachable by a screen reader (#327, NR-N4): the overlay is a
 * focusable, labelled region holding a list; each entry is a list item whose
 * text is its label; the shape swatch is hidden from assistive technology. The
 * exported key is a list of items titled by their labels. Browser proof:
 * test/playwright/diagram-key.spec.ts.
 */
describe('diagram key accessibility (#327)', () => {
    const panelSrc = fs.readFileSync(path.resolve(__dirname, '../../webview/PreviewPanel.ts'), 'utf8');

    it('the overlay is a focusable, labelled region with a list of entries', () => {
        const markup = panelSrc.slice(panelSrc.indexOf('id="legend-overlay"'), panelSrc.indexOf('</ul>', panelSrc.indexOf('id="legend-overlay"')));
        assert.ok(markup.includes('role="region"'));
        assert.ok(markup.includes('aria-label="Diagram legend.'));
        assert.ok(markup.includes('tabindex="0"'));
        assert.ok(markup.includes('<ul id="legend-items">'));
    });

    it('each derived entry announces its label and hides its swatch', () => {
        const start = PREVIEW_CLIENT_SCRIPT.indexOf('for (const entry of derived || [])');
        const block = PREVIEW_CLIENT_SCRIPT.slice(start, PREVIEW_CLIENT_SCRIPT.indexOf('legendItemsEl.appendChild(li);', start));
        assert.ok(start > 0);
        assert.ok(block.includes("document.createElement('li')"));
        assert.ok(block.includes("li.setAttribute('aria-label', entry.label)"));
        assert.ok(block.includes("swatch.setAttribute('aria-hidden', 'true')"));
        assert.ok(block.includes('label.textContent = entry.label'));
    });
});
