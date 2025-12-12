
import * as fs from 'fs';
import * as path from 'path';
import { C4XParser } from '../src/parser/C4XParser';

const parser = new C4XParser();

async function verifyLayoutDocs() {
    const filePath = path.join(__dirname, '../docs/EXAMPLES-LAYOUT.md');
    console.log(`🔍 Verifying ${filePath}...`);

    if (!fs.existsSync(filePath)) {
        console.error('❌ File not found!');
        process.exit(1);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const regex = /```c4x\n([\s\S]*?)```/g;
    let match;
    let totalBlocks = 0;
    let errors = 0;

    while ((match = regex.exec(content)) !== null) {
        totalBlocks++;
        const snippet = match[1];
        try {
            parser.parse(snippet);
            console.log(`✅ Block ${totalBlocks} passed.`);
        } catch (e: any) {
            console.error(`❌ Error in Block ${totalBlocks}:`);
            console.error(e.message);
            console.error('Code snippet start:', snippet.substring(0, 100).replace(/\n/g, '\\n'));
            errors++;
        }
    }

    console.log(`Checked ${totalBlocks} blocks.`);
    if (errors > 0) {
        console.error(`❌ Found ${errors} errors.`);
        process.exit(1);
    } else {
        console.log('✅ All blocks valid.');
    }
}

verifyLayoutDocs();
