/**
 * Shape geometry for the C4 shape set (#323, notation decision #320, Decision 2).
 *
 * One module answers four questions for every outline the renderer draws:
 *   - the SVG markup (`shapeOutlineSvg`): outline first, then any detail
 *     (a lid, a title bar, a prompt glyph) in a `<g class="shape-detail">`;
 *   - the text-safe inner box (`shapeTextBox`) the label is laid out in, so
 *     text stays inside the outline at the shape's minimum size;
 *   - where the outline crosses each side's midline (`shapeSideInsets`), so
 *     arrows end on the outline, not on the bounding box (EdgeRouter);
 *   - the minimum size (`shapeMinSize`) the layout gives an element.
 *
 * The theme rectangle (`rect`), `box`, `roundedBox` and `cylinder` keep the
 * markup and text placement they had before #323, so diagrams without a
 * named shape render byte-identically.
 *
 * EMBEDDING CONTRACT: the webview client embeds these functions verbatim via
 * `fn.toString()` (previewClientScript.ts), exactly as it embeds the style
 * resolver. Every function must be self-contained: no runtime imports, no
 * module-level constants, and calls only to functions listed in
 * SHAPE_GEOMETRY_CLIENT_FUNCTIONS.
 */
import type { StyleOutline } from './elementStyle';

export interface ShapeBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Distance from each side of the bounding box to the outline, along that side's midline. */
export interface ShapeSideInsets {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

/** Paint for an outline: colours, width and an optional dash attribute string. */
export interface ShapePaint {
    fill: string;
    stroke: string;
    strokeWidth: number;
    /** ` stroke-dasharray="…"` or empty. */
    dashAttr: string;
}

/**
 * The person outline's proportions at a size: head circle radius and centre,
 * the body's top edge and its corner radius. Head and body are scaled from
 * the c4model.com container key, bounded so the body keeps room for text.
 */
export function personShapeMetrics(width: number, height: number): { headR: number; headCx: number; headCy: number; bodyTop: number; bodyR: number } {
    const headR = Math.min(width * 0.2, height * 0.22, 40);
    const bodyTop = headR * 1.75;
    const bodyR = Math.min(width * 0.18, (height - bodyTop) / 2.5, 40);
    return { headR, headCx: width / 2, headCy: headR, bodyTop, bodyR };
}

/** Bucket proportions: lid ellipse half-height and the taper of each side at the bottom. */
export function bucketShapeMetrics(width: number, height: number): { ry: number; taper: number } {
    return { ry: Math.min(12, height * 0.1), taper: width * 0.1 };
}

/** Folder proportions: tab height, tab start and end (from the left edge), tab corner radius. */
export function folderShapeMetrics(width: number, height: number): { tabH: number; tabX0: number; tabX1: number; tabR: number } {
    const tabH = Math.min(14, height * 0.12);
    return { tabH, tabX0: width * 0.03, tabX1: width * 0.35, tabR: Math.min(4, tabH / 2) };
}

/** Web browser title bar height. */
export function webBrowserBarHeight(height: number): number {
    return Math.min(18, height * 0.16);
}

/** Terminal: the band at the top the `>_` glyph occupies. */
export function terminalGlyphBand(): number {
    return 28;
}

/**
 * The text-safe inner box, in absolute coordinates. The theme rectangle, box
 * and rounded box use the whole bounding box, and the cylinder a box centred
 * on it, so their text sits exactly where it did before #323.
 */
export function shapeTextBox(outline: StyleOutline | string, x: number, y: number, width: number, height: number): ShapeBox {
    switch (outline) {
        case 'cylinder':
            // The cylinder's caps are 12 high; the box is symmetric, so the
            // text centre is the bounding box centre, as before.
            return { x, y: y + 12, width, height: height - 24 };
        case 'bucket': {
            const m = bucketShapeMetrics(width, height);
            return { x: x + m.taper, y: y + 2 * m.ry, width: width - 2 * m.taper, height: height - 3 * m.ry };
        }
        case 'folder': {
            const m = folderShapeMetrics(width, height);
            return { x, y: y + m.tabH, width, height: height - m.tabH };
        }
        case 'webBrowser': {
            // Inset 4px from the sides and bottom, clear of the rounded corners.
            const bar = webBrowserBarHeight(height);
            return { x: x + 4, y: y + bar, width: width - 8, height: height - bar - 4 };
        }
        case 'terminal': {
            const band = terminalGlyphBand();
            return { x: x + 4, y: y + band, width: width - 8, height: height - band - 4 };
        }
        case 'person': {
            // Inset from the body's rounded corners on every side.
            const m = personShapeMetrics(width, height);
            const inset = m.bodyR * 0.3;
            return { x: x + inset, y: y + m.bodyTop + inset, width: width - 2 * inset, height: height - m.bodyTop - 2 * inset };
        }
        default:
            return { x, y, width, height };
    }
}

/**
 * Where the outline crosses each side's midline, measured inward from the
 * bounding box. Zero for every side of the rectangle, box, rounded box,
 * cylinder, web browser and terminal: their midpoints are on the outline.
 */
export function shapeSideInsets(outline: StyleOutline | string | undefined, width: number, height: number): ShapeSideInsets {
    switch (outline) {
        case 'person': {
            // Left and right: the body's side at mid height, inside its rounded corner if mid height falls there.
            const m = personShapeMetrics(width, height);
            const d = height / 2 - m.bodyTop;
            let side = 0;
            if (d < 0) {
                // Mid height crosses the head circle only.
                const dy = height / 2 - m.headCy;
                side = Math.abs(dy) < m.headR ? width / 2 - Math.sqrt(m.headR * m.headR - dy * dy) : width / 2;
            } else if (d < m.bodyR) {
                const off = m.bodyR - d;
                side = m.bodyR - Math.sqrt(m.bodyR * m.bodyR - off * off);
            }
            return { top: 0, right: side, bottom: 0, left: side };
        }
        case 'bucket': {
            // The sides taper linearly from the lid (y = ry) to the base (y = height - ry).
            const m = bucketShapeMetrics(width, height);
            const span = height - 2 * m.ry;
            const side = span > 0 ? m.taper * (height / 2 - m.ry) / span : 0;
            return { top: 0, right: side, bottom: 0, left: side };
        }
        case 'folder': {
            // The top centre is on the body's top edge, below the tab, while the tab ends left of centre.
            const m = folderShapeMetrics(width, height);
            return { top: m.tabX1 < width / 2 ? m.tabH : 0, right: 0, bottom: 0, left: 0 };
        }
        default:
            return { top: 0, right: 0, bottom: 0, left: 0 };
    }
}

/**
 * The smallest size the layout gives an element with this outline: its text
 * box holds a label, a type line and a one-line description (3 lines of 16px,
 * or 15px under an icon, plus 16px of padding). With an icon drawn inside the
 * shape, the text box must also hold the 40px icon and its gap (50px).
 * The theme rectangle, box and rounded box add no minimum: the element type's
 * standard size applies, as before #323.
 */
export function shapeMinSize(outline: StyleOutline | string, withIcon: boolean): { width: number; height: number } {
    switch (outline) {
        case 'cylinder': return withIcon ? { width: 160, height: 130 } : { width: 160, height: 90 };
        case 'bucket': return withIcon ? { width: 160, height: 150 } : { width: 160, height: 100 };
        case 'folder': return withIcon ? { width: 160, height: 125 } : { width: 160, height: 80 };
        case 'webBrowser': return withIcon ? { width: 160, height: 135 } : { width: 160, height: 85 };
        case 'terminal': return withIcon ? { width: 160, height: 145 } : { width: 160, height: 100 };
        case 'person': return withIcon ? { width: 200, height: 205 } : { width: 160, height: 135 };
        default: return { width: 0, height: 0 };
    }
}

/** Format a coordinate as the renderer always has: two decimals. */
export function shapeNum(value: number): string {
    return value.toFixed(2);
}

/**
 * The outline markup for a shape at (x, y, width, height). `radius` is the
 * theme's corner radius. Each top-level element is part of the outline (the
 * client repaints them like the rectangle); detail marks sit in a
 * `<g class="shape-detail">` whose children carry `data-paint` = `stroke`
 * (filled with the outline colour), `fill` (filled with the fill colour) or
 * `line` (stroked with the outline colour).
 */
export function shapeOutlineSvg(
    outline: StyleOutline | string,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    paint: ShapePaint,
): string {
    const n = shapeNum;
    const strokeAttrs = `stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}"${paint.dashAttr}`;
    const filled = `fill="${paint.fill}" ${strokeAttrs}`;
    const rect = (rx: number): string =>
        `<rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" rx="${rx}" ry="${rx}" ${filled} />`;
    switch (outline) {
        case 'box':
            return rect(0);
        case 'roundedBox':
            // The theme's radius, with a 6px minimum when the theme's is 0 (Decision 2).
            return rect(Math.max(radius, 6));
        case 'cylinder': {
            const ry = 12;
            const top = y + ry;
            const bottom = y + height - ry;
            const body = `M ${n(x)} ${n(top)} L ${n(x)} ${n(bottom)} A ${n(width / 2)} ${ry} 0 0 0 ${n(x + width)} ${n(bottom)} L ${n(x + width)} ${n(top)} A ${n(width / 2)} ${ry} 0 0 0 ${n(x)} ${n(top)} Z`;
            const lid = `M ${n(x)} ${n(top)} A ${n(width / 2)} ${ry} 0 0 1 ${n(x + width)} ${n(top)}`;
            return `<path d="${body}" ${filled} />\n    <path d="${lid}" fill="none" ${strokeAttrs} />`;
        }
        case 'bucket': {
            const m = bucketShapeMetrics(width, height);
            const top = y + m.ry;
            const bottom = y + height - m.ry;
            const baseRx = width / 2 - m.taper;
            const body = `M ${n(x)} ${n(top)} L ${n(x + m.taper)} ${n(bottom)} A ${n(baseRx)} ${n(m.ry)} 0 0 0 ${n(x + width - m.taper)} ${n(bottom)} L ${n(x + width)} ${n(top)} A ${n(width / 2)} ${n(m.ry)} 0 0 0 ${n(x)} ${n(top)} Z`;
            // The lid's front arc, from left to right through the bottom of the ellipse.
            const lid = `M ${n(x)} ${n(top)} A ${n(width / 2)} ${n(m.ry)} 0 0 0 ${n(x + width)} ${n(top)}`;
            return `<path d="${body}" ${filled} />\n    <path d="${lid}" fill="none" ${strokeAttrs} />`;
        }
        case 'folder': {
            const m = folderShapeMetrics(width, height);
            const bodyTop = y + m.tabH;
            const r = m.tabR;
            const d = [
                `M ${n(x)} ${n(y + height)}`,
                `L ${n(x)} ${n(bodyTop)}`,
                `L ${n(x + m.tabX0)} ${n(bodyTop)}`,
                `L ${n(x + m.tabX0)} ${n(y + r)}`,
                `A ${n(r)} ${n(r)} 0 0 1 ${n(x + m.tabX0 + r)} ${n(y)}`,
                `L ${n(x + m.tabX1 - r)} ${n(y)}`,
                `A ${n(r)} ${n(r)} 0 0 1 ${n(x + m.tabX1)} ${n(y + r)}`,
                `L ${n(x + m.tabX1)} ${n(bodyTop)}`,
                `L ${n(x + width)} ${n(bodyTop)}`,
                `L ${n(x + width)} ${n(y + height)}`,
                'Z',
            ].join(' ');
            return `<path d="${d}" ${filled} />`;
        }
        case 'webBrowser': {
            const bar = webBrowserBarHeight(height);
            const rx = Math.min(radius, 6);
            const dotR = bar * 0.2;
            const dots = [0, 1, 2].map(i =>
                `<circle data-paint="fill" cx="${n(x + bar * 0.65 + i * bar * 0.7)}" cy="${n(y + bar / 2)}" r="${n(dotR)}" fill="${paint.fill}" stroke="none" />`,
            ).join('');
            const addressX = x + bar * 2.6;
            const addressH = bar * 0.45;
            const address = `<rect data-paint="fill" x="${n(addressX)}" y="${n(y + (bar - addressH) / 2)}" width="${n(Math.max(0, x + width - bar * 0.4 - addressX))}" height="${n(addressH)}" rx="${n(addressH / 2)}" ry="${n(addressH / 2)}" fill="${paint.fill}" stroke="none" />`;
            const titleBar = `<rect data-paint="stroke" x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(bar)}" rx="${rx}" ry="${rx}" fill="${paint.stroke}" stroke="none" />`;
            return `${rect(rx)}\n    <g class="shape-detail">${titleBar}${dots}${address}</g>`;
        }
        case 'terminal': {
            const gx = x + 12;
            const gy = y + 10;
            const glyph = `<path data-paint="line" d="M ${n(gx)} ${n(gy)} L ${n(gx + 8)} ${n(gy + 6)} L ${n(gx)} ${n(gy + 12)} M ${n(gx + 12)} ${n(gy + 14)} L ${n(gx + 24)} ${n(gy + 14)}" fill="none" stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />`;
            return `${rect(radius)}\n    <g class="shape-detail">${glyph}</g>`;
        }
        case 'person': {
            const m = personShapeMetrics(width, height);
            const body = `<rect x="${n(x)}" y="${n(y + m.bodyTop)}" width="${n(width)}" height="${n(height - m.bodyTop)}" rx="${n(m.bodyR)}" ry="${n(m.bodyR)}" ${filled} />`;
            const head = `<circle cx="${n(x + m.headCx)}" cy="${n(y + m.headCy)}" r="${n(m.headR)}" ${filled} />`;
            return `${body}\n    ${head}`;
        }
        default:
            return rect(radius);
    }
}

/**
 * Every function above, in dependency order, for the webview client to embed
 * (host/client parity: the client clips edges with the same insets).
 */
export const SHAPE_GEOMETRY_CLIENT_FUNCTIONS: ReadonlyArray<(...args: never[]) => unknown> = [
    personShapeMetrics,
    bucketShapeMetrics,
    folderShapeMetrics,
    webBrowserBarHeight,
    terminalGlyphBand,
    shapeTextBox,
    shapeSideInsets,
    shapeMinSize,
];
