import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { C4XParser } from '../src/parser/C4XParser';

// Colors for console output
const colors = {
    reset: "\x1b[0m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    bold: "\x1b[1m"
};

async function validateMarkdownFiles() {
    console.log(`${colors.blue}${colors.bold}🔍 Starting C4X Markdown Syntax Validation...${colors.reset}\n`);

    const parser = new C4XParser();
    let totalBlocks = 0;
    let failedBlocks = 0;
    let filesWithErrors = 0;

    // Find all markdown files
    const files = await glob('**/*.md', { 
        ignore: [
            'node_modules/**', 
            'out/**', 
            'dist/**', 
            '.github/**', 
            'test/**',
            'docs/archive/**',
            'docs/phases/**'
        ] 
    });

    for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        
        // Regex to capture c4x code blocks
        // Matches ```c4x [content] ```
        const codeBlockRegex = /```c4x\n([\s\S]*?)```/g;
        
        let match;
        let hasError = false;
        let fileHeaderPrinted = false;

        while ((match = codeBlockRegex.exec(content)) !== null) {
            totalBlocks++;
            const code = match[1];
            
            // Calculate line number of the block start
            const linesUpToBlock = content.substring(0, match.index).split('\n');
            const startLine = linesUpToBlock.length;

            try {
                parser.parse(code);
            } catch (error: any) {
                failedBlocks++;
                hasError = true;

                if (!fileHeaderPrinted) {
                    console.log(`${colors.bold}📄 File: ${file}${colors.reset}`);
                    fileHeaderPrinted = true;
                }

                console.error(`${colors.red}  ✖ Parse Error at line ${startLine}:${colors.reset}`);
                console.error(`    ${error.message}`);
                
                // Show context (first few lines of the block)
                const codePreview = code.split('\n').slice(0, 3).map(l => `      > ${l}`).join('\n');
                console.error(`    Context:\n${codePreview}\n`);
            }
        }

        if (hasError) {
            filesWithErrors++;
        }
    }

    console.log(`\n${colors.bold}📊 Validation Summary:${colors.reset}`);
    console.log(`  Files Scanned: ${files.length}`);
    console.log(`  C4X Blocks Found: ${totalBlocks}`);
    
    if (failedBlocks > 0) {
        console.error(`${colors.red}  ✖ Errors Found: ${failedBlocks} blocks in ${filesWithErrors} files${colors.reset}`);
        process.exit(1);
    } else {
        console.log(`${colors.green}  ✅ All C4X examples are valid!${colors.reset}`);
        process.exit(0);
    }
}

validateMarkdownFiles().catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
});
