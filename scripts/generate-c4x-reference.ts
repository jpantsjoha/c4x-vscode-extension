/**
 * Writes, or with --check verifies, the generated C4X reference (#354):
 *   docs/reference/c4x-reference.json
 *   docs/reference/c4x-reference.md
 *   docs/reference/c4x-reference.schema.json
 *
 * Run it through `pnpm run generate:reference` or `make reference`. `--check`
 * exits 1 and names each file that differs from a fresh run; it writes nothing.
 * The same comparison runs in the unit tests, so `make check` catches drift.
 */
import * as fs from 'fs';
import * as path from 'path';
import { generateAll, repoRoot } from './c4x-reference/generate';

function main(): number {
    const check = process.argv.includes('--check');
    const files = generateAll();
    const stale: string[] = [];
    for (const [relative, text] of Object.entries(files)) {
        const target = path.join(repoRoot(), relative);
        // `relative` is one of the three fixed output paths above.
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : undefined;
        if (current === text) { continue; }
        stale.push(relative);
        if (!check) {
            // eslint-disable-next-line security/detect-non-literal-fs-filename
            fs.mkdirSync(path.dirname(target), { recursive: true });
            // eslint-disable-next-line security/detect-non-literal-fs-filename
            fs.writeFileSync(target, text);
        }
    }
    if (check && stale.length > 0) {
        console.error(`C4X reference is out of date: ${stale.join(', ')}. Run: pnpm run generate:reference`);
        return 1;
    }
    console.log(check ? 'C4X reference is current.' : `C4X reference written (${stale.length} of ${Object.keys(files).length} files changed).`);
    return 0;
}

try {
    process.exitCode = main();
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
}
