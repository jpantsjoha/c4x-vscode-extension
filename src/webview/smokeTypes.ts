/** What the packaged webview reports to the host in smoke mode (C4X_VSIX_SMOKE=1), and how the host cleans it. */

/** What the packaged webview reported about its rendered DOM, plus the host's theme and revision. */
export interface SmokeRenderResult {
    nodeCount: number;
    text: string;
    nodes: Array<{ id: string; x: number; y: number; w: number; h: number; fill: string; stroke: string }>;
    theme: string;
    revision: string;
}

export function sanitiseSmokeNodes(value: unknown): SmokeRenderResult['nodes'] {
    if (!Array.isArray(value)) { return []; }
    return value.slice(0, 500).flatMap(entry => {
        const n = entry as Record<string, unknown>;
        if (!n || typeof n.id !== 'string' || typeof n.fill !== 'string' || typeof n.stroke !== 'string' ||
            ![n.x, n.y, n.w, n.h].every(v => typeof v === 'number' && Number.isFinite(v))) { return []; }
        return [{ id: n.id.slice(0, 200), x: n.x as number, y: n.y as number, w: n.w as number, h: n.h as number,
            fill: n.fill.slice(0, 80), stroke: n.stroke.slice(0, 80) }];
    });
}
