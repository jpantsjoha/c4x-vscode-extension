/**
 * c4-model theme tokens (#321, notation decision #320).
 *
 * Asserts every token of the c4-model theme and its dark variant, that the
 * values come from the shared palette module, that the legacy themes carry
 * boundary/title/accent tokens reproducing today's drawing, and that
 * BoundaryRenderer reads the boundary tokens.
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
import { C4ModelTheme, C4ModelDarkTheme } from '../../themes/C4ModelTheme';
import * as palette from '../../themes/c4-palette';
import { accentTextColor, C4Theme } from '../../themes/Theme';
import { ClassicTheme } from '../../themes/ClassicTheme';
import { C4StandardTheme } from '../../themes/C4StandardTheme';
import { ModernTheme } from '../../themes/ModernTheme';
import { MutedTheme } from '../../themes/MutedTheme';
import { HighContrastTheme } from '../../themes/HighContrastTheme';
import { DarkTheme, LightTheme } from '../../themes/AutoTheme';
import { renderBoundary } from '../../render/BoundaryRenderer';
import type { PositionedBoundary } from '../../layout/DagreLayoutEngine';

const outlined = (fill: string, colour: string) => ({ fill, stroke: colour, text: colour });

describe('c4-model theme (#321)', () => {
    const t = C4ModelTheme;

    it('has its name and metadata', () => {
        assert.strictEqual(t.name, 'c4-model');
        assert.strictEqual(t.displayName, 'C4 Model');
        assert.ok(t.description.length > 0);
    });

    it('uses the sampled c4model.com element colours on white fills', () => {
        assert.deepStrictEqual(t.colors.person, outlined('#FFFFFF', '#297E06'));
        assert.deepStrictEqual(t.colors.softwareSystem, outlined('#FFFFFF', '#1168BD'));
        assert.deepStrictEqual(t.colors.container, outlined('#FFFFFF', '#1168BD'));
        assert.deepStrictEqual(t.colors.component, outlined('#FFFFFF', '#1168BD'));
        assert.deepStrictEqual(t.colors.deploymentNode, outlined('#FFFFFF', '#444444'));
    });

    it('colours externals with the first accent', () => {
        const red = outlined('#FFFFFF', '#BF101D');
        assert.deepStrictEqual(t.colors.externalSystem, red);
        assert.deepStrictEqual(t.colors.externalPerson, red);
        assert.deepStrictEqual(t.colors.externalContainer, red);
        assert.deepStrictEqual(t.colors.externalComponent, red);
    });

    it('draws relationships and the background as sampled', () => {
        assert.deepStrictEqual(t.colors.relationship, { stroke: '#444444', text: '#444444' });
        assert.strictEqual(t.colors.background, '#FFFFFF');
    });

    it('lists the four external accents in order, darkening text only where needed', () => {
        assert.deepStrictEqual(t.externalAccents.map(a => a.stroke), ['#BF101D', '#ED8609', '#1A849C', '#8411BD']);
        assert.deepStrictEqual(t.externalAccents.map(accentTextColor), ['#BF101D', '#B35F00', '#197F96', '#8411BD']);
    });

    it('has a thin solid blue boundary with the label bottom left (honoured by #324)', () => {
        assert.deepStrictEqual(t.boundary, {
            stroke: '#1168BD',
            text: '#1168BD',
            strokeWidth: 1,
            dash: null,
            opacity: 1,
            labelPosition: 'bottom-left',
            showType: true,
        });
    });

    it('has a dark grey caption bottom left (honoured by #328)', () => {
        assert.deepStrictEqual(t.title, { position: 'bottom-left', color: '#444444', showDescription: true });
    });

    it('has small rounded corners, 2px borders and no shadow', () => {
        assert.deepStrictEqual(t.styles, {
            borderRadius: 6,
            borderWidth: 2,
            fontSize: 14,
            fontFamily: 'Arial, sans-serif',
            shadowEnabled: false,
        });
    });

    it('reads its values from the shared palette module', () => {
        assert.strictEqual(t.colors.person.stroke, palette.C4_MODEL_PERSON);
        assert.strictEqual(t.colors.softwareSystem.stroke, palette.C4_MODEL_INTERNAL);
        assert.strictEqual(t.colors.relationship.stroke, palette.C4_MODEL_NEUTRAL);
        assert.strictEqual(t.boundary.stroke, palette.C4_MODEL_BOUNDARY);
        assert.strictEqual(t.externalAccents, palette.C4_MODEL_EXTERNAL_ACCENTS);
    });

    it('declares a dark variant with lighter tones of the same hues', () => {
        const d = C4ModelDarkTheme;
        assert.strictEqual(t.dark, d);
        assert.strictEqual(d.name, 'c4-model');
        assert.strictEqual(d.dark, undefined);
        assert.strictEqual(d.colors.background, '#1E1E1E');
        assert.deepStrictEqual(d.colors.person, outlined('#1E1E1E', '#72AA5B'));
        assert.deepStrictEqual(d.colors.softwareSystem, outlined('#1E1E1E', '#69A0D5'));
        assert.deepStrictEqual(d.colors.container, outlined('#1E1E1E', '#69A0D5'));
        assert.deepStrictEqual(d.colors.component, outlined('#1E1E1E', '#69A0D5'));
        assert.deepStrictEqual(d.colors.deploymentNode, outlined('#1E1E1E', '#9C9C9C'));
        assert.deepStrictEqual(d.colors.externalSystem, outlined('#1E1E1E', '#DE8389'));
        assert.deepStrictEqual(d.colors.relationship, { stroke: '#9C9C9C', text: '#9C9C9C' });
        assert.deepStrictEqual(d.externalAccents.map(accentTextColor), ['#DE8389', '#ED8609', '#5AA6B8', '#C086DD']);
        assert.strictEqual(d.boundary.stroke, '#69A0D5');
        assert.strictEqual(d.boundary.dash, null);
        assert.strictEqual(d.title.color, '#9C9C9C');
    });
});

describe('legacy theme tokens reproduce the pre-#320 drawing (#321)', () => {
    const legacy: ReadonlyArray<[string, C4Theme]> = [
        ['classic', ClassicTheme],
        ['c4-standard', C4StandardTheme],
        ['modern', ModernTheme],
        ['muted', MutedTheme],
        ['high-contrast', HighContrastTheme],
        ['auto/dark', DarkTheme],
        ['auto/light', LightTheme],
    ];
    for (const [name, theme] of legacy) {
        it(`${name}: boundary and title borrow the relationship colours; no accents`, () => {
            assert.deepStrictEqual(theme.boundary, {
                stroke: theme.colors.relationship.stroke,
                text: theme.colors.relationship.text,
                strokeWidth: 2,
                dash: '8,4',
                opacity: 0.7,
                labelPosition: 'top-left',
                showType: false,
            });
            assert.deepStrictEqual(theme.title, {
                position: 'top-center',
                color: theme.colors.relationship.text,
                showDescription: false,
            });
            assert.deepStrictEqual(theme.externalAccents, []);
            assert.strictEqual(theme.dark, undefined);
        });
    }
});

describe('BoundaryRenderer reads boundary tokens (#321)', () => {
    const boundary = {
        id: 'b1', x: 10, y: 20, width: 300, height: 200,
        boundary: { label: 'Internet Banking System' },
    } as unknown as PositionedBoundary;

    it('draws the classic boundary dashed at 0.7 opacity in the relationship colour', () => {
        const svg = renderBoundary(boundary, ClassicTheme);
        assert.ok(svg.includes('stroke="#707070"'));
        assert.ok(svg.includes('stroke-width="2"'));
        assert.ok(svg.includes('stroke-dasharray="8,4"'));
        assert.ok(svg.includes('opacity="0.7"'));
        assert.ok(svg.includes('fill="#707070"'));
    });

    it('draws the c4-model boundary solid, thin and opaque in blue', () => {
        const svg = renderBoundary(boundary, C4ModelTheme);
        assert.ok(svg.includes('stroke="#1168BD"'));
        assert.ok(svg.includes('stroke-width="1"'));
        assert.ok(!svg.includes('stroke-dasharray'));
        assert.ok(svg.includes('opacity="1"'));
        assert.ok(svg.includes('fill="#1168BD"'));
    });
});
