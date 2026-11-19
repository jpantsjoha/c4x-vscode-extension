/**
 * PlantUML C4 Macro Parser
 * Regex-based parser for extracting C4 macros from PlantUML source
 */

import {
    PlantUMLDocument,
    Macro,
    ElementMacro,
    RelationshipMacro,
    BoundaryMacro,
    ElementMacroType,
    RelationshipMacroType,
    BoundaryMacroType,
    PlantUMLParserError,
} from './macros';
import { MAX_NESTING_DEPTH, nestingDepthMessage } from '../nestingDepth';

/**
 * PlantUML C4 Parser
 * Parses PlantUML source code and extracts C4 macro calls
 */
export class PlantUMLParser {
    private lines: string[];
    private currentLine: number = 0;
    private currentColumn: number = 0;
    /** Boundaries currently open; capped at MAX_NESTING_DEPTH so recursion cannot overflow (#362). */
    private boundaryDepth = 0;

    constructor(source: string) {
        this.lines = source.split(/\r?\n/);
    }

    /**
     * Parse PlantUML source and extract all C4 macros
     */
    public parse(): PlantUMLDocument {
        const macros: Macro[] = [];

        for (let i = 0; i < this.lines.length; i++) {
            this.currentLine = i + 1;
            let line = this.lines[i].trim();

            // Skip empty lines
            if (line.length === 0) {
                continue;
            }

            // Skip comments (line starting with ')
            if (line.startsWith("'")) {
                continue;
            }

            // Skip PlantUML directives (@startuml, @enduml, !include, etc.)
            if (line.startsWith('@') || line.startsWith('!')) {
                continue;
            }

            // Reconstruct logical line if macro spans multiple lines (e.g., multiline params)
            line = this.collectMultiline(line);

            // Try to parse macro
            const macro = this.parseMacro(line);
            if (macro) {
                macros.push(macro);
            }

            // If parsing consumed multiple lines (e.g., boundary with children),
            // update loop index to skip already-processed lines
            if (this.currentLine > i + 1) {
                i = this.currentLine - 1;
            }
        }

        return { macros };
    }

    /**
     * Try to parse a macro from a line
     */
    private parseMacro(line: string): Macro | null {
        this.currentColumn = 1;

        // Try element macros
        const elementMacro = this.parseElementMacro(line);
        if (elementMacro) {
            return elementMacro;
        }

        // Try relationship macros
        const relMacro = this.parseRelationshipMacro(line);
        if (relMacro) {
            return relMacro;
        }

        // Try boundary macros
        const boundaryMacro = this.parseBoundaryMacro(line);
        if (boundaryMacro) {
            return boundaryMacro;
        }

        return null;
    }

    /**
     * Parse element macro
     * Pattern: Person(alias, "Label", "Description", "Technology")
     */
    private parseElementMacro(line: string): ElementMacro | null {
        const pattern = /^(Person|Person_Ext|System|System_Ext|SystemDb|SystemDb_Ext|Container|ContainerDb|Component|ComponentDb)\s*\(([\s\S]*)\)\s*$/;
        const match = line.match(pattern);

        if (!match) {
            return null;
        }

        const macroType = match[1] as ElementMacroType;
        const params = this.parseParameters(match[2]);

        if (params.length < 2) {
            console.warn(`Insufficient parameters for ${macroType} on line ${this.currentLine}`);
            return null;
        }

        // Container and Component macros have technology before description
        // Person/System: (alias, label, description)
        // Container/Component: (alias, label, technology, description)
        const isContainerOrComponent = macroType.startsWith('Container') || macroType.startsWith('Component');

        return {
            type: 'element',
            macroType,
            alias: params[0],
            label: params[1],
            description: isContainerOrComponent ? params[3] : params[2],
            technology: isContainerOrComponent ? params[2] : params[3],
            tags: params[4],
            sprite: params[5],
            link: params[6],
            line: this.currentLine,
            column: this.currentColumn,
        };
    }

    /**
     * Parse relationship macro
     * Pattern: Rel(from, to, "Label", "Technology")
     */
    private parseRelationshipMacro(line: string): RelationshipMacro | null {
        const pattern = /^(Rel|Rel_Back|Rel_Neighbor|Rel_D|Rel_U|Rel_L|Rel_R|BiRel|BiRel_D|BiRel_U|BiRel_L|BiRel_R)\s*\(([\s\S]*)\)\s*$/;
        const match = line.match(pattern);

        if (!match) {
            return null;
        }

        const macroType = match[1] as RelationshipMacroType;
        const params = this.parseParameters(match[2]);

        if (params.length < 2) {
            console.warn(`Insufficient parameters for ${macroType} on line ${this.currentLine}`);
            return null;
        }

        return {
            type: 'relationship',
            macroType,
            from: params[0],
            to: params[1],
            label: params[2],
            technology: params[3],
            description: params[4],
            line: this.currentLine,
            column: this.currentColumn,
        };
    }

    /**
     * Parse boundary macro
     * Pattern: System_Boundary(alias, "Label") {
     * Note: Closing brace may be on same line or different line
     */
    private parseBoundaryMacro(line: string): BoundaryMacro | null {
        const pattern = /^(System_Boundary|Container_Boundary|Boundary)\s*\(([\s\S]*)\)\s*\{?\s*$/;
        const match = line.match(pattern);

        if (!match) {
            return null;
        }

        const macroType = match[1] as BoundaryMacroType;
        const params = this.parseParameters(match[2]);

        if (params.length < 2) {
            console.warn(`Insufficient parameters for ${macroType} on line ${this.currentLine}`);
            return null;
        }

        // Parse children until closing brace
        // The one behaviour this PR adds here (#362): each level recurses, so past
        // MAX_NESTING_DEPTH the parse stops with a located error instead of
        // overflowing the stack. Everything else is origin/main's behaviour.
        if (this.boundaryDepth >= MAX_NESTING_DEPTH) {
            const raw = this.lines[this.currentLine - 1] ?? '';
            throw new PlantUMLParserError(nestingDepthMessage(), this.currentLine, Math.max(1, raw.indexOf(macroType) + 1));
        }
        this.boundaryDepth++;
        let children: Array<ElementMacro | RelationshipMacro | BoundaryMacro>;
        try {
            children = this.parseBoundaryChildren();
        } finally {
            this.boundaryDepth--;
        }

        return {
            type: 'boundary',
            macroType,
            alias: params[0],
            label: params[1],
            children,
            line: this.currentLine,
            column: this.currentColumn,
        };
    }

    /**
     * Parse boundary children (elements inside boundary)
     * Reads lines until closing brace is found
     */
    private parseBoundaryChildren(): Array<ElementMacro | RelationshipMacro | BoundaryMacro> {
        const children: Array<ElementMacro | RelationshipMacro | BoundaryMacro> = [];
        let braceCount = 1; // Already seen opening brace

        while (this.currentLine < this.lines.length && braceCount > 0) {
            this.currentLine++;
            if (this.currentLine > this.lines.length) {
                break;
            }

            const line = this.lines[this.currentLine - 1].trim();

            // Count braces
            for (const char of line) {
                if (char === '{') {
                    braceCount++;
                } else if (char === '}') {
                    braceCount--;
                }
            }

            if (braceCount === 0) {
                break;
            }

            // Skip empty lines and comments
            if (line.length === 0 || line.startsWith("'")) {
                continue;
            }

            // Parse child macro
            const macro = this.parseMacro(line);
            if (macro) {
                children.push(macro);
            }
        }

        return children;
    }

    /**
     * Parse comma-separated parameters, respecting quoted strings
     * Examples:
     *   user, "Label", "Description"  →  ["user", "Label", "Description"]
     *   web, "Web App", "React, TypeScript"  →  ["web", "Web App", "React, TypeScript"]
     */
    private parseParameters(paramString: string): string[] {
        const params: string[] = [];
        let current = '';
        let inQuotes = false;
        let escapeNext = false;

        for (let i = 0; i < paramString.length; i++) {
            const char = paramString[i];

            if (escapeNext) {
                current += char;
                escapeNext = false;
                continue;
            }

            if (char === '\\') {
                escapeNext = true;
                continue;
            }

            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                params.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        if (current.trim().length > 0) {
            params.push(current.trim());
        }

        // Remove quotes from parameters
        return params.map((p) => this.unquote(p));
    }

    /**
     * Remove surrounding quotes from a string
     */
    private unquote(str: string): string {
        const trimmed = str.trim();
        if (
            (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
            (trimmed.startsWith("'") && trimmed.endsWith("'"))
        ) {
            return trimmed.slice(1, -1);
        }
        return trimmed;
    }

    /**
     * Join a macro that spans several lines. The rule is origin/main's, quirks
     * included: a line continues while the text joined so far has more `(`
     * than `)` or an odd number of `"`, counted anywhere (inside quotes too,
     * with no escapes), and an open call at the end of the source takes the
     * rest of it. What changed (#362) is only the cost: main recounted the
     * whole growing string with three regular expressions for every line it
     * added, which was quadratic (900 KB took over 5.5 s); here each line is
     * counted once and the parts are joined once.
     */
    private collectMultiline(line: string): string {
        let open = 0;
        let close = 0;
        let quotes = 0;
        const count = (text: string) => {
            for (let index = 0; index < text.length; index++) {
                const code = text.charCodeAt(index);
                if (code === 40) { open++; } else if (code === 41) { close++; } else if (code === 34) { quotes++; }
            }
        };
        const needsContinuation = () => open > close || quotes % 2 !== 0;

        count(line);
        const parts = [line];
        while (needsContinuation() && this.currentLine < this.lines.length) {
            this.currentLine++;
            if (this.currentLine > this.lines.length) {
                break;
            }
            const next = this.lines[this.currentLine - 1].trim();
            parts.push(next);
            count(next);
        }

        return parts.join('\n');
    }
}

/**
 * Parse PlantUML C4 source code
 * Convenience function for one-step parsing
 */
export function parsePlantUML(source: string): PlantUMLDocument {
    const parser = new PlantUMLParser(source);
    return parser.parse();
}
