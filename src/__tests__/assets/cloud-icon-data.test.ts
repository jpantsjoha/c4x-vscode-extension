/**
 * The AWS and Azure icon data is one generated file the bundles read and check (#534).
 * The file, its recorded digest and the loader's fail-closed rules are tested here on the
 * source modules; the bundles and the packages that carry them are tested in
 * src/__tests__/render/cloud-icon-bundles.test.ts and the packaging tests.
 */
import * as assert from 'assert';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CloudIconDataError, cloudIconsPath, expectedCloudIconsSha256, readCloudIcons } from '../../assets/cloudIcons';
import { CLOUD_ICONS_SHA256 } from '../../assets/cloudIconsDigest';
import { SPRITES, getSprite, type Sprite } from '../../assets/icons';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const DATA = path.join(ROOT, 'data', 'cloud-icons.json');
const sha256 = (bytes: Buffer | string) => crypto.createHash('sha256').update(bytes).digest('hex');

describe('Cloud icon data (#534)', () => {
    let scratch: string;
    before(() => { scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-icons-')); });
    after(() => fs.rmSync(scratch, { recursive: true, force: true }));

    const faultFile = (name: string, content: Buffer | string) => {
        const file = path.join(scratch, name);
        fs.writeFileSync(file, content);
        return file;
    };
    const fault = (file: string, expected = CLOUD_ICONS_SHA256): CloudIconDataError | undefined => {
        try { readCloudIcons(file, expected); } catch (error) { return error as CloudIconDataError; }
        return undefined;
    };

    it('the recorded digest is the SHA-256 of the committed file, and the source build expects it', () => {
        assert.strictEqual(sha256(fs.readFileSync(DATA)), CLOUD_ICONS_SHA256, 'data/cloud-icons.json changed without "node scripts/generate-*-icons.js"; regenerate so src/assets/cloudIconsDigest.ts matches');
        assert.strictEqual(expectedCloudIconsSha256(), CLOUD_ICONS_SHA256);
    });

    it('holds the 430 AWS and 624 Azure sprites, each with a body, a view box and its brand colours kept', () => {
        const icons = readCloudIcons(DATA, CLOUD_ICONS_SHA256);
        assert.strictEqual(Object.keys(icons.aws).length, 430);
        assert.strictEqual(Object.keys(icons.azure).length, 624);
        for (const [vendor, sprites] of Object.entries(icons) as Array<[string, Record<string, Sprite>]>) {
            for (const [id, sprite] of Object.entries(sprites)) {
                assert.ok(id.startsWith(`${vendor}-`), id);
                assert.ok(typeof sprite.body === 'string' && sprite.body.length > 0 && sprite.viewBox && sprite.preserveColor === true, id);
            }
        }
    });

    it('SPRITES lists the cloud sets with the rest, and getSprite resolves an exact, a prefixed and a suffix name', () => {
        const ids = Object.keys(SPRITES);
        assert.strictEqual(ids.filter(id => id.startsWith('aws-')).length, 430);
        assert.strictEqual(ids.filter(id => id.startsWith('azure-')).length, 624);
        assert.ok(ids.includes('person') && ids.some(id => id.startsWith('gcp-')));
        assert.ok('azure-sql-database' in SPRITES && 'person' in SPRITES && !('no-such-sprite' in SPRITES), 'the in operator sees the cloud sets too');
        assert.strictEqual(getSprite('aws-simple-storage-service-s3-standard'), SPRITES['aws-simple-storage-service-s3-standard']);
        assert.strictEqual(getSprite('AZURE-SQL-DATABASE'), SPRITES['azure-sql-database']);
        assert.ok(getSprite('sql-database'), 'vendor-prefix lookup');
        assert.strictEqual(getSprite('constructor'), undefined);
    });

    describe('fails closed, with a message that says what to do', () => {
        it('a missing file', () => {
            const error = fault(path.join(scratch, 'absent.json'));
            assert.strictEqual(error?.fault, 'missing');
            assert.match(error!.message, /C4X icon data is missing: expected .*absent\.json\. Reinstall the package/);
        });

        it('a file whose bytes changed by one character', () => {
            const bytes = fs.readFileSync(DATA);
            bytes[bytes.indexOf('M') ] ^= 0x01;
            const error = fault(faultFile('tampered.json', bytes));
            assert.strictEqual(error?.fault, 'mismatch');
            assert.match(error!.message, /failed its integrity check: .*tampered\.json has SHA-256 [0-9a-f]{64}, this build expects [0-9a-f]{64}\. Reinstall/);
        });

        it('an empty file, and a file with a sprite swapped for another', () => {
            assert.strictEqual(fault(faultFile('empty.json', ''))?.fault, 'mismatch');
            const swapped = JSON.parse(fs.readFileSync(DATA, 'utf8'));
            swapped.aws['aws-simple-storage-service-s3-standard'].body = '<circle r="1"/>';
            assert.strictEqual(fault(faultFile('swapped.json', JSON.stringify(swapped)))?.fault, 'mismatch');
        });

        it('a file that is not JSON, or has no aws and azure sections, even when its hash matches the build', () => {
            const notJson = 'not json';
            assert.strictEqual(fault(faultFile('notjson.json', notJson), sha256(notJson))?.fault, 'malformed');
            const noSections = '{"aws":{}}';
            assert.strictEqual(fault(faultFile('nosections.json', noSections), sha256(noSections))?.fault, 'malformed');
            assert.strictEqual(fault(faultFile('array.json', '[]'), sha256('[]'))?.fault, 'malformed');
        });

        it('a path that cannot be read as a file', () => {
            const error = fault(scratch);
            assert.strictEqual(error?.fault, 'unreadable');
            assert.match(error!.message, /cannot be read at .*EISDIR/);
        });
    });

    describe('where the data is read from depends on the running code, never on the working directory', () => {
        it('a bundle reads data/ beside its own directory', () => {
            for (const bundleDir of ['dist', 'mcp', 'cli', 'server']) {
                assert.strictEqual(cloudIconsPath(path.join('/pkg', bundleDir)), path.join('/pkg', 'data', 'cloud-icons.json'), bundleDir);
            }
        });

        it('source modules read the checkout\'s data/, compiled or not', () => {
            assert.strictEqual(cloudIconsPath(path.join('/repo', 'src', 'assets')), path.join('/repo', 'data', 'cloud-icons.json'));
            assert.strictEqual(cloudIconsPath(path.join('/repo', 'out', 'src', 'assets')), path.join('/repo', 'data', 'cloud-icons.json'));
            assert.strictEqual(cloudIconsPath(), DATA);
        });

        it('the working directory does not matter', () => {
            const cwd = process.cwd();
            try {
                process.chdir(os.tmpdir());
                assert.strictEqual(cloudIconsPath(), DATA);
            } finally {
                process.chdir(cwd);
            }
        });
    });
});
