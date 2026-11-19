/**
 * The icon data digest is computed per build and the data file is a watched input (#534, review round 1).
 * Watch mode is not run here; the helper and the real esbuild plugin are exercised directly.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { cloudIconsDigest, cloudIconsPlugin, stampDigest } = require('../../../scripts/cloud-icons-esbuild.js') as {
    cloudIconsDigest: (file?: string) => string;
    cloudIconsPlugin: (options?: { file?: string }) => { setup: (build: unknown) => void };
    stampDigest: (source: string, digest: string) => string;
};

const sha = (text: string) => crypto.createHash('sha256').update(text).digest('hex');
const SOURCE = path.resolve(__dirname, '..', '..', 'assets', 'cloudIcons.ts');

describe('cloud-icons esbuild digest (#534)', () => {
    let scratch: string;
    before(() => { scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-icons-esb-')); });
    after(() => fs.rmSync(scratch, { recursive: true, force: true }));

    it('reads the digest at each call, so a regenerated file gives a new digest', () => {
        const file = path.join(scratch, 'cloud-icons.json');
        fs.writeFileSync(file, '{"aws":{},"azure":{}}\n');
        const first = cloudIconsDigest(file);
        fs.writeFileSync(file, '{"aws":{"aws-x":{"body":"<g/>"}},"azure":{}}\n');
        const second = cloudIconsDigest(file);
        assert.strictEqual(first, sha('{"aws":{},"azure":{}}\n'));
        assert.notStrictEqual(second, first);
        assert.strictEqual(second, cloudIconsDigest(file));
    });

    it('the plugin stamps the current digest on every load and watches the data file', () => {
        const file = path.join(scratch, 'watched.json');
        fs.writeFileSync(file, 'one');
        let onLoad!: (args: { path: string }) => { contents: string; watchFiles: string[] };
        cloudIconsPlugin({ file }).setup({ onLoad: (_filter: unknown, callback: typeof onLoad) => { onLoad = callback; } });
        const firstLoad = onLoad({ path: SOURCE });
        fs.writeFileSync(file, 'two');
        const secondLoad = onLoad({ path: SOURCE });
        assert.ok(firstLoad.contents.includes(`= "${sha('one')}"`));
        assert.ok(secondLoad.contents.includes(`= "${sha('two')}"`));
        assert.deepStrictEqual(secondLoad.watchFiles, [file]);
    });

    it('fails loudly when the declaration it rewrites is gone', () => {
        assert.throws(() => stampDigest('export const x = 1;', 'abc'), /no longer declares/);
    });
});
