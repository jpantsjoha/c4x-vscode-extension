/* eslint-disable @typescript-eslint/no-var-requires */
const esbuild = require('esbuild');
const peggy = require('peggy');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const { BUNDLE_PLANNING_TARGET_BYTES } = require('./scripts/vsix-budget');
const { NOTICES_FILE, writeThirdPartyNotices } = require('./scripts/third-party-notices');
const { ENGINE_HASH_PLACEHOLDER, engineHash, firstPartyInputs } = require('./scripts/engine-hash');
const { headlessVscodePlugin } = require('./scripts/headless-vscode-plugin');

const { cloudIconsPlugin } = require('./scripts/cloud-icons-esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const mcpOnly = process.argv.includes('--mcp-only');
const checkMcp = process.argv.includes('--check-mcp');
const mcpBundlePath = path.join('mcp', 'c4x-mcp-server.bundle.cjs');
const mcpNoticesPath = path.join('mcp', 'THIRD_PARTY_NOTICES.txt');
const cliBundlePath = path.join('cli', 'c4x-lint.cjs');
const renderCliBundlePath = path.join('cli', 'c4x.cjs');
const renderCliNoticesPath = path.join('cli', 'THIRD_PARTY_NOTICES.txt');
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

async function createThirdPartyNotices(metafile, title, bundleName) {
    const packages = new Map();

    for (const inputPath of Object.keys(metafile.inputs)) {
        if (!inputPath.includes('node_modules')) {
            continue;
        }

        const packageInfo = await findPackageDirectory(inputPath);
        packages.set(`${packageInfo.manifest.name}@${packageInfo.manifest.version}`, packageInfo);
    }

    const sections = [
        title,
        '',
        `This generated file lists licenses for packages embedded in ${bundleName}.`,
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

/**
 * Replace the banner's engine-hash placeholder with the SHA-256 of the
 * first-party sources in this build's metafile (#353): the stale-bundle
 * check (scripts/engine-hash.js) recomputes it from the working tree.
 */
async function stampEngineHash(outfile, metafile) {
    const content = await fs.readFile(outfile, 'utf8');
    const stamped = content.replace(ENGINE_HASH_PLACEHOLDER, engineHash(firstPartyInputs(metafile, process.cwd()), process.cwd()));
    if (stamped !== content) {
        await fs.writeFile(outfile, stamped);
    }
}

function generatedArtifactsPlugin(outfile, noticesPath, title) {
    return {
        name: 'c4x-generated-artifacts',
        setup(build) {
            build.onEnd(async result => {
                if (result.errors.length === 0 && result.metafile) {
                    await normalizeGeneratedArtifact(outfile);
                    await stampEngineHash(outfile, result.metafile);
                    await fs.writeFile(noticesPath, await createThirdPartyNotices(result.metafile, title, path.basename(outfile)));
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
        loader: { '.md': 'text' },
        banner: { js: `/*! Third-party licenses: ./THIRD_PARTY_NOTICES.txt */\n/*! c4x-engine-sha256: ${ENGINE_HASH_PLACEHOLDER} */` },
        metafile: true,
        // The render worker's test-only delay (src/cli/renderWorker.ts) is
        // compiled out of every shipped bundle.
        define: { __C4X_TEST_RENDER_DELAY_MS__: 'undefined' },
        plugins: [cloudIconsPlugin(), headlessVscodePlugin(), generatedArtifactsPlugin(outfile, noticesPath, 'C4X MCP SERVER THIRD-PARTY SOFTWARE NOTICES')],
    };
}

/**
 * The headless render CLI `c4x` (#353): `c4x render` draws SVG with the
 * extension's parser, layout and renderer. Tracked like the MCP bundle and,
 * like it, embeds the layout dependency (dagre) with a notices file. It never
 * imports `vscode` (headlessVscodePlugin).
 */
function renderCliBuildOptions(outfile, noticesPath, logLevel = 'info') {
    return {
        entryPoints: ['src/cli/c4xMain.ts'],
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
        banner: { js: `#!/usr/bin/env node\n/*! c4x: C4X render. Generated by esbuild.config.js from src/cli; do not edit. Third-party licenses: ./THIRD_PARTY_NOTICES.txt */\n/*! c4x-engine-sha256: ${ENGINE_HASH_PLACEHOLDER} */` },
        metafile: true,
        // The render worker's test-only delay (src/cli/renderWorker.ts) is
        // compiled out of every shipped bundle.
        define: { __C4X_TEST_RENDER_DELAY_MS__: 'undefined' },
        plugins: [cloudIconsPlugin(), headlessVscodePlugin(), generatedArtifactsPlugin(outfile, noticesPath, 'C4X RENDER CLI THIRD-PARTY SOFTWARE NOTICES')],
    };
}

/**
 * The headless lint CLI (#216): one self-contained file, tracked like the MCP
 * bundle so a hook or CI job can run it from a checkout with no install step.
 * It must embed no third-party package and must never import `vscode`; the
 * plugin below fails the build if either happens, so the bundle needs no
 * notices file and runs on bare Node.
 */
function cliDependencyGuardPlugin(outfile) {
    return {
        name: 'c4x-cli-dependency-guard',
        setup(build) {
            build.onResolve({ filter: /^vscode$/ }, args => ({
                errors: [{ text: `c4x-lint must not import vscode (imported by ${args.importer})` }],
            }));
            build.onEnd(async result => {
                if (result.errors.length > 0 || !result.metafile) {
                    return;
                }
                const thirdParty = Object.keys(result.metafile.inputs).filter(input => input.includes('node_modules'));
                if (thirdParty.length > 0) {
                    throw new Error(`c4x-lint must stay dependency-free; it bundled: ${thirdParty.join(', ')}`);
                }
                await normalizeGeneratedArtifact(outfile);
            });
        },
    };
}

function cliBuildOptions(outfile, logLevel = 'info') {
    return {
        entryPoints: ['src/cli/main.ts'],
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
        banner: { js: '#!/usr/bin/env node\n/*! c4x-lint: C4X notation lint. Generated by esbuild.config.js from src/cli; do not edit. */' },
        metafile: true,
        plugins: [cliDependencyGuardPlugin(outfile)],
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
        const candidateCliPath = path.join(tempDirectory, 'c4x-lint.cjs');
        await esbuild.build(cliBuildOptions(candidateCliPath, 'silent'));
        await assertFilesEqual(cliBundlePath, candidateCliPath, 'c4x-lint CLI bundle is stale. Run "pnpm run build:mcp" and commit the regenerated cli/c4x-lint.cjs.');
        const candidateRenderPath = path.join(tempDirectory, 'c4x.cjs');
        const candidateRenderNoticesPath = path.join(tempDirectory, 'CLI_THIRD_PARTY_NOTICES.txt');
        await esbuild.build(renderCliBuildOptions(candidateRenderPath, candidateRenderNoticesPath, 'silent'));
        await assertFilesEqual(renderCliBundlePath, candidateRenderPath, 'c4x render CLI bundle is stale. Run "pnpm run build:mcp" and commit the regenerated cli/c4x.cjs.');
        await assertFilesEqual(renderCliNoticesPath, candidateRenderNoticesPath, 'c4x render CLI third-party notices are stale. Run "pnpm run build:mcp" and commit the regenerated cli/THIRD_PARTY_NOTICES.txt.');

        console.log('C4X generated parser, MCP bundle, third-party notices, c4x-lint CLI bundle and c4x render CLI bundle are fresh.');
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
 * That is why the extension bundle preserves identifiers and syntax.
 * Whitespace-only compaction does not rename the embedded helpers. This guard turns the
 * failure into a build error instead of a broken editor in someone's VS Code.
 * If you want the size win, split the webview client into its own entry point
 * rather than reaching for `minify`.
 */
const WEBVIEW_EMBEDDED_HELPERS = [
    'formatMoveAnnouncement',
    'computeZoomToFit',
    'computeOptimalConnectionPoints',
    'computeBoundaryWrap',
    'formatDraftRestoreStatus',
    'isDraftStateForCurrentScope',
    'isRenderScopeValue',
    'migrateLegacyDraftState',
    'isPersistableViewport',
    'isRelationshipEndpointLegal',
    'eligibleConnectTargets',
    'advanceConnectMode',
    'computeStageAddRelationship',
    'formatAddRelationshipSummary',
];

/**
 * the VSIX redistributes every npm package inlined into
 * dist/extension.js, so THIRD_PARTY_NOTICES.txt (shipped at the package root)
 * is regenerated from this build's metafile on every build. A bundled package
 * with no licence file, or a licence outside the allowlist in
 * scripts/third-party-notices.js, fails the build. The file is generated, so it
 * is gitignored and never exported to the public mirror, which builds its own.
 */
// Keep source-module provenance in whitespace-compacted bundles. These legal
// comments travel with each dependency's source, independently of the metafile
// used to generate notices, so the installed smoke can still audit every package.
function extensionModuleProvenancePlugin() {
    return {
        name: 'c4x-module-provenance',
        setup(build) {
            build.onLoad({ filter: /node_modules[\\/].*\.[cm]?js$/ }, async args => {
                const relative = path.relative(process.cwd(), args.path).split(path.sep).join('/');
                const contents = await fs.readFile(args.path, 'utf8');
                return {
                    contents: `/*! c4x-module: ${relative} */\n${contents}`,
                    loader: 'js',
                    resolveDir: path.dirname(args.path),
                };
            });
        },
    };
}

function extensionNoticesPlugin(noticesPath) {
    return {
        name: 'c4x-extension-third-party-notices',
        setup(build) {
            build.onEnd(result => {
                if (result.errors.length > 0 || !result.metafile) {
                    return;
                }
                const packages = writeThirdPartyNotices(result.metafile, noticesPath, { bundle: 'dist/extension.js' });
                console.log(`📜 ${NOTICES_FILE}: ${packages.length} bundled packages, licences verified`);
            });
        },
    };
}

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
        // Preserve identifiers and syntax: webview helpers are embedded with toString().
        // Whitespace compaction reduces cold parsing/source-map overhead (#233).
        minifyWhitespace: true,
        sourcemap: !production,
        sourcesContent: false,
        platform: 'node',
        outfile: 'dist/extension.js',
        external: ['vscode'],
        logLevel: 'info',
        treeShaking: true,
        metafile: true,
        plugins: [cloudIconsPlugin(), extensionModuleProvenancePlugin(), extensionNoticesPlugin(NOTICES_FILE)],
    };

    // The preview layout worker (#454): dagre only, run in a worker thread
    // beside the extension bundle so a large layout cannot block the host.
    const layoutWorkerOptions = {
        entryPoints: ['src/layout/layoutWorkerMain.ts'],
        bundle: true,
        format: 'cjs',
        minify: production,
        sourcemap: false,
        platform: 'node',
        outfile: 'dist/layoutWorker.js',
        logLevel: 'info',
        treeShaking: true,
        legalComments: 'none',
        plugins: [cloudIconsPlugin(), headlessVscodePlugin()],
    };

    // --mcp-only regenerates every tracked generated bundle: the MCP server, the
    // c4x-lint CLI and the c4x render CLI. Only the MCP server ships in the VSIX.
    const generatedOptions = [mcpBuildOptions(mcpBundlePath, mcpNoticesPath), cliBuildOptions(cliBundlePath), renderCliBuildOptions(renderCliBundlePath, renderCliNoticesPath)];
    const buildOptions = mcpOnly
        ? generatedOptions
        : [extensionOptions, layoutWorkerOptions, ...generatedOptions];
    const contexts = await Promise.all(buildOptions.map(options => esbuild.context(options)));

    if (watch) {
        console.log('👀 Watching for changes...');
        await Promise.all(contexts.map(ctx => ctx.watch()));
    } else {
        // Settle every build before failing. With Promise.all, one failed build
        // (the notices licence check, say) exited the process while another
        // build's onEnd was still writing a tracked file such as
        // mcp/THIRD_PARTY_NOTICES.txt, leaving it truncated.
        const outcomes = await Promise.allSettled(contexts.map(ctx => ctx.rebuild()));
        const failed = outcomes.find(outcome => outcome.status === 'rejected');
        if (failed) {
            await Promise.all(contexts.map(ctx => ctx.dispose()));
            throw failed.reason;
        }

        const buildTime = Date.now() - startTime;
        console.log(`✅ Build complete in ${buildTime}ms`);

        if (!mcpOnly) {
            await assertWebviewHelpersSurvivedBundling();
        }

        // Report bundle size against the one raw-bundle planning target
        // (BUNDLE_PLANNING_TARGET_BYTES). Informational only: nothing here fails the
        // build. Printing ❌ before a ✅ "checks passed" read as a gate; it is not.
        // The bundle is deliberately unminified (see WEBVIEW_EMBEDDED_HELPERS), so
        // reducing it is an architecture question.
        try {
            const bundleStat = await fs.stat('dist/extension.js');
            const bundleBytes = bundleStat.size;
            const bundleKB = (bundleBytes / 1024).toFixed(1);
            const targetMB = (BUNDLE_PLANNING_TARGET_BYTES / 1_000_000).toFixed(1);
            const MODE = production ? 'production' : 'development';
            const measured = `${bundleBytes} bytes (${bundleKB} KB)`;
            if (bundleBytes > BUNDLE_PLANNING_TARGET_BYTES) {
                console.warn(`⚠️  Bundle size (${MODE}): ${measured} — exceeds the ${targetMB} MB planning target; informational, not a gate`);
            } else {
                console.log(`📦 Bundle size (${MODE}): ${measured} — within the ${targetMB} MB planning target`);
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
