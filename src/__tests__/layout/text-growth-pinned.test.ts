import * as assert from 'assert';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]) {
    if (request === 'vscode') {
        return require.resolve('../__mocks__/vscode');
    }
    return originalResolveFilename.call(this, request, ...args);
};

import { C4XParser } from '../../parser/C4XParser';
import { C4ModelBuilder } from '../../model/C4ModelBuilder';
import { DagreLayoutEngine, hasSavedGeometry, type LayoutResult, type PositionedElement } from '../../layout/DagreLayoutEngine';
import type { C4View } from '../../model/C4Model';
import { layoutElementText, measureTextPx, textFitsBox, textMetricVariant, TEXT_METRICS } from '../../render/textLayout';

/** Every character is in a reliably measured script (Latin and its extensions, Greek, Cyrillic, punctuation). */
const isExact = (line: string): boolean => Array.from(line).every(ch => {
    const cp = ch.codePointAt(0)!;
    return cp < 0x590 || (cp >= 0x1e00 && cp <= 0x1eff) || (cp >= 0x2000 && cp <= 0x2193);
});
import { isBundledSpriteId, resolveElementStyle } from '../../render/elementStyle';
import { applySidecarLayoutOverrides, saveSidecarLayout, type SidecarPersistenceBoundary, type SidecarUri } from '../../writeback/SidecarPersistence';
import type { C4Theme } from '../../themes/Theme';
import { ClassicTheme } from '../../themes/ClassicTheme';
import { MutedTheme } from '../../themes/MutedTheme';
import { LightTheme } from '../../themes/AutoTheme';

/**
 * Box growth for wrapped text and saved layouts (#340, review rounds 1 and 2).
 *
 * Rule: a box grows for wrapped text only in a diagram with no saved geometry
 * (no element `$x`, `$y` or `locked`, inline or from the sidecar file, and no
 * boundary `$x`, `$y`, `$w` or `$h`). A diagram with saved geometry is laid out
 * at the standard sizes, exactly as without growth, and long text is cut to
 * the box with an ellipsis and the full text in a tooltip.
 *
 * Invariant, tested directly and by a property test: for a diagram with saved
 * geometry the layout equals the growth-disabled layout (every element and
 * frame at the same position and size), so (a) no pinned element or saved
 * frame edge moves, (b) no new overlap appears and no gap shrinks, and (c) no
 * unpinned element moves; and every drawn line stays inside its box.
 */

const parser = new C4XParser();
const builder = new C4ModelBuilder();

function viewOf(source: string): C4View {
    return builder.build(parser.parse(source), 'pinned').views[0];
}

function layoutView(view: C4View, theme: C4Theme = ClassicTheme, growText = true): LayoutResult {
    return new DagreLayoutEngine(() => undefined).layoutSync(view, { theme, growText });
}

function layout(source: string, theme: C4Theme = ClassicTheme, growText = true): LayoutResult {
    return layoutView(viewOf(source), theme, growText);
}

type Box = { x: number; y: number; width: number; height: number };
const overlap = (a: Box, b: Box): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Every element and frame, by id, at its position and size. */
function geometry(result: LayoutResult): Record<string, [number, number, number, number]> {
    const out: Record<string, [number, number, number, number]> = {};
    for (const e of result.elements) { out[`e:${e.id}`] = [e.x, e.y, e.width, e.height]; }
    for (const b of result.boundaries ?? []) { out[`b:${b.id}`] = [b.x, b.y, b.width, b.height]; }
    return out;
}

/** The text the renderer draws for a laid-out element in `theme`. */
function textOf(node: PositionedElement, view: Pick<C4View, 'elementStyles'>, theme: C4Theme = ClassicTheme) {
    const style = resolveElementStyle(node.element, theme, { rules: view.elementStyles ?? [], accentSlots: {} }, { isKnownSprite: isBundledSpriteId });
    return layoutElementText({
        x: node.x, y: node.y, width: node.width, height: node.height,
        iconLayout: !!(style.iconLayout && style.icon), cylinder: style.outline === 'cylinder',
        fontFamily: theme.styles.fontFamily,
        label: node.element.label, technology: node.element.technology, description: node.element.description,
    }, TEXT_METRICS);
}

/** Every drawn line of a leaf element stays inside its box (when the box holds one line per field). */
function assertTextInside(node: PositionedElement, view: Pick<C4View, 'elementStyles'>, theme: C4Theme = ClassicTheme): void {
    const text = textOf(node, view, theme);
    if (text.blocks.length === 0) { return; }
    const last = text.blocks[text.blocks.length - 1];
    assert.ok(last.ys[last.ys.length - 1] <= node.y + node.height, `${node.id}: last baseline below the box`);
    assert.ok(text.blocks[0].ys[0] - text.blocks[0].fontSize >= node.y, `${node.id}: first line above the box`);
    for (const block of text.blocks) {
        const variant = textMetricVariant(theme.styles.fontFamily, block.bold, block.italic);
        for (const line of block.lines) {
            const glyphs = Array.from(line).length;
            // An unwrapped line in a script the model cannot measure exactly is drawn
            // as before #340 (textFitsBox); containment is asserted where the model is exact.
            if (glyphs > 1 && (block.wrapped || !textFitsBox(line, block.fontSize, variant, TEXT_METRICS, node.width) || isExact(line))) {
                assert.ok(measureTextPx(line, block.fontSize, variant, TEXT_METRICS) <= node.width, `${node.id}: "${line}"`);
            }
        }
    }
}

/** The invariant against the growth-disabled layout, plus text containment. */
function assertInvariant(view: C4View, theme: C4Theme = ClassicTheme): LayoutResult {
    assert.ok(hasSavedGeometry(view), 'the case carries saved geometry');
    const grown = layoutView(view, theme, true);
    const fixed = layoutView(view, theme, false);
    assert.deepStrictEqual(geometry(grown), geometry(fixed));
    // Independently of the option: every leaf keeps its type's standard height.
    const standard: Record<string, number> = { Person: 160, SoftwareSystem: 140, Container: 130, Component: 120, DeploymentNode: 200 };
    for (const node of grown.elements) {
        if (!node.element.children?.length) {
            assert.strictEqual(node.height, standard[node.element.type] ?? 140, `${node.id} (${node.element.type}) grew to ${node.height}`);
        }
    }
    for (const node of grown.elements) {
        if (!node.element.children?.length) { assertTextInside(node, view, theme); }
    }
    return grown;
}

const LONG = 'handles payments for customers and '.repeat(20).trim();

function memorySidecar(): SidecarPersistenceBoundary {
    const files = new Map<string, Uint8Array>();
    const file = (fsPath: string): SidecarUri => ({ fsPath, scheme: 'file' });
    return {
        getWorkspaceFolder: uri => (uri.fsPath.startsWith('/workspace/') ? { uri: file('/workspace') } : undefined),
        getWorkspaceFolders: () => [{ uri: file('/workspace') }],
        readFile: uri => {
            const bytes = files.get(uri.fsPath);
            return bytes ? Promise.resolve(bytes) : Promise.reject(Object.assign(new Error('ENOENT'), { code: 'FileNotFound' }));
        },
        writeFile: (uri, content) => { files.set(uri.fsPath, content); return Promise.resolve(); },
        deleteFile: uri => { files.delete(uri.fsPath); return Promise.resolve(); },
        joinPath: (base, ...paths) => file([base.fsPath, ...paths].join('/')),
        file,
        getWorkingDirectory: () => '/workspace',
    };
}

/** Strip inline element positions and apply them through the sidecar file instead. */
async function viaSidecar(source: string): Promise<C4View> {
    const positions = [...source.matchAll(/\w+\((\w+),[^\n]*?, \$x="(-?\d+)", \$y="(-?\d+)"\)/g)].map(m => [m[1], Number(m[2]), Number(m[3])] as const);
    const model = builder.build(parser.parse(source.replace(/, \$x="-?\d+", \$y="-?\d+"\)/g, ')')), 'pinned');
    const sidecar = memorySidecar();
    const documentUri: SidecarUri = { fsPath: '/workspace/pinned.c4x', scheme: 'file' };
    for (const [id, x, y] of positions) { await saveSidecarLayout(documentUri, id, x, y, sidecar); }
    await applySidecarLayoutOverrides(model, documentUri, sidecar);
    return model.views[0];
}

// Review round 1: Containers pinned at (100,100) and (100,235), a 5 px gap; the upper one has long text.
const ROUND1 = `%%{ c4: container }%%
graph TB
    Container(upper, "Upper", "Java", "${LONG}", $x="100", $y="100")
    Container(lower, "Lower", "Java", "Short", $x="100", $y="235")
`;

// Review round 2, case 1: a and b pinned, unpinned u between them by its relationships.
const ROUND2_NUDGE = `%%{ c4: container }%%
graph TB
    Container(a, "A", "Java", "${LONG}", $x="100", $y="100")
    Container(b, "B", "Java", "Short", $x="100", $y="400")
    Container(u, "U", "Java", "Short")
    a -->|Calls| u
    u -->|Calls| b
`;

// Review round 2, case 2: a frame with saved $x/$y/$w but no $h, and a pinned element below it.
const ROUND2_FRAME = `%%{ c4: container }%%
graph TB
    subgraph Shop $x="60", $y="40", $w="400" {
        Container(a, "A", "Java", "${LONG}", $x="100", $y="100")
    }
    Container(b, "B", "Java", "Short", $x="100", $y="280")
`;

describe('Box growth and saved layouts (#340)', () => {
    it('[review 1] a pinned box keeps its standard size next to a pinned box below it; text is cut to fit with a tooltip', () => {
        const view = viewOf(ROUND1);
        const result = assertInvariant(view);
        const [upper, lower] = result.elements;
        assert.deepStrictEqual([upper.y, upper.height, lower.y, lower.height], [100, 130, 235, 130]);
        const description = textOf(upper, view).blocks.find(b => b.field === 'description')!;
        assert.strictEqual(description.truncated, true);
        assert.ok(description.lines[description.lines.length - 1].endsWith('…'));
        assert.strictEqual(description.full, LONG);
    });

    it('[review 1] the same from the sidecar layout file', async () => {
        const view = await viaSidecar(ROUND1);
        const result = assertInvariant(view);
        assert.deepStrictEqual(result.elements.map(e => [e.id, e.y, e.height]), [['upper', 100, 130], ['lower', 235, 130]]);
    });

    it('[review 2] an unpinned box between two pinned ones lands where it would without growth; nothing overlaps', () => {
        const result = assertInvariant(viewOf(ROUND2_NUDGE));
        const at = Object.fromEntries(result.elements.map(e => [e.id, e]));
        assert.strictEqual(at.a.height, 130);
        assert.ok(!overlap(at.a, at.u) && !overlap(at.u, at.b), 'no overlap');
    });

    it('[review 2] a frame without a saved height does not grow into a pinned box below it', () => {
        const result = assertInvariant(viewOf(ROUND2_FRAME));
        const frame = result.boundaries![0];
        const b = result.elements.find(e => e.id === 'b')!;
        assert.ok(frame.y + frame.height <= b.y, `frame bottom ${frame.y + frame.height} reaches b at ${b.y}`);
    });

    it('[review 2] both review cases hold through the sidecar file too', async () => {
        assertInvariant(await viaSidecar(ROUND2_NUDGE));
        assertInvariant(await viaSidecar(ROUND2_FRAME));
    });

    it('a locked element or a saved frame alone counts as saved geometry', () => {
        assert.ok(hasSavedGeometry(viewOf(`graph TB\n    Container(a, "A", "Java", "${LONG}", $locked="true")\n`)));
        assert.ok(hasSavedGeometry(viewOf(`graph TB\n    subgraph S $h="300" {\n        Container(a, "A", "Java", "${LONG}")\n    }\n`)));
        assert.ok(!hasSavedGeometry(viewOf(`graph TB\n    Container(a, "A", "Java", "${LONG}")\n`)));
    });

    it('grows boxes in a diagram with no saved geometry, in the theme font, without overlaps', () => {
        const unpinned = ROUND2_NUDGE.replace(/, \$x="\d+", \$y="\d+"/g, '');
        const heights = [ClassicTheme, MutedTheme, LightTheme].map(theme => layout(unpinned, theme).elements.find(e => e.id === 'a')!.height);
        assert.ok(heights.every(h => h > 130), heights.join(','));
        assert.ok(heights[2] >= heights[0], 'monospace grows at least as much as Arial');
        const result = layout(unpinned);
        for (let i = 0; i < result.elements.length; i++) {
            for (let j = i + 1; j < result.elements.length; j++) {
                assert.ok(!overlap(result.elements[i], result.elements[j]), `${result.elements[i].id} overlaps ${result.elements[j].id}`);
            }
        }
        assert.notDeepStrictEqual(geometry(result), geometry(layout(unpinned, ClassicTheme, false)));
    });

    it('[review 3] wouldGrowText reports whether the view-mode layout grows a box: the preview asks for edit mode on it', () => {
        const engine = new DagreLayoutEngine(() => undefined);
        const unpinned = ROUND2_NUDGE.replace(/, \$x="\d+", \$y="\d+"/g, '');
        assert.strictEqual(engine.wouldGrowText(viewOf(unpinned), { theme: ClassicTheme }), true);
        assert.strictEqual(engine.wouldGrowText(viewOf(unpinned), { theme: ClassicTheme, growText: false }), false);
        assert.strictEqual(engine.wouldGrowText(viewOf(ROUND2_NUDGE), { theme: ClassicTheme }), false, 'saved geometry: never grows');
        assert.strictEqual(engine.wouldGrowText(viewOf(unpinned.replace(LONG, 'Short'))), false, 'text fits');
        const nested = `%%{ c4: deployment }%%\ngraph TB\n    Node(n, "Node", "Linux") {\n        Container(api, "API", "Java", "${LONG}")\n    }\n`;
        assert.strictEqual(engine.wouldGrowText(viewOf(nested), { theme: ClassicTheme }), true, 'a nested leaf counts');
        // layoutGrewText reads the same answer off a layout.
        assert.strictEqual(engine.layoutGrewText(engine.layoutSync(viewOf(unpinned), { theme: ClassicTheme })), true);
        assert.strictEqual(engine.layoutGrewText(engine.layoutSync(viewOf(unpinned), { theme: ClassicTheme, growText: false })), false);
        assert.strictEqual(engine.layoutGrewText(engine.layoutSync(viewOf(nested), { theme: ClassicTheme })), true);
        // Edit mode lays the same diagram out at the standard sizes, as Save of a first move will.
        const edit = layout(unpinned, ClassicTheme, false);
        assert.deepStrictEqual(edit.elements.map(e => e.height), [130, 130, 130]);
    });

    it('does not grow a group: an element with children takes its size from them', () => {
        const source = `%%{ c4: deployment }%%
graph TB
    Node(aws, "Amazon Web Services", "${LONG}") {
        Container(api, "API", "Java", "Serves requests")
    }
`;
        assert.strictEqual(layout(source).elements.find(e => e.id === 'api')!.height, 130);
    });
});

describe('Saved-layout invariant, property test (#340 review 2)', function () {
    // Thousands of layouts; slower under coverage instrumentation.
    this.timeout(180000);
    // Deterministic generator: the same diagrams on every run.
    function rng(seed: number): () => number {
        let state = seed >>> 0;
        return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
    }
    const KINDS = ['Person', 'System', 'System_Ext', 'SystemDb', 'Container', 'ContainerDb', 'Component', 'ComponentDb'];
    const TEXTS = ['', 'Short', 'Reads and writes accounts', LONG, 'https://api.example.com/v2/accounts/{id}/transactions?limit=50', '网上银行系统允许客户查看账户信息并进行支付'];

    /** A random diagram with saved geometry: elements, maybe boundaries, relationships, some pinned. */
    function randomDiagram(random: () => number): string {
        const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
        const count = 2 + Math.floor(random() * 7);
        const ids = Array.from({ length: count }, (_, i) => `e${i}`);
        // Tight packing: coordinates on a small grid so boxes often touch or nearly touch.
        const coordinate = (): number => Math.floor(random() * 6) * (random() < 0.5 ? 130 : 145) + Math.floor(random() * 20);
        const line = (id: string): string => {
            const kind = pick(KINDS);
            const pinned = random() < 0.55 ? `, $x="${coordinate()}", $y="${coordinate()}"` : random() < 0.08 ? ', $locked="true"' : '';
            const label = random() < 0.15 ? 'Personal Banking Customer With A Long Name' : `Element ${id}`;
            const text = pick(TEXTS);
            const args = /^(Person|System)/.test(kind) ? `"${text}"` : `"${pick(TEXTS) || 'Java'}", "${text}"`;
            return `${kind}(${id}, "${label}", ${args}${pinned})`;
        };
        const lines = ['%%{ c4: container }%%', 'graph TB'];
        const framed = random() < 0.4 ? ids.filter(() => random() < 0.4) : [];
        if (framed.length > 0) {
            const geometryArgs = [`$x="${coordinate()}"`, `$y="${coordinate()}"`, `$w="${300 + Math.floor(random() * 400)}"`, `$h="${200 + Math.floor(random() * 300)}"`]
                .filter(() => random() < 0.6);
            lines.push(`    subgraph Frame ${geometryArgs.join(', ')} {`);
            for (const id of framed) { lines.push(`        ${line(id)}`); }
            lines.push('    }');
        }
        for (const id of ids.filter(id => !framed.includes(id))) { lines.push(`    ${line(id)}`); }
        for (let i = 0; i < count; i++) {
            if (random() < 0.7) {
                const from = pick(ids);
                const to = pick(ids);
                if (from !== to) { lines.push(`    ${from} -->|Uses| ${to}`); }
            }
        }
        // Every case carries saved geometry: pin one element if nothing else did.
        if (!/\$x=|\$y=|\$locked=|\$w=|\$h=/.test(lines.join('\n'))) {
            const first = lines.findIndex(text => /^\s+\w+\(e\d+,/.test(text));
            lines[first] = lines[first].replace(/\)$/, `, $x="${coordinate()}", $y="${coordinate()}")`);
        }
        return lines.join('\n') + '\n';
    }

    it('holds for 3,000 random inline diagrams in three theme fonts', () => {
        const random = rng(340);
        const themes = [ClassicTheme, MutedTheme, LightTheme];
        let pinned = 0;
        for (let n = 0; n < 3000; n++) {
            const source = randomDiagram(random);
            const view = viewOf(source);
            try {
                assertInvariant(view, themes[n % 3]);
            } catch (error) {
                throw new Error(`case ${n}:\n${source}\n${(error as Error).message}`);
            }
            pinned += view.elements.filter(e => e.metadata?.x !== undefined).length;
        }
        assert.ok(pinned > 3000, `${pinned} pinned elements`);
    });

    it('holds for 400 random diagrams whose positions come from the sidecar file', async () => {
        const random = rng(1340);
        for (let n = 0; n < 400; n++) {
            const source = randomDiagram(random);
            if (!/, \$x="-?\d+", \$y="-?\d+"\)/.test(source)) { continue; }
            const view = await viaSidecar(source);
            try {
                assertInvariant(view);
            } catch (error) {
                throw new Error(`sidecar case ${n}:\n${source}\n${(error as Error).message}`);
            }
        }
    });
});
