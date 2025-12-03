import './mock-vscode'; // Mock vscode first
import * as fs from 'fs';
// import * as path from 'path'; // Path is no longer directly used for line calcs
import * as glob from 'glob';
import MarkdownIt from 'markdown-it';
import { c4xPlugin } from '../src/markdown/c4xPlugin';
import { c4xParser } from '../src/parser/C4XParser'; // For .c4x files

// Setup MarkdownIt with the C4X plugin
const md = new MarkdownIt();
md.use(c4xPlugin);

interface FileResult {
    file: string;
    syntaxErrors: string[];
    parsedBlocks: number;
}

async function validateAllFiles() {
    console.log('🔍 Running Global Syntax Validation...');

    const results: FileResult[] = [];

    const files = glob.sync('**/*.{md,c4x}', {
        ignore: ['node_modules/**', 'out/**', 'dist/**', '.*/**', 'docs/archive/**', 'docs/phases/**', 'docs/legacy/**', 'docs/marketplace/**']
    });

    for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        const result: FileResult = { file, syntaxErrors: [], parsedBlocks: 0 };

        if (file.endsWith('.c4x')) {
            try {
                c4xParser.parse(content);
                result.parsedBlocks++;
            } catch (e: any) {
                const line = e.location?.start?.line || 1;
                result.syntaxErrors.push(`Line ${line}: ${e.message}`);
            }
        } else if (file.endsWith('.md')) {
            // Use markdown-it to render and check for error blocks
            const htmlOutput = md.render(content);
            
            // Regex to find <div class="c4x-error"> blocks and extract their messages
            const errorRegex = /<div class="c4x-error"[\s\S]*?<pre class="c4x-error-message">([\s\S]*?)<\/pre>/g;
            let match;
            let errorCount = 0;
            while ((match = errorRegex.exec(htmlOutput)) !== null) {
                // The error message from renderError already includes line/column from the parser
                result.syntaxErrors.push(`Markdown Block Error: ${match[1].trim()}`);
                errorCount++;
                if (file.includes('AGENT.md')) {
                    console.log(`\n--- Debug: Failed Block in ${file} ---`);
                    console.log(match[1].trim());
                    console.log('--- End Debug ---\n');
                }
            }

            if (errorCount > 0) {
                result.parsedBlocks = 0; // Indicate failure to parse
            } else {
                // To accurately count parsed blocks, c4xPlugin.ts would need to expose a counter.
                // For now, assume if no errors, it parsed any C4X blocks successfully.
                const c4xBlockCount = (content.match(/```c4x/g) || []).length;
                result.parsedBlocks = c4xBlockCount;
            }
        }

        if (result.syntaxErrors.length > 0) {
            results.push(result);
        }
    }

    // Report
    console.log('\n📊 Validation Report:');
    if (results.length === 0) {
        console.log('✅ All diagrams valid!');
    } else {
        console.log(`❌ Found errors in ${results.length} files:\n`);
        results.forEach(r => {
            console.log(`📄 ${r.file}`);
            r.syntaxErrors.forEach(e => console.log(`   🔴 ${e}`));
            console.log('');
        });
        process.exit(1);
    }
}

validateAllFiles();
