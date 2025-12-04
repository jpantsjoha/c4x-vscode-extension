import './mock-vscode';
import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';
import { c4xParser } from '../src/parser/C4XParser';
import { c4ModelBuilder } from '../src/model/C4ModelBuilder';
import { dagreLayoutEngine } from '../src/layout/DagreLayoutEngine';
import { svgBuilder } from '../src/render/SvgBuilder';
import { ModernTheme } from '../src/themes/ModernTheme';

const ASSETS_DIR = path.join(__dirname, '../assets/marketplace/images');
const SAMPLES_DIR = path.join(__dirname, '../samples');

const TASKS = [
    {
        input: path.join(SAMPLES_DIR, 'system-context/banking-system.c4x'),
        output: 'system-context.png',
        width: 800,
        height: 600
    },
    {
        input: path.join(SAMPLES_DIR, 'container/ecommerce-containers.c4x'),
        output: 'containers.png',
        width: 1000,
        height: 800
    },
    {
        input: path.join(SAMPLES_DIR, 'component/api-gateway-components.c4x'),
        output: 'components.png',
        width: 1000,
        height: 800
    }
];

async function generateAssets() {
    console.log('🎨 Generating Marketplace Assets...');
    
    // Ensure output directory exists
    if (!fs.existsSync(ASSETS_DIR)) {
        fs.mkdirSync(ASSETS_DIR, { recursive: true });
    }

    const browser = await chromium.launch();

    for (const task of TASKS) {
        console.log(`Processing ${path.basename(task.input)} -> ${task.output}...`);
        
        try {
            // 1. Read and Parse
            const source = fs.readFileSync(task.input, 'utf-8');
            const parseResult = c4xParser.parse(source);
            const model = c4ModelBuilder.build(parseResult, 'asset-gen');
            
            if (!model.views || model.views.length === 0) {
                throw new Error('No views found');
            }

            // 2. Layout and Render
            const view = model.views[0];
            const layout = dagreLayoutEngine.layoutSync(view); 
            let svg = svgBuilder.build(layout, { theme: ModernTheme });

            // Fix: Replace 100% width/height with actual pixel values for tight crop
            svg = svg.replace('width="100%"', `width="${layout.width}px"`);
            svg = svg.replace('height="100%"', `height="${layout.height}px"`);

            // 3. Render to PNG using Playwright
            const page = await browser.newPage({
                viewport: { width: Math.max(task.width, layout.width), height: Math.max(task.height, layout.height) },
                deviceScaleFactor: 2 // Retina quality
            });

            // Wrap SVG in a minimal container
            const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { 
                        margin: 0; 
                        padding: 0;
                        display: inline-block; /* Shrink wrap */
                    }
                    svg {
                        display: block; /* Remove descender space */
                    }
                </style>
            </head>
            <body>
                ${svg}
            </body>
            </html>`;

            await page.setContent(html);
            
            const svgElement = await page.$('svg');
            
            if (svgElement) {
                await svgElement.screenshot({
                    path: path.join(ASSETS_DIR, task.output),
                    omitBackground: true
                });
            }
            
            console.log(`✅ Generated ${task.output} (${layout.width}x${layout.height})`);
            await page.close();

        } catch (error) {
            console.error(`❌ Failed to generate ${task.output}:`, error);
        }
    }

    await browser.close();
    console.log('✨ Asset generation complete!');
}

generateAssets().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
