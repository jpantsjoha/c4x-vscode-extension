const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Correct path relative to CWD
const rootDir = 'assets/cloud/Azure/Icons';
const outPath = 'src/assets/azure-icons.ts';

console.log(`Scanning ${rootDir}...`);

const files = glob.sync('**/*.svg', { cwd: rootDir });

if (files.length === 0) {
    console.error('No SVG files found! Check path.');
    process.exit(1);
}

const sprites = new Map();

files.forEach(file => {
    const fullPath = path.join(rootDir, file);
    let content = fs.readFileSync(fullPath, 'utf8');
    
    // Extract viewBox
    const viewBoxMatch = content.match(/viewBox="([^"]+)"/);
    const viewBox = viewBoxMatch ? viewBoxMatch[1] : '0 0 18 18'; 

    // Extract content inside <svg> tags
    const bodyMatch = content.match(/<svg[^>]*>([\s\S]*?)<\/svg>/);
    if (bodyMatch) {
        let body = bodyMatch[1];
        
        // Remove newlines and trim
        body = body.replace(/[\r\n]+/g, '').replace(/\s+/g, ' ').replace(/> </g, '><').trim();
        
        // Escape single quotes
        body = body.replace(/'/g, "\'");

        // Generate key
        const filename = path.basename(file, '.svg');
        // Example: 10318-icon-service-Resource-Graph-Explorer
        let key = filename.replace(/^\d+-icon-service-/, '')
                          .replace(/_/g, '-')
                          .replace(/\s+/g, '-')
                          .toLowerCase();
        
        // Remove redundant 'azure-' or 'microsoft-' in the name itself
        key = key.replace(/^azure-/, '').replace(/^microsoft-/, '');
        
        // Prefix with azure-
        key = `azure-${key}`;

        if (!sprites.has(key)) {
            sprites.set(key, {
                body: body,
                viewBox: viewBox,
                preserveColor: true
            });
        }
    }
});

let output = `import { Sprite } from './icons';\n\nexport const AZURE_SPRITES: Record<string, Sprite> = {\n`;

sprites.forEach((sprite, key) => {
    output += `    '${key}': {\n`;
    output += `        body: '${sprite.body}',\n`;
    output += `        viewBox: '${sprite.viewBox}',\n`;
    output += `        preserveColor: true\n`;
    output += `    },\n`;
});

output += `};\n`;

fs.writeFileSync(outPath, output);
console.log(`Generated ${outPath} with ${sprites.size} unique icons from ${files.length} source files.`);