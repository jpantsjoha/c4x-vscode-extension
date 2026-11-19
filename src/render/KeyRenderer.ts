/**
 * The diagram key (#327, notation decision #320, Decision 6).
 *
 * c4model.com: every diagram should have a key, listing each distinct style
 * in it. This module derives the key from the styles the renderer actually
 * resolved for the drawn view, then draws it:
 *
 *   - `computeKeyEntries` groups the drawn elements by style signature (type,
 *     outline, stroke, fill, text colour, border, stroke width, icon) and
 *     emits one entry per signature, then one per boundary style and one per
 *     relationship line style. Pure; the webview overlay and every export use
 *     the same list.
 *   - `keySwatchSvg` draws an entry's swatch with the shared shape geometry
 *     (`shapeOutlineSvg`, #323), so a folder in the key is the folder in the
 *     diagram, not a colour chip.
 *   - `renderKeySvg` lays the entries out in a grid, and `appendKeyToSvg`
 *     adds that band below a drawn diagram when `c4x.export.includeKey` is
 *     on. SvgBuilder itself is unchanged.
 *
 * Every label reaches SVG through `escapeXml`.
 */
import type { LayoutResult } from '../layout/DagreLayoutEngine';
import type { C4Theme } from '../themes/Theme';
import { escapeXml } from './svg-utils';
import {
    borderDashArray,
    isBundledSpriteId,
    orderedStyleTags,
    resolveElementStyle,
    styleTypeTag,
    type ElementStyleContext,
    type ElementStyleOptions,
    type ElementStyleTheme,
    type StyleBorder,
    type StyleOutline,
} from './elementStyle';
import { shapeOutlineSvg, shapeNum } from './shapeGeometry';
import { boundaryTypeLabel } from './boundaryLabel';
import { measureTextPx, textMetricVariant, TEXT_METRICS } from './textLayout';

/** An element style in the key. */
export interface ElementKeyEntry {
    readonly kind: 'element';
    readonly label: string;
    readonly type: string;
    readonly outline: StyleOutline;
    readonly fill: string;
    readonly stroke: string;
    readonly color: string;
    readonly border: StyleBorder;
    readonly strokeWidth: number;
    readonly icon?: string;
}

/** A boundary style in the key: one per boundary type the view draws. */
export interface BoundaryKeyEntry {
    readonly kind: 'boundary';
    readonly label: string;
}

/** A relationship line style in the key: dashed (uses, async) or solid (sync). */
export interface RelationshipKeyEntry {
    readonly kind: 'relationship';
    readonly label: string;
    readonly dashed: boolean;
}

export type KeyEntry = ElementKeyEntry | BoundaryKeyEntry | RelationshipKeyEntry;

/** What the key needs from each drawn element: the resolver's input, in source order. */
export interface KeyElementInput {
    readonly id?: string;
    readonly type: string;
    readonly tags?: readonly string[];
    readonly sprite?: string;
    readonly shape?: string;
    readonly impliedTags?: readonly string[];
}

/** The resolver functions the key's element entries use, injected so the function embeds cleanly. */
export interface KeyStyleDeps {
    readonly resolveElementStyle: typeof resolveElementStyle;
    readonly orderedStyleTags: typeof orderedStyleTags;
    readonly styleTypeTag: typeof styleTypeTag;
}

/** The swatch drawing functions, injected for the same reason. */
export interface KeySwatchDeps {
    readonly shapeOutlineSvg: typeof shapeOutlineSvg;
    readonly shapeNum: typeof shapeNum;
    readonly borderDashArray: typeof borderDashArray;
}

/** The host's dependencies: the imported functions themselves. */
export const KEY_STYLE_DEPS: KeyStyleDeps = { resolveElementStyle, orderedStyleTags, styleTypeTag };
export const KEY_SWATCH_DEPS: KeySwatchDeps = { shapeOutlineSvg, shapeNum, borderDashArray };

/** `WebBrowser` -> `Web Browser`. Self-contained (embedded in the webview). */
export function shapeDisplayName(shape: string): string {
    return shape.replace(/([a-z])([A-Z])/g, '$1 $2');
}

/**
 * The element entries of the key, in key order: by type (Person, Software
 * System, Container, Component, Deployment Node, then any other), each type by
 * first appearance in `elements` (source order).
 *
 * Label: the winning tag style's `$legend`; otherwise the type name, then the
 * tags that styled the element (tag order, without `Element` and the type
 * tag), then the element's own `$shape` when it changed the outline. Two
 * entries that would read the same also list the first element's other tags,
 * and a numeral as a last resort, so no two entries share a label.
 *
 * EMBEDDING CONTRACT: the webview embeds this verbatim (KEY_CLIENT_FUNCTIONS),
 * so a staged tag edit rebuilds the key with the host's own rule. The style
 * resolver functions come in through `deps` (a compiled cross-module call is
 * module-qualified and would not resolve in the webview); it calls nothing
 * else but `shapeDisplayName`, and uses no module constants.
 */
export function computeElementKeyEntries(
    elements: ReadonlyArray<KeyElementInput>,
    theme: ElementStyleTheme,
    styles: ElementStyleContext,
    borderWidth: number,
    options: ElementStyleOptions | undefined,
    deps: KeyStyleDeps,
): ElementKeyEntry[] {
    const resolveElementStyle = deps.resolveElementStyle;
    const orderedStyleTags = deps.orderedStyleTags;
    const styleTypeTag = deps.styleTypeTag;
    const sameText = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();
    const hasPart = (parts: readonly string[], part: string): boolean =>
        parts.some(p => sameText(p, part) || sameText(p.replace(/\s+/g, ''), part.replace(/\s+/g, '')));
    const typeOrder = ['Person', 'SoftwareSystem', 'Container', 'Component', 'DeploymentNode'];
    const groups: Array<{ first: KeyElementInput; parts: string[]; entry: Omit<ElementKeyEntry, 'label'> }> = [];
    const seen: Record<string, true> = Object.create(null);
    for (const element of elements) {
        if (!element.type) { continue; }
        const style = resolveElementStyle(element, theme, styles, options);
        const strokeWidth = style.strokeWidth !== undefined ? style.strokeWidth : borderWidth;
        const icon = style.iconLayout ? style.icon : undefined;
        const signature = JSON.stringify([element.type, style.outline, style.stroke, style.fill, style.color, style.border, strokeWidth, icon || '', style.legend || '']);
        if (seen[signature]) { continue; }
        seen[signature] = true;
        const typeName = styleTypeTag(element.type);
        let parts: string[];
        if (style.legend !== undefined) {
            parts = [style.legend];
        } else {
            parts = [typeName];
            for (const tag of style.contributingTags) {
                if (!sameText(tag, 'Element') && !sameText(tag, typeName) && !hasPart(parts, tag)) { parts.push(tag); }
            }
            if (element.shape !== undefined && style.shape !== undefined) {
                const withoutOwnShape = resolveElementStyle(Object.assign({}, element, { shape: undefined }), theme, styles, options);
                const name = shapeDisplayName(style.shape);
                if (withoutOwnShape.outline !== style.outline && !hasPart(parts, name)) { parts.push(name); }
            }
        }
        const entry: Omit<ElementKeyEntry, 'label'> = icon !== undefined
            ? { kind: 'element', type: element.type, outline: style.outline, fill: style.fill, stroke: style.stroke, color: style.color, border: style.border, strokeWidth, icon }
            : { kind: 'element', type: element.type, outline: style.outline, fill: style.fill, stroke: style.stroke, color: style.color, border: style.border, strokeWidth };
        groups.push({ first: element, parts, entry });
    }
    const rank = (type: string): number => {
        const r = typeOrder.indexOf(type);
        return r < 0 ? typeOrder.length : r;
    };
    const ordered = groups
        .map((group, index) => ({ group, index }))
        .sort((a, b) => rank(a.group.entry.type) - rank(b.group.entry.type) || a.index - b.index)
        .map(item => item.group);
    const labelOf = (group: { parts: string[] }): string => group.parts.join(', ');
    const collisions = (): Array<Array<{ first: KeyElementInput; parts: string[] }>> => {
        const byLabel: Record<string, Array<{ first: KeyElementInput; parts: string[] }>> = Object.create(null);
        const keys: string[] = [];
        for (const group of ordered) {
            const key = labelOf(group).toLowerCase();
            if (!byLabel[key]) { byLabel[key] = []; keys.push(key); }
            byLabel[key].push(group);
        }
        return keys.map(key => byLabel[key]).filter(same => same.length > 1);
    };
    // Entries that read the same: add the first element's other tags (the
    // author's own words for it), then a numeral.
    for (const same of collisions()) {
        for (const group of same) {
            const element = group.first;
            const implied = (element.impliedTags || []).map(t => t.toLowerCase());
            for (const tag of orderedStyleTags(element)) {
                if (sameText(tag, 'Element') || sameText(tag, styleTypeTag(element.type)) || implied.indexOf(tag.toLowerCase()) >= 0) { continue; }
                if (!hasPart(group.parts, tag)) { group.parts.push(tag); }
            }
        }
    }
    for (const same of collisions()) {
        same.forEach((group, i) => {
            if (i > 0) { group.parts[group.parts.length - 1] += ' (' + (i + 1) + ')'; }
        });
    }
    return ordered.map(group => Object.assign({}, group.entry, { label: labelOf(group) }) as ElementKeyEntry);
}

/**
 * The key entries for a drawn view, in key order: the element entries
 * (`computeElementKeyEntries`), then one per boundary type, then one per
 * relationship line style. Pure; exported for unit tests.
 */
export function computeKeyEntries(layout: LayoutResult, theme: C4Theme, styles: ElementStyleContext): KeyEntry[] {
    // Drawn elements in source order (index order where a source range is missing).
    const elements = layout.elements
        .map((node, index) => ({ node, index }))
        .sort((a, b) => (a.node.element.sourceRange?.start.offset ?? Number.MAX_SAFE_INTEGER)
            - (b.node.element.sourceRange?.start.offset ?? Number.MAX_SAFE_INTEGER) || a.index - b.index)
        .map(entry => entry.node.element);
    const entries: KeyEntry[] = computeElementKeyEntries(elements, theme, styles, theme.styles.borderWidth, { isKnownSprite: isBundledSpriteId }, KEY_STYLE_DEPS);

    // Boundaries: the theme draws every frame alike; the key names each boundary type in the view.
    const boundaryLabels: string[] = [];
    for (const boundary of layout.boundaries ?? []) {
        const typeLine = boundaryTypeLabel(boundary.boundary.boundaryType);
        const label = typeLine ? `Boundary, ${typeLine.replace(/^\[|\]$/g, '')}` : 'Boundary';
        if (boundaryLabels.indexOf(label) < 0) {
            boundaryLabels.push(label);
        }
    }
    for (const label of boundaryLabels) {
        entries.push({ kind: 'boundary', label });
    }

    // Relationships: one entry per line style, in order of first appearance.
    const seen: boolean[] = [];
    for (const routed of layout.relationships) {
        const dashed = routed.relationship.relType !== 'sync';
        if (seen.indexOf(dashed) < 0) {
            seen.push(dashed);
        }
    }
    const both = seen.length > 1;
    for (const dashed of seen) {
        entries.push({ kind: 'relationship', dashed, label: !dashed && both ? 'Relationship, synchronous' : 'Relationship' });
    }
    return entries;
}

/** Swatch box in SVG units: wide enough for every outline to read at a glance. */
export const KEY_SWATCH_WIDTH = 64;
export const KEY_SWATCH_HEIGHT = 44;

/** What a swatch needs from the theme: small enough for the render payload. */
export interface KeySwatchTheme {
    readonly borderRadius: number;
    readonly borderWidth: number;
    readonly background: string;
    readonly relationshipStroke: string;
    readonly boundary: { readonly stroke: string; readonly strokeWidth: number; readonly dash: string | null; readonly opacity: number };
}

/** The swatch inputs of a theme. Host only. */
export function keySwatchTheme(theme: C4Theme): KeySwatchTheme {
    return {
        borderRadius: theme.styles.borderRadius,
        borderWidth: theme.styles.borderWidth,
        background: theme.colors.background,
        relationshipStroke: theme.colors.relationship.stroke,
        boundary: { stroke: theme.boundary.stroke, strokeWidth: theme.boundary.strokeWidth, dash: theme.boundary.dash, opacity: theme.boundary.opacity },
    };
}

/**
 * An entry's swatch at (x, y), KEY_SWATCH_WIDTH x KEY_SWATCH_HEIGHT (64 x 44).
 * Elements draw their outline with the shared shape geometry; an icon-layout
 * person (the classic themes' person icon over a box) reads as the person
 * outline. Self-contained (embedded in the webview): the drawing functions
 * come in through `deps`.
 */
export function keySwatchSvg(entry: KeyEntry, theme: KeySwatchTheme, x: number, y: number, deps: KeySwatchDeps): string {
    const w = 64;
    const h = 44;
    const n = deps.shapeNum;
    const shapeOutlineSvg = deps.shapeOutlineSvg;
    const borderDashArray = deps.borderDashArray;
    if (entry.kind === 'element') {
        const dash = borderDashArray(entry.border);
        const outline: StyleOutline = entry.outline === 'rect' && entry.icon === 'person' ? 'person' : entry.outline;
        return shapeOutlineSvg(outline, x, y, w, h, theme.borderRadius, {
            fill: entry.fill,
            stroke: entry.stroke,
            strokeWidth: entry.strokeWidth,
            dashAttr: dash ? ' stroke-dasharray="' + dash + '"' : '',
        });
    }
    if (entry.kind === 'boundary') {
        const style = theme.boundary;
        const dash = style.dash === null ? '' : ' stroke-dasharray="' + style.dash + '"';
        return '<rect x="' + n(x + 1) + '" y="' + n(y + 1) + '" width="' + n(w - 2) + '" height="' + n(h - 2) + '" rx="8" ry="8" fill="none" stroke="' + style.stroke + '" stroke-width="' + style.strokeWidth + '"' + dash + ' opacity="' + style.opacity + '" />';
    }
    const stroke = theme.relationshipStroke;
    const midY = y + h / 2;
    const dash = entry.dashed ? ' stroke-dasharray="8,4"' : '';
    return '<path d="M ' + n(x) + ' ' + n(midY) + ' L ' + n(x + w - 9) + ' ' + n(midY) + '" fill="none" stroke="' + stroke + '" stroke-width="' + theme.borderWidth + '"' + dash + ' />'
        + '<path d="M ' + n(x + w - 10) + ' ' + n(midY - 4) + ' L ' + n(x + w) + ' ' + n(midY) + ' L ' + n(x + w - 10) + ' ' + n(midY + 4) + ' z" fill="' + stroke + '" />';
}

/**
 * A standalone swatch image for the webview overlay: the same drawing as the
 * export key, on the diagram background, scaled into a small box. Decorative
 * (the label names the entry). Self-contained (embedded in the webview).
 */
export function keySwatchImage(entry: KeyEntry, theme: KeySwatchTheme, deps: KeySwatchDeps): string {
    const pad = 3;
    const vw = 64 + pad * 2;
    const vh = 44 + pad * 2;
    // On the diagram's own background, so the swatch reads as it does in the
    // drawing whatever the overlay's editor-themed panel colour.
    const backdrop = '<rect width="' + vw + '" height="' + vh + '" rx="4" ry="4" fill="' + theme.background + '" />';
    return '<svg xmlns="http://www.w3.org/2000/svg" class="legend-swatch-svg" width="32" height="22" viewBox="0 0 ' + vw + ' ' + vh + '" aria-hidden="true" focusable="false">' + backdrop + keySwatchSvg(entry, theme, pad, pad, deps) + '</svg>';
}

/**
 * The overlay's entries, bounded to what the render payload validator accepts
 * (`isValidLegendEntries`): at most 128 entries, each label at most 300
 * characters (longer ones end in an ellipsis). A diagram with more styles
 * lists the first 127 and a last entry saying how many more there are, so the
 * key never fails a render. Self-contained (embedded in the webview).
 */
export function boundLegendEntries(
    entries: ReadonlyArray<{ label: string; kind: 'element' | 'boundary' | 'relationship'; swatch: string }>,
): Array<{ label: string; kind: 'element' | 'boundary' | 'relationship'; swatch: string }> {
    const maxEntries = 128;
    const maxLabel = 300;
    const clip = (label: string): string => label.length > maxLabel ? label.slice(0, maxLabel - 1) + '…' : label;
    const bounded = entries.map(entry => ({ label: clip(entry.label), kind: entry.kind, swatch: entry.swatch }));
    if (bounded.length <= maxEntries) {
        return bounded;
    }
    const kept = bounded.slice(0, maxEntries - 1);
    const more = bounded.length - kept.length;
    const blank = '<svg xmlns="http://www.w3.org/2000/svg" class="legend-swatch-svg" width="32" height="22" viewBox="0 0 70 50" aria-hidden="true" focusable="false"></svg>';
    kept.push({ label: 'and ' + more + ' more styles', kind: 'element', swatch: blank });
    return kept;
}

/**
 * Every self-contained function above, in dependency order, for the webview
 * to embed beside the style resolver and the shape geometry.
 */
export const KEY_CLIENT_FUNCTIONS: ReadonlyArray<(...args: never[]) => unknown> = [
    shapeDisplayName,
    computeElementKeyEntries,
    shapeNum,
    shapeOutlineSvg,
    keySwatchSvg,
    keySwatchImage,
    boundLegendEntries,
];

/** Key grid metrics. */
const KEY_PAD = 20;
const KEY_TITLE_HEIGHT = 28;
const KEY_LABEL_GAP = 10;
const KEY_COLUMN_GAP = 24;
const KEY_ROW_GAP = 12;
const KEY_FONT_SIZE = 12;
const KEY_LINE_HEIGHT = 15;
/** Widest label line, px; `wrapKeyLabel` breaks longer words to fit. */
export const KEY_LABEL_MAX_WIDTH = 200;

/**
 * A label wrapped to lines no wider than `max` px. A word wider than `max` on
 * its own is broken between characters, so no line ever overruns its cell.
 * Exported for unit tests.
 */
export function wrapKeyLabel(label: string, fontFamily: string, max: number): string[] {
    const variant = textMetricVariant(fontFamily, false, false);
    const width = (text: string): number => measureTextPx(text, KEY_FONT_SIZE, variant, TEXT_METRICS);
    const pieces: string[] = [];
    for (const word of label.split(/\s+/).filter(Boolean)) {
        if (width(word) <= max) {
            pieces.push(word);
            continue;
        }
        let chunk = '';
        for (const ch of Array.from(word)) {
            if (chunk && width(chunk + ch) > max) {
                pieces.push(chunk);
                chunk = ch;
            } else {
                chunk += ch;
            }
        }
        if (chunk) { pieces.push(chunk); }
    }
    const lines: string[] = [];
    let line = '';
    for (const piece of pieces) {
        const next = line ? `${line} ${piece}` : piece;
        if (line && width(next) > max) {
            lines.push(line);
            line = piece;
        } else {
            line = next;
        }
    }
    if (line) { lines.push(line); }
    return lines.length > 0 ? lines : [''];
}

export interface KeyBand {
    /** The `<g class="diagram-key">` markup, positioned at (0, top). */
    readonly svg: string;
    /** Height of the band below the diagram. */
    readonly height: number;
    /** Width the band needs; the document grows to it when the diagram is narrower. */
    readonly width: number;
}

/**
 * The key as a band below the diagram: a "Key" heading, then the entries in a
 * grid that fills the diagram's width, row by row in key order. Each entry is
 * a list item whose `<title>` is its label, so a screen reader reading the
 * exported SVG announces it. Returns height 0 and no markup for no entries.
 * Pure; exported for unit tests.
 */
export function renderKeySvg(entries: readonly KeyEntry[], theme: C4Theme, diagramWidth: number, top: number): KeyBand {
    if (entries.length === 0) {
        return { svg: '', height: 0, width: 0 };
    }
    const font = theme.styles.fontFamily;
    const variant = textMetricVariant(font, false, false);
    const wrapped = entries.map(entry => wrapKeyLabel(entry.label, font, KEY_LABEL_MAX_WIDTH));
    const labelWidth = Math.min(KEY_LABEL_MAX_WIDTH, Math.max(...wrapped.flat().map(line => measureTextPx(line, KEY_FONT_SIZE, variant, TEXT_METRICS))));
    const cellWidth = KEY_SWATCH_WIDTH + KEY_LABEL_GAP + Math.ceil(labelWidth);
    const maxLines = Math.max(...wrapped.map(lines => lines.length));
    const cellHeight = Math.max(KEY_SWATCH_HEIGHT, maxLines * KEY_LINE_HEIGHT);
    const columns = Math.max(1, Math.floor((diagramWidth - KEY_PAD * 2 + KEY_COLUMN_GAP) / (cellWidth + KEY_COLUMN_GAP)));
    const rows = Math.ceil(entries.length / columns);
    const width = KEY_PAD * 2 + columns * cellWidth + (columns - 1) * KEY_COLUMN_GAP;
    const height = KEY_PAD + KEY_TITLE_HEIGHT + rows * cellHeight + (rows - 1) * KEY_ROW_GAP + KEY_PAD;
    const textColor = theme.title.color;
    const swatchTheme = keySwatchTheme(theme);
    const items = entries.map((entry, index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);
        const x = KEY_PAD + col * (cellWidth + KEY_COLUMN_GAP);
        const y = KEY_PAD + KEY_TITLE_HEIGHT + row * (cellHeight + KEY_ROW_GAP);
        const swatchY = y + (cellHeight - KEY_SWATCH_HEIGHT) / 2;
        const lines = wrapped[index];
        const firstBaseline = y + cellHeight / 2 - ((lines.length - 1) * KEY_LINE_HEIGHT) / 2 + 4;
        const tx = x + KEY_SWATCH_WIDTH + KEY_LABEL_GAP;
        const tspans = lines.map((line, i) => `<tspan x="${shapeNum(tx)}" y="${shapeNum(firstBaseline + i * KEY_LINE_HEIGHT)}">${escapeXml(line)}</tspan>`).join('');
        const label = escapeXml(entry.label);
        return `    <g class="key-entry" role="listitem" data-kind="${entry.kind}"><title>${label}</title>
    <g class="key-swatch" aria-hidden="true">${keySwatchSvg(entry, swatchTheme, x, swatchY, KEY_SWATCH_DEPS)}</g>
    <text fill="${textColor}" font-size="${KEY_FONT_SIZE}" font-family="${font}">${tspans}</text></g>`;
    }).join('\n');
    const svg = `  <g class="diagram-key" role="list" aria-label="Key" transform="translate(0, ${shapeNum(top)})">
    <text class="key-title" x="${KEY_PAD}" y="${KEY_PAD + 14}" fill="${textColor}" font-size="14" font-weight="bold" font-family="${font}">Key</text>
${items}
  </g>`;
    return { svg, height, width };
}

/**
 * The `c4x.export.includeKey` setting (default false). False when the vscode
 * configuration API is unavailable (unit tests, the CLI), so those paths draw
 * exactly as before.
 */
export function readExportIncludeKey(): boolean {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const vscodeApi = require('vscode');
        if (!vscodeApi.workspace) {
            return false;
        }
        const config = vscodeApi.workspace.getConfiguration('c4x') as { get<T>(key: string, defaultValue?: T): T | undefined };
        return config.get<boolean>('export.includeKey', false) === true;
    } catch {
        return false;
    }
}

/**
 * The SVG with the key band appended below the diagram (#327). Takes the
 * document SvgBuilder produced and changes only what the band needs: the root
 * viewBox (and a fixed width and height), the background rectangle, and the
 * band itself before the closing tag. Everything else stays byte for byte, so
 * the renderer, and every bundle that embeds it, is untouched. Returns the SVG
 * unchanged when there are no entries or the document is not SvgBuilder's.
 * Pure; exported for unit tests.
 */
export function appendKeyToSvg(svg: string, entries: readonly KeyEntry[], theme: C4Theme, diagramWidth: number): string {
    const root = /<svg\b[^>]*\bviewBox="0 0 ([\d.]+) ([\d.]+)"[^>]*>/.exec(svg);
    const end = svg.lastIndexOf('</svg>');
    if (!root || end < 0 || entries.length === 0) {
        return svg;
    }
    const width = Number(root[1]);
    const height = Number(root[2]);
    const band = renderKeySvg(entries, theme, diagramWidth, height);
    const newWidth = Math.max(width, band.width);
    const newHeight = height + band.height;
    const fixed = (attr: string, from: number, to: number) => (tag: string): string =>
        tag.replace(new RegExp(`\\s${attr}="${from}"`), ` ${attr}="${to}"`);
    let rootTag = root[0].replace(`viewBox="0 0 ${root[1]} ${root[2]}"`, `viewBox="0 0 ${newWidth} ${newHeight}"`);
    rootTag = fixed('height', height, newHeight)(fixed('width', width, newWidth)(rootTag));
    const background = `<rect x="0" y="0" width="${root[1]}" height="${root[2]}"`;
    const head = svg.slice(0, root.index) + rootTag;
    let body = svg.slice(root.index + root[0].length, end);
    body = body.replace(background, `<rect x="0" y="0" width="${newWidth}" height="${newHeight}"`);
    return `${head}${body.replace(/\n$/, '')}\n${band.svg}\n${svg.slice(end)}`;
}
