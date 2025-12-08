import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { C4XParser } from '../src/parser/C4XParser';

const parser = new C4XParser();

async function validateSamplesMarkdown() {
    console.log('🔍 Validating Markdown files in samples/...');
    // Explicitly target samples
    const files = await glob('samples/**/*.md');
    
    let totalBlocks = 0;
    let errors = 0;

    for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        const regex = /```c4x\n([\s\S]*?)```/g;
        let match;
        
        while ((match = regex.exec(content)) !== null) {
            totalBlocks++;
            try {
                parser.parse(match[1]);
            } catch (e: any) {
                console.error(`❌ Error in ${file}:`);
                console.error(e.message);
                console.error('Code snippet start:', match[1].substring(0, 50).replace(/\n/g, '\\n'));
                errors++;
            }
        }
    }

    console.log(`Checked ${files.length} files, ${totalBlocks} blocks.`);
    if (errors > 0) {
        process.exit(1);
    } else {
        console.log('✅ All samples Markdown valid.');
    }
}

validateSamplesMarkdown();
