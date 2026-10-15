/**
 * Generates docs/ICONS.md from the sprite map the extension actually ships.
 *
 * The catalogue is derived from `SPRITES` at runtime, not from a regex over the
 * vendor source files: the regex silently dropped every Azure key containing a
 * parenthesis or a plus sign, and the committed catalogue had drifted to 1,100
 * rows for 1,098 vendor sprites. A unit test regenerates this document in memory
 * and fails when the committed file differs, so it cannot drift again.
 *
 *   pnpm exec ts-node --transpile-only scripts/generate-icon-catalog.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { SPRITES } from '../src/assets/icons';

export const OUT_FILE = path.join(__dirname, '../docs/ICONS.md');

const VENDORS: ReadonlyArray<{ name: string; prefix: string }> = [
    { name: 'AWS', prefix: 'aws' },
    { name: 'Google Cloud', prefix: 'gcp' },
    { name: 'Azure', prefix: 'azure' },
];

function vendorOf(key: string): string | undefined {
    return VENDORS.find(vendor => key.startsWith(`${vendor.prefix}-`))?.prefix;
}

/** Renders the whole catalogue for the given sprite keys, deterministically. */
export function renderCatalog(keys: ReadonlyArray<string>): string {
    const sorted = [...keys].sort();
    const lines: string[] = [
        '# C4X Icon Catalog',
        '',
        '> **Usage**: Use `$sprite="c4xicons.<vendor>.<icon-name>"`',
        '> **Example**: `$sprite="c4xicons.aws.s3-bucket"`',
        '',
        'Icon artwork is the property of AWS, Microsoft and Google and is not covered by the MIT licence — see [NOTICE.md](../NOTICE.md) for sources and terms.',
        '',
        'Use `Ctrl+Space` (or `Cmd+Space`) in the editor to search these interactively.',
        '',
        `This file is generated from \`src/assets/icons.ts\` by \`scripts/generate-icon-catalog.ts\` and checked by a unit test; ${sorted.length} sprites ship. Edit the sprite map, not this file.`,
        '',
    ];

    for (const vendor of VENDORS) {
        const vendorKeys = sorted.filter(key => vendorOf(key) === vendor.prefix);
        lines.push(`## ${vendor.name}`, '', `**Namespace**: \`c4xicons.${vendor.prefix}\` — ${vendorKeys.length} icons`, '', '| Icon Name | Usage Key |', '| :--- | :--- |');
        for (const key of vendorKeys) {
            const suffix = key.slice(vendor.prefix.length + 1);
            lines.push(`| ${suffix} | \`c4xicons.${vendor.prefix}.${suffix}\` |`);
        }
        lines.push('');
    }

    const generic = sorted.filter(key => vendorOf(key) === undefined);
    lines.push('## Generic', '', `Built-in C4 shapes with no vendor namespace — ${generic.length} sprites. Use the bare name.`, '', '| Icon Name | Usage Key |', '| :--- | :--- |');
    for (const key of generic) {
        lines.push(`| ${key} | \`${key}\` |`);
    }
    lines.push('');
    return lines.join('\n');
}

if (require.main === module) {
    const markdown = renderCatalog(Object.keys(SPRITES));
    fs.writeFileSync(OUT_FILE, markdown);
    console.log(`Generated ${OUT_FILE}: ${Object.keys(SPRITES).length} sprites`);
}
