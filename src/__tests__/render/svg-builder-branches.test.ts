/**
 * Branch coverage for SvgBuilder: dash/marker selection per relationship type,
 * the title formatter, the boundaries slot, the edges-on-top setting seam and
 * the edge-routing fallbacks.
 *
 * Each case asserts the markup or geometry the branch produces.
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
import {
    LayoutResult,
    Point,
    PositionedBoundary,
    PositionedElement,
    RoutedRelationship,
} from '../../layout/DagreLayoutEngine';
import { C4Theme } from '../../themes/Theme';
import { ClassicTheme } from '../../themes/ClassicTheme';
import { C4ViewType } from '../../parser';
import { RelType } from '../../model/C4Model';
import { SvgBuilder, offsetPerpendicular, BIDIRECTIONAL_EDGE_OFFSET } from '../../render/SvgBuilder';

const MOCK_VSCODE_PATH = require.resolve('../__mocks__/vscode');

interface EdgeOptions {
    id?: string;
    from?: string;
    to?: string;
    label?: string;
    relType?: RelType;
    order?: number;
    points?: Point[];
}

function node(id: string, x: number, y: number): PositionedElement {
    return {
        id,
        element: { id, label: id, type: 'SoftwareSystem' },
        x,
        y,
        width: 200,
        height: 100,
    };
}

function edge(options: EdgeOptions = {}): RoutedRelationship {
    const id = options.id ?? 'rel-0';
    return {
        id,
        points: options.points ?? [{ x: 0, y: 0 }, { x: 100, y: 100 }],
        relationship: {
            id,
            from: options.from ?? 'a',
            to: options.to ?? 'b',
            label: options.label ?? 'Uses',
            relType: options.relType ?? 'uses',
            ...(options.order !== undefined ? { order: options.order } : {}),
        },
    };
}

function layout(overrides: Partial<LayoutResult> = {}): LayoutResult {
    return {
        elements: [node('a', 0, 0), node('b', 400, 300)],
        relationships: [edge()],
        width: 800,
        height: 600,
        ...overrides,
    };
}

function boundary(): PositionedBoundary {
    return {
        id: 'backend-boundary-0',
        boundary: { id: 'backend-boundary-0', label: 'Backend', elements: [] },
        x: 5,
        y: 6,
        width: 700,
        height: 500,
    };
}

function build(layoutResult: LayoutResult, options: Parameters<SvgBuilder['build']>[1] = {}): string {
    return new SvgBuilder().build(layoutResult, { theme: ClassicTheme, ...options });
}

/** Index of the node layer relative to the edge layer in the rendered document. */
function layerOrder(svg: string): 'nodes-first' | 'edges-first' {
    const nodes = svg.indexOf('<g class="nodes">');
    const edges = svg.indexOf('<g class="edges">');
    assert.ok(nodes >= 0 && edges >= 0, `both layers must be present:\n${svg}`);
    return nodes < edges ? 'nodes-first' : 'edges-first';
}

/** Runs `run` with the resolved `vscode` module replaced by `replacement`. */
function withVscodeExports<T>(replacement: unknown, run: () => T): T {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('vscode');
    // eslint-disable-next-line security/detect-object-injection
    const entry = require.cache[MOCK_VSCODE_PATH];
    assert.ok(entry, 'the vscode mock must be in the require cache');
    const saved = entry.exports;
    entry.exports = replacement;
    try {
        return run();
    } finally {
        entry.exports = saved;
    }
}

/** Runs `run` while `require('vscode')` fails to resolve. */
function withoutVscodeModule<T>(run: () => T): T {
    const saved = Module._resolveFilename;
    Module._resolveFilename = function (request: string, ...args: unknown[]) {
        if (request === 'vscode') {
            throw new Error("Cannot find module 'vscode'");
        }
        return saved.call(this, request, ...args);
    };
    try {
        return run();
    } finally {
        Module._resolveFilename = saved;
    }
}

describe('SvgBuilder — relationship dash and marker per type', () => {
    it('draws a sync relationship solid, with the sync marker', () => {
        const svg = build(layout({ relationships: [edge({ relType: 'sync' })] }));

        assert.ok(!svg.includes('stroke-dasharray="8,4"'), `a sync edge must be solid, got:\n${svg}`);
        assert.ok(svg.includes('marker-end="url(#c4x-arrow-sync)"'), 'expected the sync marker');
    });

    it('draws an async relationship dashed, with the async marker', () => {
        const svg = build(layout({ relationships: [edge({ relType: 'async' })] }));

        assert.ok(svg.includes('stroke-dasharray="8,4"'), `an async edge must be dashed, got:\n${svg}`);
        assert.ok(svg.includes('marker-end="url(#c4x-arrow-async)"'), 'expected the async marker');
    });

    it('draws a plain "uses" relationship dashed, with the default marker', () => {
        const svg = build(layout({ relationships: [edge({ relType: 'uses' })] }));

        assert.ok(svg.includes('stroke-dasharray="8,4"'), 'a uses edge must be dashed');
        assert.ok(svg.includes('marker-end="url(#c4x-arrow-uses)"'), 'expected the default marker');
    });
});

describe('SvgBuilder — perpendicular offset', () => {
    it('separates the two lines of a real segment by the configured offset', () => {
        const shifted = offsetPerpendicular({ x: 0, y: 0 }, { x: 100, y: 0 }, BIDIRECTIONAL_EDGE_OFFSET);

        assert.deepStrictEqual(shifted.from, { x: 0, y: BIDIRECTIONAL_EDGE_OFFSET });
        assert.deepStrictEqual(shifted.to, { x: 100, y: BIDIRECTIONAL_EDGE_OFFSET });
    });

    it('leaves a zero-length segment where it is instead of producing NaN', () => {
        const shifted = offsetPerpendicular({ x: 40, y: 50 }, { x: 40, y: 50 }, BIDIRECTIONAL_EDGE_OFFSET);

        assert.ok(Number.isFinite(shifted.from.x) && Number.isFinite(shifted.from.y), 'from must stay finite');
        assert.ok(Number.isFinite(shifted.to.x) && Number.isFinite(shifted.to.y), 'to must stay finite');
        assert.strictEqual(shifted.from.x, 40);
        assert.strictEqual(shifted.from.y, 50);
        assert.strictEqual(shifted.to.x, 40);
        assert.strictEqual(shifted.to.y, 50);
    });
});

describe('SvgBuilder — boundaries layer', () => {
    it('renders each boundary when the layout has them', () => {
        const svg = build(layout({ boundaries: [boundary()] }));

        assert.ok(svg.includes('data-id="backend-boundary-0"'), `expected the boundary group, got:\n${svg}`);
        assert.ok(svg.includes('>Backend</text>'), 'expected the boundary label');
    });

    it('leaves the boundaries layer empty when the layout has none', () => {
        const svg = build(layout({ boundaries: undefined }));

        assert.ok(svg.includes('<g class="boundaries">\n\n    </g>'), `expected an empty boundaries layer, got:\n${svg}`);
        assert.ok(!svg.includes('class="boundary"'), 'no boundary may be rendered');
    });
});

describe('SvgBuilder — diagram title', () => {
    const cases: Array<[C4ViewType, string]> = [
        ['system-context', 'System Context'],
        ['container', 'Container'],
        ['component', 'Component'],
        ['deployment', 'Deployment'],
        ['dynamic', 'Dynamic'],
    ];

    for (const [viewType, expected] of cases) {
        it(`titles a ${viewType} view "${expected}"`, () => {
            const svg = build(layout(), { viewType });

            assert.ok(
                svg.includes(`class="diagram-title" x="400.00" y="28.00"`),
                `expected a centred title, got:\n${svg}`,
            );
            assert.ok(svg.includes(`>${expected}</text>`), `expected the title text "${expected}", got:\n${svg}`);
        });
    }

    it('falls back to the raw view type for an unrecognised value', () => {
        const svg = build(layout(), { viewType: 'landscape' as C4ViewType });

        assert.ok(svg.includes('>landscape</text>'), `expected the raw view type as title, got:\n${svg}`);
    });

    it('appends the workspace name when one is supplied', () => {
        const svg = build(layout(), { viewType: 'container', workspaceName: 'Acme Bank' });

        assert.ok(svg.includes('>Container — Acme Bank</text>'), `expected the workspace name, got:\n${svg}`);
    });

    it('omits the title and its 40px band when no view type is supplied', () => {
        const svg = build(layout());

        assert.ok(!svg.includes('diagram-title'), 'no title element expected');
        assert.ok(svg.includes('viewBox="0 0 800 600"'), `canvas must not reserve title height, got:\n${svg}`);
    });
});

describe('SvgBuilder — edges-on-top resolution', () => {
    it('honours an explicit option over the setting', () => {
        assert.strictEqual(layerOrder(build(layout(), { edgesOnTop: true })), 'nodes-first');
        assert.strictEqual(layerOrder(build(layout(), { edgesOnTop: false })), 'edges-first');
    });

    it('reads c4x.edgesOnTop when no explicit option is given', () => {
        const svg = withVscodeExports(
            { workspace: { getConfiguration: () => ({ get: () => false }) } },
            () => build(layout()),
        );

        assert.strictEqual(layerOrder(svg), 'edges-first', 'a false setting must paint edges under nodes');
    });

    it('defaults to edges on top when the configuration value is unset', () => {
        const svg = withVscodeExports(
            { workspace: { getConfiguration: () => ({ get: () => undefined }) } },
            () => build(layout()),
        );

        assert.strictEqual(layerOrder(svg), 'nodes-first');
    });

    it('defaults to edges on top when the vscode module exposes no workspace API', () => {
        const svg = withVscodeExports({}, () => build(layout()));

        assert.strictEqual(layerOrder(svg), 'nodes-first');
    });

    it('defaults to edges on top when the vscode module cannot be loaded at all', () => {
        const svg = withoutVscodeModule(() => build(layout()));

        assert.strictEqual(layerOrder(svg), 'nodes-first');
    });
});

describe('SvgBuilder — edge routing fallbacks', () => {
    it('routes through the dagre points when an endpoint is missing from the element map', () => {
        const points: Point[] = [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }];
        const svg = build(layout({
            elements: [node('a', 0, 0)],
            relationships: [edge({ from: 'a', to: 'ghost', points })],
        }));

        assert.ok(
            svg.includes('d="M 1.00 2.00 L 3.00 4.00 L 5.00 6.00"'),
            `expected the dagre polyline, got:\n${svg}`,
        );
    });

    it('emits an empty path when neither endpoint nor dagre points are available', () => {
        const svg = build(layout({
            elements: [],
            relationships: [edge({ from: 'ghost-a', to: 'ghost-b', points: [] })],
        }));

        assert.ok(svg.includes('<path class="edge-hit-area" d=""'), `expected an empty path, got:\n${svg}`);
    });

    it('falls back to the dagre polyline when no element map is supplied at all', () => {
        const builder = new SvgBuilder();
        const renderEdge = (builder as unknown as {
            renderEdge(relationship: RoutedRelationship, theme: C4Theme): string;
        }).renderEdge.bind(builder);

        const markup = renderEdge(edge({ points: [{ x: 7, y: 8 }, { x: 9, y: 10 }] }), ClassicTheme);

        assert.ok(markup.includes('d="M 7.00 8.00 L 9.00 10.00"'), `expected the dagre polyline, got:\n${markup}`);
    });
});

describe('SvgBuilder — relationship labels', () => {
    it('prefixes the sequence number and tolerates an empty label', () => {
        const svg = build(layout({ relationships: [edge({ label: '', order: 3 })] }));

        assert.ok(svg.includes('>3: </text>'), `expected the bare order prefix, got:\n${svg}`);
    });

    it('renders the order and the label together', () => {
        const svg = build(layout({ relationships: [edge({ label: 'Reads', order: 2 })] }));

        assert.ok(svg.includes('>2: Reads</text>'), `expected the numbered label, got:\n${svg}`);
    });

    it('renders no label element when there is neither label nor order', () => {
        const svg = build(layout({ relationships: [edge({ label: '' })] }));

        assert.ok(!svg.includes('paint-order="stroke"'), `expected no label text, got:\n${svg}`);
    });
});
