import './mock-vscode';
import * as fs from 'fs';
import * as path from 'path';
import { c4xParser } from '../src/parser/C4XParser';
import { c4ModelBuilder } from '../src/model/C4ModelBuilder';
import { dagreLayoutEngine } from '../src/layout/DagreLayoutEngine';
import { svgBuilder } from '../src/render/SvgBuilder';

import { ModernTheme } from '../src/themes/ModernTheme';

async function generateSvg(inputPath: string, outputPath: string) {
    try {
        console.log(`Reading ${inputPath}...`);
        const source = fs.readFileSync(inputPath, 'utf-8');

        console.log('Parsing...');
        const parseResult = c4xParser.parse(source);

        console.log('Building model...');
        const model = c4ModelBuilder.build(parseResult, 'script');

        if (!model.views || model.views.length === 0) {
            throw new Error('No views found in diagram');
        }

        console.log('Layouting...');
        // Use layoutSync as we found it in the code
        const view = model.views[0];
        const layout = dagreLayoutEngine.layoutSync(view);

        console.log('Rendering SVG with Modern Theme...');
        const svg = svgBuilder.build(layout, { theme: ModernTheme });

        console.log(`Writing to ${outputPath}...`);
        fs.writeFileSync(outputPath, svg);

        // Also create a HTML wrapper for easier viewing
        const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: sans-serif; padding: 20px; background: #f0f0f0; }
        .container { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h1 { margin-top: 0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Preview: ${path.basename(inputPath)}</h1>
        ${svg}
    </div>
</body>
</html>`;
        fs.writeFileSync(outputPath + '.html', html);

        console.log('Done!');
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

const input = process.argv[2];
const output = process.argv[3];

if (!input || !output) {
    console.error('Usage: ts-node scripts/generate-svg.ts <input.c4x> <output.svg>');
    process.exit(1);
}

generateSvg(input, output);
