import * as assert from 'assert';
import type { C4Element } from '../../model/C4Model';
import {
    C4_ELEMENT_TYPES,
    C4_LEVELS,
    C4_SCOPES,
    isElementLegalIn,
    isRelationshipLegal,
    legalChildTypes,
} from '../../model/c4Legality';
import type { C4ElementType, C4Level, C4Scope } from '../../model/c4Legality';

type CanonicalC4Level = typeof C4_LEVELS[number];
type CanonicalC4Scope = typeof C4_SCOPES[number];

const expectedChildTypes: ReadonlyMap<
    CanonicalC4Level,
    ReadonlyMap<CanonicalC4Scope, readonly C4ElementType[]>
> = new Map([
    ['C1', new Map<CanonicalC4Scope, readonly C4ElementType[]>([
        ['root', ['Person', 'Person_Ext', 'SoftwareSystem', 'System_Ext', 'Enterprise_Boundary']],
        ['Enterprise_Boundary', ['Person', 'Person_Ext', 'SoftwareSystem', 'System_Ext']],
        ['System_Boundary', []],
        ['Container_Boundary', []],
        ['Node', []],
    ])],
    ['C2', new Map<CanonicalC4Scope, readonly C4ElementType[]>([
        ['root', ['Person', 'Person_Ext', 'SoftwareSystem', 'System_Ext', 'System_Boundary', 'Enterprise_Boundary']],
        ['Enterprise_Boundary', ['Person', 'Person_Ext', 'SoftwareSystem', 'System_Ext', 'System_Boundary']],
        ['System_Boundary', ['Container', 'Container_Ext']],
        ['Container_Boundary', []],
        ['Node', []],
    ])],
    ['C3', new Map<CanonicalC4Scope, readonly C4ElementType[]>([
        ['root', ['Person', 'Person_Ext', 'SoftwareSystem', 'System_Ext', 'System_Boundary', 'Enterprise_Boundary']],
        ['Enterprise_Boundary', ['Person', 'Person_Ext', 'SoftwareSystem', 'System_Ext', 'System_Boundary']],
        ['System_Boundary', ['Container', 'Container_Ext', 'Container_Boundary']],
        ['Container_Boundary', ['Component', 'Component_Ext']],
        ['Node', []],
    ])],
    ['C4', new Map<CanonicalC4Scope, readonly C4ElementType[]>([
        ['root', ['Node']],
        ['Enterprise_Boundary', []],
        ['System_Boundary', []],
        ['Container_Boundary', []],
        ['Node', ['Node', 'Container', 'Container_Ext']],
    ])],
]);

function expectedTypes(level: CanonicalC4Level, scope: CanonicalC4Scope): readonly C4ElementType[] {
    return expectedChildTypes.get(level)!.get(scope)!;
}

function relationshipElement(type: C4Element['type'], id: string): C4Element {
    return { type, id, label: id };
}

describe('C4 legality child-type matrix', () => {
    for (const c4Level of C4_LEVELS) {
        describe(c4Level, () => {
            for (const parentScope of C4_SCOPES) {
                it(`returns the documented palette types for ${parentScope}`, () => {
                    assert.deepStrictEqual(
                        legalChildTypes(parentScope, c4Level),
                        expectedTypes(c4Level, parentScope),
                    );
                });
            }
        });
    }
});

describe('C4 legality element matrix', () => {
    for (const c4Level of C4_LEVELS) {
        describe(c4Level, () => {
            for (const parentScope of C4_SCOPES) {
                describe(parentScope, () => {
                    for (const elementType of C4_ELEMENT_TYPES) {
                        const expected = expectedTypes(c4Level, parentScope).includes(elementType);
                        it(`${elementType} is ${expected ? 'legal' : 'illegal'}`, () => {
                            const result = isElementLegalIn(elementType, parentScope, c4Level);

                            assert.strictEqual(result.legal, expected);
                            if (expected) {
                                assert.strictEqual(result.reason, undefined);
                            } else {
                                assert.ok(result.reason?.endsWith('view.'), 'Illegal placements explain the rule to the user.');
                            }
                        });
                    }
                });
            }
        });
    }
});

describe('C4 legality aliases and runtime validation', () => {
    const aliases: readonly [C4ElementType, C4ElementType][] = [
        ['System', 'SoftwareSystem'],
        ['SoftwareSystem_Ext', 'System_Ext'],
        ['SystemDb', 'SoftwareSystem'],
        ['SystemDb_Ext', 'System_Ext'],
        ['ContainerDb', 'Container'],
        ['ContainerDb_Ext', 'Container_Ext'],
        ['ComponentDb', 'Component'],
        ['ComponentDb_Ext', 'Component_Ext'],
        ['DeploymentNode', 'Node'],
    ];

    for (const [alias, base] of aliases) {
        it(`accepts ${alias} wherever ${base} is legal`, () => {
            for (const c4Level of C4_LEVELS) {
                for (const parentScope of C4_SCOPES) {
                    assert.strictEqual(
                        isElementLegalIn(alias, parentScope, c4Level).legal,
                        isElementLegalIn(base, parentScope, c4Level).legal,
                    );
                }
            }
        });
    }

    it('accepts parser view and parent-scope aliases', () => {
        assert.deepStrictEqual(legalChildTypes('SystemBoundary', 'component'), [
            'Container',
            'Container_Ext',
            'Container_Boundary',
        ]);
        assert.deepStrictEqual(legalChildTypes('DeploymentNode', 'deployment'), [
            'Node',
            'Container',
            'Container_Ext',
        ]);
    });

    it('rejects an unsupported parent scope, level, and element type with user-facing reasons', () => {
        const invalidScope = isElementLegalIn('Person', 'other' as C4Scope, 'C1');
        const invalidLevel = isElementLegalIn('Person', 'root', 'other' as C4Level);
        const invalidType = isElementLegalIn('Database' as C4ElementType, 'root', 'C1');

        assert.deepStrictEqual(legalChildTypes('other' as C4Scope, 'C1'), []);
        assert.deepStrictEqual(legalChildTypes('root', 'other' as C4Level), []);
        assert.strictEqual(invalidScope.reason, 'The selected parent scope is not supported by the C4 editor.');
        assert.strictEqual(invalidLevel.reason, 'The selected C4 view level is not supported by the C4 editor.');
        assert.strictEqual(invalidType.reason, 'Database is not a supported C4 element type.');
    });
});

describe('C4 legality relationships', () => {
    it('accepts relationships when both logical endpoints exist', () => {
        assert.deepStrictEqual(
            isRelationshipLegal(
                relationshipElement('Person', 'user'),
                relationshipElement('SoftwareSystem', 'system'),
            ),
            { legal: true },
        );
    });

    it('accepts relationships between deployment nodes', () => {
        assert.deepStrictEqual(
            isRelationshipLegal(
                relationshipElement('DeploymentNode', 'cloud'),
                relationshipElement('DeploymentNode', 'region'),
            ),
            { legal: true },
        );
    });

    it('requires an existing, well-formed source endpoint', () => {
        assert.strictEqual(
            isRelationshipLegal(undefined as unknown as C4Element, relationshipElement('Person', 'target')).reason,
            'Choose an existing C4 element as the relationship source.',
        );
        assert.strictEqual(
            isRelationshipLegal({} as C4Element, relationshipElement('Person', 'target')).reason,
            'Choose an existing C4 element as the relationship source.',
        );
        assert.strictEqual(
            isRelationshipLegal({ id: ' ', label: 'Blank', type: 'Person' }, relationshipElement('Person', 'target')).reason,
            'Choose an existing C4 element as the relationship source.',
        );
        assert.strictEqual(
            isRelationshipLegal(
                { id: 'unknown', label: 'Unknown', type: 'Database' as C4Element['type'] },
                relationshipElement('Person', 'target'),
            ).reason,
            'Choose an existing C4 element as the relationship source.',
        );
    });

    it('requires an existing target endpoint', () => {
        assert.strictEqual(
            isRelationshipLegal(relationshipElement('Person', 'source'), undefined as unknown as C4Element).reason,
            'Choose an existing C4 element as the relationship target.',
        );
    });

    it('keeps deployment and logical-view relationships separate', () => {
        assert.strictEqual(
            isRelationshipLegal(
                relationshipElement('DeploymentNode', 'node'),
                relationshipElement('Container', 'container'),
            ).reason,
            'Deployment Nodes cannot be connected directly to logical-view elements.',
        );
    });
});
