/* eslint-disable @typescript-eslint/no-var-requires */
const esbuild = require('esbuild');
const pegjs = require('pegjs');
const fs = require('fs').promises;

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function compilePeg() {
    console.log('Compiling PEG.js grammar...');
    const grammar = await fs.readFile('src/parser/c4x.pegjs', 'utf8');
    let parser = pegjs.generate(grammar, {
        output: 'source',
        format: 'commonjs',
    });
    // Fix PEG.js 0.10.0 bug: replace 'for (const i' with 'for (let i'
    parser = parser.replace(/for \(const i = 0; i < /g, 'for (let i = 0; i < ');
    await fs.writeFile('src/parser/c4x.generated.js', parser);

    // Copy to out/ directory for tests (TypeScript doesn't copy .js files)
    try {
        await fs.mkdir('out/src/parser', { recursive: true });
        await fs.copyFile('src/parser/c4x.generated.js', 'out/src/parser/c4x.generated.js');
        await fs.copyFile('src/parser/c4x.generated.d.ts', 'out/src/parser/c4x.generated.d.ts');
        console.log('PEG.js grammar compiled and copied to out/.');
    } catch (err) {
        console.warn('Note: Could not copy to out/ (normal if out/ doesn\'t exist yet)');
    }
}

async function main() {
    const startTime = Date.now();

    await compilePeg();

    const ctx = await esbuild.context({
        entryPoints: ['src/extension.ts'],
        bundle: true,
        format: 'cjs',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: 'node',
        outfile: 'dist/extension.js',
        external: ['vscode', 'playwright-core', 'chromium-bidi/lib/cjs/bidiMapper/BidiMapper', 'chromium-bidi/lib/cjs/cdp/CdpConnection'],
        logLevel: 'info',
        treeShaking: true,
        metafile: true,
    });

    if (watch) {
        console.log('👀 Watching for changes...');
        await ctx.watch();
    } else {
        await ctx.rebuild();

        const buildTime = Date.now() - startTime;
        console.log(`✅ Build complete in ${buildTime}ms`);

        // Performance warning
        if (buildTime > 1000) {
            console.warn(`⚠️  Build time exceeded target (1000ms): ${buildTime}ms`);
        }

        await ctx.dispose();
    }
}

main().catch((e) => {
    console.error('❌ Build failed:', e);
    process.exit(1);
});
