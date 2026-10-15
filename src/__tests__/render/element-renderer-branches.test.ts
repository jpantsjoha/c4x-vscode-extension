/**
 * Branch coverage for ElementRenderer: the external-variant colour fallbacks,
 * the defensive geometry defaults, the locked-element decorations, both sprite
 * shapes (string and object) and the optional text rows.
 *
 * Every case asserts the markup the branch produces, so inverting the
 * condition in the source fails the test.
 */
import * as assert from 'assert';
import { PositionedElement } from '../../layout/DagreLayoutEngine';
import { C4Element } from '../../model/C4Model';
import { C4Theme } from '../../themes/Theme';
import { ClassicTheme } from '../../themes/ClassicTheme';
import { ModernTheme } from '../../themes/ModernTheme';
import { SPRITES } from '../../assets/icons';
import { LabelCollisionTracker } from '../../render/LabelRenderer';
import {
    getFillColor,
    getStrokeColor,
    getTextColor,
    renderNode,
} from '../../render/ElementRenderer';

/** Sprite key injected by these tests only; removed again in `after`. */
const MALFORMED_VIEWBOX_SPRITE = 'branch-test-malformed-viewbox';

function element(overrides: Partial<C4Element>): C4Element {
    return {
        id: 'node-1',
        label: 'Node One',
        type: 'SoftwareSystem',
        ...overrides,
    };
}

function positioned(el: C4Element, geometry?: Partial<PositionedElement>): PositionedElement {
    return {
        id: el.id,
        element: el,
        x: 10,
        y: 20,
        width: 260,
        height: 140,
        ...geometry,
    };
}

function render(el: C4Element, theme: C4Theme = ClassicTheme, geometry?: Partial<PositionedElement>): string {
    return renderNode(positioned(el, geometry), theme, new LabelCollisionTracker());
}

const external = ['External'];

describe('ElementRenderer — external colour variants', () => {
    it('uses the dedicated external palette for Person, Container and Component when the theme defines one', () => {
        const person = positioned(element({ type: 'Person', tags: external }));
        const container = positioned(element({ type: 'Container', tags: external }));
        const component = positioned(element({ type: 'Component', tags: external }));

        assert.strictEqual(getFillColor(person, ClassicTheme), ClassicTheme.colors.externalPerson?.fill);
        assert.strictEqual(getFillColor(container, ClassicTheme), ClassicTheme.colors.externalContainer?.fill);
        assert.strictEqual(getFillColor(component, ClassicTheme), ClassicTheme.colors.externalComponent?.fill);

        assert.strictEqual(getStrokeColor(person, ClassicTheme), ClassicTheme.colors.externalPerson?.stroke);
        assert.strictEqual(getStrokeColor(container, ClassicTheme), ClassicTheme.colors.externalContainer?.stroke);
        assert.strictEqual(getStrokeColor(component, ClassicTheme), ClassicTheme.colors.externalComponent?.stroke);

        assert.strictEqual(getTextColor(person, ClassicTheme), ClassicTheme.colors.externalPerson?.text);
        assert.strictEqual(getTextColor(container, ClassicTheme), ClassicTheme.colors.externalContainer?.text);
        assert.strictEqual(getTextColor(component, ClassicTheme), ClassicTheme.colors.externalComponent?.text);
    });

    it('falls back to the external system palette when the theme has no dedicated variant', () => {
        assert.strictEqual(ModernTheme.colors.externalPerson, undefined, 'fixture assumes ModernTheme has no external variants');

        const person = positioned(element({ type: 'Person', tags: external }));
        const container = positioned(element({ type: 'Container', tags: external }));
        const component = positioned(element({ type: 'Component', tags: external }));

        for (const node of [person, container, component]) {
            assert.strictEqual(getFillColor(node, ModernTheme), ModernTheme.colors.externalSystem.fill);
            assert.strictEqual(getStrokeColor(node, ModernTheme), ModernTheme.colors.externalSystem.stroke);
            assert.strictEqual(getTextColor(node, ModernTheme), ModernTheme.colors.externalSystem.text);
        }
    });

    it('keeps the internal palette for untagged Person, Container and Component', () => {
        const person = positioned(element({ type: 'Person' }));
        const container = positioned(element({ type: 'Container' }));
        const component = positioned(element({ type: 'Component' }));

        assert.strictEqual(getFillColor(person, ClassicTheme), ClassicTheme.colors.person.fill);
        assert.strictEqual(getStrokeColor(container, ClassicTheme), ClassicTheme.colors.container.stroke);
        assert.strictEqual(getTextColor(component, ClassicTheme), ClassicTheme.colors.component.text);
    });

    it('gives a DeploymentNode its own stroke and text colour regardless of the External tag', () => {
        const node = positioned(element({ type: 'DeploymentNode', tags: external }));

        assert.strictEqual(getStrokeColor(node, ClassicTheme), ClassicTheme.colors.deploymentNode.stroke);
        assert.strictEqual(getTextColor(node, ClassicTheme), ClassicTheme.colors.deploymentNode.text);
        assert.notStrictEqual(getStrokeColor(node, ClassicTheme), ClassicTheme.colors.externalSystem.stroke);
    });

    it('treats an element with no tags as internal', () => {
        const node = positioned(element({ type: 'Person', tags: undefined }));

        assert.strictEqual(getFillColor(node, ClassicTheme), ClassicTheme.colors.person.fill);
    });
});

describe('ElementRenderer — defensive geometry defaults', () => {
    it('substitutes 0/0/200/100 when the layout supplied no coordinates or size', () => {
        const bare = {
            id: 'no-geometry',
            element: element({ id: 'no-geometry', type: 'Container' }),
        } as unknown as PositionedElement;

        const svg = renderNode(bare, ClassicTheme, new LabelCollisionTracker());

        assert.ok(
            svg.includes('<rect x="0.00" y="0.00" width="200.00" height="100.00"'),
            `expected the default rect geometry, got:\n${svg}`,
        );
    });

    it('uses the supplied coordinates when the layout provided them', () => {
        const svg = render(element({ type: 'Container' }), ClassicTheme, { x: 10, y: 20, width: 260, height: 140 });

        assert.ok(
            svg.includes('<rect x="10.00" y="20.00" width="260.00" height="140.00"'),
            `expected the layout rect geometry, got:\n${svg}`,
        );
    });
});

describe('ElementRenderer — drop shadow', () => {
    it('attaches the drop-shadow filter when the theme enables shadows', () => {
        assert.strictEqual(ModernTheme.styles.shadowEnabled, true, 'fixture assumes ModernTheme enables shadows');

        const svg = render(element({ type: 'Container' }), ModernTheme);

        assert.ok(svg.includes('filter="url(#drop-shadow)"'), `expected a drop-shadow filter, got:\n${svg}`);
    });

    it('omits the filter attribute entirely when the theme disables shadows', () => {
        assert.strictEqual(ClassicTheme.styles.shadowEnabled, false, 'fixture assumes ClassicTheme disables shadows');

        const svg = render(element({ type: 'Container' }), ClassicTheme);

        assert.ok(!svg.includes('filter='), `expected no filter attribute, got:\n${svg}`);
    });
});

describe('ElementRenderer — locked elements', () => {
    it('marks a locked box with the locked class and data attribute', () => {
        const svg = render(element({ type: 'Container', metadata: { locked: 'true' } }));

        assert.ok(svg.includes('class="node locked"'), `expected the locked class, got:\n${svg}`);
        assert.ok(svg.includes('data-locked="true"'), `expected data-locked, got:\n${svg}`);
    });

    it('leaves an unlocked box undecorated', () => {
        const svg = render(element({ type: 'Container', metadata: { locked: 'false' } }));

        assert.ok(svg.includes('class="node"'), `expected the bare node class, got:\n${svg}`);
        assert.ok(!svg.includes('data-locked'), `expected no data-locked, got:\n${svg}`);
    });

    it('marks a locked database cylinder', () => {
        const svg = render(element({ type: 'Container', tags: ['Database'], metadata: { locked: 'true' } }));

        assert.ok(svg.includes('class="node database locked"'), `expected the locked database class, got:\n${svg}`);
        assert.ok(svg.includes('data-locked="true"'), `expected data-locked, got:\n${svg}`);
    });

    it('marks a locked icon node', () => {
        const svg = render(element({ type: 'Person', metadata: { locked: 'true' } }));

        assert.ok(svg.includes('class="node person locked"'), `expected the locked person class, got:\n${svg}`);
        assert.ok(svg.includes('data-locked="true"'), `expected data-locked, got:\n${svg}`);
    });

    it('leaves an unlocked icon node undecorated', () => {
        const svg = render(element({ type: 'Person' }));

        assert.ok(svg.includes('class="node person"'), `expected the bare person class, got:\n${svg}`);
        assert.ok(!svg.includes('data-locked'), `expected no data-locked, got:\n${svg}`);
    });
});

describe('ElementRenderer — sprite shapes', () => {
    after(() => {
        // eslint-disable-next-line security/detect-object-injection
        delete SPRITES[MALFORMED_VIEWBOX_SPRITE];
    });

    it('recolours a plain string sprite with the element stroke', () => {
        const svg = render(element({ type: 'Container', sprite: 'server' }));
        const stroke = ClassicTheme.colors.container.stroke;

        assert.ok(svg.includes(`fill="${stroke}" stroke="none"`), `expected the sprite group recoloured, got:\n${svg}`);
        assert.ok(svg.includes('scale(0.4000)'), `expected a 0 0 100 100 viewBox scale, got:\n${svg}`);
    });

    it('preserves the original colours of a vendor sprite that asks for it', () => {
        const vendor = SPRITES['gcp-vertexai'];
        assert.ok(typeof vendor === 'object', 'fixture assumes gcp-vertexai is an object sprite');
        assert.strictEqual(vendor.preserveColor, true, 'fixture assumes gcp-vertexai preserves colour');
        assert.strictEqual(vendor.viewBox, '0 0 512 512', 'fixture assumes a 512 viewBox');

        const svg = render(element({ type: 'Container', sprite: 'gcp-vertexai' }));

        assert.ok(svg.includes('scale(0.0781)"  stroke="none">'), `expected no fill override, got:\n${svg}`);
        assert.ok(!svg.includes('scale(0.0781)" fill='), 'a preserveColor sprite must not be recoloured');
        assert.ok(svg.includes(vendor.body.slice(0, 30)), 'the sprite body must be inlined');
    });

    it('falls back to a width of 100 when the sprite viewBox is malformed', () => {
        // eslint-disable-next-line security/detect-object-injection
        SPRITES[MALFORMED_VIEWBOX_SPRITE] = {
            body: '<rect x="0" y="0" width="10" height="10" />',
            viewBox: '0 0 50',
            preserveColor: false,
        };

        const svg = render(element({ type: 'Container', sprite: MALFORMED_VIEWBOX_SPRITE }));

        // 40px icon / fallback 100px viewBox width = 0.4, not 40/50 = 0.8.
        assert.ok(svg.includes('scale(0.4000)'), `expected the fallback viewBox width, got:\n${svg}`);
        assert.ok(!svg.includes('scale(0.8000)'), 'a three-part viewBox must not be trusted for the width');
        assert.ok(
            svg.includes(`fill="${ClassicTheme.colors.container.stroke}"`),
            'a sprite that does not preserve colour must be recoloured',
        );
    });

    it('renders no icon group content for an unknown sprite name', () => {
        const svg = render(element({ type: 'Container', sprite: 'no-such-sprite-anywhere' }));

        assert.ok(svg.includes('<g class="element-icon">'), 'the icon slot is still emitted');
        assert.ok(!svg.includes('transform="translate('), `expected no sprite transform, got:\n${svg}`);
    });
});

describe('ElementRenderer — person text rows', () => {
    it('emits a row per populated field', () => {
        const svg = render(element({ type: 'Person', label: 'Customer', technology: 'Browser', description: 'Buys things' }));

        assert.ok(svg.includes('data-field="label"'), 'label row missing');
        assert.ok(svg.includes('>[Browser]</text>'), `technology row missing, got:\n${svg}`);
        assert.ok(svg.includes('>Buys things</text>'), `description row missing, got:\n${svg}`);
    });

    it('emits no text rows at all when label, technology and description are empty', () => {
        const svg = render(element({ type: 'Person', label: '', technology: undefined, description: '' }));

        assert.ok(!svg.includes('<text'), `expected no text rows, got:\n${svg}`);
        assert.ok(svg.includes('class="node person"'), 'the person node itself is still rendered');
    });

    it('emits only the label row when technology and description are absent', () => {
        const svg = render(element({ type: 'Person', label: 'Customer' }));

        assert.strictEqual(svg.match(/<text /g)?.length, 1, `expected exactly one text row, got:\n${svg}`);
        assert.ok(svg.includes('data-field="label"'), 'label row missing');
    });
});

describe('ElementRenderer — box text rows', () => {
    it('emits a row per populated field', () => {
        const svg = render(element({ type: 'Container', label: 'API', technology: 'Go', description: 'Serves requests' }));

        assert.ok(svg.includes('>API</text>'), `label row missing, got:\n${svg}`);
        assert.ok(svg.includes('>[Go]</text>'), `technology row missing, got:\n${svg}`);
        assert.ok(svg.includes('>Serves requests</text>'), `description row missing, got:\n${svg}`);
    });

    it('emits no text rows when every field is empty', () => {
        const svg = render(element({ type: 'Container', label: '', technology: undefined, description: '' }));

        assert.ok(!svg.includes('<text'), `expected no text rows, got:\n${svg}`);
        assert.ok(svg.includes('<rect '), 'the box itself is still rendered');
    });

    it('emits only the label row when technology and description are absent', () => {
        const svg = render(element({ type: 'Container', label: 'API' }));

        assert.strictEqual(svg.match(/<text /g)?.length, 1, `expected exactly one text row, got:\n${svg}`);
        assert.ok(!svg.includes('data-field="technology"'), 'no technology row expected');
        assert.ok(!svg.includes('data-field="description"'), 'no description row expected');
    });
});
