const fs = require('fs');
const path = require('path');

// Try to resolve the C4ModelBuilder and Parser from the built output
// Adjust relative path as needed (assuming script is in /scripts/ and outputs are in /out/src/)
const builderPath = path.resolve(__dirname, '../out/src/model/C4ModelBuilder');
const parserPath = path.resolve(__dirname, '../out/src/parser/C4XParser');

let C4ModelBuilder, c4xParser;

try {
    const builderModule = require(builderPath);
    C4ModelBuilder = builderModule.C4ModelBuilder;

    // Note: Depends on how C4XParser is exported in the built JS
    const parserModule = require(parserPath);
    c4xParser = parserModule.c4xParser;
} catch (e) {
    console.error('❌ Could not load C4X modules. Ensure the project is built (npm run build).');
    console.error('Error:', e.message);
    process.exit(1);
}

const builder = new C4ModelBuilder();

const args = process.argv.slice(2);
if (args.length === 0) {
    console.log('Usage: node scripts/verify_c4x.js <file1.md> <file2.md> ...');
    process.exit(0);
}

let hasError = false;
let totalBlocks = 0;

console.log(`🔍 Verifying C4X syntax in ${args.length} files...`);

args.forEach(filePath => {
    if (!fs.existsSync(filePath)) {
        console.warn(`File not found: ${filePath}`);
        return;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    // Regex matches ```c4x at start of line, captures content, ends with ``` at start of line
    const regex = /^```c4x\r?\n([\s\S]*?)^```/gm;
    let match;
    let blockIndex = 1;

    while ((match = regex.exec(content)) !== null) {
        totalBlocks++;
        const blockContent = match[1];
        try {
            // 1. Parse (Syntax Check)
            const parseResult = c4xParser.parse(blockContent.trim());

            // 2. Build (Semantic Check - Relationships, Element Types)
            builder.build(parseResult, 'verification-workspace');

        } catch (e) {
            console.error(`\n❌ Error in ${path.basename(filePath)} (Block ${blockIndex}):`);
            console.error(`   ${e.message}`);
            if (e.location && e.location.start) {
                console.error(`   At Line: ${e.location.start.line}, Column: ${e.location.start.column}`);
            } else if (e.line) {
                // C4ModelBuilder errors often have line/column in the error object itself if not in location
                console.error(`   At Line: ${e.line}, Column: ${e.column}`);
            }
            hasError = true;
        }
        blockIndex++;
    }
});

console.log(`\n--------------------------------------------------`);
if (hasError) {
    console.log(`❌ Verification FAILED.`);
    process.exit(1);
} else {
    console.log(`✅ Verification PASSED. Checked ${totalBlocks} blocks.`);
    process.exit(0);
}
