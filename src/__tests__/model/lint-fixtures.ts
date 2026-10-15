/**
 * Shared lint fixtures. Not a spec file: imported by the lint unit suite and by
 * `test/benchmarks/performance.bench.ts`, so the benchmark measures the same
 * model the unit suite proves correct.
 */
import { C4XParser } from '../../parser/C4XParser';
import { c4ModelBuilder } from '../../model/C4ModelBuilder';
import type { C4Model } from '../../model/C4Model';

const parser = new C4XParser();

/** Parse and build native C4X exactly as the preview and diagnostics do. */
export function modelFromC4X(source: string): C4Model {
    return c4ModelBuilder.build(parser.parse(source), 'lint-fixture');
}

/** How the generated model breaks the rules, so a test can predict every count. */
export interface GeneratedLintModel {
    readonly source: string;
    readonly elementCount: number;
    readonly relationshipCount: number;
    readonly expected: Readonly<Record<'C4X-L001' | 'C4X-L002' | 'C4X-L003' | 'C4X-L004' | 'C4X-L005', number>>;
}

/**
 * A container view with `containers` containers inside a system boundary and
 * `systems` software systems outside it, half of them marked external.
 *
 * Container i has a description when i is even and a technology when i is a
 * multiple of 3. Container i uses container i + 1, labelled when i is even and
 * with a protocol when i is a multiple of 5. Container i also calls system
 * i (when that system exists) with a label and a protocol, so those
 * relationships are clean. Every rule not named in `expected` is satisfied.
 */
export function generateLintModel(containers = 180, systems = 20): GeneratedLintModel {
    const lines = ['%%{ c4: container }%%', 'graph TB', '    System_Boundary(scope, "System in scope") {'];
    let missingDescription = 0;
    let missingTechnology = 0;
    for (let i = 0; i < containers; i++) {
        const technology = i % 3 === 0 ? `"Tech ${i}"` : '';
        const description = i % 2 === 0 ? `"Does thing ${i}"` : '';
        if (!description) { missingDescription++; }
        if (!technology) { missingTechnology++; }
        // Positional arguments: a description needs a technology slot before it.
        const args = [`c${i}`, `"Container ${i}"`];
        if (technology || description) { args.push(technology || '""'); }
        if (description) { args.push(description); }
        lines.push(`        Container(${args.join(', ')})`);
    }
    lines.push('    }');
    for (let s = 0; s < systems; s++) {
        lines.push(`    ${s % 2 === 0 ? 'System_Ext' : 'System'}(s${s}, "System ${s}", "Neighbour ${s}")`);
    }

    let unlabelled = 0;
    let noProtocol = 0;
    let relationships = 0;
    for (let i = 0; i + 1 < containers; i++) {
        const label = i % 2 === 0 ? `|Calls ${i}|` : '';
        const protocol = i % 5 === 0 ? ' "HTTPS"' : '';
        if (!label) { unlabelled++; }
        if (!protocol) { noProtocol++; }
        relationships++;
        lines.push(`    c${i} -->${label}${protocol} c${i + 1}`);
    }
    for (let s = 0; s < systems && s < containers; s++) {
        relationships++;
        lines.push(`    c${s} -->|Sends notifications to| "AMQP" s${s}`);
    }

    return {
        source: lines.join('\n'),
        elementCount: containers + systems,
        relationshipCount: relationships,
        expected: {
            'C4X-L001': missingDescription,
            'C4X-L002': missingTechnology,
            'C4X-L003': unlabelled,
            'C4X-L004': noProtocol,
            'C4X-L005': Math.floor(systems / 2),
        },
    };
}
