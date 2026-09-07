import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';

interface VerifyResult {
    status: number | null;
    output: string;
}

const verifier = path.resolve(__dirname, '../../../scripts/verify-doc-claims.ts');
const tsNodeRegister = require.resolve('ts-node/register/transpile-only');

function writeFixtureFile(root: string, relative: string, contents: string): void {
    const target = path.join(root, relative);
    // Fixture paths are created under this test's fresh mkdtemp directory.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.mkdirSync(path.dirname(target), { recursive: true });
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.writeFileSync(target, contents);
}

function modelsSource(proModel: string, includeProInRegistry = true, proChannel: 'ga' | 'preview' = 'preview'): string {
    return `
export const DEFAULT_MODEL = 'gemini-3.8-flash';
// no generally available Pro model exists in the Gemini 3.x line
export const PRO_MODEL = '${proModel}';
export const LITE_MODEL = 'gemini-3.1-flash-lite';
export const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image';
export const PRO_IMAGE_MODEL = 'gemini-3-pro-image';
export const LITE_IMAGE_MODEL = 'gemini-3.1-flash-lite-image';
export const MODEL_REGISTRY = [
    { id: DEFAULT_MODEL, purpose: 'default', channel: 'ga' },
    { id: DEFAULT_IMAGE_MODEL, purpose: 'default image', channel: 'ga' },
    { id: LITE_MODEL, purpose: 'lite', channel: 'ga' },
    { id: PRO_IMAGE_MODEL, purpose: 'pro image', channel: 'ga' },
    { id: LITE_IMAGE_MODEL, purpose: 'lite image', channel: 'ga' },
    ${includeProInRegistry ? `{ id: PRO_MODEL, purpose: 'pro', channel: '${proChannel}' },` : ''}
    { id: 'gemini-3.1-pro-preview', purpose: 'approved preview', channel: 'preview' },
    { id: 'gemini-3.2-pro-preview', purpose: 'unapproved preview', channel: 'preview' },
    { id: 'gemini-2.5-pro', purpose: 'GA pro', channel: 'ga' },
];
`;
}

function createFixture(options: {
    proModel?: string;
    includeProInRegistry?: boolean;
    proChannel?: 'ga' | 'preview';
    faqDefault?: string;
} = {}): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-doc-claims-'));
    const current = 'gemini-3.8-flash';
    const faqDefault = options.faqDefault ?? current;

    writeFixtureFile(root, 'src/ai/models.ts', modelsSource(
        options.proModel ?? 'gemini-3.1-pro-preview',
        options.includeProInRegistry ?? true,
        options.proChannel ?? 'preview',
    ));
    writeFixtureFile(root, 'src/settings.ts', `
const config = vscode.workspace.getConfiguration('c4x.ai');
config.get('model');
config.get('imageModel');
`);
    writeFixtureFile(root, 'package.json', JSON.stringify({
        contributes: {
            configuration: {
                properties: {
                    'c4x.ai.model': {
                        default: current,
                        description: `Verified 2026-09-05:\n- ${current} — newest generally available flash (default)`,
                    },
                    'c4x.ai.imageModel': { default: 'gemini-3.1-flash-image' },
                },
            },
            commands: [],
        },
    }, null, 2));
    writeFixtureFile(root, 'README.md', `The default model is \`${current}\`.\n`);
    writeFixtureFile(root, 'docs/GEMINI_GUIDE.md', `C4X defaults to \`${current}\`.\n`);
    writeFixtureFile(root, 'docs/FAQ.md', `The default is \`${faqDefault}\`.\n`);
    writeFixtureFile(root, 'docs/DIAGRAM-WITH-GEMINI-IMAGE.md', 'No current text-default claim here.\n');
    writeFixtureFile(root, 'CHANGELOG.md', 'C4X 1.6.x defaulted to `gemini-3.6-flash`.\n');
    return root;
}

function verify(root: string): VerifyResult {
    const result = spawnSync(process.execPath, ['-r', tsNodeRegister, verifier], {
        cwd: path.resolve(__dirname, '../../..'),
        env: { ...process.env, NODE_ENV: 'test', C4X_DOC_CLAIM_ROOT: root },
        encoding: 'utf8',
    });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe('doc-claim model policy', () => {
    const roots: string[] = [];

    afterEach(() => {
        for (const root of roots.splice(0)) {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    function fixture(options: Parameters<typeof createFixture>[0] = {}): string {
        const root = createFixture(options);
        roots.push(root);
        return root;
    }

    it('allows the one approved preview failover', () => {
        const result = verify(fixture());
        assert.strictEqual(result.status, 0, result.output);
    });

    it('rejects a substituted, unapproved preview failover', () => {
        const result = verify(fixture({ proModel: 'gemini-3.2-pro-preview' }));
        assert.strictEqual(result.status, 1, result.output);
        assert.match(result.output, /gemini-3\.2-pro-preview/);
        assert.match(result.output, /approved|record/i);
    });

    it('rejects an unknown failover model id', () => {
        const result = verify(fixture({ proModel: 'gemini-9-pro', includeProInRegistry: false }));
        assert.strictEqual(result.status, 1, result.output);
        assert.match(result.output, /unknown|absent from MODEL_REGISTRY/i);
    });

    it('allows a generally available Pro failover', () => {
        const result = verify(fixture({ proModel: 'gemini-2.5-pro', proChannel: 'ga' }));
        assert.strictEqual(result.status, 0, result.output);
    });

    it('rejects a stale current-default claim and names its authoritative file', () => {
        const result = verify(fixture({ faqDefault: 'gemini-3.6-flash' }));
        assert.strictEqual(result.status, 1, result.output);
        assert.match(result.output, /docs\/FAQ\.md/);
        assert.match(result.output, /gemini-3\.6-flash/);
        assert.match(result.output, /gemini-3\.8-flash/);
    });

    it('ignores historical default statements in CHANGELOG.md', () => {
        const result = verify(fixture());
        assert.strictEqual(result.status, 0, result.output);
        assert.doesNotMatch(result.output, /CHANGELOG\.md/);
    });
});
