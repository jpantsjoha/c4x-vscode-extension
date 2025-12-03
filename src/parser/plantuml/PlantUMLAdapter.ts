/**
 * PlantUML to C4Model Adapter
 * Converts PlantUML C4 macros to C4Model IR for rendering
 */

import {
    PlantUMLDocument,
    ElementMacro,
    RelationshipMacro,
    BoundaryMacro,
} from './macros';
import { parsePlantUML } from './PlantUMLParser';
import {
    C4Model,
    C4View,
    C4Element,
    C4Rel,
    C4ElementType,
} from '../../model/C4Model';

/**
 * Adapter that converts PlantUML C4 macros to C4Model IR
 */
export class PlantUMLAdapter {
    /**
     * Convert PlantUML document to C4Model
     */
    public convert(document: PlantUMLDocument): C4Model {
        const elements: C4Element[] = [];
        const relationships: C4Rel[] = [];

        for (const macro of document.macros) {
            if (macro.type === 'element') {
                elements.push(this.convertElement(macro));
            } else if (macro.type === 'relationship') {
                relationships.push(this.convertRelationship(macro));
            } else if (macro.type === 'boundary') {
                // Flatten boundary - extract children
                const boundaryResult = this.flattenBoundary(macro);
                elements.push(...boundaryResult.elements);
                relationships.push(...boundaryResult.relationships);
            }
        }

        // Create default system-context view
        const view: C4View = {
            type: 'system-context',
            elements,
            relationships,
        };

        return {
            workspace: 'PlantUML C4 Diagram',
            views: [view],
        };
    }

    /**
     * Convert element macro to C4Element
     */
    private convertElement(macro: ElementMacro): C4Element {
        const element: C4Element = {
            id: macro.alias,
            label: macro.label,
            type: this.mapElementType(macro.macroType),
        };

        if (macro.description) {
            element.description = macro.description;
        }

        if (macro.technology) {
            element.technology = macro.technology;
        }

        // Add tags based on macro type
        const tags = this.getElementTags(macro);
        if (tags && tags.length > 0) {
            element.tags = tags;
        }

        return element;
    }

    /**
     * Convert relationship macro to C4Rel
     */
    private convertRelationship(macro: RelationshipMacro): C4Rel {
        const rel: C4Rel = {
            id: `${macro.from}-${macro.to}`,
            from: macro.from,
            to: macro.to,
            label: macro.label || '',
            relType: this.mapRelationType(macro.macroType),
        };

        if (macro.technology) {
            rel.technology = macro.technology;
        }

        return rel;
    }

    /**
     * Flatten boundary macro (extract children)
     */
    private flattenBoundary(macro: BoundaryMacro, parentBoundaryTags: string[] = []): {
        elements: C4Element[];
        relationships: C4Rel[];
    } {
        const elements: C4Element[] = [];
        const relationships: C4Rel[] = [];

        for (const child of macro.children) {
            if (child.type === 'element') {
                const element = this.convertElement(child);
                // Add boundary as tag
                if (!element.tags) {
                    element.tags = [];
                }
                element.tags.push(`boundary:${macro.alias}`);
                // Add parent boundary tags
                element.tags.push(...parentBoundaryTags);
                elements.push(element);
            } else if (child.type === 'relationship') {
                relationships.push(this.convertRelationship(child));
            } else if (child.type === 'boundary') {
                // Recursively flatten nested boundaries
                const nestedBoundaryTags = [`boundary:${macro.alias}`, ...parentBoundaryTags];
                const nested = this.flattenBoundary(child, nestedBoundaryTags);
                elements.push(...nested.elements);
                relationships.push(...nested.relationships);
            }
        }

        return { elements, relationships };
    }

    /**
     * Map PlantUML macro type to C4ElementType
     */
    private mapElementType(macroType: string): C4ElementType {
        if (macroType.startsWith('Person')) {
            return 'Person';
        } else if (macroType.startsWith('System')) {
            return 'SoftwareSystem';
        } else if (macroType.startsWith('Container')) {
            return 'Container';
        } else if (macroType.startsWith('Component')) {
            return 'Component';
        }
        return 'SoftwareSystem'; // Default
    }

    /**
     * Map PlantUML relationship type to C4Rel type
     */
    private mapRelationType(_macroType: string): 'uses' | 'async' | 'sync' {
        // All PlantUML relationships map to 'uses' by default
        // Direction hints (Rel_D, Rel_U, Rel_L, Rel_R) could be used for layout in future
        return 'uses';
    }

    /**
     * Get element tags based on macro type
     */
    private getElementTags(macro: ElementMacro): string[] | undefined {
        const tags: string[] = [];

        // Add 'External' tag for _Ext variants
        if (macro.macroType.includes('_Ext')) {
            tags.push('External');
        }

        // Add 'Database' tag for Db variants
        if (macro.macroType.includes('Db')) {
            tags.push('Database');
        }

        // Add custom tags from macro if present
        if (macro.tags) {
            // Parse comma-separated tags
            const customTags = macro.tags.split(',').map((t) => t.trim());
            tags.push(...customTags);
        }

        return tags.length > 0 ? tags : undefined;
    }
}

/**
 * Parse PlantUML C4 source and convert to C4Model
 * Complete pipeline in one function call
 */
export function parsePlantUMLtoC4Model(source: string): C4Model {
    const document = parsePlantUML(source);
    const adapter = new PlantUMLAdapter();
    return adapter.convert(document);
}
