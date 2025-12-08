const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Correct path relative to CWD (root)
const rootDir = 'assets/cloud/GCP';
const outPath = 'src/assets/gcp-icons.ts';

console.log(`Scanning ${rootDir}...`);

const files = glob.sync('**/*512-color*.svg', { cwd: rootDir });

if (files.length === 0) {
    console.error('No SVG files found! Check path.');
    process.exit(1);
}

let output = `import { Sprite } from './icons';\n\nexport const GCP_SPRITES: Record<string, Sprite> = {\n`;
let count = 0;

files.forEach(file => {
    const fullPath = path.join(rootDir, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    
    // Extract styles (class -> color mapping)
    const styleMap = {};
    const styleRegex = /\.([a-zA-Z0-9_-]+)\s*\{\s*fill:\s*(#[a-fA-F0-9]+);/g;
    let styleMatch;
    
    // Scan all style blocks
    while ((styleMatch = styleRegex.exec(content)) !== null) {
        styleMap[styleMatch[1]] = styleMatch[2];
    }

    // Extract content inside <g id="art">
    let artContent = '';
    const artMatch = content.match(/<g id="art">([\s\S]*?)<\/g>/);
    
    if (artMatch) {
        artContent = artMatch[1];
    } else {
        // Fallback: try to find the main group if id="art" is missing but structure implies it
        // Some might just be directly under svg.
        // Let's assume complex content if art is missing is valid to take if stripped of defs/metadata.
        // But to be safe, skipping mostly or logging warning.
        // console.warn(`Skipping ${file}: No <g id="art"> found.`);
        return;
    }

    if (artContent) {
        // Replace class="stX" with fill="color"
        let processedContent = artContent.replace(/class="([^ vital]+)"/g, (match, cls) => {
            // cls might be multiple classes? standard seems single.
            const color = styleMap[cls];
            return color ? `fill="${color}"` : match;
        });
        
        // Remove newlines and trim
        processedContent = processedContent.replace(/[\r\n]+/g, '').replace(/\s+/g, ' ').replace(/> </g, '><').trim();
        
        // Escape single quotes
        processedContent = processedContent.replace(/'/g, "\'ի");

        // Generate key
        const filename = path.basename(file);
        // Clean up name: remove -512-color, replace _ with -, lowercase
        let key = filename.replace(/-512-color.*/i, '')
                          .replace(/_/g, '-')
                          .replace(/\s+/g, '-') // Should not happen in basename but just in case
                          .toLowerCase();
        
        // Prefix with gcp-
        key = `gcp-${key}`;

        output += `    '${key}': {
`;
        output += `        body: '${processedContent}',
`;
        output += `        viewBox: '0 0 512 512',
`;
        output += `        preserveColor: true
`;
        output += `    },
`;
        count++;
    }
});

output += `};
`;

fs.writeFileSync(outPath, output);
console.log(`Generated ${outPath} with ${count} icons from ${files.length} source files.`);
