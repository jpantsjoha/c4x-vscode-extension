
import * as fs from 'fs';
import * as path from 'path';

// Paths to icon files
const ASSETS_DIR = path.join(__dirname, '../src/assets');
const OUT_FILE = path.join(__dirname, '../docs/ICONS.md');

const VENDORS = [
    { name: 'AWS', file: 'aws-icons.ts', prefix: 'aws-' },
    { name: 'Google Cloud', file: 'gcp-icons.ts', prefix: 'gcp-' },
    { name: 'Azure', file: 'azure-icons.ts', prefix: 'azure-' }
];

function extractKeys(filePath: string): string[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const regex = /'([a-zA-Z0-9-]+)':/g;
    const keys: string[] = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
        keys.push(match[1]);
    }
    return keys.sort();
}

const generateMarkdownTable = (baseKey: string, sprites: Record<string, any>) => {
    let md = `**Namespace**: \`${baseKey}\`\n\n`;
    md += `| Icon Name | Usage Key |\n`;
    md += `| :--- | :--- |\n`;

    const sortedKeys = Object.keys(sprites).sort();
    const uniqueShortKeys = new Set<string>();

    for (const key of sortedKeys) {
        // key is something like 'aws-s3-bucket'
        const suffix = key.split('-').slice(1).join('-');

        // Show all available keys as valid options, unless exact duplicate
        if (!uniqueShortKeys.has(key)) {
            uniqueShortKeys.add(key);
            md += `| ${suffix} | \`${baseKey}.${suffix}\` |\n`;
        }
    }
    return md;
};

function generateMarkdown() {
    let md = '# C4X Icon Catalog\n\n';
    md += '> **Usage**: Use `$sprite="c4xicons.<vendor>.<icon-name>"`\n';
    md += '> **Example**: `$sprite="c4xicons.aws.s3-bucket"`\n\n';
    md += 'Use `Ctrl+Space` (or `Cmd+Space`) in the editor to search these interactively.\n\n';

    VENDORS.forEach(vendor => {
        md += `## ${vendor.name}\n\n`;

        try {
            const keys = extractKeys(path.join(ASSETS_DIR, vendor.file));
            const sprites: Record<string, any> = {};
            keys.forEach(key => {
                sprites[key] = true; // Value doesn't matter, just need the key
            });
            md += generateMarkdownTable(`c4xicons.${vendor.prefix.replace('-', '')}`, sprites);
            md += '\n';
            console.log(`Processed ${vendor.name}: ${keys.length} icons`);
        } catch (e) {
            console.error(`Error processing ${vendor.name}:`, e);
        }
    });

    fs.writeFileSync(OUT_FILE, md);
    console.log(`Generated ${OUT_FILE}`);
}

generateMarkdown();
