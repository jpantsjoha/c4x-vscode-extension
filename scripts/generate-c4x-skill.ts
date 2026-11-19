/**
 * Builds skills/c4x/references/syntax.md (#355) from docs/reference/c4x-reference.json (#354).
 * Nothing about the notation is retyped: the file is a condensed view of the generated reference.
 * `--check` exits 1 when the committed file differs from a fresh build.
 */
import * as fs from 'fs';
import * as path from 'path';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const SKILL_REFERENCE_PATH = 'skills/c4x/references/syntax.md';
export const SKILL_LINT_PATH = 'skills/c4x/scripts/c4x-lint.cjs';
export const LINT_SOURCE_PATH = 'cli/c4x-lint.cjs';
const REFERENCE_JSON = 'docs/reference/c4x-reference.json';

export function repoRoot(): string {
    return path.resolve(__dirname, '..');
}

export function buildSkillReference(ref: any): string {
    const out: string[] = [];
    const push = (...lines: string[]) => out.push(...lines);
    const code = (s: string) => `\`${s}\``;
    push('# C4X syntax reference for the c4x skill', '',
        'Generated from `docs/reference/c4x-reference.json` by `pnpm run generate:skill`. Do not edit by hand.', '');

    const doc = ref.document;
    push('## Document', '',
        `- First line: ${code(doc.viewDeclaration.form)}. ${doc.viewDeclaration.summary} Default: ${code(doc.viewDeclaration.default)}.`,
        `- Direction: ${code(doc.graphLine.form)}, one of ${doc.graphLine.directions.map(code).join(', ')}. ${doc.graphLine.summary}`,
        `- Comments: ${code(doc.comment.marker)}. ${doc.comment.summary}`, '');

    push('## Views', '', '| View | Level | Shows |', '|---|---|---|');
    for (const v of ref.viewTypes) push(`| ${code(v.id)} | ${v.level} | ${v.summary} |`);
    push('');

    push('## Elements', '', `Call form: ${code(ref.elementCall.form)}.`, '');
    for (const k of ref.elementKinds) {
        push(`### ${k.kind}`, '', k.summary, '', `Example: ${code(k.example)}`, '',
            `Spellings: ${k.spellings.filter((s: any) => s.callForm).map((s: any) => code(s.name)).join(', ')}.`, '');
    }

    push('## Where each element may sit', '');
    for (const view of Object.keys(ref.placement)) {
        push(`- ${code(view)}`);
        for (const [scope, kinds] of Object.entries<any>(ref.placement[view])) {
            push(`  - ${scope}: ${kinds.length ? kinds.map(code).join(', ') : 'nothing'}`);
        }
    }
    push('');

    push('## Relationships', '', `Form: ${code(ref.relationships.form)}.`, '', '| Arrow | Use |', '|---|---|');
    for (const a of ref.relationships.arrows) push(`| ${code(a.arrow)} | ${a.summary} |`);
    push('', ref.relationships.technologyNote, '');

    push('## Boundaries', '');
    for (const b of ref.boundaries) push(`- ${code(b.form)}: ${b.summary}`);
    push('');

    push('## Attributes', '');
    for (const [key, text] of Object.entries<any>(ref.attributes.known)) push(`- ${code('$' + key)}: ${text}`);
    push(`- Other keys: ${ref.attributes.other}`, '');

    push('## Styles', '', 'Style elements by tag with `elementStyle TagName $key="value", ...` at the top level. Every value is quoted.', '',
        '| Key | Accepts | Example |', '|---|---|---|');
    for (const k of ref.styles.keys) push(`| ${code('$' + k.key)} | ${k.accepts} ${k.summary} | ${code(k.example)} |`);
    push('', ref.styles.tagMatching, '', ref.styles.shapeNote, '',
        `Shapes drawn today: ${ref.styles.shapes.filter((x: any) => x.drawn).map((x: any) => code(x.name)).join(', ')}. Valid but drawn as the theme rectangle: ${ref.styles.shapes.filter((x: any) => !x.drawn).map((x: any) => code(x.name)).join(', ')}.`, '',
        'Style diagnostics:', '');
    for (const d of ref.styles.diagnostics) push(`- ${d.id} (${d.severity}): ${d.summary}`);
    push('');

    const safe = ref.textLimits.safeForAnyKind;
    push('## Text limits', '',
        `Element text is not wrapped (${ref.textLimits.issue}). Safe for any kind: at most **${safe.label}** characters in a label, **${safe.technology}** in a technology and **${safe.description}** in a description.`, '',
        '| Kind | Label | Technology | Description |', '|---|---|---|---|');
    for (const k of ref.textLimits.kinds) {
        push(`| ${k.kind} | ${k.maxCharacters.label} | ${k.maxCharacters.technology} | ${k.maxCharacters.description} |`);
    }
    push('');

    push('## Lint', '', `Default severity of every rule: ${code(ref.lint.defaultSeverity)}.`, '');
    for (const note of ref.lint.cliNotes) push(`- ${note}`);
    push('', '| Id | Applies to | Levels |', '|---|---|---|');
    for (const r of ref.lint.rules) push(`| ${r.id} | ${r.appliesTo} | ${r.levels.join(', ')} |`);
    push('', 'What each finding says and how to fix it:', '');
    for (const r of ref.lint.rules) push(`- ${r.id}: ${r.exampleFinding.message} Fix: ${r.exampleFinding.hint}`);
    push('');
    for (const d of ref.lint.otherDiagnostics) push(`- ${d.id} (${d.severity}): ${d.summary}`);
    push('');

    push('## Rules for writing C4X', '');
    for (const rule of ref.authoringRules) push(`- ${rule}`);
    push('', '## Known limitations', '');
    for (const l of ref.knownLimitations) push(`- ${l.issue}: ${l.text}`);
    push('');

    push('## Examples', '', 'Each example parses and lints with no finding at `info`.', '');
    for (const e of ref.examples) push(`### ${e.id}`, '', e.summary, '', '```c4x', e.source, '```', '');
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

export function generate(): string {
    const ref = JSON.parse(fs.readFileSync(path.join(repoRoot(), REFERENCE_JSON), 'utf8'));
    return buildSkillReference(ref);
}

if (require.main === module) {
    const target = path.join(repoRoot(), SKILL_REFERENCE_PATH);
    const lintSrc = path.join(repoRoot(), LINT_SOURCE_PATH);
    const lintTarget = path.join(repoRoot(), SKILL_LINT_PATH);
    const fresh = generate();
    if (process.argv.includes('--check')) {
        const same = fs.existsSync(target) && fs.readFileSync(target, 'utf8') === fresh;
        if (!same) {
            console.error(`${SKILL_REFERENCE_PATH} is stale. Run: pnpm run generate:skill`);
            process.exit(1);
        }
        console.log(`${SKILL_REFERENCE_PATH} is current.`);
        const lintSame = fs.existsSync(lintTarget) && fs.readFileSync(lintTarget).equals(fs.readFileSync(lintSrc));
        if (!lintSame) {
            console.error(`${SKILL_LINT_PATH} differs from ${LINT_SOURCE_PATH}. Run: pnpm run generate:skill`);
            process.exit(1);
        }
        console.log(`${SKILL_LINT_PATH} is current.`);
    } else {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, fresh);
        console.log(`wrote ${SKILL_REFERENCE_PATH}`);
        fs.copyFileSync(lintSrc, lintTarget);
        console.log(`wrote ${SKILL_LINT_PATH}`);
    }
}
