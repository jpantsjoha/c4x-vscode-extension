/**
 * Editor initial zoom tests (#134): a visual editor opened from a Markdown
 * fence applies c4x.markdown.previewScale (default 0.5) as its initial zoom,
 * taking precedence over auto-fit-on-open (#111). Standalone .c4x panels omit
 * the hint and keep the auto-fit path.
 *
 * Layers covered here:
 *   - resolveInitialZoom / formatInitialZoomAnnouncement (pure client helpers)
 *   - readMarkdownPreviewScale (host-side validated setting read, #128 bounds)
 *   - static wiring pins on PREVIEW_CLIENT_SCRIPT and PreviewPanel.ts
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]) {
    if (request === 'vscode') {
        return require.resolve('../__mocks__/vscode');
    }
    return originalResolveFilename.call(this, request, ...args);
};

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
    PREVIEW_CLIENT_SCRIPT,
    INITIAL_ZOOM_MIN,
    INITIAL_ZOOM_MAX,
    formatInitialZoomAnnouncement,
    resolveInitialZoom,
} from '../../webview/previewClientScript';
import {
    readMarkdownPreviewScale,
    PREVIEW_SCALE_DEFAULT,
} from '../../markdown/c4xPlugin';
import { setMarkdownPreviewScaleForTests } from '../__mocks__/vscode';

describe('resolveInitialZoom (#134)', () => {
    it('returns the scale carried by a Markdown-originated payload', () => {
        assert.strictEqual(resolveInitialZoom({ initialZoom: 0.5 }), 0.5);
    });

    it('accepts the boundary values of c4x.markdown.previewScale', () => {
        assert.strictEqual(resolveInitialZoom({ initialZoom: INITIAL_ZOOM_MIN }), INITIAL_ZOOM_MIN);
        assert.strictEqual(resolveInitialZoom({ initialZoom: INITIAL_ZOOM_MAX }), INITIAL_ZOOM_MAX);
    });

    it('returns undefined for a standalone payload (no settings) — auto-fit decides', () => {
        assert.strictEqual(resolveInitialZoom(undefined), undefined);
        assert.strictEqual(resolveInitialZoom(null), undefined);
    });

    it('returns undefined when settings carry no initialZoom (standalone panel)', () => {
        assert.strictEqual(resolveInitialZoom({}), undefined);
        assert.strictEqual(resolveInitialZoom({ initialZoom: undefined }), undefined);
    });

    it('rejects non-number values — falls back to the auto-fit path', () => {
        for (const bad of ['0.5', true, null, {}, []]) {
            assert.strictEqual(
                resolveInitialZoom({ initialZoom: bad }), undefined,
                `initialZoom ${JSON.stringify(bad)} must be ignored`,
            );
        }
    });

    it('rejects non-finite numbers — falls back to the auto-fit path', () => {
        for (const bad of [NaN, Infinity, -Infinity]) {
            assert.strictEqual(
                resolveInitialZoom({ initialZoom: bad }), undefined,
                `initialZoom ${bad} must be ignored`,
            );
        }
    });

    it('rejects out-of-bounds numbers — falls back to the auto-fit path', () => {
        for (const bad of [0, 0.1, 0.19, 1.01, 1.5, -0.5]) {
            assert.strictEqual(
                resolveInitialZoom({ initialZoom: bad }), undefined,
                `initialZoom ${bad} is outside [${INITIAL_ZOOM_MIN}, ${INITIAL_ZOOM_MAX}]`,
            );
        }
    });
});

describe('formatInitialZoomAnnouncement (#134)', () => {
    it('states the applied scale instead of a zoom-to-fit claim', () => {
        assert.strictEqual(formatInitialZoomAnnouncement(0.5), 'Diagram opened at 50% zoom');
        assert.ok(!formatInitialZoomAnnouncement(0.5).includes('fit'));
    });

    it('rounds to whole percentages like the zoom display', () => {
        assert.strictEqual(formatInitialZoomAnnouncement(1.0), 'Diagram opened at 100% zoom');
        assert.strictEqual(formatInitialZoomAnnouncement(0.2), 'Diagram opened at 20% zoom');
    });
});

describe('readMarkdownPreviewScale (#134 host read)', () => {
    beforeEach(() => {
        setMarkdownPreviewScaleForTests(undefined);
    });

    it('falls back to the 0.5 default when the setting is unset', () => {
        assert.strictEqual(readMarkdownPreviewScale(), PREVIEW_SCALE_DEFAULT);
        assert.strictEqual(PREVIEW_SCALE_DEFAULT, 0.5);
    });

    it('returns an explicit in-bounds value — the next editor open picks it up', () => {
        setMarkdownPreviewScaleForTests(0.8);
        assert.strictEqual(readMarkdownPreviewScale(), 0.8);
    });

    it('falls back to the default for out-of-bounds or non-number values', () => {
        for (const bad of [0.1, 1.5, NaN, '0.5', null]) {
            setMarkdownPreviewScaleForTests(bad);
            assert.strictEqual(
                readMarkdownPreviewScale(), PREVIEW_SCALE_DEFAULT,
                `markdown.previewScale ${JSON.stringify(bad)} must fall back to the default`,
            );
        }
    });
});

describe('editor initial zoom wiring pins (#134)', () => {
    it('client resolves the payload hint on the first-render path', () => {
        assert.ok(
            PREVIEW_CLIENT_SCRIPT.includes('resolveInitialZoom(renderSettings)'),
            'showSvg must resolve settings.initialZoom via resolveInitialZoom',
        );
        assert.ok(
            PREVIEW_CLIENT_SCRIPT.includes('firstRender && initialZoom !== undefined'),
            'the explicit initial zoom must gate on firstRender and take precedence over auto-fit',
        );
    });

    it('client announces the applied scale, not a false zoom-to-fit', () => {
        assert.ok(
            PREVIEW_CLIENT_SCRIPT.includes('formatInitialZoomAnnouncement(appliedInitialZoom)'),
            'the polite live region must announce the applied initial zoom',
        );
    });

    it('render-message validator accepts initialZoom as an optional number', () => {
        assert.ok(
            PREVIEW_CLIENT_SCRIPT.includes('message.payload.settings.initialZoom === undefined'),
            'isRenderMessage must tolerate an absent settings.initialZoom',
        );
        assert.ok(
            PREVIEW_CLIENT_SCRIPT.includes("typeof message.payload.settings.initialZoom === 'number'"),
            'isRenderMessage must accept settings.initialZoom as a number',
        );
    });

    it('zoom control displays the applied scale', () => {
        assert.ok(
            PREVIEW_CLIENT_SCRIPT.includes("getElementById('zoom-reset')"),
            'applyZoomPan must refresh the zoom-level display',
        );
        assert.ok(
            PREVIEW_CLIENT_SCRIPT.includes("Math.round(zoom * 100) + '%'"),
            'the zoom display must show the current zoom as a percentage',
        );
    });

    it('host sends initialZoom only for Markdown-bound panels', () => {
        const panelSource = fs.readFileSync(
            path.resolve(__dirname, '../../webview/PreviewPanel.ts'),
            'utf8',
        );
        assert.ok(
            panelSource.includes('initialZoom: this.markdownBlock ? readMarkdownPreviewScale() : undefined'),
            'PreviewPanel must gate initialZoom on this.markdownBlock so standalone panels omit it',
        );
    });
});
