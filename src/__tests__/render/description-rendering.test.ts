/**
 * Person and System descriptions are drawn as description text (#420, NR-F15).
 *
 * `Person(id, "Label", "Description")` and `System(...)` take the description as
 * their third argument. Before #420 the grammar read that argument as the
 * technology, so every theme drew it as `[Description]` in the italic technology
 * style with `data-field="technology"`. Containers, components and deployment
 * nodes keep `[Technology]` and their description.
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
import { assignDescriptionFirstArguments, isDescriptionFirstElementType } from '../../parser/elementArguments';
import { C4ModelBuilder } from '../../model/C4ModelBuilder';
import type { C4Element, C4Model } from '../../model/C4Model';
import { DagreLayoutEngine } from '../../layout/DagreLayoutEngine';
import { SvgBuilder } from '../../render/SvgBuilder';
import type { C4Theme } from '../../themes/Theme';
import { ClassicTheme } from '../../themes/ClassicTheme';
import { C4ModelDarkTheme, C4ModelTheme } from '../../themes/C4ModelTheme';
import { C4StandardTheme } from '../../themes/C4StandardTheme';
import { ModernTheme } from '../../themes/ModernTheme';
import { MutedTheme } from '../../themes/MutedTheme';
import { HighContrastTheme } from '../../themes/HighContrastTheme';
import { DarkTheme, LightTheme } from '../../themes/AutoTheme';
import { parseStructurizrDSL } from '../../parser/structurizr';
import { parsePlantUMLtoC4Model } from '../../parser/plantuml';
import {
    planElementTechnologyUpdate,
    planElementTextUpdates,
    type NativeElementSourceRef,
} from '../../writeback/NativeMutationPlanner';
import { applyBoundedEdits } from '../../writeback/SourceRange';

const parser = new C4XParser();
const builder = new C4ModelBuilder();

function build(source: string): C4Model {
    return builder.build(parser.parse(source), 'description-rendering');
}

function element(model: C4Model, id: string): C4Element {
    const found = model.views[0].elements.find(el => el.id === id);
    assert.ok(found, `element ${id} not found`);
    return found;
}

function render(source: string, theme: C4Theme): string {
    const model = build(source);
    const view = model.views[0];
    return new SvgBuilder().build(new DagreLayoutEngine().layoutSync(view), { theme, view });
}

/** The `<g class="node ...">` group of one element, up to the next element group. */
function nodeGroup(svg: string, id: string): string {
    const start = svg.indexOf(`data-id="${id}"`);
    assert.ok(start >= 0, `no rendered node for ${id}`);
    const next = svg.indexOf('<g class="node', start + 1);
    return svg.slice(start, next === -1 ? undefined : next);
}

const DESCRIPTION_FIRST = ['Person', 'Person_Ext', 'System', 'System_Ext', 'SystemDb', 'SystemDb_Ext', 'person', 'system_ext'];
const TECHNOLOGY_FIRST = ['Container', 'Container_Ext', 'ContainerDb', 'ContainerDb_Ext', 'Component', 'Component_Ext', 'ComponentDb', 'ComponentDb_Ext'];

describe('Description-first element arguments (#420)', () => {
    it('classifies the Person and System families as description-first, and nothing else', () => {
        for (const type of [...DESCRIPTION_FIRST, 'SoftwareSystem', 'Software System', ' SYSTEMDB ']) {
            assert.strictEqual(isDescriptionFirstElementType(type), true, type);
        }
        for (const type of [...TECHNOLOGY_FIRST, 'Node', 'node', '', undefined]) {
            assert.strictEqual(isDescriptionFirstElementType(type), false, String(type));
        }
    });

    it('moves only a lone positional argument, recursively, and leaves explicit pairs alone', () => {
        const raw = [
            { elementType: 'Person', technology: 'Desc' },
            { elementType: 'System', technology: 'Tech', description: 'Desc' },
            { elementType: 'Container', technology: 'Java' },
            { elementType: 'Node', technology: 'AWS', children: [{ elementType: 'System_Ext', technology: 'Inner' }] },
        ];
        assignDescriptionFirstArguments(raw);
        assert.deepStrictEqual(raw, [
            { elementType: 'Person', description: 'Desc' },
            { elementType: 'System', technology: 'Tech', description: 'Desc' },
            { elementType: 'Container', technology: 'Java' },
            { elementType: 'Node', technology: 'AWS', children: [{ elementType: 'System_Ext', description: 'Inner' }] },
        ]);
        assert.doesNotThrow(() => assignDescriptionFirstArguments(undefined));
    });

    for (const type of DESCRIPTION_FIRST) {
        it(`${type}(id, "Label", "Description") maps the third argument to description`, () => {
            const model = build(`%%{ c4: system-context }%%\ngraph TB\n    ${type}(e, "Label", "The description")`);
            const el = element(model, 'e');
            assert.strictEqual(el.description, 'The description');
            assert.strictEqual(el.technology, undefined);
        });
    }

    for (const type of TECHNOLOGY_FIRST) {
        it(`${type}(id, "Label", "Technology") keeps the third argument as technology`, () => {
            const model = build(`%%{ c4: component }%%\ngraph TB\n    ${type}(e, "Label", "Java")\n    ${type}(f, "Label", "Java", "Does work")`);
            assert.strictEqual(element(model, 'e').technology, 'Java');
            assert.strictEqual(element(model, 'e').description, undefined);
            assert.strictEqual(element(model, 'f').technology, 'Java');
            assert.strictEqual(element(model, 'f').description, 'Does work');
        });
    }

    it('keeps a technology given to a System through two positional arguments', () => {
        const model = build('%%{ c4: system-context }%%\ngraph TB\n    System(s, "S", "Mainframe", "Holds accounts")\n    Person(p, "P", "", "Uses it")');
        assert.strictEqual(element(model, 's').technology, 'Mainframe');
        assert.strictEqual(element(model, 's').description, 'Holds accounts');
        assert.strictEqual(element(model, 'p').technology, '');
        assert.strictEqual(element(model, 'p').description, 'Uses it');
    });

    it('maps the description inside boundaries and with attributes after it', () => {
        const model = build([
            '%%{ c4: system-context }%%',
            'graph TB',
            '    Enterprise_Boundary(b, "Bank") {',
            '        Person(staff, "Staff", "Answers calls", $tags="Internal")',
            '        System(crm, "CRM", "Holds contacts", $sprite="server")',
            '    }',
        ].join('\n'));
        assert.strictEqual(element(model, 'staff').description, 'Answers calls');
        assert.strictEqual(element(model, 'staff').technology, undefined);
        assert.strictEqual(element(model, 'crm').description, 'Holds contacts');
    });

    it('keeps a deployment Node third argument as technology', () => {
        const model = build('%%{ c4: deployment }%%\ngraph TB\n    Node(aws, "AWS", "Cloud") {\n        Container(api, "API", "Java")\n    }');
        assert.strictEqual(element(model, 'aws').technology, 'Cloud');
    });

    it('Structurizr DSL person and softwareSystem descriptions stay descriptions', () => {
        const model = parseStructurizrDSL([
            'workspace "Bank" {',
            '  model {',
            '    u = person "User" "Pays bills"',
            '    s = softwareSystem "Bank" "Holds accounts" {',
            '      api = container "API" "Serves requests" "Java"',
            '    }',
            '  }',
            '  views { systemContext s { include * } }',
            '}',
        ].join('\n'));
        const all = model.views.flatMap(v => v.elements);
        const u = all.find(e => e.id === 'u');
        const s = all.find(e => e.id === 's');
        assert.strictEqual(u?.description, 'Pays bills');
        assert.strictEqual(u?.technology, undefined);
        assert.strictEqual(s?.description, 'Holds accounts');
        assert.strictEqual(s?.technology, undefined);
    });

    it('C4-PlantUML Person and System_Ext descriptions stay descriptions', () => {
        const model = parsePlantUMLtoC4Model([
            '@startuml',
            'Person(u, "User", "Pays bills")',
            'System_Ext(m, "Mail", "Sends receipts")',
            'Container(api, "API", "Java", "Serves requests")',
            '@enduml',
        ].join('\n'));
        const all = model.views.flatMap(v => v.elements);
        assert.strictEqual(all.find(e => e.id === 'u')?.description, 'Pays bills');
        assert.strictEqual(all.find(e => e.id === 'u')?.technology, undefined);
        assert.strictEqual(all.find(e => e.id === 'm')?.description, 'Sends receipts');
        assert.strictEqual(all.find(e => e.id === 'api')?.technology, 'Java');
    });
});

const THEMES: Record<string, C4Theme> = {
    classic: ClassicTheme,
    'c4-model': C4ModelTheme,
    'c4-model dark': C4ModelDarkTheme,
    'c4-standard': C4StandardTheme,
    modern: ModernTheme,
    muted: MutedTheme,
    'high-contrast': HighContrastTheme,
    'auto light': LightTheme,
    'auto dark': DarkTheme,
};

const SOURCE = [
    '%%{ c4: container }%%',
    'graph TB',
    '    Person(customer, "Customer", "Pays bills online")',
    '    Person_Ext(auditor, "Auditor", "Reviews payments")',
    '    System_Ext(email, "Email Service", "Sends receipts")',
    '    SystemDb(ledger, "Ledger", "Records payments")',
    '    System(legacy, "Legacy", "Mainframe", "Holds old accounts")',
    '    Container(api, "API", "Java", "Serves requests")',
    '    customer -->|Uses| api',
    '    api -->|Sends using| email',
].join('\n');

describe('Person and System descriptions render as description text in every theme (#420)', () => {
    for (const [name, theme] of Object.entries(THEMES)) {
        it(`${name}: draws Person and System descriptions plain, and Container technology bracketed`, () => {
            const svg = render(SOURCE, theme);
            for (const [id, text] of [
                ['customer', 'Pays bills online'],
                ['auditor', 'Reviews payments'],
                ['email', 'Sends receipts'],
                ['ledger', 'Records payments'],
            ]) {
                const group = nodeGroup(svg, id);
                assert.ok(group.includes(`data-field="description"`), `${id}: no description text`);
                assert.ok(group.includes(`>${text}</text>`), `${id}: description not drawn plain`);
                // A theme that prints the type line (#348) draws `[Person]` or `[Software System]` there, never the description.
                assert.ok(theme.showElementType || !group.includes('data-field="technology"'), `${id}: drawn with a technology line`);
                assert.ok(!group.includes(`[${text}]`), `${id}: description drawn in brackets`);
                const descriptionTag = /<text data-field="description"[^>]*>/.exec(group)?.[0] ?? '';
                assert.ok(!descriptionTag.includes('font-style="italic"'), `${id}: description drawn italic`);
            }
            const legacy = nodeGroup(svg, 'legacy');
            assert.ok(legacy.includes(theme.showElementType ? '>[Software System: Mainframe]</text>' : '>[Mainframe]</text>'), 'explicit system technology no longer drawn');
            assert.ok(legacy.includes('>Holds old accounts</text>'));
            const api = nodeGroup(svg, 'api');
            assert.ok(/<text data-field="technology"[^>]*font-style="italic"[^>]*>\[(Container: )?Java\]<\/text>/.test(api) && api.includes(theme.showElementType ? '[Container: Java]' : '[Java]'), 'container technology lost');
            assert.ok(api.includes('<text data-field="description"') && api.includes('>Serves requests</text>'));
        });
    }
});

describe('Writeback of a Person or System description (#420)', () => {
    function ref(source: string, id: string): NativeElementSourceRef {
        const raw = parser.parse(source).elements.find(e => e.id === id);
        assert.ok(raw?.sourceRange, `no source range for ${id}`);
        return { elementId: id, range: raw.sourceRange };
    }

    function apply(source: string, id: string, patch: Parameters<typeof planElementTextUpdates>[2]): string {
        return applyBoundedEdits(source, planElementTextUpdates(source, ref(source, id), patch));
    }

    const cases: Array<[string, string, Parameters<typeof planElementTextUpdates>[2], string, string | undefined, string | undefined]> = [
        ['replaces the description argument', 'Person(u, "User", "Old")', { description: 'New' }, 'Person(u, "User", "New")', undefined, 'New'],
        ['inserts a description as the third argument', 'System_Ext(u, "Mail")', { description: 'Sends mail' }, 'System_Ext(u, "Mail", "Sends mail")', undefined, 'Sends mail'],
        ['removes the description argument when cleared', 'SystemDb(u, "Ledger", "Old", $tags="x")', { description: null }, 'SystemDb(u, "Ledger", $tags="x")', undefined, undefined],
        ['clearing an absent description changes nothing', 'Person(u, "User")', { description: null }, 'Person(u, "User")', undefined, undefined],
        ['an unchanged description changes nothing', 'Person(u, "User", "Same")', { description: 'Same' }, 'Person(u, "User", "Same")', undefined, 'Same'],
        ['adds a technology before the existing description', 'Person(u, "User", "Uses it")', { technology: 'Browser' }, 'Person(u, "User", "Browser", "Uses it")', 'Browser', 'Uses it'],
        ['adds technology and description together', 'Person_Ext(u, "User")', { technology: 'Phone', description: 'Calls' }, 'Person_Ext(u, "User", "Phone", "Calls")', 'Phone', 'Calls'],
        ['an empty technology leaves the single description slot', 'Person(u, "User", "Uses it")', { technology: '', description: 'Uses it a lot' }, 'Person(u, "User", "Uses it a lot")', undefined, 'Uses it a lot'],
        ['relabels and keeps the description', 'System(u, "Old", "Desc")', { label: 'New' }, 'System(u, "New", "Desc")', undefined, 'Desc'],
        ['keeps the two-slot form once a technology exists', 'System(u, "S", "Mainframe", "Old")', { description: 'New' }, 'System(u, "S", "Mainframe", "New")', 'Mainframe', 'New'],
    ];

    for (const [title, statement, patch, expected, technology, description] of cases) {
        it(title, () => {
            const source = `graph TB\n${statement}`;
            const mutated = apply(source, 'u', patch);
            assert.strictEqual(mutated, `graph TB\n${expected}`);
            const parsed = parser.parse(mutated).elements[0];
            assert.strictEqual(parsed.technology, technology);
            assert.strictEqual(parsed.description, description);
        });
    }

    it('planElementTechnologyUpdate on a Person keeps its description', () => {
        const source = 'graph TB\nPerson(u, "User", "Uses it")';
        const mutated = applyBoundedEdits(source, planElementTechnologyUpdate(source, ref(source, 'u'), 'Browser'));
        assert.strictEqual(parser.parse(mutated).elements[0].description, 'Uses it');
        assert.strictEqual(parser.parse(mutated).elements[0].technology, 'Browser');
    });

    it('a Container description edit still uses the technology slot', () => {
        const source = 'graph TB\nContainer(u, "API", "Java")';
        assert.strictEqual(apply(source, 'u', { description: 'Serves' }), 'graph TB\nContainer(u, "API", "Java", "Serves")');
    });
});
