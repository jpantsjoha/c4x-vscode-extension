/**
 * Legend removal from the SVG document (#98): the legend is now a draggable
 * HTML overlay in the preview webview, so SvgBuilder must not render an
 * inline `<g class="legend">` nor reserve canvas height for one.
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

function render(): { svg: string; width: number; height: number } {
    const parsed = new C4XParser().parse(DSL);
    const model = new C4ModelBuilder().build(parsed, 'legend-removal-test');
    const layout = new DagreLayoutEngine().layoutSync(model.views[0]);
    const svg = new SvgBuilder().build(layout, { theme: ClassicTheme, viewType: model.views[0].type });
    return { svg, width: layout.width, height: layout.height };
}

describe('SvgBuilder legend removal (#98)', () => {
    it('renders no inline legend group', () => {
        const { svg } = render();
        assert.ok(!svg.includes('class="legend"'), 'SVG must not contain a <g class="legend"> element');
    });

    it('reserves no canvas height for the legend (title only)', () => {
        const { svg, width, height } = render();
        // viewType is set by the fixture directive, so the canvas height is
        // layout.height + 40px title — and nothing more (no 130px legend).
        assert.ok(
            svg.includes(`viewBox="0 0 ${width} ${height + 40}"`),
            `viewBox must be exactly layout size + 40px title; got:\n${svg.split('\n')[1]}`,
        );
        assert.ok(
            !svg.includes(`viewBox="0 0 ${width} ${height + 40 + 130}"`),
            'viewBox must not include the removed 130px legend reservation',
        );
    });

    it('reserves no canvas height at all when there is no title', () => {
        const parsed = new C4XParser().parse(DSL);
        const model = new C4ModelBuilder().build(parsed, 'legend-removal-test');
        const layout = new DagreLayoutEngine().layoutSync(model.views[0]);
        const svg = new SvgBuilder().build(layout, { theme: ClassicTheme });
        assert.ok(
            svg.includes(`viewBox="0 0 ${layout.width} ${layout.height}"`),
            'without a title the canvas must be exactly the layout size',
        );
    });
});
