/**
 * Activation never reads the AWS and Azure icon data file (#534, review round 1).
 * The extension constructs the completion provider synchronously in activate(); a read there
 * would cost every activation 2.9 MB of parsing and let a damaged install throw out of activate().
 * Enumerating sprite ids is id-only; only fetching a cloud sprite body reads the file.
 */
import * as assert from 'assert';
import * as realFs from 'fs';
import * as path from 'path';
import * as vscodeMock from '../__mocks__/vscode';
import { BUNDLED_SPRITE_IDS } from '../../assets/spriteIds';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const DATA = path.join(ROOT, 'data', 'cloud-icons.json');
const MODULES = ['../../assets/icons', '../../assets/cloudIcons', '../../completion/C4XCompletionItemProvider', '../../writeback/NativeMutationPlanner'];

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module');

/** Load the provider and icons afresh (the loader caches its read), against this file's vscode mock. */
function freshModules() {
    for (const name of MODULES) { delete require.cache[require.resolve(name)]; }
    const originalLoad = Module._load;
    const providerVscode = { ...vscodeMock };
    Module._load = function (request: string, ...args: unknown[]) {
        return request === 'vscode' ? providerVscode : originalLoad.call(this, request, ...args);
    };
    try {
        return {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            provider: require('../../completion/C4XCompletionItemProvider') as typeof import('../../completion/C4XCompletionItemProvider'),
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            icons: require('../../assets/icons') as typeof import('../../assets/icons'),
        };
    } finally {
        Module._load = originalLoad;
    }
}

/** Record every read of the data file; optionally make it look missing. Returns restore and the read log. */
function spyOnDataReads(missing: boolean) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as { readFileSync: unknown };
    const original = fs.readFileSync;
    const reads: string[] = [];
    fs.readFileSync = function (file: unknown, ...rest: unknown[]) {
        if (typeof file === 'string' && path.resolve(file) === DATA) {
            reads.push(file);
            if (missing) { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); }
        }
        return (original as (...args: unknown[]) => unknown).call(this, file, ...rest);
    };
    return { reads, restore: () => { fs.readFileSync = original; } };
}

async function listSpriteCompletions(provider: InstanceType<ReturnType<typeof freshModules>['provider']['C4XCompletionItemProvider']>, prefix: string) {
    const document = { languageId: 'c4x', lineAt: () => ({ text: prefix }) } as never;
    const position = new vscodeMock.Position(0, prefix.length) as never;
    const items = await provider.provideCompletionItems(document, position, {} as never, {} as never);
    return Array.isArray(items) ? items : items.items;
}

describe('Activation and the icon data file (#534)', () => {
    it('constructing the completion provider and listing completions reads the data file zero times', async () => {
        const spy = spyOnDataReads(false);
        try {
            const { provider } = freshModules();
            const completions = new provider.C4XCompletionItemProvider();
            const aws = await listSpriteCompletions(completions, 'c4x sprite="c4xicons.aws.');
            assert.ok(aws.length > 400, `AWS completions listed: ${aws.length}`);
            assert.deepStrictEqual(spy.reads, []);
        } finally { spy.restore(); }
    });

    it('with the data file missing, construction does not throw and AWS and Azure ids still complete', async () => {
        const spy = spyOnDataReads(true);
        try {
            const { provider } = freshModules();
            let completions!: InstanceType<typeof provider.C4XCompletionItemProvider>;
            assert.doesNotThrow(() => { completions = new provider.C4XCompletionItemProvider(); });
            const aws = await listSpriteCompletions(completions, 'c4x sprite="c4xicons.aws.');
            const azure = await listSpriteCompletions(completions, 'c4x sprite="c4xicons.azure.');
            assert.ok(aws.length > 400 && azure.length > 600, `${aws.length} aws, ${azure.length} azure`);
        } finally { spy.restore(); }
    });

    it('enumerating, testing and own-property checks on SPRITES do not read the file; fetching a cloud body does, and fails at that call', () => {
        const spy = spyOnDataReads(true);
        try {
            const { icons } = freshModules();
            assert.ok(Object.keys(icons.SPRITES).includes('aws-lambda-lambda-function'));
            assert.ok('azure-sql-database' in icons.SPRITES);
            assert.ok(Object.prototype.hasOwnProperty.call(icons.SPRITES, 'aws-lambda-lambda-function'));
            assert.ok(!Object.prototype.hasOwnProperty.call(icons.SPRITES, 'constructor'));
            assert.deepStrictEqual(spy.reads, []);
            assert.throws(() => icons.SPRITES['aws-lambda-lambda-function'], /C4X icon data is missing/);
            assert.strictEqual(spy.reads.length, 1);
        } finally { spy.restore(); }
    });

    it('a listed id reports a lazy property whose getter loads the body on first read', () => {
        const spy = spyOnDataReads(false);
        try {
            const { icons } = freshModules();
            const descriptor = Object.getOwnPropertyDescriptor(icons.SPRITES, 'aws-lambda-lambda-function');
            assert.ok(descriptor && descriptor.enumerable && typeof descriptor.get === 'function');
            assert.deepStrictEqual(spy.reads, []);
            const body = descriptor.get!.call(icons.SPRITES) as { body: string };
            assert.ok(typeof body.body === 'string' && body.body.length > 0);
            assert.strictEqual(spy.reads.length, 1);
            assert.ok(Object.getOwnPropertyDescriptor(icons.SPRITES, 'aws-lambda-lambda-function')!.value, 'a plain value once filled');
        } finally { spy.restore(); }
    });

    it('the bundled id list is exactly the AWS and Azure keys of data/cloud-icons.json plus the sprites compiled in', () => {
        const data = JSON.parse(realFs.readFileSync(DATA, 'utf8')) as { aws: Record<string, unknown>; azure: Record<string, unknown> };
        const fromData = [...Object.keys(data.aws), ...Object.keys(data.azure)].sort();
        const cloudIds = BUNDLED_SPRITE_IDS.filter(id => id.startsWith('aws-') || id.startsWith('azure-')).slice().sort();
        assert.deepStrictEqual(cloudIds, fromData);
    });
});
