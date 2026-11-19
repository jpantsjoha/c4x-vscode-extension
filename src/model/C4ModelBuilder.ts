import { C4XParseError, ParseResult, RawElement, RawRelationship, RawBoundary } from '../parser';
import {
    C4Element,
    C4ElementStyleRule,
    C4ElementType,
    C4Model,
    C4ModelDiagnostic,
    C4Rel,
    C4View,
    RelType,
    C4Boundary,
} from './C4Model';
import { CODE_MAPPABLE_TYPES, parseCodePaths } from './codePaths';
import { STYLE_DIAGNOSTIC_CODES, styleDiagnosticsFor, type ElementShapeInput } from './styleDiagnostics';
import { isBundledSpriteId } from '../render/elementStyle';

/* eslint-disable @typescript-eslint/naming-convention */
/** Every element-call spelling the builder accepts (lower case) and the model type it builds. Read by the reference generator. */
export const ELEMENT_TYPE_MAP: Record<string, C4ElementType> = {
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

/** Every arrow the builder accepts and the relationship type it builds. Read by the reference generator. */
export const REL_TYPE_MAP: Record<string, RelType> = {
    '-->': 'uses',
    '-.->': 'async',
    '==>': 'sync',
};
/* eslint-enable @typescript-eslint/naming-convention */

export interface C4ModelBuilderOptions {
    /**
     * Checks an `elementStyle` `$sprite` id. Defaults to the bundled id list
     * (src/assets/spriteIds.ts), which the editor, the headless CLI and MCP
     * bundles and the webview client share.
     */
    readonly isKnownSprite?: (id: string) => boolean;
}

export class C4ModelBuilder {
    /** Per-build record of each element's `$shape` input, for diagnostics. */
    private shapeInputs: ElementShapeInput[] = [];

    constructor(private readonly options: C4ModelBuilderOptions = {}) {}

    public build(parseResult: ParseResult, workspace: string): C4Model {
        this.shapeInputs = [];
        const elements = this.buildElements(parseResult.elements);
        const relationships = this.buildRelationships(parseResult.relationships, elements, parseResult.viewType);
        const boundaries = parseResult.boundaries ? this.buildBoundaries(parseResult.boundaries) : undefined;

        const view: C4View = {
            type: parseResult.viewType,
            // Only propagate direction when the user explicitly wrote a graph directive.
            // Undefined signals the layout engine to auto-detect based on element count.
            direction: parseResult.hasExplicitDirection ? parseResult.direction : undefined,
            elements,
            relationships,
            boundaries,
        };

        const elementStyles: C4ElementStyleRule[] = (parseResult.elementStyles ?? []).map(raw => ({
            tag: raw.tag,
            properties: raw.properties.map(pair => ({
                key: pair.key,
                value: pair.value,
                ...(pair.sourceRange ? { sourceRange: pair.sourceRange } : {}),
            })),
            ...(raw.sourceRange ? { sourceRange: raw.sourceRange } : {}),
        }));
        if (elementStyles.length > 0) {
            view.elementStyles = elementStyles;
        }

        const diagnostics: C4ModelDiagnostic[] = styleDiagnosticsFor(elementStyles, this.shapeInputs, {
            isKnownSprite: this.options.isKnownSprite ?? isBundledSpriteId,
            elements,
        });
        for (const classDef of parseResult.classDefinitions ?? []) {
            diagnostics.push({
                code: STYLE_DIAGNOSTIC_CODES.classDefNoEffect,
                severity: 'info',
                message: `classDef "${classDef.name}" has no effect. Use \`elementStyle ${classDef.name} $stroke="#RRGGBB"\` to style elements tagged ${classDef.name}.`,
                ...(classDef.sourceRange ? { range: classDef.sourceRange } : {}),
            });
        }
        this.collectDroppedConstructs(parseResult.elements, diagnostics);
        diagnostics.sort((a, b) => (a.range?.start.offset ?? Number.MAX_SAFE_INTEGER) - (b.range?.start.offset ?? Number.MAX_SAFE_INTEGER));

        const model: C4Model = {
            workspace,
            views: [view],
        };
        if (diagnostics.length > 0) {
            model.diagnostics = diagnostics;
        }
        return model;
    }

    /** C4X-L116: constructs the grammar discards inside a deployment Node (#472). */
    private collectDroppedConstructs(rawElements: RawElement[], diagnostics: C4ModelDiagnostic[]): void {
        for (const element of rawElements) {
            for (const dropped of element.droppedConstructs ?? []) {
                const what = dropped.kind === 'direction'
                    ? 'A `direction` statement'
                    : (dropped.kind === 'subgraph' ? 'A `subgraph`' : `A \`${dropped.kind}\` block`);
                diagnostics.push({
                    code: STYLE_DIAGNOSTIC_CODES.droppedInNode,
                    severity: 'warning',
                    message: `${what} inside deployment Node "${element.id}" is not drawn. Nodes hold elements and relationships only.${dropped.kind === 'direction' ? ' Set a view-wide direction with `graph LR`, or put `direction` inside a subgraph or boundary.' : ' Move it outside the Node.'}`,
                    ...(dropped.sourceRange ? { range: dropped.sourceRange } : {}),
                });
            }
            if (element.children) { this.collectDroppedConstructs(element.children, diagnostics); }
        }
    }

    private buildElements(rawElements: RawElement[], seen: Set<string> = new Set()): C4Element[] {
        return rawElements.map((element, index) => {
            const elementType = this.resolveElementType(element, index);

            if (seen.has(element.id)) {
                throw new C4XParseError(`Duplicate element identifier "${element.id}"`, { line: index + 1, column: 1 });
            }

            seen.add(element.id);

            // Process tags for metadata extraction (for generic elements like A[...])
            const finalTags: string[] = [];
            const tagMetadata: Record<string, string> = {};

            const tagsToProcess = element.tags ? [...element.tags] : [];
            let shapeTagLines = 0;
            tagsToProcess.forEach(tag => {
                if (tag.startsWith('$')) {
                    // Split at the first `=` only: a value may itself contain one.
                    const body = tag.substring(1);
                    const equals = body.indexOf('=');
                    if (equals > 0) {
                        if (body.slice(0, equals) === 'shape') { shapeTagLines++; }
                        tagMetadata[body.slice(0, equals)] = body.slice(equals + 1).replace(/['"]/g, ''); // Remove quotes
                    } else {
                        // Just a flag like $flag?
                        tagMetadata[tag.substring(1)] = 'true';
                    }
                } else {
                    finalTags.push(tag);
                }
            });

            // Auto-inject tags for specific element types (Ext, Db)
            const rawType = element.elementType.toLowerCase();

            // Tags injected here take the implied position in style
            // resolution; the same tags written by the author do not.
            const impliedTags: string[] = [];
            const macroTags: string[] = [];
            if (rawType.includes('_ext')) { macroTags.push('External'); }
            if (rawType.includes('db')) { macroTags.push('Database'); }
            if (rawType.includes('_ext')) {
                if (!finalTags.includes('External')) { finalTags.push('External'); impliedTags.push('External'); }
            }
            if (rawType.includes('db')) {
                if (!finalTags.includes('Database')) { finalTags.push('Database'); impliedTags.push('Database'); }
            }

            // `A[Label<br/>Component<br/>$code=src/a]` carries $code as a tag line.
            // It is the same mapping, so it must not fall into generic metadata.
            const rawCode = element.code ?? tagMetadata.code;
            delete tagMetadata.code;

            // `$shape` (notation decision #320): a known key, read from a bracket element's
            // tag line the way `$code` is. The attribute after `]` comes later
            // in the source, so it wins over a tag line.
            const tagLineShape = tagMetadata.shape;
            delete tagMetadata.shape;
            const shape = element.shape ?? tagLineShape;
            const repeats = (element.duplicateKeys ?? []).filter(duplicate => duplicate.key === 'shape');
            const shapeCount = shapeTagLines + (element.shape !== undefined ? 1 + repeats.length : 0);
            if (shape !== undefined) {
                this.shapeInputs.push({
                    elementId: element.id,
                    value: shape,
                    range: element.shapeRange ?? element.sourceRange,
                    repeatRanges: shapeCount > 1
                        ? (repeats.length > 0
                            ? repeats.map(repeat => repeat.sourceRange ?? element.sourceRange)
                            : Array.from({ length: shapeCount - 1 }, () => element.sourceRange))
                        : [],
                });
            }

            // Merge explicit metadata (from ElementCall) with tag metadata
            const metadata = { ...tagMetadata, ...(element.metadata || {}) };

            const c4Element: C4Element = {
                id: element.id,
                label: element.label,
                type: elementType,
                tags: finalTags.length > 0 ? finalTags : undefined,
                sprite: element.sprite,
                technology: element.technology,
                description: element.description,
                metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
                sourceRange: element.sourceRange,
                sourceId: element.sourceId,
            };
            if (shape !== undefined) {
                c4Element.shape = shape;
            }
            if (impliedTags.length > 0) {
                c4Element.impliedTags = impliedTags;
            }
            if (macroTags.length > 0) {
                c4Element.macroTags = macroTags;
            }

            if (rawCode !== undefined) {
                c4Element.codePaths = this.resolveCodePaths(element, rawCode, elementType, index);
            }

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

            const c4Rel: C4Rel = {
                id: `rel-${index}`,
                from: rel.from,
                to: rel.to,
                label: rel.label,
                relType,
                order: viewType === 'dynamic' ? index + 1 : undefined,
                sourceRange: rel.sourceRange,
                sourceId: rel.sourceId,
            };
            if (rel.technology) {
                c4Rel.technology = rel.technology;
            }
            return c4Rel;
        });
    }

    private buildBoundaries(rawBoundaries: RawBoundary[]): C4Boundary[] {
        const boundaryId = (boundary: RawBoundary, index: number): string =>
            boundary.label.toLowerCase().replace(/\s+/g, '-') + '-boundary-' + index;
        const ids = new Map(rawBoundaries.map((boundary, index) => [index, boundaryId(boundary, index)]));
        return rawBoundaries.map((boundary, index) => {
            // Members are element ids plus the ids of boundaries declared directly
            // inside this one, in source order, so the layout engine nests a child
            // boundary inside its parent instead of beside it (#339). One forward
            // pass: before each element, emit the nested boundaries declared ahead
            // of it. childBoundaries is in source order, so adjacent nested
            // boundaries keep their order too.
            const pending = (boundary.childBoundaries ?? [])
                .filter(child => child.index !== index && ids.has(child.index));
            const elements: string[] = [];
            const emitNestedUpTo = (position: number): void => {
                while (pending.length > 0 && pending[0].afterElements <= position) {
                    elements.push(ids.get(pending.shift()!.index)!);
                }
            };
            boundary.elements.forEach((elem, position) => {
                emitNestedUpTo(position);
                elements.push(elem.id);
            });
            emitNestedUpTo(Infinity);
            return {
                id: boundaryId(boundary, index),
                label: boundary.label,
                ...(boundary.boundaryType ? { boundaryType: boundary.boundaryType } : {}),
                ...(boundary.boundaryType && boundary.id ? { alias: boundary.id } : {}),
                direction: boundary.direction,
                elements,
                metadata: boundary.metadata,
                sourceRange: boundary.sourceRange,
                sourceId: boundary.sourceId,
            };
        });
    }

    /**
     * `$code` maps a Container or Component to source paths. Anywhere else it
     * is an authoring mistake, reported at the element rather than ignored.
     */
    private resolveCodePaths(element: RawElement, rawCode: string, elementType: C4ElementType, index: number): string[] {
        const location = element.sourceRange
            ? { line: element.sourceRange.start.line, column: element.sourceRange.start.column }
            : { line: index + 1, column: 1 };
        if (!CODE_MAPPABLE_TYPES.has(elementType)) {
            throw new C4XParseError(
                `$code is only valid on Container and Component elements; "${element.id}" is a ${elementType}`,
                location,
            );
        }
        try {
            return parseCodePaths(rawCode);
        } catch (error) {
            throw new C4XParseError(
                `Element "${element.id}": ${error instanceof Error ? error.message : String(error)}`,
                location,
            );
        }
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

/** The shared builder. Checks `elementStyle` sprite ids against the bundled id list. */
export const c4ModelBuilder = new C4ModelBuilder();
