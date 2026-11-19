/**
 * Greyscale distinguishability of element kinds (#329).
 *
 * NR-N4 clause: in greyscale, no element kind is told apart by colour alone;
 * each element states its type in text or differs by shape or border. This
 * test renders the seven Internet Banking System fixtures in every fixed theme
 * and, per theme, records each element's kind (type, external, database), its
 * drawing signature (node class, first shape tag, dash, icon) and whether its
 * text states its type. A kind whose elements neither state their type nor have
 * a signature of their own is told apart by colour alone.
 *
 * Only the c4-model theme draws a type line (#348); in the other themes the five
 * kinds that share the plain rectangle are colour-only. The groups are
 * pinned per theme: the test fails when one theme changes, and when delivery
 * (#322, #323, #326, or a type line) shrinks a group and the pin is not updated.
 * The target state is an empty pin.
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
import { readFileSync, readdirSync } from 'fs';
import * as path from 'path';
import { C4XParser } from '../../parser/C4XParser';
import { C4ModelBuilder } from '../../model/C4ModelBuilder';
import { DagreLayoutEngine } from '../../layout/DagreLayoutEngine';
import { SvgBuilder } from '../../render/SvgBuilder';
import type { C4Theme } from '../../themes/Theme';
import { C4StandardTheme } from '../../themes/C4StandardTheme';
import { C4ModelTheme } from '../../themes/C4ModelTheme';
import { ClassicTheme } from '../../themes/ClassicTheme';
import { ModernTheme } from '../../themes/ModernTheme';
import { MutedTheme } from '../../themes/MutedTheme';
import { HighContrastTheme } from '../../themes/HighContrastTheme';

const FIXTURES_DIR = path.join(__dirname, '..', 'snapshots', 'fixtures', 'ibs');

const THEMES: ReadonlyArray<readonly [string, C4Theme]> = [
    ['classic', ClassicTheme],
    ['c4-model', C4ModelTheme],
    ['c4-standard', C4StandardTheme],
    ['modern', ModernTheme],
    ['muted', MutedTheme],
    ['high-contrast', HighContrastTheme],
];

const parser = new C4XParser();
const modelBuilder = new C4ModelBuilder();
const layoutEngine = new DagreLayoutEngine();
const svgBuilder = new SvgBuilder();

/** Kind label of an element: type, plus external and database markers. */
function kindOf(type: string, tags: ReadonlyArray<string> | undefined): string {
    const lower = (tags ?? []).map(t => t.toLowerCase());
    return [type, lower.includes('external') ? 'external' : '', lower.includes('database') ? 'database' : '']
        .filter(Boolean).join(' ');
}

/**
 * The drawing of one `<g class="node ..." data-id="...">` group with colour,
 * position and text removed: node class, first shape tag, dash and whether an
 * icon is drawn.
 * Corner radius and border width are theme constants shared by every kind in a
 * theme, so they cannot tell kinds apart and are left out.
 */
function geometrySignature(group: string): string {
    const cls = /class="node([^"]*)"/.exec(group)?.[1].replace(/\blocked\b/g, '').trim() ?? '';
    const shape = /<(rect|path)\b[^>]*>/.exec(group);
    const dash = /stroke-dasharray="([^"]*)"/.exec(shape?.[0] ?? '')?.[1] ?? 'solid';
    const glyph = /<g transform="[^"]*"[^>]*>/.test(group) ? 'icon' : 'no-icon';
    const isCylinder = (shape?.[0] ?? '').includes(' A ');
    // A named shape from #323 (person, bucket, folder, web browser, terminal) is its own drawing.
    const named = /data-shape="([^"]+)"/.exec(group)?.[1];
    return [cls || 'plain', named ?? (isCylinder ? 'cylinder' : (shape?.[1] ?? 'none')), `dash=${dash}`, glyph].join(' | ');
}

interface Seen { kind: string; signature: string; statesType: boolean }

function renderKinds(fixture: string, theme: C4Theme): Seen[] {
    const dsl = readFileSync(path.join(FIXTURES_DIR, `${fixture}.c4x`), 'utf-8');
    const model = modelBuilder.build(parser.parse(dsl), 'greyscale');
    const layout = layoutEngine.layoutSync(model.views[0]);
    const svg = svgBuilder.build(layout, { theme });
    const seen: Seen[] = [];
    for (const el of layout.elements) {
        if (el.element.sprite) {
            continue; // an author-chosen sprite is not a property of the kind
        }
        const start = svg.indexOf(`data-id="${el.id}"`);
        assert.ok(start >= 0, `${fixture}: no node group for ${el.id}`);
        const groupStart = svg.lastIndexOf('<g ', start);
        const groupEnd = svg.indexOf('</g>', start);
        const group = svg.slice(groupStart, groupEnd);
        const text = [...group.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map(m => m[1]).join(' ');
        seen.push({
            kind: kindOf(el.element.type, el.element.tags),
            signature: geometrySignature(group),
            // A type line such as "[Software System]" or "[Container: Java]".
            statesType: /\[(Person|Software System|Container|Component|Deployment Node)\b/i.test(text),
        });
    }
    return seen;
}

/**
 * Colour-only groups today, the same in every fixed theme: kinds that draw the
 * same plain solid rectangle and state no type. Person (icon) and database
 * (cylinder) already differ by shape. #322 (border by tag), #323 (shapes) and
 * #326 (deployment notation), or a type line, remove these. The c4-model theme
 * prints a type line (#348), so its pin is empty: the NR-N4 target state.
 */
const PLAIN_RECTANGLE_KINDS = ['Component', 'Container', 'DeploymentNode', 'SoftwareSystem', 'SoftwareSystem external'];
const COLOUR_ONLY_TODAY: Readonly<Record<string, ReadonlyArray<string>>> = {
    'plain | rect | dash=solid | no-icon': PLAIN_RECTANGLE_KINDS,
};

const PINNED_BY_THEME: Readonly<Record<string, Readonly<Record<string, ReadonlyArray<string>>>>> = {
    'c4-model': {},
};

describe('greyscale distinguishability of element kinds (#329)', () => {
    const fixtures = readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.c4x')).map(f => f.replace(/\.c4x$/, '')).sort();

    it('reads the seven fixtures', () => {
        assert.strictEqual(fixtures.length, 7);
    });

    for (const [themeName, theme] of THEMES) {
        it(`${themeName}: pins the kinds told apart by colour alone`, () => {
            const bySignature = new Map<string, Set<string>>();
            for (const fixture of fixtures) {
                for (const { kind, signature, statesType } of renderKinds(fixture, theme)) {
                    if (statesType) {
                        continue; // this element names its type in text
                    }
                    if (!bySignature.has(signature)) {
                        bySignature.set(signature, new Set());
                    }
                    bySignature.get(signature)!.add(kind);
                }
            }
            const actual: Record<string, string[]> = {};
            for (const [signature, kinds] of bySignature) {
                if (kinds.size > 1) {
                    actual[signature] = [...kinds].sort();
                }
            }
            assert.deepStrictEqual(actual, PINNED_BY_THEME[themeName] ?? COLOUR_ONLY_TODAY, `${themeName}: ${JSON.stringify(actual, null, 2)}`);
        });
    }
});
