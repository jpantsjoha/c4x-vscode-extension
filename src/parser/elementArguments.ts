/**
 * Positional arguments of a C4X element call (#420).
 *
 * `Person`, `System` and their `_Ext` and `Db` variants take
 * `(id, "Label", "Description")`: their third argument is the description, as
 * docs/C4X-ELEMENT-TYPES.md documents and as C4-PlantUML and Structurizr define
 * them. `Container`, `Component` and `Node` take
 * `(id, "Label", "Technology", "Description")`.
 *
 * The grammar reads positional arguments without knowing the element kind, so it
 * fills `technology` first. For a description-first kind with a single positional
 * argument, that value is the description. A description-first call with two
 * positional arguments keeps today's reading (technology, then description): the
 * grammar has always accepted it, and diagrams that give a person or system a
 * technology that way keep drawing it.
 */

const DESCRIPTION_FIRST_TYPES = new Set([
    'person',
    'person_ext',
    'system',
    'system_ext',
    'systemdb',
    'systemdb_ext',
    'softwaresystem',
    'software system',
]);

/** True when the element type's third argument is its description (Person and System families). */
export function isDescriptionFirstElementType(elementType: string | undefined): boolean {
    if (typeof elementType !== 'string') { return false; }
    return DESCRIPTION_FIRST_TYPES.has(elementType.trim().toLowerCase().replace(/\s+/g, ' '));
}

interface PositionalTextFields {
    elementType: string;
    technology?: string;
    description?: string;
    children?: PositionalTextFields[];
}

/**
 * Move a description-first element's lone positional argument from
 * `technology` to `description`, recursively through nested children.
 */
export function assignDescriptionFirstArguments(elements: PositionalTextFields[] | undefined): void {
    for (const element of elements ?? []) {
        if (isDescriptionFirstElementType(element.elementType)
            && element.technology !== undefined
            && element.description === undefined) {
            element.description = element.technology;
            delete element.technology;
        }
        assignDescriptionFirstArguments(element.children);
    }
}
