/**
 * Headless C4X render (#353): `checkC4xSource` runs parse → model → style
 * diagnostics → lint → layout → SVG, the steps and modules the extension's
 * preview runs (`src/webview/PreviewPanel.ts`, view mode), and returns the
 * findings with the SVG. The MCP tool `render_c4x` and the `c4x render`
 * command are thin adapters over it (#352: one engine).
 *
 * Nothing here reads VS Code: the theme is passed in by name, and the two
 * settings that change the picture, `c4x.layout.spacing` and
 * `c4x.edgesOnTop`, are pinned to the extension defaults and passed to the
 * layout and the SVG builder explicitly (#352).
 *
 * Bounds: the input limits of `./limits` apply before layout (they are
 * checked by the shared analysis, as for lint); a diagram with more than
 * MAX_RENDER_ELEMENTS elements or MAX_RENDER_RELATIONSHIPS relationships is
 * not laid out; an SVG over
 * MAX_RENDER_SVG_BYTES is not returned. Never throws for bad input: every
 * outcome is a result.
 */
import { DagreLayoutEngine, LAYOUT_SPACING_PRESETS, type LayoutSpacing } from '../layout/DagreLayoutEngine';
import type { LintOptions } from '../model/lint';
import type { C4Element, C4View } from '../model/C4Model';
import { SvgBuilder } from '../render/SvgBuilder';
import type { C4Theme } from '../themes/Theme';
import { C4ModelTheme } from '../themes/C4ModelTheme';
import { C4StandardTheme } from '../themes/C4StandardTheme';
import { ClassicTheme } from '../themes/ClassicTheme';
import { HighContrastTheme } from '../themes/HighContrastTheme';
import { ModernTheme } from '../themes/ModernTheme';
import { MutedTheme } from '../themes/MutedTheme';
import { LIMIT_RULE_ID, MAX_RENDER_ELEMENTS, MAX_RENDER_RELATIONSHIPS, MAX_RENDER_SVG_BYTES } from './limits';
import { MODEL_RULE_ID, SYNTAX_RULE_ID, analyseC4xSource, type HeadlessFinding } from './lintSource';

/**
 * Themes a headless render accepts: the fixed themes of the `c4x.theme`
 * setting. `auto` follows the editor's colour scheme, which a headless caller
 * does not have, so it is not offered. Order as in the setting.
 */
export const RENDER_THEMES: ReadonlyMap<string, C4Theme> = new Map<string, C4Theme>([
    ['classic', ClassicTheme],
    ['c4-model', C4ModelTheme],
    ['c4-standard', C4StandardTheme],
    ['modern', ModernTheme],
    ['muted', MutedTheme],
    ['high-contrast', HighContrastTheme],
]);

/**
 * The theme when the caller names none: the extension's default theme
 * (`DEFAULT_THEME_NAME` in src/themes/ThemeManager.ts, which a test keeps
 * equal). #352 moves it to `c4-model` when the extension default moves.
 */
export const DEFAULT_RENDER_THEME = 'classic';

/** The output formats. `png` is reserved (#352, option L4): it returns the SVG and says PNG is not available. */
export const RENDER_FORMATS = ['svg', 'png'] as const;
export type RenderFormat = typeof RENDER_FORMATS[number];

// The render bounds live with the other input bounds (./limits), so the
// generated reference lists them; re-exported for the adapters and tests.
export { MAX_RENDER_ELEMENTS, MAX_RENDER_RELATIONSHIPS, MAX_RENDER_SVG_BYTES, RENDER_TIME_BUDGET_MS } from './limits';

/** Rule id for a render the bounds above refuse. Not a catalogue rule. */
export const RENDER_RULE_ID = 'C4X-RENDER';

/** The layout separations of the `balanced` preset, the `c4x.layout.spacing` default. */
export const DEFAULT_RENDER_SPACING: LayoutSpacing = LAYOUT_SPACING_PRESETS.balanced;
/** The `c4x.edgesOnTop` default. */
export const DEFAULT_RENDER_EDGES_ON_TOP = true;

export interface RenderOptions {
    /** A name from RENDER_THEMES; default DEFAULT_RENDER_THEME. */
    readonly theme?: string;
    /** 0-based index of the view to draw. A C4X source has one view, index 0. */
    readonly view?: number;
    readonly format?: RenderFormat;
    readonly lint: LintOptions;
}

export type RenderStatus =
    /** The SVG is in `svg`. */
    | 'rendered'
    /** The source does not parse, exceeds an input limit, or the model builder rejects it: findings only. */
    | 'invalid'
    /** The options are wrong (unknown theme, view or format): `message` says which. */
    | 'bad-options'
    /** The diagram is over MAX_RENDER_ELEMENTS or MAX_RENDER_RELATIONSHIPS, or its SVG is over MAX_RENDER_SVG_BYTES: findings only. */
    | 'too-large'
    /** The source is blank. */
    | 'empty'
    /** The deadline (RENDER_TIME_BUDGET_MS) passed and the render was stopped: findings only (./renderWorker.ts). */
    | 'timed-out';

export interface RenderOutcome {
    readonly status: RenderStatus;
    /** Present only when status is `rendered`. */
    readonly svg?: string;
    /** Syntax, limit, model, style and lint findings, plus one C4X-RENDER finding when a bound refused the render. */
    readonly findings: HeadlessFinding[];
    /** The theme drawn (or that would have been drawn). */
    readonly theme: string;
    /** Set for `bad-options` and `too-large`, and for a `png` request: one sentence about it. */
    readonly message?: string;
    /** SVG size in UTF-8 bytes when one was drawn (also when it was too large to return). */
    readonly svgBytes?: number;
}

const BLOCKING_RULES: ReadonlySet<string> = new Set([SYNTAX_RULE_ID, LIMIT_RULE_ID, MODEL_RULE_ID]);

/** Elements and boundaries in a view, at every level: the count MAX_RENDER_ELEMENTS bounds. */
export function countRenderElements(view: Pick<C4View, 'elements' | 'boundaries'>): number {
    let count = (view.boundaries ?? []).length;
    const stack: C4Element[] = [...view.elements];
    while (stack.length > 0) {
        const element = stack.pop()!;
        count++;
        if (element.children) { stack.push(...element.children); }
    }
    return count;
}

/** A C4X-RENDER finding: a render bound refused the render. */
export function renderFinding(message: string): HeadlessFinding {
    return { ruleId: RENDER_RULE_ID, severity: 'error', message, hint: '', line: 1, column: 1, endLine: 1, endColumn: 1 };
}

/**
 * Draw one view: the layout and SVG calls of the preview's view mode
 * (PreviewPanel.ts: `layout(view, { theme, growText: true })`, then
 * `svgBuilder.build(layout, { theme, view })`), with the two settings pinned.
 * Exported for the equality test, which compares it with the bundles.
 */
export function drawView(view: C4View, theme: C4Theme): string {
    const layout = new DagreLayoutEngine().layoutSync(view, { theme, growText: true, spacing: DEFAULT_RENDER_SPACING });
    return new SvgBuilder().build(layout, { theme, view, edgesOnTop: DEFAULT_RENDER_EDGES_ON_TOP });
}

/**
 * Check and draw one C4X source. Throws only `LintEngineError`, as lint
 * does, when a rule itself fails; the adapters report that as an error.
 * A fault inside layout or drawing is reported as a C4X-RENDER finding.
 */
export function checkC4xSource(source: string, options: RenderOptions): RenderOutcome {
    const prepared = prepareRender(source, options);
    if ('outcome' in prepared) { return prepared.outcome; }
    const { view, theme, themeName, format, findings } = prepared;
    let svg: string;
    try {
        svg = drawView(view, theme);
    } catch (error) {
        const message = `Render failed: ${error instanceof Error ? error.message : String(error)}`;
        return { status: 'invalid', findings: [...findings, renderFinding(message)], theme: themeName, message };
    }
    return boundedRender(svg, findings, themeName, format);
}

/** A render the checks let through, ready to draw. */
export interface PreparedRender {
    readonly view: C4View;
    readonly theme: C4Theme;
    readonly themeName: string;
    readonly format: RenderFormat;
    readonly findings: HeadlessFinding[];
}

/**
 * Every check of a render before layout: options, parse, input limits,
 * model, style diagnostics, lint, and the element and relationship caps.
 * Returns the final outcome when a check refuses the render, else what to
 * draw. The adapters run it before they start the deadline worker
 * (./renderWorker.ts), so the caps are the first line of defence and the
 * findings of a render stopped at the deadline are known.
 */
export function prepareRender(source: string, options: RenderOptions): { readonly outcome: RenderOutcome } | PreparedRender {
    const refuse = (outcome: RenderOutcome) => ({ outcome });
    const themeName = options.theme ?? DEFAULT_RENDER_THEME;
    const theme = RENDER_THEMES.get(themeName);
    if (!theme) {
        return refuse({ status: 'bad-options', findings: [], theme: themeName, message: `Unknown theme. Themes: ${[...RENDER_THEMES.keys()].join(', ')}.` });
    }
    const format = options.format ?? 'svg';
    if (!(RENDER_FORMATS as readonly string[]).includes(format)) {
        return refuse({ status: 'bad-options', findings: [], theme: themeName, message: `Unknown format. Formats: ${RENDER_FORMATS.join(', ')}.` });
    }
    const viewIndex = options.view ?? 0;
    if (!Number.isInteger(viewIndex) || viewIndex < 0) {
        return refuse({ status: 'bad-options', findings: [], theme: themeName, message: 'The view must be a whole number, 0 or more.' });
    }

    const { findings, model } = analyseC4xSource(source.charCodeAt(0) === 0xfeff ? source.slice(1) : source, options.lint);
    if (!model) {
        if (findings.length === 0) {
            return refuse({ status: 'empty', findings, theme: themeName, message: 'The source is empty.' });
        }
        return refuse({ status: 'invalid', findings, theme: themeName });
    }
    if (findings.some(finding => BLOCKING_RULES.has(finding.ruleId))) {
        return refuse({ status: 'invalid', findings, theme: themeName });
    }
    const view = model.views[viewIndex];
    if (!view) {
        return refuse({ status: 'bad-options', findings, theme: themeName, message: `The source has ${model.views.length} view${model.views.length === 1 ? '' : 's'}; view ${viewIndex} does not exist.` });
    }
    const elements = countRenderElements(view);
    const relationships = view.relationships.length;
    if (elements > MAX_RENDER_ELEMENTS || relationships > MAX_RENDER_RELATIONSHIPS) {
        const message = elements > MAX_RENDER_ELEMENTS
            ? `Render too large: the view has ${elements} elements and boundaries; a render lays out at most ${MAX_RENDER_ELEMENTS}. Split it into several views.`
            : `Render too large: the view has ${relationships} relationships; a render routes at most ${MAX_RENDER_RELATIONSHIPS}. Split it into several views.`;
        return refuse({ status: 'too-large', findings: [...findings, renderFinding(message)], theme: themeName, message });
    }

    return { view, theme, themeName, format: format as RenderFormat, findings };
}

/**
 * The last step of a render: an SVG of at most MAX_RENDER_SVG_BYTES UTF-8
 * bytes is returned whole; a larger one is never returned, partly or at all,
 * and a C4X-RENDER finding says why. Exported so the cap is tested at exactly
 * the limit and one byte beyond it.
 */
export function boundedRender(svg: string, findings: HeadlessFinding[], themeName: string, format: RenderFormat = 'svg'): RenderOutcome {
    const svgBytes = Buffer.byteLength(svg, 'utf8');
    if (svgBytes > MAX_RENDER_SVG_BYTES) {
        const message = `Render too large: the SVG is ${svgBytes} bytes; a render returns at most ${MAX_RENDER_SVG_BYTES}. Split the diagram into several views or shorten its text.`;
        return { status: 'too-large', findings: [...findings, renderFinding(message)], theme: themeName, message, svgBytes };
    }
    const pngNote = format === 'png' ? 'PNG is not available in this version; the SVG is returned instead.' : undefined;
    return { status: 'rendered', svg, findings, theme: themeName, svgBytes, ...(pngNote ? { message: pngNote } : {}) };
}
