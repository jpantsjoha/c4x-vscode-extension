/**
 * Legend overlay unit coverage (#98):
 *  - computePresentElementTypes: host-side contextual key extraction.
 *  - filterLegendItems / clampLegendPosition / formatLegendMoveAnnouncement:
 *    the pure helpers injected into the webview client.
 *  - isValidPresentElementTypes / isValidLegendSwatchColors: the untrusted
 *    render-payload boundary (new fields optional but typed).
 *  - Static pins: overlay markup/CSS in PreviewPanel, client-script wiring,
 *    and the c4x.legend.show setting registration.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

import type { C4View } from '../../model/C4Model';
import { computePresentElementTypes, LEGEND_CATALOG } from '../../webview/legendCatalog';
import {
    PREVIEW_CLIENT_SCRIPT,
    clampLegendPosition,
    filterLegendItems,
    formatLegendMoveAnnouncement,
    isValidLegendSwatchColors,
    isValidPresentElementTypes,
} from '../../webview/previewClientScript';

// ---------------------------------------------------------------------------
// computePresentElementTypes
// ---------------------------------------------------------------------------

function view(partial: Partial<C4View>): C4View {
    return { type: 'system-context', elements: [], relationships: [], ...partial };
}

describe('computePresentElementTypes (#98)', () => {
    it('returns deduplicated element types in first-seen order', () => {
        const keys = computePresentElementTypes(view({
            elements: [
                { id: 'a', label: 'A', type: 'Person' },
                { id: 'b', label: 'B', type: 'SoftwareSystem' },
                { id: 'c', label: 'C', type: 'Person' },
            ],
        }));
        assert.deepStrictEqual(keys, ['Person', 'SoftwareSystem']);
    });

    it('walks nested children (deployment/container hierarchies)', () => {
        const keys = computePresentElementTypes(view({
            elements: [
                {
                    id: 'node', label: 'Node', type: 'DeploymentNode',
                    children: [
                        { id: 'app', label: 'App', type: 'Container' },
                        {
                            id: 'svc', label: 'Svc', type: 'Container',
                            children: [{ id: 'comp', label: 'Comp', type: 'Component' }],
                        },
                    ],
                },
            ],
        }));
        assert.deepStrictEqual(keys, ['DeploymentNode', 'Container', 'Component']);
    });

    it('adds the External marker for external-tagged elements (case-insensitive)', () => {
        const keys = computePresentElementTypes(view({
            elements: [
                { id: 'a', label: 'A', type: 'SoftwareSystem', tags: ['External'] },
                { id: 'b', label: 'B', type: 'Person', tags: ['external'] },
            ],
        }));
        assert.deepStrictEqual(keys, ['SoftwareSystem', 'External', 'Person']);
    });

    it('omits External when no element carries the tag', () => {
        const keys = computePresentElementTypes(view({
            elements: [{ id: 'a', label: 'A', type: 'Person' }],
        }));
        assert.ok(!keys.includes('External'));
    });

    it('adds Boundary only when the view declares boundaries', () => {
        assert.ok(!computePresentElementTypes(view({})).includes('Boundary'));
        const withBoundary = computePresentElementTypes(view({
            boundaries: [{ id: 'b1', label: 'B', elements: [] }],
        }));
        assert.ok(withBoundary.includes('Boundary'));
    });

    it('adds Relationship only when the view has relationships', () => {
        assert.ok(!computePresentElementTypes(view({})).includes('Relationship'));
        const withRel = computePresentElementTypes(view({
            elements: [{ id: 'a', label: 'A', type: 'Person' }],
            relationships: [{ id: 'rel-0', from: 'a', to: 'a', label: '', relType: 'uses' }],
        }));
        assert.ok(withRel.includes('Relationship'));
    });

    it('returns an empty list for an empty view', () => {
        assert.deepStrictEqual(computePresentElementTypes(view({})), []);
    });
});

// ---------------------------------------------------------------------------
// filterLegendItems
// ---------------------------------------------------------------------------

describe('filterLegendItems (#98)', () => {
    it('keeps only present entries, in catalogue order', () => {
        const items = filterLegendItems(LEGEND_CATALOG, ['Relationship', 'Person', 'SoftwareSystem']);
        assert.deepStrictEqual(items.map(i => i.key), ['Person', 'SoftwareSystem', 'Relationship']);
    });

    it('ignores unknown keys', () => {
        const items = filterLegendItems(LEGEND_CATALOG, ['Person', 'Bogus']);
        assert.deepStrictEqual(items.map(i => i.key), ['Person']);
    });

    it('returns nothing when no known types are present', () => {
        assert.deepStrictEqual(filterLegendItems(LEGEND_CATALOG, []), []);
        assert.deepStrictEqual(filterLegendItems(LEGEND_CATALOG, ['Bogus']), []);
    });

    it('covers every C4 element type with a catalogue entry', () => {
        for (const key of ['Person', 'SoftwareSystem', 'Container', 'Component', 'DeploymentNode']) {
            assert.ok(
                LEGEND_CATALOG.some(item => item.key === key),
                `LEGEND_CATALOG must contain an entry for ${key}`,
            );
        }
    });
});

// ---------------------------------------------------------------------------
// clampLegendPosition
// ---------------------------------------------------------------------------

describe('clampLegendPosition (#98)', () => {
    it('keeps in-bounds positions, rounding to whole pixels', () => {
        assert.deepStrictEqual(
            clampLegendPosition(10.4, 20.6, 140, 100, 800, 600),
            { left: 10, top: 21 },
        );
    });

    it('clamps negative coordinates to the origin', () => {
        assert.deepStrictEqual(
            clampLegendPosition(-50, -10, 140, 100, 800, 600),
            { left: 0, top: 0 },
        );
    });

    it('clamps so the whole legend stays inside the canvas area', () => {
        assert.deepStrictEqual(
            clampLegendPosition(1000, 1000, 140, 100, 800, 600),
            { left: 660, top: 500 },
        );
    });

    it('pins to the origin when the area is smaller than the legend', () => {
        assert.deepStrictEqual(
            clampLegendPosition(50, 50, 900, 700, 800, 600),
            { left: 0, top: 0 },
        );
    });
});

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

describe('legend announcements (#98)', () => {
    it('formats reposition announcements with the clamped position', () => {
        assert.strictEqual(formatLegendMoveAnnouncement(120, 240), 'Legend repositioned to 120, 240');
    });

    it('pointer drop announces the clamped position (varies per drop)', () => {
        // Identical live-region textContent may not re-announce, so the drop
        // path must include the position, mirroring the keyboard path.
        const dropHandler = PREVIEW_CLIENT_SCRIPT.slice(
            PREVIEW_CLIENT_SCRIPT.indexOf('function onLegendPointerUp'),
            PREVIEW_CLIENT_SCRIPT.indexOf('function onLegendKeyDown'),
        );
        assert.ok(
            dropHandler.includes('formatLegendMoveAnnouncement(legendPosition.left, legendPosition.top)'),
            'onLegendPointerUp must announce via formatLegendMoveAnnouncement with the drop position',
        );
    });

    it('keyboard path announces via the same helper', () => {
        const keyHandler = PREVIEW_CLIENT_SCRIPT.slice(
            PREVIEW_CLIENT_SCRIPT.indexOf('function onLegendKeyDown'),
        );
        assert.ok(
            keyHandler.includes('formatLegendMoveAnnouncement(legendPosition.left, legendPosition.top)'),
            'onLegendKeyDown must announce via formatLegendMoveAnnouncement with the nudged position',
        );
    });
});

// ---------------------------------------------------------------------------
// Render-payload field validators (untrusted webview boundary)
// ---------------------------------------------------------------------------

describe('render payload legend validators (#98)', () => {
    it('accepts undefined (older hosts) and valid arrays', () => {
        assert.strictEqual(isValidPresentElementTypes(undefined), true);
        assert.strictEqual(isValidPresentElementTypes([]), true);
        assert.strictEqual(isValidPresentElementTypes(['Person', 'SoftwareSystem']), true);
    });

    it('rejects non-arrays and malformed entries', () => {
        assert.strictEqual(isValidPresentElementTypes('Person'), false);
        assert.strictEqual(isValidPresentElementTypes(42), false);
        assert.strictEqual(isValidPresentElementTypes(['Person', 42]), false);
        assert.strictEqual(isValidPresentElementTypes(['']), false);
        assert.strictEqual(isValidPresentElementTypes(['x'.repeat(129)]), false);
        assert.strictEqual(isValidPresentElementTypes(Array(65).fill('Person')), false);
    });

    it('accepts undefined and valid swatch-colour records', () => {
        assert.strictEqual(isValidLegendSwatchColors(undefined), true);
        assert.strictEqual(isValidLegendSwatchColors({}), true);
        assert.strictEqual(isValidLegendSwatchColors({ person: '#08427b', external: '#999999' }), true);
    });

    it('rejects malformed swatch-colour records', () => {
        assert.strictEqual(isValidLegendSwatchColors(['#08427b']), false);
        assert.strictEqual(isValidLegendSwatchColors('#08427b'), false);
        assert.strictEqual(isValidLegendSwatchColors({ person: 42 }), false);
        assert.strictEqual(isValidLegendSwatchColors({ person: '' }), false);
        assert.strictEqual(isValidLegendSwatchColors({ person: 'x'.repeat(65) }), false);
        const tooMany: Record<string, string> = {};
        for (let i = 0; i < 33; i++) { tooMany[`k${i}`] = '#fff'; }
        assert.strictEqual(isValidLegendSwatchColors(tooMany), false);
    });

    it('isRenderMessage validates the new optional fields', () => {
        assert.ok(
            PREVIEW_CLIENT_SCRIPT.includes('isValidPresentElementTypes(message.payload.presentElementTypes)'),
            'isRenderMessage must validate payload.presentElementTypes',
        );
        assert.ok(
            PREVIEW_CLIENT_SCRIPT.includes('isValidLegendSwatchColors(message.payload.legendSwatchColors)'),
            'isRenderMessage must validate payload.legendSwatchColors',
        );
        assert.ok(
            PREVIEW_CLIENT_SCRIPT.includes("typeof message.payload.settings.legendShow === 'boolean'"),
            'isRenderMessage must accept settings.legendShow as an optional boolean',
        );
    });
});

// ---------------------------------------------------------------------------
// Static pins — client wiring, overlay markup/CSS, setting registration
// ---------------------------------------------------------------------------

describe('legend overlay wiring pins (#98)', () => {
    it('client script wires drag, keyboard and render updates', () => {
        for (const pin of [
            "document.getElementById('legend-overlay')",
            'function onLegendPointerDown(event)',
            'function onLegendPointerMove(event)',
            'function onLegendPointerUp(event)',
            'function onLegendKeyDown(event)',
            'function updateLegend(presentElementTypes, swatchColors, legendShow)',
            "legendOverlayEl.addEventListener('keydown', onLegendKeyDown)",
            'filterLegendItems(LEGEND_CATALOG',
        ]) {
            assert.ok(PREVIEW_CLIENT_SCRIPT.includes(pin), `PREVIEW_CLIENT_SCRIPT must contain: ${pin}`);
        }
    });

    it('keyboard nudges match the node-movement deltas (10px, 25px with Shift)', () => {
        assert.ok(
            PREVIEW_CLIENT_SCRIPT.includes('const delta = event.shiftKey ? 25 : 10;'),
            'legend keyboard handler must reuse the 10/25px arrow-key deltas',
        );
    });

    it('PreviewPanel renders the overlay markup with ARIA and default anchor', () => {
        const panelSrc = fs.readFileSync(
            path.resolve(__dirname, '../../webview/PreviewPanel.ts'), 'utf8',
        );
        // Markup: focusable region, hidden until the first render.
        assert.ok(panelSrc.includes('id="legend-overlay"'), 'overlay markup missing');
        assert.ok(panelSrc.includes('role="region"'), 'overlay must be a region');
        assert.ok(panelSrc.includes('aria-label='), 'overlay must have an aria-label');
        assert.ok(panelSrc.includes('tabindex="0"'), 'overlay must be tab-focusable');
        // Default position per audit Appendix B.
        const legendCss = panelSrc.slice(panelSrc.indexOf('#legend-overlay {'));
        assert.ok(legendCss.includes('bottom: 20px;'), 'default anchor must be bottom: 20px');
        assert.ok(legendCss.includes('right: 20px;'), 'default anchor must be right: 20px');
        assert.ok(legendCss.includes('#legend-overlay:focus-visible'), 'overlay needs :focus-visible styling');
    });

    it('PreviewPanel delivers legend data in the render payload', () => {
        const panelSrc = fs.readFileSync(
            path.resolve(__dirname, '../../webview/PreviewPanel.ts'), 'utf8',
        );
        assert.ok(
            panelSrc.includes('presentElementTypes: computePresentElementTypes(view)'),
            'payload must carry presentElementTypes computed from the model',
        );
        assert.ok(
            panelSrc.includes("get<boolean>('legend.show', true)"),
            'payload settings must mirror c4x.legend.show',
        );
        assert.ok(
            panelSrc.includes('legendSwatchColors'),
            'payload must carry theme swatch colours',
        );
    });

    it('c4x.legend.show stays registered as a boolean defaulting to true', () => {
        const pkg = JSON.parse(
            fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8'),
        );
        const setting = pkg?.contributes?.configuration?.properties?.['c4x.legend.show'];
        assert.ok(setting, 'c4x.legend.show must be registered in package.json');
        assert.strictEqual(setting.type, 'boolean');
        assert.strictEqual(setting.default, true);
    });
});
