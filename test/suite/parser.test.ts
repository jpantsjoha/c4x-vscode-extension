import * as assert from 'assert';
import { c4xParser, C4XParseError } from '../../src/parser';

type ArrowVariant = '-->' | '-.->' | '==>';

type TagVariant = string[];

function buildDiagram(arrow: ArrowVariant, tags: TagVariant, view = 'system-context'): string {
    const tagLines = tags.map(tag => `<br/>${tag}`).join('');
    const relationshipLabel = arrow === '-->' ? 'Uses' : arrow === '-.->' ? 'Async call' : 'Sync call';

    return `%%{ c4: ${view} }%%\n` +
        'graph TB\n' +
        '    Customer[Customer<br/>Person]\n' +
        `    Banking[Internet Banking System<br/>Software System${tagLines}]\n` +
        '    Email[Email System<br/>Software System<br/>External]\n\n' +
        `    Customer ${arrow}|${relationshipLabel}| Banking\n` +
        `    Banking -->|Sends emails| Email\n`;
}

describe('C4X Parser', () => {
    const arrows: ArrowVariant[] = ['-->', '-.->', '==>'];
    const tagVariants: TagVariant[] = [
        [],
        ['External'],
        ['Internal'],
        ['Critical'],
        ['External', 'API'],
        ['External', 'Internal'],
        ['Partner'],
        ['Public'],
        ['Tier1'],
        ['Tier2'],
        ['Legacy'],
        ['External', 'Critical', 'API'],
        ['Core'],
        ['External', 'Tier1'],
    ];

    const viewTypes = ['system-context', 'container', 'component'] as const;

    const diagrams: string[] = [];

    for (const view of viewTypes) {
        for (const arrow of arrows) {
            for (const tags of tagVariants) {
                if (diagrams.length >= 120) {
                    break;
                }
                diagrams.push(buildDiagram(arrow, tags, view));
            }
            if (diagrams.length >= 120) {
                break;
            }
        }
        if (diagrams.length >= 120) {
            break;
        }
    }

    diagrams.forEach((diagram, index) => {
        it(`parses valid diagram variation #${index + 1}`, () => {
            const result = c4xParser.parse(diagram);
            assert.ok(result.elements.length >= 3, 'Expected at least 3 elements');
            assert.strictEqual(result.relationships.length, 2);
            assert.ok(['system-context', 'container', 'component'].includes(result.viewType));
        });
    });

    it('injects default graph declaration if missing', () => {
        const input = 'Customer[Customer<br/>Person]';
        const result = c4xParser.parse(input);
        assert.ok(result);
        assert.strictEqual(result.elements.length, 1);
        assert.strictEqual(result.elements[0].label, 'Customer');
    });

    it('throws error for invalid relationship', () => {
        const input = 'graph TB\nCustomer[Customer<br/>Person]\nCustomer => Banking';
        assert.throws(() => c4xParser.parse(input), C4XParseError);
    });

    it('reports line and column on error', () => {
        const input = 'graph TB\nCustomer[Customer]\n';
        try {
            c4xParser.parse(input);
            assert.fail('Expected parse error');
        } catch (error) {
            assert.ok(error instanceof C4XParseError);
            assert.strictEqual(error.location.line, 2);
        }
    });

    describe('classDef compatibility', () => {
        it('parses classDef statements without errors', () => {
            const input = `%%{ c4: system-context }%%
graph TB
classDef external fill:#999999,stroke:#333
classDef highlight fill:#FF9900

    Customer[Customer<br/>Person]
    SystemA[System A<br/>Software System]
    ExternalSystem[External<br/>Software System]

    class Customer highlight
    class ExternalSystem external

    Customer -->|Uses| SystemA
    SystemA -->|Calls| ExternalSystem
`;
            const result = c4xParser.parse(input);
            assert.strictEqual(result.classDefinitions?.length, 2);
            const customer = result.elements.find(e => e.id === 'Customer');
            const external = result.elements.find(e => e.id === 'ExternalSystem');
            assert.ok(customer?.tags.includes('highlight'));
            assert.ok(external?.tags.includes('external'));
        });

        it('supports multi-target class assignments', () => {
            const input = `graph TB
classDef internal fill:#0C4A6E
class Customer,BackOffice internal

    Customer[Customer<br/>Person]
    BackOffice[Back Office<br/>Person]
    CoreSystem[Core<br/>Software System]

    Customer --> CoreSystem
    BackOffice --> CoreSystem
`;
            const result = c4xParser.parse(input);
            ['Customer', 'BackOffice'].forEach(id => {
                const element = result.elements.find(e => e.id === id);
                assert.ok(element, `Element ${id} not found`);
                assert.ok(element?.tags.includes('internal'));
            });
        });
    });
});
