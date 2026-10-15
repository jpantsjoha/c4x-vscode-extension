import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * scripts/bundle-runtime.js is what the VSIX smoke uses to check two things
 * activation cannot show (#181): the bundle requires nothing the VSIX does not
 * ship, and `@google/genai` stays unevaluated until first use. Each check is
 * proved here against a bundle esbuild builds the way esbuild.config.js builds
 * the extension (cjs, node, `vscode` external), red and green.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { bundleRuntimeFindings, installedBundlePath } = require('../../scripts/bundle-runtime.js') as {
    bundleRuntimeFindings: (bundlePath: string) => string[];
    installedBundlePath: (extensionsDir: string, manifest: { publisher: string; name: string; version: string }) => string;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const esbuild = require('esbuild') as typeof import('esbuild');

const ROOT = path.resolve(__dirname, '..', '..');
const temporaryRoots: string[] = [];

function temporaryRoot(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    temporaryRoots.push(dir);
    return dir;
}

function build(name: string, contents: string, external: string[] = []): string {
    const outfile = path.join(temporaryRoot('c4x-bundle-runtime-'), `${name}.js`);
    esbuild.buildSync({
        stdin: { contents, resolveDir: ROOT, loader: 'js' },
        bundle: true,
        format: 'cjs',
        platform: 'node',
        outfile,
        external: ['vscode', ...external],
        logLevel: 'silent',
    });
    return outfile;
}

describe('bundle runtime checks for the packaged extension (#181)', function () {
    this.timeout(60_000);

    after(() => {
        for (const dir of temporaryRoots) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('passes a bundle that imports the SDK dynamically, as geminiClient.ts does', () => {
        const bundle = build('lazy', `
            require('vscode');
            exports.client = async () => new (await import('@google/genai')).GoogleGenAI({ apiKey: 'k' });
        `);
        assert.deepEqual(bundleRuntimeFindings(bundle), []);
    });

    it('fails a bundle that left the SDK external: the VSIX has no node_modules to find it in', () => {
        const bundle = build('external', `
            exports.client = async () => new (await import('@google/genai')).GoogleGenAI({ apiKey: 'k' });
        `, ['@google/genai']);
        assert.ok(bundleRuntimeFindings(bundle).includes('bundle-requires-unshipped-module-@google/genai'));
    });

    it('fails a bundle that evaluates the SDK at load, which is what a static value import does', () => {
        const bundle = build('eager', `
            const { GoogleGenAI } = require('@google/genai');
            exports.client = () => new GoogleGenAI({ apiKey: 'k' });
        `);
        const findings = bundleRuntimeFindings(bundle);
        assert.ok(
            findings.some(finding => finding.startsWith('sdk-transport-loaded-at-activation-')),
            `the SDK's network stack loads with the bundle. Got: ${findings.join(', ')}`,
        );
    });

    it('detects eager transport through a symlinked bundle directory', () => {
        const bundle = build('eager-alias', `require('https'); exports.ok = true;`);
        const aliasRoot = temporaryRoot('c4x-bundle-alias-');
        const alias = path.join(aliasRoot, 'bundle');
        // A junction also works without symlink privileges on Windows.
        fs.symlinkSync(fs.realpathSync(path.dirname(bundle)), alias, 'junction');
        const findings = bundleRuntimeFindings(path.join(alias, path.basename(bundle)));
        assert.ok(findings.includes('sdk-transport-loaded-at-activation-https'));
    });

    it('ignores a require() that appears only in a comment', () => {
        const bundle = build('comment', `
            /** Usage: const {JWT} = require('google-auth-library'); */
            exports.ok = true;
        `);
        assert.deepEqual(bundleRuntimeFindings(bundle), []);
    });

    // The smoke checks the bundle VS Code installed from the VSIX, not dist/ in
    // the working tree, which can be rebuilt after packaging (#232 review).
    describe('the installed bundle', () => {
        const ours = { publisher: 'C4X', name: 'c4x', version: '1.8.0' };

        /** An extensions folder as `code --install-extension` leaves it. */
        function extensionsDir(installed: Array<{ folder: string; manifest: object; bundle?: string }>): string {
            const root = temporaryRoot('c4x-installed-');
            for (const { folder, manifest, bundle } of installed) {
                // eslint-disable-next-line security/detect-non-literal-fs-filename -- under the temp folder made above
                fs.mkdirSync(path.join(root, folder, 'dist'), { recursive: true });
                // eslint-disable-next-line security/detect-non-literal-fs-filename -- under the temp folder made above
                fs.writeFileSync(path.join(root, folder, 'package.json'), JSON.stringify(manifest));
                if (bundle) {
                    fs.copyFileSync(bundle, path.join(root, folder, 'dist', 'extension.js'));
                }
            }
            return root;
        }

        const lazy = `exports.client = async () => new (await import('@google/genai')).GoogleGenAI({ apiKey: 'k' });`;

        it('is found by publisher, name and version, ignoring other extensions and the case of the id', () => {
            const bundle = build('installed-lazy', lazy);
            const root = extensionsDir([
                { folder: 'someone.else-1.0.0', manifest: { publisher: 'someone', name: 'else', version: '1.0.0' }, bundle },
                { folder: 'c4x.c4x-1.7.0', manifest: { ...ours, version: '1.7.0' }, bundle },
                { folder: 'c4x.c4x-1.8.0', manifest: ours, bundle },
            ]);
            assert.equal(installedBundlePath(root, ours), path.join(root, 'c4x.c4x-1.8.0', 'dist', 'extension.js'));
        });

        it('fails when the version under test is not installed, or installed without a bundle', () => {
            const bundle = build('installed-old', lazy);
            assert.throws(
                () => installedBundlePath(extensionsDir([{ folder: 'c4x.c4x-1.7.0', manifest: { ...ours, version: '1.7.0' }, bundle }]), ours),
                /expected exactly one installed C4X\.c4x@1\.8\.0/,
            );
            assert.throws(
                () => installedBundlePath(extensionsDir([{ folder: 'c4x.c4x-1.8.0', manifest: ours }]), ours),
                /the installed extension has no bundle/,
            );
        });

        it('is what gets checked: a packaged bundle that left the SDK external fails though the working-tree one is clean', () => {
            const workingTree = build('working-tree', lazy);
            const packaged = build('packaged-external', lazy, ['@google/genai']);
            const root = extensionsDir([{ folder: 'c4x.c4x-1.8.0', manifest: ours, bundle: packaged }]);

            assert.deepEqual(bundleRuntimeFindings(workingTree), [], 'the working-tree bundle alone would pass');
            assert.ok(bundleRuntimeFindings(installedBundlePath(root, ours)).includes('bundle-requires-unshipped-module-@google/genai'));
        });
    });
});
