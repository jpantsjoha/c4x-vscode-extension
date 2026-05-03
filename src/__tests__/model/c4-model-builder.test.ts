import * as assert from 'assert';
import { C4ModelBuilder } from '../../model/C4ModelBuilder';
import { C4XParseError, ParseResult, RawElement, RawRelationship, RawBoundary } from '../../parser/types';

describe('C4ModelBuilder', () => {
    let builder: C4ModelBuilder;

    beforeEach(() => {
        builder = new C4ModelBuilder();
    });

    // =========================================================================
    // Helpers
    // =========================================================================

    function makeElement(overrides: Partial<RawElement> = {}): RawElement {
        return {
            type: 'element',
            id: 'defaultId',
            label: 'Default Label',
            elementType: 'Person',
            tags: [],
            ...overrides,
        };
    }

    function makeRelationship(overrides: Partial<RawRelationship> = {}): RawRelationship {
        return {
            type: 'relationship',
            from: 'A',
            to: 'B',
            arrow: '-->',
            label: 'Uses',
            ...overrides,
        };
    }

    function makeParseResult(overrides: Partial<ParseResult> = {}): ParseResult {
        return {
            viewType: 'system-context',
            direction: 'TB',
            hasExplicitDirection: false,
            elements: [],
            relationships: [],
            ...overrides,
        };
    }

    // =========================================================================
    // Element type mapping
    // =========================================================================

    describe('element type mapping', () => {
        const typeMappings: [string, string][] = [
            ['person', 'Person'],
            ['person_ext', 'Person'],
            ['software system', 'SoftwareSystem'],
            ['softwaresystem', 'SoftwareSystem'],
            ['system', 'SoftwareSystem'],
            ['system_ext', 'SoftwareSystem'],
            ['systemdb', 'SoftwareSystem'],
            ['systemdb_ext', 'SoftwareSystem'],
            ['container', 'Container'],
            ['container_ext', 'Container'],
            ['containerdb', 'Container'],
            ['containerdb_ext', 'Container'],
            ['component', 'Component'],
            ['component_ext', 'Component'],
            ['componentdb', 'Component'],
            ['componentdb_ext', 'Component'],
            ['node', 'DeploymentNode'],
        ];

        for (const [rawType, expectedType] of typeMappings) {
            it(`maps "${rawType}" to "${expectedType}"`, () => {
                const result = makeParseResult({
                    elements: [makeElement({ id: 'E1', elementType: rawType })],
                });
                const model = builder.build(result, 'Test');
                assert.strictEqual(model.views[0].elements[0].type, expectedType);
            });
        }

        it('throws C4XParseError for unsupported element type', () => {
            const result = makeParseResult({
                elements: [makeElement({ id: 'E1', elementType: 'unknown_type' })],
            });
            assert.throws(
                () => builder.build(result, 'Test'),
                C4XParseError
            );
        });

        it('error message mentions the unsupported type', () => {
            const result = makeParseResult({
                elements: [makeElement({ id: 'E1', elementType: 'banana' })],
            });
            try {
                builder.build(result, 'Test');
                assert.fail('Expected C4XParseError');
            } catch (error) {
                assert.ok(error instanceof C4XParseError);
                assert.ok(error.message.includes('banana'));
            }
        });
    });

    // =========================================================================
    // Basic model building
    // =========================================================================

    describe('basic model building', () => {
        it('builds a model with workspace name', () => {
            const result = makeParseResult({
                elements: [makeElement({ id: 'A' })],
            });
            const model = builder.build(result, 'My Workspace');
            assert.strictEqual(model.workspace, 'My Workspace');
        });

        it('builds a model with a single view', () => {
            const result = makeParseResult({
                elements: [makeElement({ id: 'A' })],
            });
            const model = builder.build(result, 'Test');
            assert.strictEqual(model.views.length, 1);
        });

        it('preserves view type from parse result', () => {
            const result = makeParseResult({
                viewType: 'container',
                elements: [makeElement({ id: 'A', elementType: 'container' })],
            });
            const model = builder.build(result, 'Test');
            assert.strictEqual(model.views[0].type, 'container');
        });

        it('converts elements with all fields', () => {
            const result = makeParseResult({
                elements: [makeElement({
                    id: 'WebApp',
                    label: 'Web Application',
                    elementType: 'container',
                    technology: 'Spring Boot',
                    description: 'Serves the UI',
                    sprite: 'java',
                })],
            });
            const model = builder.build(result, 'Test');
            const element = model.views[0].elements[0];
            assert.strictEqual(element.id, 'WebApp');
            assert.strictEqual(element.label, 'Web Application');
            assert.strictEqual(element.type, 'Container');
            assert.strictEqual(element.technology, 'Spring Boot');
            assert.strictEqual(element.description, 'Serves the UI');
            assert.strictEqual(element.sprite, 'java');
        });

        it('sets tags to undefined when no tags are present', () => {
            const result = makeParseResult({
                elements: [makeElement({ id: 'A', tags: [] })],
            });
            const model = builder.build(result, 'Test');
            assert.strictEqual(model.views[0].elements[0].tags, undefined);
        });

        it('preserves tags when present', () => {
            const result = makeParseResult({
                elements: [makeElement({ id: 'A', tags: ['Critical', 'Core'] })],
            });
            const model = builder.build(result, 'Test');
            assert.deepStrictEqual(model.views[0].elements[0].tags, ['Critical', 'Core']);
        });
    });

    // =========================================================================
    // Tag auto-injection (_ext, db)
    // =========================================================================

    describe('tag auto-injection', () => {
        it('adds External tag for _ext element types', () => {
            const result = makeParseResult({
                elements: [makeElement({ id: 'A', elementType: 'system_ext', tags: [] })],
            });
            const model = builder.build(result, 'Test');
            assert.ok(model.views[0].elements[0].tags?.includes('External'));
        });

        it('adds Database tag for db element types', () => {
            const result = makeParseResult({
                elements: [makeElement({ id: 'A', elementType: 'containerdb', tags: [] })],
            });
            const model = builder.build(result, 'Test');
            assert.ok(model.views[0].elements[0].tags?.includes('Database'));
        });

        it('adds both External and Database tags for systemdb_ext', () => {
            const result = makeParseResult({
                elements: [makeElement({ id: 'A', elementType: 'systemdb_ext', tags: [] })],
            });
            const model = builder.build(result, 'Test');
            const tags = model.views[0].elements[0].tags;
            assert.ok(tags?.includes('External'));
            assert.ok(tags?.includes('Database'));
        });

        it('does not duplicate External tag if already present', () => {
            const result = makeParseResult({
                elements: [makeElement({ id: 'A', elementType: 'system_ext', tags: ['External'] })],
            });
            const model = builder.build(result, 'Test');
            const tags = model.views[0].elements[0].tags;
            const externalCount = tags?.filter(t => t === 'External').length ?? 0;
            assert.strictEqual(externalCount, 1);
        });

        it('does not duplicate Database tag if already present', () => {
            const result = makeParseResult({
                elements: [makeElement({ id: 'A', elementType: 'containerdb', tags: ['Database'] })],
            });
            const model = builder.build(result, 'Test');
            const tags = model.views[0].elements[0].tags;
            const dbCount = tags?.filter(t => t === 'Database').length ?? 0;
            assert.strictEqual(dbCount, 1);
        });
    });

    // =========================================================================
    // Tag metadata extraction ($key=value)
    // =========================================================================

    describe('tag metadata extraction', () => {
        it('extracts $key=value from tags into metadata', () => {
            const result = makeParseResult({
                elements: [makeElement({ id: 'A', tags: ['$color=blue'] })],
            });
            const model = builder.build(result, 'Test');
            const element = model.views[0].elements[0];
            assert.ok(element.metadata);
            assert.strictEqual(element.metadata!['color'], 'blue');
        });

        it('removes quotes from metadata values', () => {
            const result = makeParseResult({
                elements: [makeElement({ id: 'A', tags: ["$tech='Java'"] })],
            });
            const model = builder.build(result, 'Test');
            assert.strictEqual(model.views[0].elements[0].metadata!['tech'], 'Java');
        });

        it('handles $flag (no =value) as boolean true', () => {
            const result = makeParseResult({
                elements: [makeElement({ id: 'A', tags: ['$deprecated'] })],
            });
            const model = builder.build(result, 'Test');
            assert.strictEqual(model.views[0].elements[0].metadata!['deprecated'], 'true');
        });

        it('keeps non-$ tags as regular tags', () => {
            const result = makeParseResult({
                elements: [makeElement({ id: 'A', tags: ['External', '$color=red', 'Critical'] })],
            });
            const model = builder.build(result, 'Test');
            const element = model.views[0].elements[0];
            assert.ok(element.tags?.includes('External'));
            assert.ok(element.tags?.includes('Critical'));
            assert.ok(!element.tags?.includes('$color=red'));
            assert.strictEqual(element.metadata!['color'], 'red');
        });

        it('merges tag metadata with explicit element metadata', () => {
            const result = makeParseResult({
                elements: [makeElement({
                    id: 'A',
                    tags: ['$fromTag=1'],
                    metadata: { fromExplicit: '2' },
                })],
            });
            const model = builder.build(result, 'Test');
            const meta = model.views[0].elements[0].metadata!;
            // Explicit metadata overrides tag metadata
            assert.strictEqual(meta['fromExplicit'], '2');
            assert.strictEqual(meta['fromTag'], '1');
        });
    });

    // =========================================================================
    // Relationship building
    // =========================================================================

    describe('relationship building', () => {
        it('builds relationship with correct arrow type mapping', () => {
            const arrowMappings: [string, string][] = [
                ['-->', 'uses'],
                ['-.->',  'async'],
                ['==>', 'sync'],
            ];
            for (const [arrow, expectedType] of arrowMappings) {
                const result = makeParseResult({
                    elements: [
                        makeElement({ id: 'A' }),
                        makeElement({ id: 'B', elementType: 'system' }),
                    ],
                    relationships: [makeRelationship({ from: 'A', to: 'B', arrow: arrow as any })],
                });
                const model = builder.build(result, 'Test');
                assert.strictEqual(
                    model.views[0].relationships[0].relType,
                    expectedType,
                    `Arrow "${arrow}" should map to "${expectedType}"`
                );
            }
        });

        it('assigns sequential IDs to relationships', () => {
            const result = makeParseResult({
                elements: [
                    makeElement({ id: 'A' }),
                    makeElement({ id: 'B', elementType: 'system' }),
                    makeElement({ id: 'C', elementType: 'system' }),
                ],
                relationships: [
                    makeRelationship({ from: 'A', to: 'B' }),
                    makeRelationship({ from: 'B', to: 'C' }),
                ],
            });
            const model = builder.build(result, 'Test');
            assert.strictEqual(model.views[0].relationships[0].id, 'rel-0');
            assert.strictEqual(model.views[0].relationships[1].id, 'rel-1');
        });

        it('preserves relationship label', () => {
            const result = makeParseResult({
                elements: [
                    makeElement({ id: 'A' }),
                    makeElement({ id: 'B', elementType: 'system' }),
                ],
                relationships: [makeRelationship({ from: 'A', to: 'B', label: 'Sends data to' })],
            });
            const model = builder.build(result, 'Test');
            assert.strictEqual(model.views[0].relationships[0].label, 'Sends data to');
        });

        it('throws C4XParseError when from element does not exist', () => {
            const result = makeParseResult({
                elements: [makeElement({ id: 'A' })],
                relationships: [makeRelationship({ from: 'Unknown', to: 'A' })],
            });
            assert.throws(() => builder.build(result, 'Test'), C4XParseError);
        });

        it('throws C4XParseError when to element does not exist', () => {
            const result = makeParseResult({
                elements: [makeElement({ id: 'A' })],
                relationships: [makeRelationship({ from: 'A', to: 'Unknown' })],
            });
            assert.throws(() => builder.build(result, 'Test'), C4XParseError);
        });

        it('error message includes the unknown element name', () => {
            const result = makeParseResult({
                elements: [makeElement({ id: 'A' })],
                relationships: [makeRelationship({ from: 'A', to: 'Ghost' })],
            });
            try {
                builder.build(result, 'Test');
                assert.fail('Expected error');
            } catch (error) {
                assert.ok(error instanceof C4XParseError);
                assert.ok(error.message.includes('Ghost'));
            }
        });
    });

    // =========================================================================
    // Dynamic view ordering
    // =========================================================================

    describe('dynamic view ordering', () => {
        it('assigns order numbers to relationships in dynamic views', () => {
            const result = makeParseResult({
                viewType: 'dynamic',
                elements: [
                    makeElement({ id: 'A' }),
                    makeElement({ id: 'B', elementType: 'system' }),
                    makeElement({ id: 'C', elementType: 'system' }),
                ],
                relationships: [
                    makeRelationship({ from: 'A', to: 'B' }),
                    makeRelationship({ from: 'B', to: 'C' }),
                ],
            });
            const model = builder.build(result, 'Test');
            assert.strictEqual(model.views[0].relationships[0].order, 1);
            assert.strictEqual(model.views[0].relationships[1].order, 2);
        });

        it('does not assign order numbers for non-dynamic views', () => {
            const result = makeParseResult({
                viewType: 'system-context',
                elements: [
                    makeElement({ id: 'A' }),
                    makeElement({ id: 'B', elementType: 'system' }),
                ],
                relationships: [makeRelationship({ from: 'A', to: 'B' })],
            });
            const model = builder.build(result, 'Test');
            assert.strictEqual(model.views[0].relationships[0].order, undefined);
        });
    });

    // =========================================================================
    // Duplicate element detection
    // =========================================================================

    describe('duplicate element detection', () => {
        it('throws C4XParseError on duplicate element identifiers', () => {
            const result = makeParseResult({
                elements: [
                    makeElement({ id: 'Dup', label: 'First' }),
                    makeElement({ id: 'Dup', label: 'Second' }),
                ],
            });
            assert.throws(() => builder.build(result, 'Test'), C4XParseError);
        });

        it('error message includes the duplicate identifier', () => {
            const result = makeParseResult({
                elements: [
                    makeElement({ id: 'MyService', label: 'First' }),
                    makeElement({ id: 'MyService', label: 'Second' }),
                ],
            });
            try {
                builder.build(result, 'Test');
                assert.fail('Expected error');
            } catch (error) {
                assert.ok(error instanceof C4XParseError);
                assert.ok(error.message.includes('MyService'));
            }
        });
    });

    // =========================================================================
    // Child element (DeploymentNode) handling
    // =========================================================================

    describe('child elements (deployment nodes)', () => {
        it('builds children for elements with child elements', () => {
            const result = makeParseResult({
                elements: [makeElement({
                    id: 'Server',
                    elementType: 'node',
                    children: [
                        makeElement({ id: 'WebApp', elementType: 'container' }),
                    ],
                })],
            });
            const model = builder.build(result, 'Test');
            const server = model.views[0].elements[0];
            assert.ok(server.children);
            assert.strictEqual(server.children!.length, 1);
            assert.strictEqual(server.children![0].id, 'WebApp');
            assert.strictEqual(server.children![0].type, 'Container');
        });

        it('resolves relationships to nested child elements', () => {
            const result = makeParseResult({
                elements: [
                    makeElement({
                        id: 'Server',
                        elementType: 'node',
                        children: [
                            makeElement({ id: 'WebApp', elementType: 'container' }),
                        ],
                    }),
                    makeElement({ id: 'Client', elementType: 'person' }),
                ],
                relationships: [makeRelationship({ from: 'Client', to: 'WebApp' })],
            });
            // Should NOT throw because WebApp exists as a child
            const model = builder.build(result, 'Test');
            assert.strictEqual(model.views[0].relationships.length, 1);
        });

        it('detects duplicates across parent and child elements', () => {
            const result = makeParseResult({
                elements: [
                    makeElement({ id: 'Dup' }),
                    makeElement({
                        id: 'Server',
                        elementType: 'node',
                        children: [
                            makeElement({ id: 'Dup', elementType: 'container' }),
                        ],
                    }),
                ],
            });
            assert.throws(() => builder.build(result, 'Test'), C4XParseError);
        });
    });

    // =========================================================================
    // Boundary building
    // =========================================================================

    describe('boundary building', () => {
        it('builds boundaries from parse result', () => {
            const boundary: RawBoundary = {
                type: 'boundary',
                label: 'Internet Banking',
                elements: [
                    makeElement({ id: 'Web', elementType: 'container' }),
                ],
                relationships: [],
            };
            const result = makeParseResult({
                elements: [makeElement({ id: 'User' })],
                boundaries: [boundary],
            });
            const model = builder.build(result, 'Test');
            assert.ok(model.views[0].boundaries);
            assert.strictEqual(model.views[0].boundaries!.length, 1);
            assert.strictEqual(model.views[0].boundaries![0].label, 'Internet Banking');
        });

        it('generates boundary ID from label', () => {
            const boundary: RawBoundary = {
                type: 'boundary',
                label: 'Internet Banking',
                elements: [],
                relationships: [],
            };
            const result = makeParseResult({ boundaries: [boundary] });
            const model = builder.build(result, 'Test');
            assert.strictEqual(
                model.views[0].boundaries![0].id,
                'internet-banking-boundary-0'
            );
        });

        it('propagates explicit direction to C4View', () => {
            const result = makeParseResult({
                direction: 'LR',
                hasExplicitDirection: true,
                elements: [makeElement({ id: 'A', elementType: 'Person' })],
            });
            const model = builder.build(result, 'Test');
            assert.strictEqual(model.views[0].direction, 'LR');
        });

        it('leaves direction undefined when not explicitly set', () => {
            const result = makeParseResult({
                direction: 'TB',
                hasExplicitDirection: false,
                elements: [makeElement({ id: 'A', elementType: 'Person' })],
            });
            const model = builder.build(result, 'Test');
            assert.strictEqual(model.views[0].direction, undefined);
        });

        it('preserves boundary direction', () => {
            const boundary: RawBoundary = {
                type: 'boundary',
                label: 'Test',
                direction: 'LR',
                elements: [],
                relationships: [],
            };
            const result = makeParseResult({ boundaries: [boundary] });
            const model = builder.build(result, 'Test');
            assert.strictEqual(model.views[0].boundaries![0].direction, 'LR');
        });

        it('maps element IDs from boundary elements', () => {
            const boundary: RawBoundary = {
                type: 'boundary',
                label: 'System',
                elements: [
                    makeElement({ id: 'Web', elementType: 'container' }),
                    makeElement({ id: 'API', elementType: 'container' }),
                ],
                relationships: [],
            };
            const result = makeParseResult({ boundaries: [boundary] });
            const model = builder.build(result, 'Test');
            assert.deepStrictEqual(model.views[0].boundaries![0].elements, ['Web', 'API']);
        });

        it('does not build boundaries when none exist in parse result', () => {
            const result = makeParseResult({ elements: [makeElement({ id: 'A' })] });
            const model = builder.build(result, 'Test');
            assert.strictEqual(model.views[0].boundaries, undefined);
        });
    });

    // =========================================================================
    // Metadata handling
    // =========================================================================

    describe('metadata handling', () => {
        it('sets metadata to undefined when no metadata fields exist', () => {
            const result = makeParseResult({
                elements: [makeElement({ id: 'A', tags: [] })],
            });
            const model = builder.build(result, 'Test');
            assert.strictEqual(model.views[0].elements[0].metadata, undefined);
        });

        it('preserves explicit metadata from element', () => {
            const result = makeParseResult({
                elements: [makeElement({
                    id: 'A',
                    metadata: { version: '2.0', owner: 'team-alpha' },
                })],
            });
            const model = builder.build(result, 'Test');
            const meta = model.views[0].elements[0].metadata!;
            assert.strictEqual(meta['version'], '2.0');
            assert.strictEqual(meta['owner'], 'team-alpha');
        });
    });

    // =========================================================================
    // Exported singleton instance
    // =========================================================================

    describe('c4ModelBuilder singleton', () => {
        it('is exported and functional', () => {
            const { c4ModelBuilder } = require('../../model/C4ModelBuilder');
            assert.ok(c4ModelBuilder);
            assert.ok(typeof c4ModelBuilder.build === 'function');

            const result = makeParseResult({
                elements: [makeElement({ id: 'A' })],
            });
            const model = c4ModelBuilder.build(result, 'Test');
            assert.strictEqual(model.workspace, 'Test');
        });
    });

    // =========================================================================
    // Edge cases
    // =========================================================================

    describe('edge cases', () => {
        it('handles empty elements array', () => {
            const result = makeParseResult({ elements: [], relationships: [] });
            const model = builder.build(result, 'Test');
            assert.strictEqual(model.views[0].elements.length, 0);
            assert.strictEqual(model.views[0].relationships.length, 0);
        });

        it('handles element with empty children array', () => {
            const result = makeParseResult({
                elements: [makeElement({
                    id: 'Server',
                    elementType: 'node',
                    children: [],
                })],
            });
            const model = builder.build(result, 'Test');
            // Empty children array means no children property on the output
            const server = model.views[0].elements[0];
            assert.strictEqual(server.children, undefined);
        });

        it('preserves element order', () => {
            const result = makeParseResult({
                elements: [
                    makeElement({ id: 'Z', label: 'Zebra' }),
                    makeElement({ id: 'A', label: 'Apple', elementType: 'system' }),
                    makeElement({ id: 'M', label: 'Mango', elementType: 'system' }),
                ],
            });
            const model = builder.build(result, 'Test');
            const ids = model.views[0].elements.map(e => e.id);
            assert.deepStrictEqual(ids, ['Z', 'A', 'M']);
        });

        it('handles case-insensitive element type matching', () => {
            const result = makeParseResult({
                elements: [makeElement({ id: 'A', elementType: 'Software System' })],
            });
            const model = builder.build(result, 'Test');
            assert.strictEqual(model.views[0].elements[0].type, 'SoftwareSystem');
        });
    });
});
