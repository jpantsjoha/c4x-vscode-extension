/**
 * PlantUML C4 Macro Type Definitions
 * Defines all supported PlantUML C4 macro types and their structures
 */

/**
 * Supported PlantUML C4 element macro types
 */
export type ElementMacroType =
    | 'Person'
    | 'Person_Ext'
    | 'System'
    | 'System_Ext'
    | 'SystemDb'
    | 'SystemDb_Ext'
    | 'Container'
    | 'ContainerDb'
    | 'Component'
    | 'ComponentDb';

/**
 * Supported PlantUML C4 relationship macro types
 */
export type RelationshipMacroType =
    | 'Rel'
    | 'Rel_Back'
    | 'Rel_Neighbor'
    | 'Rel_D'  // Down
    | 'Rel_U'  // Up
    | 'Rel_L'  // Left
    | 'Rel_R'  // Right
    | 'BiRel'
    | 'BiRel_D'
    | 'BiRel_U'
    | 'BiRel_L'
    | 'BiRel_R';

/**
 * Supported PlantUML C4 boundary macro types
 */
export type BoundaryMacroType =
    | 'System_Boundary'
    | 'Container_Boundary'
    | 'Boundary';

/**
 * All supported macro types
 */
export type MacroType = ElementMacroType | RelationshipMacroType | BoundaryMacroType;

/**
 * Base interface for all macro calls
 */
export interface BaseMacro {
    line: number;
    column: number;
}

/**
 * Element macro call
 * Examples:
 *   Person(user, "User", "A user of the system")
 *   Container(web, "Web App", "React", "Frontend application")
 *   SystemDb(db, "Database", "Stores data")
 */
export interface ElementMacro extends BaseMacro {
    type: 'element';
    macroType: ElementMacroType;
    alias: string;
    label: string;
    description?: string;
    technology?: string;
    tags?: string;
    sprite?: string;
    link?: string;
}

/**
 * Relationship macro call
 * Examples:
 *   Rel(user, web, "Uses", "HTTPS")
 *   Rel_D(web, api, "Calls")
 *   Rel_Back(api, db, "Reads from")
 */
export interface RelationshipMacro extends BaseMacro {
    type: 'relationship';
    macroType: RelationshipMacroType;
    from: string;
    to: string;
    label?: string;
    technology?: string;
    description?: string;
}

/**
 * Boundary macro call (contains other elements)
 * Examples:
 *   System_Boundary(sys1, "Banking System") {
 *       Container(web, "Web App")
 *       Container(db, "Database")
 *   }
 */
export interface BoundaryMacro extends BaseMacro {
    type: 'boundary';
    macroType: BoundaryMacroType;
    alias: string;
    label: string;
    children: Array<ElementMacro | RelationshipMacro | BoundaryMacro>;
}

/**
 * Union type for all macros
 */
export type Macro = ElementMacro | RelationshipMacro | BoundaryMacro;

/**
 * PlantUML document structure (parsed result)
 */
export interface PlantUMLDocument {
    macros: Macro[];
}

/**
 * PlantUML parser error
 */
export class PlantUMLParserError extends Error {
    constructor(
        message: string,
        public readonly line: number,
        public readonly column: number
    ) {
        super(`${message} (Line ${line}, Column ${column})`);
        this.name = 'PlantUMLParserError';
    }
}
