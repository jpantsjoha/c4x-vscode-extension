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
} from './macros';

/**
 * PlantUML C4 Parser
 * Parses PlantUML source code and extracts C4 macro calls
 */
export class PlantUMLParser {
    private lines: string[];
    private currentLine: number = 0;
    private currentColumn: number = 0;

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
        const children = this.parseBoundaryChildren();

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

    private needsContinuation(line: string): boolean {
        const openParens = (line.match(/\(/g) ?? []).length;
        const closeParens = (line.match(/\)/g) ?? []).length;
        const quoteCount = (line.match(/"/g) ?? []).length;

        const hasUnclosedParens = openParens > closeParens;
        const hasUnclosedQuotes = quoteCount % 2 !== 0;

        return hasUnclosedParens || hasUnclosedQuotes;
    }

    private collectMultiline(line: string): string {
        let combined = line;

        while (this.needsContinuation(combined) && this.currentLine < this.lines.length) {
            this.currentLine++;
            if (this.currentLine > this.lines.length) {
                break;
            }
            combined += '\n' + this.lines[this.currentLine - 1].trim();
        }

        return combined;
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
