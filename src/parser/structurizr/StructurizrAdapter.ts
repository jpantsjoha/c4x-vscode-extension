/**
 * Structurizr DSL to C4Model Adapter
 * Converts Structurizr AST to C4Model IR for rendering
 */

import {
    WorkspaceNode,
    ModelNode,
    ElementNode,
    RelationshipNode,
    ViewNode,
    ViewsNode,
} from './ast';
import {
    C4Model,
    C4View,
    C4Element,
    C4Rel,
    C4ElementType,
} from '../../model/C4Model';
import { CODE_MAPPABLE_TYPES, parseCodePaths } from '../../model/codePaths';
import { C4ModelWarning } from '../../model/modelWarnings';
import { C4ViewType } from '../types';

/**
 * Adapter to convert Structurizr AST to C4Model IR
 */
export class StructurizrAdapter {
    /** Non-fatal notes from the last `convert` (one per element, not per view). */
    private warnings: C4ModelWarning[] = [];

    /**
     * Convert a Structurizr WorkspaceNode to C4Model
     */
    public convert(workspace: WorkspaceNode): C4Model {
        this.warnings = [];
        const views: C4View[] = [];

        if (workspace.views && workspace.model) {
            views.push(...this.convertViews(workspace.views, workspace.model));
        }

        return {
            workspace: workspace.name,
            views,
            ...(this.warnings.length > 0 ? { warnings: [...this.warnings] } : {}),
        };
    }

    /**
     * Convert Structurizr views to C4Views
     */
    private convertViews(viewsNode: ViewsNode, modelNode: ModelNode): C4View[] {
        return viewsNode.views
            .filter(view => this.isSupportedViewType(view.viewType))
            .map(view => this.convertView(view, modelNode));
    }

    /**
     * Convert a single Structurizr view to C4View
     */
    private convertView(viewNode: ViewNode, modelNode: ModelNode): C4View {
        const viewType = this.mapViewType(viewNode.viewType);

        // Build element map for quick lookup
        const elementMap = this.buildElementMap(modelNode.elements);

        // Get all elements (flattened)
        const allElements = this.flattenElements(modelNode.elements);

        // Filter elements based on include/exclude
        let filteredElements = allElements;

        if (viewNode.include) {
            filteredElements = this.filterElements(
                allElements,
                viewNode.include,
                elementMap
            );
        }

        if (viewNode.exclude) {
            filteredElements = filteredElements.filter(
                el => !viewNode.exclude!.includes(el.identifier)
            );
        }

        // Apply scope filtering for context/container/component views
        if (viewNode.scope) {
            filteredElements = this.applyScopeFilter(
                filteredElements,
                viewNode.scope,
                viewNode.viewType,
                elementMap
            );
        }

        // Convert elements to C4Elements
        const c4Elements = filteredElements.map(el => this.convertElement(el));

        // Filter relationships to only include those between visible elements
        const elementIds = new Set(filteredElements.map(el => el.identifier));
        const filteredRelationships = modelNode.relationships.filter(
            rel => elementIds.has(rel.source) && elementIds.has(rel.destination)
        );

        // Convert relationships to C4Rels
        const c4Relationships = filteredRelationships.map(rel =>
            this.convertRelationship(rel)
        );

        return {
            type: viewType,
            elements: c4Elements,
            relationships: c4Relationships,
        };
    }

    /**
     * Convert Structurizr ElementNode to C4Element
     */
    private convertElement(node: ElementNode): C4Element {
        const element: C4Element = {
            id: node.identifier,
            label: node.name,
            type: this.mapElementType(node.elementType),
            tags: node.tags,
            technology: node.technology,
            description: node.description,
        };
        const code = node.properties?.code;
        if (code !== undefined) {
            element.codePaths = this.convertCodePaths(node, element.type, code);
        }
        return element;
    }

    /**
     * Map a `properties { "code" "src/parser/**" }` entry onto `codePaths`,
     * with the same splitting and validation as the C4X `$code` attribute.
     *
     * Unlike C4X's `$code`, a Structurizr `code` property is a general
     * key-value pair that a workspace may already use for something else
     * (`"code" "SYS:001"` on a software system). So a value C4X cannot use is a
     * warning on the model, and the value is ignored, rather than a parse error
     * that would stop an otherwise valid workspace from rendering.
     */
    private convertCodePaths(node: ElementNode, type: C4ElementType, code: string): string[] | undefined {
        // The key leaves the location out, so the same problem keeps one identity
        // while lines above it are edited; the location is for the reader only.
        const key = `structurizr-code\u0000${node.identifier}\u0000${code}`;
        const where = `${node.location.line}:${node.location.column}`;
        if (!CODE_MAPPABLE_TYPES.has(type)) {
            this.warn(key, `Element "${node.identifier}" (${where}): the code property maps source paths only on containers and components, not on a ${node.elementType}; it is ignored.`);
            return undefined;
        }
        try {
            return parseCodePaths(code);
        } catch (error) {
            this.warn(key, `Element "${node.identifier}" (${where}): the code property is not a source-path mapping and is ignored: ${error instanceof Error ? error.message : String(error)}.`);
            return undefined;
        }
    }

    private warn(key: string, message: string): void {
        if (!this.warnings.some(warning => warning.key === key)) {
            this.warnings.push({ key, message });
        }
    }

    /**
     * Convert Structurizr RelationshipNode to C4Rel
     */
    private convertRelationship(node: RelationshipNode): C4Rel {
        return {
            id: `${node.source}_${node.destination}`,
            from: node.source,
            to: node.destination,
            label: node.description || '',
            technology: node.technology,
            relType: 'uses', // Default relationship type
        };
    }

    /**
     * Build a map of element identifiers to ElementNodes (including nested)
     */
    private buildElementMap(
        elements: ElementNode[]
    ): Map<string, ElementNode> {
        const map = new Map<string, ElementNode>();

        const traverse = (elements: ElementNode[]) => {
            for (const element of elements) {
                map.set(element.identifier, element);
                if (element.children) {
                    traverse(element.children);
                }
            }
        };

        traverse(elements);
        return map;
    }

    /**
     * Flatten nested element hierarchy
     */
    private flattenElements(elements: ElementNode[]): ElementNode[] {
        const flattened: ElementNode[] = [];

        const traverse = (elements: ElementNode[]) => {
            for (const element of elements) {
                flattened.push(element);
                if (element.children) {
                    traverse(element.children);
                }
            }
        };

        traverse(elements);
        return flattened;
    }

    /**
     * Filter elements based on include list (supports wildcard *)
     */
    private filterElements(
        elements: ElementNode[],
        include: string[],
        elementMap: Map<string, ElementNode>
    ): ElementNode[] {
        // If wildcard, include all
        if (include.includes('*')) {
            return elements;
        }

        // Include specific elements and their children
        const included = new Set<string>();

        for (const identifier of include) {
            const element = elementMap.get(identifier);
            if (element) {
                included.add(identifier);
                // Include all children recursively
                if (element.children) {
                    const addChildren = (children: ElementNode[]) => {
                        for (const child of children) {
                            included.add(child.identifier);
                            if (child.children) {
                                addChildren(child.children);
                            }
                        }
                    };
                    addChildren(element.children);
                }
            }
        }

        return elements.filter(el => included.has(el.identifier));
    }

    /**
     * Apply scope filtering for context/container/component views
     */
    private applyScopeFilter(
        elements: ElementNode[],
        scope: string,
        viewType: string,
        elementMap: Map<string, ElementNode>
    ): ElementNode[] {
        const scopeElement = elementMap.get(scope);
        if (!scopeElement) {
            return elements;
        }

        if (viewType === 'systemContext') {
            if (scopeElement.elementType !== 'softwareSystem') {
                return elements;
            }
            // System context: show the system and its external dependencies
            return elements.filter(
                el =>
                    el.identifier === scope ||
                    el.elementType === 'person' ||
                    (el.elementType === 'softwareSystem' &&
                        el.identifier !== scope)
            );
        } else if (viewType === 'container') {
            if (scopeElement.elementType !== 'softwareSystem') {
                return elements;
            }
            // Container view: show containers within the system
            if (scopeElement.children) {
                return [scopeElement, ...scopeElement.children];
            }
            return [scopeElement];
        } else if (viewType === 'component') {
            if (scopeElement.elementType !== 'container') {
                return elements;
            }
            // Component view: show components within the container
            if (scopeElement.children) {
                return [scopeElement, ...scopeElement.children];
            }
            return [scopeElement];
        }

        return elements;
    }

    /**
     * Map Structurizr element type to C4ElementType
     */
    private mapElementType(
        elementType: ElementNode['elementType']
    ): C4ElementType {
        switch (elementType) {
            case 'person':
                return 'Person';
            case 'softwareSystem':
                return 'SoftwareSystem';
            case 'container':
                return 'Container';
            case 'component':
                return 'Component';
        }
    }

    /**
     * Map Structurizr view type to C4ViewType
     */
    private mapViewType(viewType: ViewNode['viewType']): C4ViewType {
        switch (viewType) {
            case 'systemContext':
                return 'system-context';
            case 'container':
                return 'container';
            case 'component':
                return 'component';
            default:
                return 'system-context';
        }
    }

    /**
     * Check if view type is supported in C4Model
     */
    private isSupportedViewType(viewType: ViewNode['viewType']): boolean {
        return (
            viewType === 'systemContext' ||
            viewType === 'container' ||
            viewType === 'component'
        );
    }
}
