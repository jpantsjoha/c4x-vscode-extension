/**
 * Adversarial render inputs (#353): diagram shapes that make layout work
 * hardest, generated at a given size. Used by render-budget.test.ts (at the
 * render bounds) and by the performance bench (at the bounds and at the
 * parser-side 2,000-element limit, to show why the render bounds are lower).
 */
export type RenderShape = 'flat' | 'boundaries' | 'nested' | 'dense' | 'long-text' | 'chain-shortcuts';

export const RENDER_SHAPES: readonly RenderShape[] = ['flat', 'boundaries', 'nested', 'dense', 'long-text', 'chain-shortcuts'];

/**
 * The round-2 review's in-bounds counterexample, byte for byte: 100
 * containers whose label, technology and description are each 3,400 "W";
 * 99 chain edges; 51 shortcuts c(j % 10) → c(99 − ⌊j / 10⌋). Source
 * 1,025,350 bytes; it drew in 2,193 ms on the reviewer's machine.
 */
export function reviewRound2Source(): string {
    const text = 'W'.repeat(3400);
    const lines = ['%%{ c4: container }%%', 'graph TB'];
    for (let i = 0; i < 100; i++) { lines.push(`Container(c${i}, "${text}", "${text}", "${text}")`); }
    for (let i = 0; i < 99; i++) { lines.push(`c${i} --> c${i + 1}`); }
    for (let j = 0; j <= 50; j++) { lines.push(`c${j % 10} --> c${99 - Math.floor(j / 10)}`); }
    return lines.join('\n');
}

/**
 * `elements` elements and boundaries in `shape`, with `relationships`
 * relationships spread over them (over a dozen elements only, for `dense`).
 * `nested` opens boundaries 30 deep; `long-text` gives every field 4,000
 * characters, near the 4,096-character text limit. `chain-shortcuts` links
 * the elements in one chain and spends the remaining relationships on
 * shortcuts from the first half into the second, `c(i % h) → c(h + (17i +
 * 23⌊i/h⌋) % h)`: the topology the #353 review found that makes dagre's
 * ordering work hardest (150 elements, 300 relationships took 3.6-4.0 s).
 */
export function adversarialSource(shape: RenderShape, elements: number, relationships: number): string {
    const lines = ['%%{ c4: container }%%', 'graph TB'];
    const ids: string[] = [];
    const container = (index: number, text = `Container ${index}`) => {
        ids.push(`c${index}`);
        return `Container(c${index}, "${text}", "${shape === 'long-text' ? text : 'Tech'}", "${shape === 'long-text' ? text : 'Does a thing'}")`;
    };
    let made = 0;
    if (shape === 'boundaries') {
        while (made < elements) {
            lines.push(`System_Boundary(b${made}, "Boundary ${made}") {`);
            made++;
            for (let i = 0; i < 9 && made < elements; i++, made++) { lines.push(`    ${container(made)}`); }
            lines.push('}');
        }
    } else if (shape === 'nested') {
        let depth = 0;
        while (made < elements) {
            if (depth < 30) { lines.push(`System_Boundary(b${made}, "B${made}") {`); depth++; made++; }
            for (let i = 0; i < 8 && made < elements; i++, made++) { lines.push(container(made)); }
        }
        for (let d = 0; d < depth; d++) { lines.push('}'); }
    } else {
        const text = shape === 'long-text' ? 'W '.repeat(2000) : undefined;
        for (; made < elements; made++) { lines.push(container(made, text)); }
    }
    if (shape === 'chain-shortcuts') {
        const half = Math.floor(ids.length / 2);
        let written = 0;
        for (let i = 0; i + 1 < ids.length && written < relationships; i++, written++) { lines.push(`${ids[i]} -->|next| ${ids[i + 1]}`); }
        for (let i = 0; written < relationships; i++, written++) {
            lines.push(`${ids[i % half]} -->|jump ${i}| ${ids[half + (17 * i + 23 * Math.floor(i / half)) % half]}`);
        }
        return lines.join('\n');
    }
    const pool = shape === 'dense' ? ids.slice(0, 12) : ids;
    for (let r = 0, written = 0; written < relationships && pool.length > 1; r++) {
        const from = pool[r % pool.length];
        const to = pool[(r * 7 + 3) % pool.length];
        if (from !== to) {
            lines.push(`${from} -->|uses ${r}| ${to}`);
            written++;
        }
    }
    return lines.join('\n');
}
