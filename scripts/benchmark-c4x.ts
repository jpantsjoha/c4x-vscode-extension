
import { C4XParser } from '../src/parser/C4XParser';
import { performance } from 'perf_hooks';

// Helper to generate a unique ID
let idInfo = 0;
const nextId = () => `id_${idInfo++}`;

/**
 * Generates a synthetic C4X diagram source string.
 * @param elementCount Total number of elements (Person/System/Container/Component).
 * @param relationshipRatio Number of relationships per element on average.
 * @param depth Max recursion depth for subgraphs (not fully implemented in this simple generator, using flat list for stress testing parser speed).
 */
function generateDiagram(elementCount: number, relationshipRatio: number = 0.5): string {
    const lines: string[] = ['%%{ c4: container }%%', 'graph TB'];
    const ids: string[] = [];

    // Generate Elements
    for (let i = 0; i < elementCount; i++) {
        const id = nextId();
        ids.push(id);
        const type = i % 4 === 0 ? 'Person' : i % 4 === 1 ? 'System' : 'Container';
        lines.push(`  ${type}(${id}, "Element ${i}", "Auto-generated element for stress testing", $sprite="c4xicons.aws.s3-bucket")`);
    }

    // Generate Relationships
    const relCount = Math.floor(elementCount * relationshipRatio);
    for (let i = 0; i < relCount; i++) {
        const src = ids[Math.floor(Math.random() * ids.length)];
        const tgt = ids[Math.floor(Math.random() * ids.length)];
        if (src !== tgt) {
            lines.push(`  ${src} -->|Test Rel ${i}| ${tgt}`);
        }
    }

    return lines.join('\n');
}

/**
 * Generates a deeply nested diagram to test recursion limits.
 */
function generateDeepDiagram(depth: number): string {
    let content = '%%{ c4: container }%%\ngraph TB\n';
    let indent = '';

    // Open subgraphs
    for (let i = 0; i < depth; i++) {
        indent += '  ';
        content += `${indent}subgraph Cluster${i} {\n`;
        content += `${indent}  Container(C${i}, "Container ${i}", "Nested")\n`;
    }

    // Close subgraphs
    for (let i = depth - 1; i >= 0; i--) {
        content += `${indent}}\n`;
        indent = indent.substring(2);
    }

    return content;
}

async function runBenchmark(name: string, generator: () => string) {
    process.stdout.write(`Generating ${name} source... `);
    const source = generator();
    process.stdout.write(`Done (${source.length} chars)\n`);

    const parser = new C4XParser();

    // Warmup
    try {
        parser.parse('%%{ c4: container }%%\ngraph TB\nPerson(P, "P", "D")');
    } catch (e) { }

    const start = performance.now();
    try {
        const result = parser.parse(source);
        const end = performance.now();
        const time = (end - start).toFixed(2);

        console.log(`[PASS] ${name}: Parsed in ${time} ms`);
        console.log(`       Elements: ${result.elements.length}, Relationships: ${result.relationships.length}`);
    } catch (e) {
        const end = performance.now();
        console.error(`[FAIL] ${name}: Failed after ${(end - start).toFixed(2)} ms`);
        console.error(e);
    }
    console.log('-'.repeat(40));
}

async function main() {
    console.log('Starting C4X Performance Benchmarks...\n');

    console.log('Test 1: Small Diagram (~50 elements)');
    await runBenchmark('Small', () => generateDiagram(50));

    console.log('Test 2: Medium Diagram (~500 elements)');
    await runBenchmark('Medium', () => generateDiagram(500));

    console.log('Test 3: Large Diagram (~2000 elements)');
    await runBenchmark('Large', () => generateDiagram(2000));

    console.log('Test 4: Deep Nesting (50 Levels)');
    await runBenchmark('DeepNested', () => generateDeepDiagram(50));

    console.log('Test 5: Very Large Diagram (~5000 elements) - Stress Test');
    await runBenchmark('Extreme', () => generateDiagram(5000));
}

main();
