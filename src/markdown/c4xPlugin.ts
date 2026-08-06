/**
 * C4X MarkdownIt Plugin
 * Renders ```c4x fenced code blocks as inline SVG diagrams
 */

import type MarkdownIt from 'markdown-it';
import { c4xParser } from '../parser/C4XParser';
import { c4ModelBuilder } from '../model/C4ModelBuilder';
import { dagreLayoutEngine } from '../layout/DagreLayoutEngine';
import { svgBuilder } from '../render/SvgBuilder';

import { parsePlantUMLtoC4Model } from '../parser/plantuml/PlantUMLAdapter';

/**
 * Options controlling how the plugin renders c4x blocks.
 */
export interface C4xPluginOptions {
    /**
     * Apply the `c4x.markdown.previewScale` factor to the wrapper max-width
     * cap. True for the VS Code Markdown preview (default); exporters pass
     * false so exported/printed diagrams keep their intrinsic size.
     */
    applyPreviewScale?: boolean;
}

/**
 * C4X MarkdownIt plugin
 * Registers a custom renderer for ```c4x fenced code blocks
 */
export function c4xPlugin(md: MarkdownIt, options: C4xPluginOptions = {}): MarkdownIt {
    const applyPreviewScale = options.applyPreviewScale ?? true;
    // Store reference to default fence renderer
    const defaultFence = md.renderer.rules.fence || function (tokens, idx, options, env, self) {
        return self.renderToken(tokens, idx, options);
    };

    // Track c4x block ordinal across all fence tokens in one document render.
    let c4xBlockOrdinal = 0;

    // Override fence renderer to intercept c4x blocks
    md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const token = tokens[idx];
        const info = token.info.trim();
        const parts = info.split(/\s+/);
        const lang = parts[0];

        // Only process c4x or plantuml blocks
        if (lang !== 'c4x' && lang !== 'plantuml') {
            return defaultFence(tokens, idx, options, env, self);
        }

        // Parse attributes from remaining parts (e.g. width=50% scale=0.8)
        const attributes: Record<string, string> = {};
        for (let i = 1; i < parts.length; i++) {
            const part = parts[i];
            const [key, value] = part.split('=');
            if (key && value) {
                attributes[key] = value.replace(/['"]/g, ''); // Remove quotes if present
            }
        }

        // Assign block ordinal for c4x fences (plantuml are skipped by FindC4xFencedBlocks).
        const blockOrdinal = lang === 'c4x' ? c4xBlockOrdinal++ : -1;

        // Render C4X diagram
        return renderC4XBlock(token.content, lang, attributes, blockOrdinal, applyPreviewScale);
    };

    return md;
}

// Bounds mirrored in package.json (c4x.markdown.previewScale) — a drift-pin
// test in src/__tests__/markdown/c4xPlugin.test.ts keeps them in sync.
export const PREVIEW_SCALE_DEFAULT = 0.5;
export const PREVIEW_SCALE_MIN = 0.2;
export const PREVIEW_SCALE_MAX = 1.0;

/**
 * Resolve the c4x.markdown.previewScale setting, falling back to the default
 * when the vscode configuration API is unavailable (unit tests, exports) or
 * the value is not a finite number within [0.2, 1.0].
 * Exported so PreviewPanel can reuse the same validated read for the
 * Markdown-bound editor's initial zoom (#134).
 */
export function readMarkdownPreviewScale(): number {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const vscodeApi = require('vscode');
        if (!vscodeApi.workspace) {
            return PREVIEW_SCALE_DEFAULT;
        }
        const config = vscodeApi.workspace.getConfiguration('c4x') as {
            get<T>(key: string, defaultValue?: T): T | undefined;
        };
        const value = config.get<number>('markdown.previewScale', PREVIEW_SCALE_DEFAULT);
        if (typeof value !== 'number' || !Number.isFinite(value) ||
            value < PREVIEW_SCALE_MIN || value > PREVIEW_SCALE_MAX) {
            return PREVIEW_SCALE_DEFAULT;
        }
        return value;
    } catch {
        return PREVIEW_SCALE_DEFAULT;
    }
}

/**
 * Render a C4X code block as inline SVG
 * @param source C4X-DSL source code
 * @param lang Language identifier (c4x or plantuml)
 * @param attributes Optional rendering attributes (width, height, scale, zoom)
 * @param blockOrdinal The zero-based ordinal of this c4x block in the document (-1 for plantuml)
 * @param applyPreviewScale Whether to apply the c4x.markdown.previewScale factor to the width cap
 * @returns HTML string with inline SVG or error message
 */
function renderC4XBlock(source: string, lang: string, attributes: Record<string, string> = {}, blockOrdinal = -1, applyPreviewScale = true): string {
    try {
        let model;

        if (lang === 'plantuml') {
            // Parse PlantUML source
            model = parsePlantUMLtoC4Model(source);
        } else {
            // 1. Parse C4X syntax
            const parseResult = c4xParser.parse(source);
            // 2. Build C4 Model IR
            model = c4ModelBuilder.build(parseResult, 'markdown-block');
        }

        // 3. Check if model has any views
        if (!model.views || model.views.length === 0) {
            return renderError('No views found in diagram');
        }

        // 4. Layout the first view (synchronous - Dagre layout is actually sync!)
        const view = model.views[0];
        const layout = dagreLayoutEngine.layoutSync(view);

        // 5. Render SVG
        const rawSvg = svgBuilder.build(layout);

        // Strip XML declaration — not valid inside an HTML document
        const svg = rawSvg.replace(/^\s*<\?xml[^?]*\?>\s*/, '');

        // Apply size overrides. Always cap the wrapper at the layout's
        // intrinsic width scaled by c4x.markdown.previewScale (#128): the
        // stylesheet gives the SVG width: 100%, so the diagram renders at the
        // configured fraction of its natural size, shrinks further to fit
        // narrow preview columns, but is never upscaled beyond the cap.
        // A smaller explicit width= still wins — CSS resolves width and
        // max-width to the minimum of the two. Exporters skip the scale so
        // exported/printed diagrams keep their intrinsic size.
        const scale = applyPreviewScale ? readMarkdownPreviewScale() : 1;
        let style = `max-width: ${Math.round(layout.width * scale)}px;`;
        if (attributes['width']) {
            style += `width: ${attributes['width']};`;
        }
        if (attributes['height']) {
            style += `height: ${attributes['height']};`;
        }
        if (attributes['scale']) {
            style += `transform: scale(${attributes['scale']}); transform-origin: top left;`;
        }

        // Add zoom hint capability
        const zoomClass = attributes['zoom'] === 'false' ? '' : 'zoomable';

        // Build "Edit C4 diagram" affordance for c4x blocks.
        // The command: URI scheme is supported by VS Code Markdown Preview.
        // The toolbar appears on hover via CSS defined in c4x.css.
        const editAffordance = lang === 'c4x' && blockOrdinal >= 0
            ? `<div class="c4x-edit-toolbar" role="toolbar" aria-label="C4 diagram actions">` +
              `<a href="command:c4x.editMarkdownBlock?${encodeURIComponent(JSON.stringify([blockOrdinal]))}" ` +
              `class="c4x-edit-button" title="Edit C4 diagram in visual editor" ` +
              `aria-label="Edit C4 diagram in visual editor (opens visual editor panel)">` +
              `✏ Edit C4 diagram` +
              `</a>` +
              `</div>`
            : '';

        // 6. Wrap in container div — SVG first, then optional edit toolbar.
        return `<div class="c4x-diagram ${zoomClass}" style="${style}">${svg}${editAffordance}</div>`;

    } catch (error) {
        // Show error inline in the markdown preview
        const errorMessage = error instanceof Error ? error.message : String(error);
        return renderError(errorMessage);
    }
}

/**
 * Render an error message for display in markdown
 */
function renderError(message: string): string {
    return `
<div class="c4x-error" role="alert">
    <div class="c4x-error-header">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="10" cy="10" r="9" stroke="#dc2626" stroke-width="2" fill="#fee"/>
            <path d="M10 6V11M10 14V14.5" stroke="#dc2626" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <strong>C4X Parse Error</strong>
    </div>
    <pre class="c4x-error-message">${escapeHtml(message)}</pre>
</div>`.trim();
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(unsafe: string): string {
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
