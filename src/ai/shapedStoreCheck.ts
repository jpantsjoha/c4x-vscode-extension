// What the live gate asks of a generated container view (#330): it parses,
// lints clean (no warning or error finding), and holds at least one data store
// drawn with a shape of its own. Pure and headless, so a unit test can run the
// same check on canned text and the live gate on a model's answer.

import type { C4Element } from '../model/C4Model';
import { c4ModelBuilder } from '../model/C4ModelBuilder';
import { c4xParser } from '../parser/C4XParser';
import { lintC4xSource } from '../cli/lintSource';

/** Shapes that mark a data store. */
const DATA_STORE_SHAPES: ReadonlySet<string> = new Set(['Cylinder', 'Bucket', 'Folder', 'Pipe']);

function* walk(elements: readonly C4Element[]): Generator<C4Element> {
    for (const element of elements) {
        yield element;
        yield* walk(element.children ?? []);
    }
}

/** Problems with a generated diagram; an empty list passes. */
export function shapedDataStoreProblems(text: string): string[] {
    const problems: string[] = [];
    try {
        const model = c4ModelBuilder.build(c4xParser.parse(text), 'live');
        const shaped = model.views.flatMap(view => [...walk(view.elements)])
            .filter(element => element.shape !== undefined && DATA_STORE_SHAPES.has(element.shape));
        if (shaped.length === 0) {
            problems.push('no element carries a data store $shape (Cylinder, Bucket, Folder or Pipe)');
        }
    } catch (error) {
        return [`does not parse: ${error instanceof Error ? error.message : String(error)}`];
    }
    for (const finding of lintC4xSource(text, {})) {
        if (finding.severity !== 'info') {
            problems.push(`${finding.ruleId} ${finding.severity}: ${finding.message}`);
        }
    }
    return problems;
}
