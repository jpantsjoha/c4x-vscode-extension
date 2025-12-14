/**
 * Standalone test for Lazy Sprite Auto-Fix Logic
 * This validates the regex replacement used in GeminiService.cleanResponse()
 * 
 * Run with: node scripts/test-lazy-sprite.js
 */

const testCases = [
    {
        name: 'Valid $sprite syntax (no change needed)',
        input: 'Container(Web, "Web App", "React", $sprite="react")',
        expected: 'Container(Web, "Web App", "React", $sprite="react")'
    },
    {
        name: 'Lazy ="value" syntax → $sprite="value"',
        input: 'Container(Web, "Web App", "React", ="react")',
        expected: 'Container(Web, "Web App", "React", $sprite="react")'
    },
    {
        name: 'Person with lazy sprite',
        input: 'Person(User, "NFT Analyst", "Person", ="person")',
        expected: 'Person(User, "NFT Analyst", "Person", $sprite="person")'
    },
    {
        name: 'Multiple lazy sprites in one string',
        input: `Container(Web, "Web App", "React", ="react")
Container(API, "API", "Node", ="node")`,
        expected: `Container(Web, "Web App", "React", $sprite="react")
Container(API, "API", "Node", $sprite="node")`
    },
    {
        name: 'No sprite at all (no change)',
        input: 'Container(Web, "Web App", "React")',
        expected: 'Container(Web, "Web App", "React")'
    },
    {
        name: 'Namespaced icon (already correct)',
        input: 'ContainerDb(DB, "Database", "RDS", $sprite="c4xicons.aws.rds")',
        expected: 'ContainerDb(DB, "Database", "RDS", $sprite="c4xicons.aws.rds")'
    },
    {
        name: 'Lazy namespaced icon',
        input: 'ContainerDb(DB, "Database", "Firestore", ="c4xicons.google.firestore")',
        expected: 'ContainerDb(DB, "Database", "Firestore", $sprite="c4xicons.google.firestore")'
    }
];

// The exact auto-fix logic from GeminiService.ts
function autoFixLazySprites(input) {
    return input.replace(/,\s*="([^"]+)"/g, ', $sprite="$1"');
}

console.log('🧪 Lazy Sprite Auto-Fix Test\n');
console.log('---');

let passed = 0;
let failed = 0;

testCases.forEach((tc, i) => {
    const result = autoFixLazySprites(tc.input);
    const success = result === tc.expected;

    if (success) {
        passed++;
        console.log(`✅ Test ${i + 1}: ${tc.name}`);
    } else {
        failed++;
        console.log(`❌ Test ${i + 1}: ${tc.name}`);
        console.log(`   Input:    ${tc.input.replace(/\n/g, '\\n')}`);
        console.log(`   Expected: ${tc.expected.replace(/\n/g, '\\n')}`);
        console.log(`   Got:      ${result.replace(/\n/g, '\\n')}`);
    }
});

console.log('---');
console.log(`Results: ${passed}/${testCases.length} passed`);

if (failed > 0) {
    console.log('\n⚠️ Some tests failed! The auto-fix logic may not be working correctly.');
    process.exit(1);
} else {
    console.log('\n✅ All tests passed! Auto-fix logic is working correctly.');
    process.exit(0);
}
