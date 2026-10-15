'use strict';
// Two facts about dist/extension.js that the VSIX smoke cannot see by
// activating the extension, because both only bite on first AI use (#181):
//
// 1. Everything the bundle requires ships. The VSIX has no node_modules
//    (`vsce package --no-dependencies`), so a package esbuild left external —
//    `@google/genai` marked external by mistake, say — passes activation and
//    the render smoke, then fails the first generation with "Cannot find module".
//
// 2. The Gemini SDK is not loaded at activation. It is imported dynamically
//    (src/ai/geminiClient.ts) so its ~1.8 MB, and the network stack it brings
//    (ws, gaxios, google-auth-library), is evaluated on first AI use only. The
//    unit tier proves that for the TypeScript; this proves it for the bundle,
//    where esbuild decides whether a dynamic import stays lazy.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const { isBuiltin } = require('node:module');
const path = require('node:path');

/**
 * Non-builtin modules the bundle may require without shipping them:
 * `vscode` is provided by the host; `bufferutil` and `utf-8-validate` are
 * optional native accelerators that ws requires inside try/catch and does
 * without.
 */
const PROVIDED_OR_OPTIONAL = new Set(['vscode', 'bufferutil', 'utf-8-validate']);

/**
 * Builtins that only the SDK's transport uses. If one is loaded when the bundle
 * is first required, the SDK (or something new) is being evaluated at
 * activation. The extension's own code makes no network calls of its own.
 */
const SDK_TRANSPORT_MODULES = [
    'http', 'https', 'http2', 'net', 'tls', 'zlib', 'worker_threads',
    'node:http', 'node:https', 'node:http2', 'node:net', 'node:tls', 'node:zlib', 'node:stream/web', 'node:worker_threads',
    'bufferutil', 'utf-8-validate',
];

/**
 * Every module specifier the bundle passes to a literal require() or import().
 * esbuild keeps an external dynamic import as `import("…")`. Comments are
 * removed first, by esbuild itself, because the unminified bundle keeps the
 * SDK's doc comments, and one of them reads `require('google-auth-library')`.
 */
function requiredSpecifiers(source) {
    const esbuild = require('esbuild');
    const code = esbuild.transformSync(source, { loader: 'js', minifyWhitespace: true, legalComments: 'none' }).code;
    const found = new Set();
    for (const match of code.matchAll(/\b(?:require|import)\(\s*(["'`])([^"'`]+)\1\s*\)/g)) {
        found.add(match[2]);
    }
    return [...found].sort();
}

/** Required packages that are neither builtins, relative paths, nor provided by the host. */
function unshippedRequires(source) {
    return requiredSpecifiers(source).filter(specifier =>
        !specifier.startsWith('.') && !specifier.startsWith('/') && !isBuiltin(specifier) && !PROVIDED_OR_OPTIONAL.has(specifier));
}

/**
 * The modules the bundle requires while it is being loaded, as VS Code loads it
 * before calling activate(). Runs in a child process with `vscode` stubbed, so
 * nothing in this process is loaded or cached.
 */
function modulesRequiredAtLoad(bundlePath) {
    const probe = `
        const Module = require('module');
        const path = require('path');
        // Node reports parent.filename using the real path. macOS temp paths
        // and installed-extension directories can contain symlink components.
        const bundle = require('fs').realpathSync(path.resolve(${JSON.stringify(bundlePath)}));
        const seen = new Set();
        const load = Module._load;
        const stub = () => new Proxy(function () {}, { get: (_t, key) => key === Symbol.toPrimitive ? () => '' : stub(), apply: () => stub(), construct: () => stub() });
        Module._load = function (request, parent, isMain) {
            if (parent && parent.filename === bundle) { seen.add(request); }
            if (request === 'vscode') { return stub(); }
            return load.apply(this, arguments);
        };
        try { require(bundle); } catch (error) { process.stdout.write(JSON.stringify({ error: String(error && error.stack || error) })); process.exit(0); }
        process.stdout.write(JSON.stringify({ modules: [...seen].sort() }));
    `;
    const result = spawnSync(process.execPath, ['-e', probe], { encoding: 'utf8', timeout: 60_000 });
    if (result.status !== 0) {
        throw new Error(`bundle load probe exited ${result.status}: ${result.stderr}`);
    }
    const parsed = JSON.parse(result.stdout);
    if (parsed.error) {
        throw new Error(`the bundle threw while loading: ${parsed.error}`);
    }
    return parsed.modules;
}

/** Findings for the bundle at bundlePath. Empty means both facts hold. */
function bundleRuntimeFindings(bundlePath) {
    const source = fs.readFileSync(bundlePath, 'utf8');
    const findings = unshippedRequires(source).map(specifier => `bundle-requires-unshipped-module-${specifier}`);
    const atLoad = modulesRequiredAtLoad(bundlePath);
    for (const specifier of atLoad) {
        if (SDK_TRANSPORT_MODULES.includes(specifier)) {
            findings.push(`sdk-transport-loaded-at-activation-${specifier}`);
        }
        if (!isBuiltin(specifier) && specifier !== 'vscode') {
            findings.push(`package-loaded-at-activation-${specifier}`);
        }
    }
    return findings;
}

/**
 * The bundle VS Code installed from the VSIX: `dist/extension.js` inside the
 * extension folder under `extensionsDir` whose package.json names this
 * publisher, name and version. The smoke checks this copy, not dist/ in the
 * working tree: it accepts an existing VSIX, and dist/ can be rebuilt after
 * packaging, so the working-tree bundle can pass while the shipped one would
 * fail (#232 review). Throws if no such extension is installed.
 */
function installedBundlePath(extensionsDir, { publisher, name, version }) {
    const matches = [];
    for (const entry of fs.readdirSync(extensionsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) {
            continue;
        }
        const folder = path.join(extensionsDir, entry.name);
        let manifest;
        try {
            manifest = JSON.parse(fs.readFileSync(path.join(folder, 'package.json'), 'utf8'));
        } catch {
            continue;
        }
        // VS Code compares extension ids without regard to case.
        if (String(manifest.publisher).toLowerCase() === String(publisher).toLowerCase()
            && String(manifest.name).toLowerCase() === String(name).toLowerCase()
            && manifest.version === version) {
            matches.push(folder);
        }
    }
    if (matches.length !== 1) {
        throw new Error(`expected exactly one installed ${publisher}.${name}@${version} under ${extensionsDir}, found ${matches.length}`);
    }
    const bundle = path.join(matches[0], 'dist', 'extension.js');
    if (!fs.existsSync(bundle)) {
        throw new Error(`the installed extension has no bundle at ${bundle}`);
    }
    return bundle;
}

module.exports = { PROVIDED_OR_OPTIONAL, SDK_TRANSPORT_MODULES, bundleRuntimeFindings, installedBundlePath, modulesRequiredAtLoad, requiredSpecifiers, unshippedRequires };
