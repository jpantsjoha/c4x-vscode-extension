/* eslint-disable @typescript-eslint/no-var-requires */
const esbuild = require('esbuild');
const peggy = require('peggy');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const mcpOnly = process.argv.includes('--mcp-only');
const checkMcp = process.argv.includes('--check-mcp');
const mcpBundlePath = path.join('mcp', 'c4x-mcp-server.bundle.cjs');
const mcpNoticesPath = path.join('mcp', 'THIRD_PARTY_NOTICES.txt');
const parserSourcePath = path.join('src', 'parser', 'c4x.generated.js');

async function findPackageDirectory(inputPath) {
    let directory = path.dirname(path.resolve(inputPath));

    while (directory !== path.dirname(directory)) {
        try {
            const manifest = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'));
            if (manifest.name && manifest.version) {
                return { directory, manifest };
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
        directory = path.dirname(directory);
    }

    throw new Error(`Could not locate package metadata for bundled input: ${inputPath}`);
}

async function createThirdPartyNotices(metafile) {
    const packages = new Map();

    for (const inputPath of Object.keys(metafile.inputs)) {
        if (!inputPath.includes('node_modules')) {
            continue;
        }

        const packageInfo = await findPackageDirectory(inputPath);
        packages.set(`${packageInfo.manifest.name}@${packageInfo.manifest.version}`, packageInfo);
    }

    const sections = [
        'C4X MCP SERVER THIRD-PARTY SOFTWARE NOTICES',
        '',
        'This generated file lists licenses for packages embedded in c4x-mcp-server.bundle.cjs.',
    ];

    for (const [identifier, { directory, manifest }] of [...packages.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        const entries = await fs.readdir(directory);
        const licenseName = entries.find(entry => /^licen[cs]e(?:\.|$)/i.test(entry));
        if (!licenseName) {
            throw new Error(`Bundled package ${identifier} has no discoverable license file.`);
        }

        const licenseText = (await fs.readFile(path.join(directory, licenseName), 'utf8')).trim();
        sections.push('', '='.repeat(80), identifier, `Declared license: ${manifest.license || 'see text below'}`, '', licenseText);
    }

    return `${sections.join('\n')}\n`;
}

async function normalizeGeneratedArtifact(filePath) {
    const content = await fs.readFile(filePath, 'utf8');
    // esbuild's native binaries disagree on whether to emit this redundant
    // top-level directive for the same CommonJS bundle. Normalize it so the
    // tracked artifact can be verified from every supported CI host.
    const normalized = content
        .replace(/(^|\n)"use strict";/, '$1')
        .replace(/[ \t]+(?=\r?$)/gm, '');
    if (normalized !== content) {
        await fs.writeFile(filePath, normalized);
    }
}

function generatedMcpArtifactsPlugin(outfile, noticesPath) {
    return {
        name: 'c4x-generated-mcp-artifacts',
        setup(build) {
            build.onEnd(async result => {
                if (result.errors.length === 0 && result.metafile) {
                    await normalizeGeneratedArtifact(outfile);
                    await fs.writeFile(noticesPath, await createThirdPartyNotices(result.metafile));
                }
            });
        },
    };
}

function mcpBuildOptions(outfile, noticesPath, logLevel = 'info') {
    return {
        entryPoints: ['mcp/c4x-mcp-server.ts'],
        bundle: true,
        format: 'cjs',
        minify: true,
        sourcemap: false,
        sourcesContent: false,
        platform: 'node',
        target: 'node18',
        outfile,
        logLevel,
        treeShaking: true,
        legalComments: 'none',
        banner: { js: '/*! Third-party licenses: ./THIRD_PARTY_NOTICES.txt */' },
        metafile: true,
        plugins: [generatedMcpArtifactsPlugin(outfile, noticesPath)],
    };
}

async function assertFilesEqual(expectedPath, candidatePath, staleMessage) {
    const [expected, candidate] = await Promise.all([
        fs.readFile(expectedPath),
        fs.readFile(candidatePath),
    ]);

    if (!expected.equals(candidate)) {
        throw new Error(staleMessage);
    }
}

async function generateParserSource() {
    const grammar = await fs.readFile('src/parser/c4x.pegjs', 'utf8');
    return peggy.generate(grammar, {
        output: 'source',
        format: 'commonjs',
    });
}

async function verifyGeneratedParser() {
    const [expected, candidate] = await Promise.all([
        fs.readFile(parserSourcePath, 'utf8'),
        generateParserSource(),
    ]);

    if (expected !== candidate) {
        throw new Error('Generated C4X parser is stale. Run "pnpm run build:mcp" and commit the regenerated parser.');
    }
}

async function verifyMcpBundle() {
    const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'c4x-mcp-'));
    const candidatePath = path.join(tempDirectory, 'c4x-mcp-server.bundle.cjs');
    const candidateNoticesPath = path.join(tempDirectory, 'THIRD_PARTY_NOTICES.txt');

    try {
        await verifyGeneratedParser();
        await esbuild.build(mcpBuildOptions(candidatePath, candidateNoticesPath, 'silent'));
        await assertFilesEqual(mcpBundlePath, candidatePath, 'MCP bundle is stale. Run "pnpm run build:mcp" and commit the regenerated bundle.');
        await assertFilesEqual(mcpNoticesPath, candidateNoticesPath, 'MCP third-party notices are stale. Run "pnpm run build:mcp" and commit the regenerated notices.');

        console.log('C4X generated parser, MCP bundle, and third-party notices are fresh.');
    } finally {
        await fs.rm(tempDirectory, { recursive: true, force: true });
    }
}

async function compilePeg() {
    console.log('Compiling Peggy grammar...');
    const parser = await generateParserSource();
    await fs.writeFile(parserSourcePath, parser);

    // Copy to out/ directory for tests (TypeScript doesn't copy .js files)
    try {
        await fs.mkdir('out/src/parser', { recursive: true });
        await fs.copyFile('src/parser/c4x.generated.js', 'out/src/parser/c4x.generated.js');
        await fs.copyFile('src/parser/c4x.generated.d.ts', 'out/src/parser/c4x.generated.d.ts');
        console.log('Peggy grammar compiled and copied to out/.');
    } catch (err) {
        console.warn('Note: Could not copy to out/ (normal if out/ doesn\'t exist yet)');
    }
}

/**
 * The webview client script is assembled at runtime from `fn.toString()` on a
 * set of exported helpers (see src/webview/previewClientScript.ts
 * `embedForWebview`). The hand-written half of that script is a template
 * literal, so it calls those helpers by their ORIGINAL names — and a template
 * literal is opaque to the bundler, which cannot rewrite the calls inside it.
 *
 * Minification therefore breaks the visual editor silently and completely:
 * esbuild renames `function eligibleConnectTargets(...)` to `function p(...)`,
 * `toString()` emits the renamed text, and the webview dies on
 * `ReferenceError: eligibleConnectTargets is not defined`. `keepNames: true`
 * does NOT help — it fixes the `.name` property, not the emitted source text.
 *
 * That is why the extension bundle ships unminified. This guard turns the
 * failure into a build error instead of a broken editor in someone's VS Code.
 * If you want the size win, split the webview client into its own entry point
 * rather than reaching for `minify`.
 */
const WEBVIEW_EMBEDDED_HELPERS = [
    'formatMoveAnnouncement',
    'computeZoomToFit',
    'isRelationshipEndpointLegal',
    'eligibleConnectTargets',
    'advanceConnectMode',
    'computeStageAddRelationship',
    'formatAddRelationshipSummary',
];

async function assertWebviewHelpersSurvivedBundling() {
    let bundle;
    try {
        bundle = await fs.readFile('dist/extension.js', 'utf8');
    } catch {
        return; // nothing built (e.g. --mcp-only); size reporting handles this
    }
    const missing = WEBVIEW_EMBEDDED_HELPERS.filter(
        name => !new RegExp(`function\\s+${name}\\s*\\(`).test(bundle),
    );
    if (missing.length > 0) {
        console.error(
            '❌ Webview client helpers were renamed by the bundler: ' + missing.join(', ') + '\n' +
            '   The webview builds its script from fn.toString() and calls these by name from a\n' +
            '   template literal, so renaming them ships a visual editor that throws\n' +
            '   ReferenceError on open. Do not minify the extension bundle; split the webview\n' +
            '   client into its own entry point instead.',
        );
        process.exit(1);
    }
}

async function main() {
    const startTime = Date.now();

    if (checkMcp) {
        await verifyMcpBundle();
        return;
    }

    await compilePeg();

    const extensionOptions = {
        entryPoints: ['src/extension.ts'],
        bundle: true,
        format: 'cjs',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: 'node',
        outfile: 'dist/extension.js',
        external: ['vscode'],
        logLevel: 'info',
        treeShaking: true,
        metafile: true,
    };

    const buildOptions = mcpOnly
        ? [mcpBuildOptions(mcpBundlePath, mcpNoticesPath)]
        : [extensionOptions, mcpBuildOptions(mcpBundlePath, mcpNoticesPath)];
    const contexts = await Promise.all(buildOptions.map(options => esbuild.context(options)));

    if (watch) {
        console.log('👀 Watching for changes...');
        await Promise.all(contexts.map(ctx => ctx.watch()));
    } else {
        await Promise.all(contexts.map(ctx => ctx.rebuild()));

        const buildTime = Date.now() - startTime;
        console.log(`✅ Build complete in ${buildTime}ms`);

        if (!mcpOnly) {
            await assertWebviewHelpersSurvivedBundling();
        }

        // Report bundle size (TDR-006: target <1MB, alert >1.5MB)
        try {
            const bundleStat = await fs.stat('dist/extension.js');
            const bundleBytes = bundleStat.size;
            const bundleKB = (bundleBytes / 1024).toFixed(1);
            const bundleMB = (bundleBytes / 1024 / 1024).toFixed(2);
            const MODE = production ? 'production' : 'development';
            if (bundleBytes > 1572864) {
                console.error(`❌ Bundle size (${MODE}): ${bundleKB} KB (${bundleMB} MB) — exceeds 1.5 MB alert threshold (TDR-006)`);
            } else if (bundleBytes > 1048576) {
                console.warn(`⚠️  Bundle size (${MODE}): ${bundleKB} KB (${bundleMB} MB) — exceeds 1 MB target (TDR-006)`);
            } else {
                console.log(`📦 Bundle size (${MODE}): ${bundleKB} KB (${bundleMB} MB) — within TDR-006 target`);
            }
        } catch {
            // Non-fatal: size reporting only
        }

        // Performance warning
        if (buildTime > 1000) {
            console.warn(`⚠️  Build time exceeded target (1000ms): ${buildTime}ms`);
        }

        await Promise.all(contexts.map(ctx => ctx.dispose()));
    }
}

main().catch((e) => {
    console.error('❌ Build failed:', e);
    process.exit(1);
});
