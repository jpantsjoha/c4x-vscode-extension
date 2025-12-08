import { C4XParseError, ParseResult, RawElement, RawRelationship, RawBoundary } from '../parser';
import { C4Element, C4ElementType, C4Model, C4Rel, C4View, RelType, C4Boundary } from './C4Model';

/* eslint-disable @typescript-eslint/naming-convention */
const ELEMENT_TYPE_MAP: Record<string, C4ElementType> = {
    'person': 'Person',
    'person_ext': 'Person',
    'software system': 'SoftwareSystem',
    'softwaresystem': 'SoftwareSystem',
    'system': 'SoftwareSystem',
    'system_ext': 'SoftwareSystem',
    'systemdb': 'SoftwareSystem',
    'systemdb_ext': 'SoftwareSystem',
    'container': 'Container',
    'container_ext': 'Container',
    'containerdb': 'Container',
    'containerdb_ext': 'Container',
    'component': 'Component',
    'component_ext': 'Component',
    'componentdb': 'Component',
    'componentdb_ext': 'Component',
    'node': 'DeploymentNode',
};

const REL_TYPE_MAP: Record<string, RelType> = {
    '-->': 'uses',
    '-.->': 'async',
    '==>': 'sync',
};
/* eslint-enable @typescript-eslint/naming-convention */

export class C4ModelBuilder {
    public build(parseResult: ParseResult, workspace: string): C4Model {
        const elements = this.buildElements(parseResult.elements);
        const relationships = this.buildRelationships(parseResult.relationships, elements, parseResult.viewType);
        const boundaries = parseResult.boundaries ? this.buildBoundaries(parseResult.boundaries) : undefined;

        const view: C4View = {
            type: parseResult.viewType,
            elements,
            relationships,
            boundaries,
        };

        return {
            workspace,
            views: [view],
        };
    }

    private buildElements(rawElements: RawElement[], seen: Set<string> = new Set()): C4Element[] {
        return rawElements.map((element, index) => {
            const elementType = this.resolveElementType(element, index);

            if (seen.has(element.id)) {
                throw new C4XParseError(`Duplicate element identifier "${element.id}"`, { line: index + 1, column: 1 });
            }

            seen.add(element.id);

            // Auto-inject tags for specific element types (Ext, Db)
            const tags = element.tags ? [...element.tags] : [];
            const rawType = element.elementType.toLowerCase();
            
            if (rawType.includes('_ext')) {
                if (!tags.includes('External')) {tags.push('External');}
            }
            if (rawType.includes('db')) {
                if (!tags.includes('Database')) {tags.push('Database');}
            }

            const c4Element: C4Element = {
                id: element.id,
                label: element.label,
                type: elementType,
                tags: tags.length > 0 ? tags : undefined,
                sprite: element.sprite,
                technology: element.technology,
                description: element.description,
            };

            if (element.children && element.children.length > 0) {
                c4Element.children = this.buildElements(element.children, seen);
            }

            return c4Element;
        });
    }

    private buildRelationships(rawRelationships: RawRelationship[], elements: C4Element[], viewType: string): C4Rel[] {
        const elementIds = new Set<string>();
        
        // Helper to collect all IDs including nested ones
        const collectIds = (elems: C4Element[]) => {
            elems.forEach(e => {
                elementIds.add(e.id);
                if (e.children) { collectIds(e.children); }
            });
        };
        collectIds(elements);

        return rawRelationships.map((rel, index) => {
            if (!elementIds.has(rel.from)) {
                throw new C4XParseError(`Relationship references unknown element "${rel.from}"`, { line: index + 1, column: 1 });
            }

            if (!elementIds.has(rel.to)) {
                throw new C4XParseError(`Relationship references unknown element "${rel.to}"`, { line: index + 1, column: 1 });
            }

            const relType = REL_TYPE_MAP[rel.arrow];
            if (!relType) {
                throw new C4XParseError(`Unsupported relationship arrow "${rel.arrow}"`, { line: index + 1, column: 1 });
            }

            return {
                id: `rel-${index}`,
                from: rel.from,
                to: rel.to,
                label: rel.label,
                relType,
                order: viewType === 'dynamic' ? index + 1 : undefined,
            };
        });
    }

    private buildBoundaries(rawBoundaries: RawBoundary[]): C4Boundary[] {
        return rawBoundaries.map((boundary, index) => {
            return {
                id: boundary.label.toLowerCase().replace(/\s+/g, '-') + '-boundary-' + index,
                label: boundary.label,
                elements: boundary.elements.map(elem => elem.id), // elem is a RawElement with id property
            };
        });
    }

    private resolveElementType(element: RawElement, index: number): C4ElementType {
        const normalizedKey = element.elementType.toLowerCase().replace(/\s+/g, ' ');
        const mapped = ELEMENT_TYPE_MAP[normalizedKey] ?? ELEMENT_TYPE_MAP[element.elementType.toLowerCase()];

        if (!mapped) {
            throw new C4XParseError(`Unsupported element type "${element.elementType}"`, { line: index + 1, column: 1 });
        }

        return mapped;
    }
}

export const c4ModelBuilder = new C4ModelBuilder();
