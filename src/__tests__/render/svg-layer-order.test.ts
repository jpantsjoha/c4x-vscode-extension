/**
 * Edges-on-top paint order tests (#UAT): the c4x.edgesOnTop setting controls
 * whether relationship arrows render above or behind diagram nodes.
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
import { C4XParser } from '../../parser/C4XParser';
import { C4ModelBuilder } from '../../model/C4ModelBuilder';
import { DagreLayoutEngine } from '../../layout/DagreLayoutEngine';
import { SvgBuilder } from '../../render/SvgBuilder';
import { ClassicTheme } from '../../themes/ClassicTheme';

const DSL = `graph TB
Person(user, "User")
System(app, "App")
user --> app
`;

function renderSvg(edgesOnTop?: boolean): string {
    const parsed = new C4XParser().parse(DSL);
    const model = new C4ModelBuilder().build(parsed, 'layer-order-test');
    const layout = new DagreLayoutEngine().layoutSync(model.views[0]);
    return new SvgBuilder().build(layout, { theme: ClassicTheme, ...(edgesOnTop !== undefined ? { edgesOnTop } : {}) });
}

function groupIndex(svg: string, className: string): number {
    return svg.indexOf(`<g class="${className}">`);
}

describe('SvgBuilder edges-on-top paint order', () => {
    it('renders the edges group after nodes by default (edges on top)', () => {
        const svg = renderSvg();
        assert.ok(groupIndex(svg, 'edges') > groupIndex(svg, 'nodes'),
            'edges group must come after nodes so arrows paint on top');
    });

    it('renders the edges group after nodes when edgesOnTop is true', () => {
        const svg = renderSvg(true);
        assert.ok(groupIndex(svg, 'edges') > groupIndex(svg, 'nodes'));
    });

    it('renders the edges group before nodes when edgesOnTop is false (legacy)', () => {
        const svg = renderSvg(false);
        assert.ok(groupIndex(svg, 'edges') < groupIndex(svg, 'nodes'),
            'legacy order paints nodes over edges');
    });
});
