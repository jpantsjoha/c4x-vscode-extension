/**
 * C4X-L116 (#472): a subgraph, boundary or direction statement inside a
 * deployment Node is not drawn. The parser used to discard it silently; it now
 * records it and the model builder reports a warning at its line.
 */
import * as assert from 'assert';
import { C4XParser } from '../../parser/C4XParser';
import { c4ModelBuilder } from '../../model/C4ModelBuilder';
import type { C4Model, C4ModelDiagnostic } from '../../model/C4Model';
import { STYLE_DIAGNOSTIC_CODES as CODES } from '../../model/styleDiagnostics';

const parser = new C4XParser();
const DEPLOY = '%%{ c4: deployment }%%\ngraph TB\n';

function buildDeploy(body: string): C4Model {
    return c4ModelBuilder.build(parser.parse(DEPLOY + body), 'drop-test');
}

function dropped(model: C4Model): C4ModelDiagnostic[] {
    return (model.diagnostics ?? []).filter(d => d.code === 'C4X-L116');
}

describe('C4X-L116: constructs dropped inside a deployment Node (#472)', () => {
    it('has the code registered', () => {
        assert.strictEqual(CODES.droppedInNode, 'C4X-L116');
    });

    it('warns at the line of a subgraph nested in a Node and still renders the rest', () => {
        const model = buildDeploy([
            'Node(host, "Host") {',
            '  Container(kept, "Kept", "Go", "Stays")',
            '  subgraph inner {',
            '    Container(lost, "Lost", "Go", "Not drawn")',
            '  }',
            '}',
        ].join('\n'));
        const found = dropped(model);
        assert.strictEqual(found.length, 1);
        assert.strictEqual(found[0].severity, 'warning');
        assert.strictEqual(found[0].range?.start.line, 5);
        assert.match(found[0].message, /subgraph.*host.*not drawn/s);
        const host = model.views[0].elements.find(e => e.id === 'host');
        assert.deepStrictEqual(host?.children?.map(c => c.id), ['kept']);
    });

    it('reports a boundary keyword and a direction statement, one diagnostic each', () => {
        const model = buildDeploy([
            'Node(host, "Host") {',
            '  direction LR',
            '  System_Boundary(b, "B") {',
            '    Container(x, "X", "Go", "d")',
            '  }',
            '}',
        ].join('\n'));
        const found = dropped(model);
        assert.deepStrictEqual(found.map(d => d.range?.start.line), [4, 5]);
        assert.match(found[0].message, /direction/);
        assert.match(found[1].message, /System_Boundary/);
    });

    it('is silent for a Node holding only elements, relationships and comments', () => {
        const model = buildDeploy([
            'Node(host, "Host") {',
            '  %% a comment',
            '  Container(a, "A", "Go", "d")',
            '  Container(b, "B", "Go", "d")',
            '  a --> b',
            '}',
        ].join('\n'));
        assert.strictEqual(dropped(model).length, 0);
    });
});
