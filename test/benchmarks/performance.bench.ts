/**
 * Performance Benchmarks
 * Validates performance claims:
 * - Parser: < 50ms
 * - Total pipeline: < 200ms
 * - Notation lint of a 200-element model: < 5ms (#214)
 * - Headless render (render_c4x, c4x render): each Internet Banking System
 *   fixture < 250ms; every adversarial shape at the render bounds within the
 *   render time budget; 2,000 elements measured to show why the render
 *   bounds are lower than the parser-side limit (#353)
 */

import '../../scripts/mock-vscode';
import { c4xParser } from '../../src/parser/C4XParser';
import { PlantUMLParser } from '../../src/parser/plantuml/PlantUMLParser';
import { c4ModelBuilder } from '../../src/model/C4ModelBuilder';
import { dagreLayoutEngine } from '../../src/layout/DagreLayoutEngine';
import { svgBuilder } from '../../src/render/SvgBuilder';
import { ClassicTheme } from '../../src/themes/ClassicTheme';
import { lintModel } from '../../src/model/lint';
import { generateLintModel } from '../../src/__tests__/model/lint-fixtures';
import { MAX_RENDER_ELEMENTS, MAX_RENDER_RELATIONSHIPS, RENDER_TIME_BUDGET_MS, checkC4xSource } from '../../src/cli/renderSource';
import { normalizeLintOptions } from '../../src/model/lint';
import { RENDER_SHAPES, adversarialSource } from '../../src/__tests__/cli/renderCorpus';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Sample C4X diagram for benchmarking
 */
const SAMPLE_C4X = `
%%{ c4: container }%%
graph TB
  Person(customer, "Personal Banking Customer", "Uses online banking")
  Person(admin, "Bank Administrator", "Operates the platform")
  System_Boundary(banking, "Internet Banking System") {
    Container(webapp, "Web Application", "Angular", "Browser experience")
    Container(api, "API Application", "Java and Spring Boot", "JSON API")
    ContainerDb(db, "Database", "Oracle", "Stores account data")
  }
  System_Ext(email, "E-mail System", "Sends notifications")
  System_Ext(mainframe, "Mainframe Banking System", "Core banking")
  customer -->|Uses| webapp
  admin -->|Administers| webapp
  webapp -->|Makes API calls to| api
  api -->|Reads from and writes to| db
  api -->|Sends e-mail using| email
  api -->|Makes API calls to| mainframe
`;

/**
 * Sample PlantUML C4 diagram
 */
const SAMPLE_PLANTUML = `
@startuml
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Container.puml

Person(customer, "Personal Banking Customer")
Person(admin, "Bank Administrator")
System_Ext(email, "E-mail System")
System_Ext(mainframe, "Mainframe Banking System")

Container(webapp, "Web Application", "JavaScript, Angular", "Provides banking functionality")
Container(api, "API Application", "Java, Spring Boot", "Provides banking functionality via JSON/HTTPS API")
ContainerDb(db, "Database", "Oracle Database", "Stores user data")

Rel(customer, webapp, "Uses", "HTTPS")
Rel(webapp, api, "Makes API calls to", "JSON/HTTPS")
Rel(api, db, "Reads from and writes to", "JDBC")
Rel(api, email, "Sends email using", "SMTP")
Rel(api, mainframe, "Makes API calls to", "XML/HTTPS")

@enduml
`;

/**
 * Performance measurement utilities
 */
class PerformanceMeasure {
    private name: string;
    private iterations: number;
    private times: number[] = [];

    constructor(name: string, iterations: number = 10) {
        this.name = name;
        this.iterations = iterations;
    }

    measure(fn: () => void): void {
        // Warm-up (JIT optimization)
        for (let i = 0; i < 3; i++) {
            fn();
        }

        // Actual measurements
        this.times = [];
        for (let i = 0; i < this.iterations; i++) {
            const start = performance.now();
            fn();
            const end = performance.now();
            this.times.push(end - start);
        }
    }

    getResults() {
        const sorted = [...this.times].sort((a, b) => a - b);
        const avg = this.times.reduce((a, b) => a + b, 0) / this.times.length;
        const median = sorted[Math.floor(sorted.length / 2)];
        const min = sorted[0];
        const max = sorted[sorted.length - 1];
        const p95 = sorted[Math.floor(sorted.length * 0.95)];

        return {
            name: this.name,
            iterations: this.iterations,
            avg,
            median,
            min,
            max,
            p95,
        };
    }

    report(): string {
        const results = this.getResults();
        return `
${results.name}:
  Iterations: ${results.iterations}
  Average:    ${results.avg.toFixed(2)}ms
  Median:     ${results.median.toFixed(2)}ms
  Min:        ${results.min.toFixed(2)}ms
  Max:        ${results.max.toFixed(2)}ms
  P95:        ${results.p95.toFixed(2)}ms`;
    }
}

/**
 * Run all benchmarks
 */
export function runBenchmarks(): void {
    console.log('\n========================================');
    console.log('C4X EXTENSION PERFORMANCE BENCHMARKS');
    console.log('========================================\n');

    // 1. Parser Benchmarks
    console.log('--- PARSER PERFORMANCE ---\n');

    const c4xParserBench = new PerformanceMeasure('C4X Parser', 100);
    c4xParserBench.measure(() => {
        c4xParser.parse(SAMPLE_C4X);
    });
    console.log(c4xParserBench.report());

    const plantumlParserBench = new PerformanceMeasure('PlantUML Parser', 100);
    plantumlParserBench.measure(() => {
        const parser = new PlantUMLParser(SAMPLE_PLANTUML);
        parser.parse();
    });
    console.log(plantumlParserBench.report());

    // 2. Model Builder Benchmark
    console.log('\n--- MODEL BUILDER PERFORMANCE ---\n');

    const parseResult = c4xParser.parse(SAMPLE_C4X);
    const modelBuilderBench = new PerformanceMeasure('Model Builder', 100);
    modelBuilderBench.measure(() => {
        c4ModelBuilder.build(parseResult, 'benchmark');
    });
    console.log(modelBuilderBench.report());

    // 3. Layout Engine Benchmark
    console.log('\n--- LAYOUT ENGINE PERFORMANCE ---\n');

    const model = c4ModelBuilder.build(parseResult, 'benchmark');
    const view = model.views[0];
    const layoutBench = new PerformanceMeasure('Dagre Layout', 100);
    layoutBench.measure(() => {
        dagreLayoutEngine.layoutSync(view);
    });
    console.log(layoutBench.report());

    // 4. SVG Renderer Benchmark
    console.log('\n--- SVG RENDERER PERFORMANCE ---\n');

    const layout = dagreLayoutEngine.layoutSync(view);
    const svgBench = new PerformanceMeasure('SVG Builder', 100);
    svgBench.measure(() => {
        svgBuilder.build(layout, { theme: ClassicTheme });
    });
    console.log(svgBench.report());

    // 5. Full Pipeline Benchmark
    console.log('\n--- FULL PIPELINE PERFORMANCE ---\n');

    const pipelineBench = new PerformanceMeasure('Full Pipeline (Parse→Layout→Render)', 100);
    pipelineBench.measure(() => {
        const parsed = c4xParser.parse(SAMPLE_C4X);
        const built = c4ModelBuilder.build(parsed, 'benchmark');
        const layouted = dagreLayoutEngine.layoutSync(built.views[0]);
        svgBuilder.build(layouted, { theme: ClassicTheme });
    });
    console.log(pipelineBench.report());

    // 6. Notation Lint Benchmark — the model the unit suite proves correct
    console.log('\n--- NOTATION LINT PERFORMANCE ---\n');

    const lintFixture = generateLintModel();
    const lintInput = c4ModelBuilder.build(c4xParser.parse(lintFixture.source), 'benchmark');
    const lintBench = new PerformanceMeasure(
        `Notation lint (${lintFixture.elementCount} elements, ${lintFixture.relationshipCount} relationships)`,
        200,
    );
    lintBench.measure(() => {
        lintModel(lintInput);
    });
    console.log(lintBench.report());

    // 7. Headless render (#353)
    console.log('\n--- HEADLESS RENDER PERFORMANCE (render_c4x, c4x render) ---\n');

    const renderLint = normalizeLintOptions(true, undefined);
    const ibsDir = path.join(__dirname, '..', '..', 'src', '__tests__', 'snapshots', 'fixtures', 'ibs');
    let ibsWorst = { name: '', p95: 0 };
    for (const file of fs.readdirSync(ibsDir).filter(name => name.endsWith('.c4x')).sort()) {
        const source = fs.readFileSync(path.join(ibsDir, file), 'utf8');
        const bench = new PerformanceMeasure(`render ${file} (c4-model)`, 20);
        bench.measure(() => { checkC4xSource(source, { lint: renderLint, theme: 'c4-model' }); });
        const results = bench.getResults();
        console.log(`  ${file.padEnd(34)} avg ${results.avg.toFixed(2)}ms  P95 ${results.p95.toFixed(2)}ms`);
        if (results.p95 > ibsWorst.p95) { ibsWorst = { name: file, p95: results.p95 }; }
    }
    let shapeWorst = { name: '', ms: 0 };
    for (const shape of RENDER_SHAPES) {
        const source = adversarialSource(shape, MAX_RENDER_ELEMENTS, MAX_RENDER_RELATIONSHIPS);
        const times: number[] = [];
        for (let run = 0; run < 3; run++) {
            const started = performance.now();
            checkC4xSource(source, { lint: renderLint });
            times.push(performance.now() - started);
        }
        const median = [...times].sort((a, b) => a - b)[1];
        console.log(`  ${`${shape} at the bounds (${MAX_RENDER_ELEMENTS} elements, ${MAX_RENDER_RELATIONSHIPS} relationships)`.padEnd(62)} median ${median.toFixed(0)}ms`);
        if (median > shapeWorst.ms) { shapeWorst = { name: shape, ms: median }; }
    }
    // Informational: the parser-side element limit, laid out once without the render bound.
    {
        const built = c4ModelBuilder.build(c4xParser.parse(adversarialSource('flat', 2000, 3000)), 'benchmark');
        const started = performance.now();
        dagreLayoutEngine.layoutSync(built.views[0], { theme: ClassicTheme });
        console.log(`  2,000 elements, 3,000 relationships (flat), layout alone: ${(performance.now() - started).toFixed(0)}ms (informational; above the ${RENDER_TIME_BUDGET_MS}ms budget is why the render bounds are lower)`);
    }

    // 8. Performance Targets Validation
    console.log('\n--- PERFORMANCE TARGETS ---\n');

    const c4xResults = c4xParserBench.getResults();
    const pipelineResults = pipelineBench.getResults();
    const lintResults = lintBench.getResults();

    const parseTarget = 50; // ms
    const pipelineTarget = 200; // ms

    console.log(`Target: Parse < ${parseTarget}ms`);
    console.log(`Actual: ${c4xResults.avg.toFixed(2)}ms (P95: ${c4xResults.p95.toFixed(2)}ms)`);
    const parsePassed = c4xResults.p95 < parseTarget;
    console.log(`Status: ${parsePassed ? '✅ PASS' : '❌ FAIL'}`);

    console.log(`\nTarget: Pipeline < ${pipelineTarget}ms`);
    console.log(`Actual: ${pipelineResults.avg.toFixed(2)}ms (P95: ${pipelineResults.p95.toFixed(2)}ms)`);
    const pipelinePassed = pipelineResults.p95 < pipelineTarget;
    console.log(`Status: ${pipelinePassed ? '✅ PASS' : '❌ FAIL'}`);

    const lintTarget = 5; // ms, for a 200-element model
    console.log(`\nTarget: Notation lint (${lintFixture.elementCount} elements) < ${lintTarget}ms`);
    console.log(`Actual: ${lintResults.avg.toFixed(2)}ms (P95: ${lintResults.p95.toFixed(2)}ms)`);
    const lintPassed = lintResults.p95 < lintTarget;
    console.log(`Status: ${lintPassed ? '✅ PASS' : '❌ FAIL'}`);

    const renderIbsTarget = 250; // ms, #352
    console.log(`\nTarget: render of each IBS fixture < ${renderIbsTarget}ms`);
    console.log(`Actual: worst P95 ${ibsWorst.p95.toFixed(2)}ms (${ibsWorst.name})`);
    const renderIbsPassed = ibsWorst.p95 < renderIbsTarget;
    console.log(`Status: ${renderIbsPassed ? '✅ PASS' : '❌ FAIL'}`);

    console.log(`\nTarget: render at the bounds < ${RENDER_TIME_BUDGET_MS}ms for every adversarial shape`);
    console.log(`Actual: worst median ${shapeWorst.ms.toFixed(0)}ms (${shapeWorst.name})`);
    const renderShapesPassed = shapeWorst.ms < RENDER_TIME_BUDGET_MS;
    console.log(`Status: ${renderShapesPassed ? '✅ PASS' : '❌ FAIL'}`);

    // 9. Comparison Table
    console.log('\n--- COMPARATIVE PERFORMANCE ---\n');
    console.log('Component                     | Avg (ms) | P95 (ms) | % of Pipeline');
    console.log('------------------------------|----------|----------|---------------');

    const pipelineAvg = pipelineResults.avg;
    console.log(`C4X Parser                    | ${c4xResults.avg.toFixed(2).padStart(8)} | ${c4xResults.p95.toFixed(2).padStart(8)} | ${((c4xResults.avg / pipelineAvg) * 100).toFixed(1)}%`);
    console.log(`Model Builder                 | ${modelBuilderBench.getResults().avg.toFixed(2).padStart(8)} | ${modelBuilderBench.getResults().p95.toFixed(2).padStart(8)} | ${((modelBuilderBench.getResults().avg / pipelineAvg) * 100).toFixed(1)}%`);
    console.log(`Dagre Layout                  | ${layoutBench.getResults().avg.toFixed(2).padStart(8)} | ${layoutBench.getResults().p95.toFixed(2).padStart(8)} | ${((layoutBench.getResults().avg / pipelineAvg) * 100).toFixed(1)}%`);
    console.log(`SVG Renderer                  | ${svgBench.getResults().avg.toFixed(2).padStart(8)} | ${svgBench.getResults().p95.toFixed(2).padStart(8)} | ${((svgBench.getResults().avg / pipelineAvg) * 100).toFixed(1)}%`);
    console.log(`------------------------------|----------|----------|---------------`);
    console.log(`Total Pipeline                | ${pipelineResults.avg.toFixed(2).padStart(8)} | ${pipelineResults.p95.toFixed(2).padStart(8)} | 100.0%`);

    console.log('\n========================================\n');

    if (!parsePassed || !pipelinePassed || !lintPassed || !renderIbsPassed || !renderShapesPassed) {
        throw new Error('Performance regression: one or more P95 targets were exceeded');
    }
}

// Run benchmarks if executed directly
if (require.main === module) {
    runBenchmarks();
}
