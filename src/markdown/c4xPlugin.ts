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
 * C4X MarkdownIt plugin
 * Registers a custom renderer for ```c4x fenced code blocks
 */
export function c4xPlugin(md: MarkdownIt): MarkdownIt {
    // Store reference to default fence renderer
    const defaultFence = md.renderer.rules.fence || function (tokens, idx, options, env, self) {
        return self.renderToken(tokens, idx, options);
    };

    // Override fence renderer to intercept c4x blocks
    md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const token = tokens[idx];
        const info = token.info.trim();
        const lang = info.split(/\s+/)[0];

        // Only process c4x or plantuml blocks
        if (lang !== 'c4x' && lang !== 'plantuml') {
            return defaultFence(tokens, idx, options, env, self);
        }

        // Render C4X diagram
        return renderC4XBlock(token.content, lang);
    };

    return md;
}

/**
 * Render a C4X code block as inline SVG
 * @param source C4X-DSL source code
 * @param lang Language identifier (c4x or plantuml)
 * @returns HTML string with inline SVG or error message
 */
function renderC4XBlock(source: string, lang: string): string {
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
        const svg = svgBuilder.build(layout);

        // 6. Wrap in container div
        return `<div class="c4x-diagram">${svg}</div>`;

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
