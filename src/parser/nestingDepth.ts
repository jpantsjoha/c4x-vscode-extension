/**
 * Nesting bound for C4X source (#362).
 *
 * Boundaries, deployment nodes and subgraphs nest with `{ … }`. The generated
 * Peggy parser and the model builder both recurse once per level, so a source
 * nested thousands of levels deep exhausts the call stack, and parse time grew
 * faster than linearly long before that (measured 2026-11-15: 1,000 nested
 * boundaries took 353 ms to parse, 2,000 nested nodes 915 ms and then a stack
 * overflow in the model builder). The deepest diagram in this repository nests
 * 4 levels.
 *
 * The grammar enforces the bound where the structure is known (`NestOpen` in
 * c4x.pegjs): it counts only the braces it is about to match as block openers,
 * so a brace inside a label never counts and a quote inside a label cannot hide
 * one. The PlantUML and Structurizr parsers apply the same value.
 */

/** At most this many boundaries, nodes and subgraphs may be open at once. 8 times the deepest real diagram. */
export const MAX_NESTING_DEPTH = 32;

/** The message every parser uses when the bound is exceeded. */
export function nestingDepthMessage(maxDepth = MAX_NESTING_DEPTH): string {
    return `Nesting is deeper than ${maxDepth} levels. C4X allows at most ${maxDepth} nested boundaries, nodes and subgraphs.`;
}
