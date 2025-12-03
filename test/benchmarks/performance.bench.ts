/**
 * Performance Benchmarks
 * Validates performance claims:
 * - Parser: < 50ms
 * - Total pipeline: < 200ms
 */

import { c4xParser } from '../../src/parser/C4XParser';
import { PlantUMLParser } from '../../src/parser/plantuml/PlantUMLParser';
import { c4ModelBuilder } from '../../src/model/C4ModelBuilder';
import { dagreLayoutEngine } from '../../src/layout/DagreLayoutEngine';
import { svgBuilder } from '../../src/render/SvgBuilder';
import { ClassicTheme } from '../../src/themes/ClassicTheme';

/**
 * Sample C4X diagram for benchmarking
 */
const SAMPLE_C4X = `
graph BankingSystem

// Elements
person customer "Personal Banking Customer"
person admin "Bank Administrator"
system email "E-mail System" external
system mainframe "Mainframe Banking System" external

container webapp "Web Application" {
  technology "JavaScript, Angular"
  description "Provides banking functionality via web browser"
}

container api "API Application" {
  technology "Java, Spring Boot"
  description "Provides banking functionality via JSON/HTTPS API"
}

container db "Database" {
  technology "Oracle Database"
  description "Stores user registration, hashed credentials, access logs"
}

// Relationships
customer -> webapp "Uses" https
customer -> email "Receives email from"
admin -> webapp "Uses" https
webapp -> api "Makes API calls to" https
api -> db "Reads from and writes to" jdbc
api -> email "Sends email using" smtp
api -> mainframe "Makes API calls to" xml

// Views
view system-context "System Context" {
  include *
}

view container "Container View" {
  include *
}
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

    // 6. Performance Targets Validation
    console.log('\n--- PERFORMANCE TARGETS ---\n');

    const c4xResults = c4xParserBench.getResults();
    const pipelineResults = pipelineBench.getResults();

    const parseTarget = 50; // ms
    const pipelineTarget = 200; // ms

    console.log(`Target: Parse < ${parseTarget}ms`);
    console.log(`Actual: ${c4xResults.avg.toFixed(2)}ms (P95: ${c4xResults.p95.toFixed(2)}ms)`);
    console.log(`Status: ${c4xResults.p95 < parseTarget ? '✅ PASS' : '❌ FAIL'}`);

    console.log(`\nTarget: Pipeline < ${pipelineTarget}ms`);
    console.log(`Actual: ${pipelineResults.avg.toFixed(2)}ms (P95: ${pipelineResults.p95.toFixed(2)}ms)`);
    console.log(`Status: ${pipelineResults.p95 < pipelineTarget ? '✅ PASS' : '❌ FAIL'}`);

    // 7. Comparison Table
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
}

// Run benchmarks if executed directly
if (require.main === module) {
    runBenchmarks();
}
