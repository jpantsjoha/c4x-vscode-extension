/**
 * The render deadline through the shipped bundles (#353, review round 3).
 *
 * - The two in-bounds diagrams two review rounds timed over budget (the
 *   round-1 chain with shortcuts at the caps, the round-2 3,400-character
 *   chain) each come back from render_c4x and `c4x render` either drawn or
 *   stopped, never later than the deadline plus a small margin.
 * - A layout that does not end (a test-only delay compiled into a scratch
 *   build of each bundle; the shipped bundles have it compiled out) is
 *   stopped at the deadline: no SVG, a too-long result, `c4x render` exits 3,
 *   and the MCP server answers the next calls.
 */
import * as assert from 'assert';
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as esbuild from 'esbuild';
import { RENDER_TIME_BUDGET_MS } from '../../cli/limits';
import { adversarialSource, reviewRound2Source } from '../cli/renderCorpus';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const MCP_BUNDLE = path.join(ROOT, 'mcp', 'c4x-mcp-server.bundle.cjs');
const RENDER_BUNDLE = path.join(ROOT, 'cli', 'c4x.cjs');
/** Worker start-up and termination are inside the deadline; this covers the caller's own scheduling. */
const MARGIN_MS = 500;
/** `c4x render` also starts Node and loads its bundle before the deadline starts. */
const CLI_START_MS = 1000;

// eslint-disable-next-line @typescript-eslint/no-require-imports, security/detect-non-literal-require -- the repository's own build helper
const { headlessVscodePlugin } = require(path.join(ROOT, 'scripts', 'headless-vscode-plugin.js')) as { headlessVscodePlugin(): esbuild.Plugin };

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-deadline-'));
const childEnv: NodeJS.ProcessEnv = { ...process.env, ...(process.env.NODE_V8_COVERAGE ? { NODE_V8_COVERAGE: path.join(scratch, 'v8') } : {}) };
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

/** A scratch build of a bundle whose render worker busy-waits `delayMs` before drawing. */
async function slowBundle(entry: string, name: string, delayMs: number): Promise<string> {
    const outfile = path.join(scratch, name);
    await esbuild.build({
        entryPoints: [path.join(ROOT, entry)], bundle: true, platform: 'node', format: 'cjs', target: 'node18', minify: true,
        outfile, logLevel: 'silent', absWorkingDir: ROOT, loader: { '.md': 'text' }, legalComments: 'none',
        define: { __C4X_TEST_RENDER_DELAY_MS__: String(delayMs) },
        plugins: [headlessVscodePlugin()],
    });
    return outfile;
}

interface McpReply { result?: { isError?: boolean; content: Array<{ type: string; text?: string; resource?: { text: string } }> }; error?: unknown }

/** An MCP session over stdio; `call` returns the reply and how long the server took to send it. */
class Session {
    private readonly child: ChildProcessWithoutNullStreams;
    private buffer = '';
    private readonly waiting = new Map<number, (reply: McpReply) => void>();
    private nextId = 1;

    constructor(bundle: string) {
        this.child = spawn(process.execPath, [bundle], { cwd: os.tmpdir(), env: childEnv, stdio: ['pipe', 'pipe', 'pipe'] });
        this.child.stdout.setEncoding('utf8');
        this.child.stdout.on('data', chunk => {
            this.buffer += chunk;
            let newline: number;
            while ((newline = this.buffer.indexOf('\n')) !== -1) {
                const line = this.buffer.slice(0, newline);
                this.buffer = this.buffer.slice(newline + 1);
                const message = JSON.parse(line) as McpReply & { id: number };
                this.waiting.get(message.id)?.(message);
            }
        });
    }

    request(method: string, params: unknown): Promise<{ reply: McpReply; ms: number }> {
        const id = this.nextId++;
        const started = Date.now();
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`no reply to ${method} in 30 s`)), 30000);
            this.waiting.set(id, reply => { clearTimeout(timer); resolve({ reply, ms: Date.now() - started }); });
            this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
        });
    }

    async open(): Promise<void> {
        await this.request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'deadline', version: '1' } });
        this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    }

    /** The id the next request will carry. */
    peekId(): number {
        return this.nextId;
    }

    notify(method: string, params: unknown): void {
        this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
    }

    render(code: string): Promise<{ reply: McpReply; ms: number }> {
        return this.request('tools/call', { name: 'render_c4x', arguments: { code } });
    }

    close(): Promise<void> {
        return new Promise(resolve => {
            this.child.once('exit', () => resolve());
            this.child.stdin.end();
            setTimeout(() => { this.child.kill('SIGKILL'); }, 3000).unref();
        });
    }
}

function cliRender(bundle: string, source: string): { status: number | null; stdout: string; stderr: string; ms: number } {
    const file = path.join(scratch, `in-${Math.random().toString(36).slice(2)}.c4x`);
    fs.writeFileSync(file, source);
    const started = Date.now();
    const run = spawnSync(process.execPath, [bundle, 'render', file], { encoding: 'utf8', env: childEnv, timeout: 60000, maxBuffer: 64 * 1024 * 1024 });
    return { status: run.status, stdout: run.stdout, stderr: run.stderr, ms: Date.now() - started };
}

describe('Render deadline through the bundles (#353)', function () {
    this.timeout(180000);
    const deadlineCases: ReadonlyArray<[string, string]> = [
        ['round-1 chain with shortcuts at the caps', adversarialSource('chain-shortcuts', 100, 150)],
        ['round-2 chain of 3,400-character texts', reviewRound2Source()],
    ];

    it('the shipped bundles carry no test-only delay', () => {
        for (const bundle of [MCP_BUNDLE, RENDER_BUNDLE]) {
            assert.doesNotMatch(fs.readFileSync(bundle, 'utf8'), /__C4X_TEST_RENDER_DELAY_MS__/, `${path.relative(ROOT, bundle)} keeps the test hook`);
        }
    });

    for (const [label, source] of deadlineCases) {
        it(`render_c4x: ${label} is drawn or stopped within the deadline`, async () => {
            const session = new Session(MCP_BUNDLE);
            try {
                await session.open();
                const { reply, ms } = await session.render(source);
                const text = reply.result!.content[0].text!;
                assert.ok(/^Render OK\./.test(text) || /^Render TOO SLOW\./.test(text), text.slice(0, 200));
                if (/^Render TOO SLOW\./.test(text)) { assert.strictEqual(reply.result!.content.length, 1, 'no SVG after the deadline'); }
                assert.ok(ms <= RENDER_TIME_BUDGET_MS + MARGIN_MS, `${label}: answered after ${ms} ms`);
            } finally {
                await session.close();
            }
        });

        it(`c4x render: ${label} is drawn (exit 0) or stopped (exit 3) within the deadline`, () => {
            const run = cliRender(RENDER_BUNDLE, source);
            assert.ok(run.status === 0 || run.status === 3, `exit ${run.status}: ${run.stderr.slice(-300)}`);
            if (run.status === 3) { assert.strictEqual(run.stdout, '', 'no SVG after the deadline'); }
            assert.ok(run.ms <= RENDER_TIME_BUDGET_MS + MARGIN_MS + CLI_START_MS, `${label}: ${run.ms} ms`);
        });
    }

    it('a layout that does not end: render_c4x stops it at the deadline and the server answers the next calls', async () => {
        const session = new Session(await slowBundle('mcp/c4x-mcp-server.ts', 'slow-mcp.cjs', 60000));
        try {
            await session.open();
            for (let attempt = 0; attempt < 2; attempt++) {
                const { reply, ms } = await session.render('graph TB\nSystem(a, "A", "d")\n');
                assert.strictEqual(reply.result!.isError, true);
                assert.strictEqual(reply.result!.content.length, 1, 'no SVG');
                assert.match(reply.result!.content[0].text!, /^Render TOO SLOW\. Stopped at the 2000 ms limit; no SVG\.[^\n]*\n(?:.*\n)*.*C4X-RENDER Render took too long/);
                assert.ok(ms >= RENDER_TIME_BUDGET_MS - 50 && ms <= RENDER_TIME_BUDGET_MS + MARGIN_MS, `attempt ${attempt + 1}: ${ms} ms`);
                const { reply: valid, ms: validMs } = await session.request('tools/call', { name: 'validate_c4x', arguments: { code: 'graph TB\nSystem(a, "A", "d")\n' } });
                assert.strictEqual(valid.result!.content[0].text, 'Syntax is VALID. No errors found.');
                assert.ok(validMs < 1000, `the next call waited ${validMs} ms`);
            }
        } finally {
            await session.close();
        }
    });

    it('while a render runs, the MCP server answers a ping within 200 ms (the render does not block its event loop)', async () => {
        const session = new Session(await slowBundle('mcp/c4x-mcp-server.ts', 'slow-mcp-ping.cjs', 60000));
        try {
            await session.open();
            const rendering = session.render('graph TB\nSystem(a, "A", "d")\n');
            await new Promise(resolve => setTimeout(resolve, 300));
            const pings: number[] = [];
            for (let i = 0; i < 3; i++) {
                const { reply, ms } = await session.request('ping', {});
                assert.deepStrictEqual(reply.result, {});
                pings.push(ms);
            }
            assert.ok(pings.every(ms => ms < 200), `pings during the render took ${pings.join(', ')} ms`);
            const { reply, ms } = await rendering;
            assert.match(reply.result!.content[0].text!, /^Render TOO SLOW\./);
            assert.ok(ms <= RENDER_TIME_BUDGET_MS + MARGIN_MS, `${ms} ms`);
        } finally {
            await session.close();
        }
    });

    it('a cancelled render_c4x request is dropped and the server goes on answering at once', async () => {
        const session = new Session(await slowBundle('mcp/c4x-mcp-server.ts', 'slow-mcp-cancel.cjs', 60000));
        try {
            await session.open();
            const requestId = session.peekId();
            void session.render('graph TB\nSystem(a, "A", "d")\n').catch(() => undefined);
            await new Promise(resolve => setTimeout(resolve, 300));
            session.notify('notifications/cancelled', { requestId, reason: 'test' });
            const { reply, ms } = await session.request('tools/call', { name: 'validate_c4x', arguments: { code: 'graph TB\nSystem(a, "A", "d")\n' } });
            assert.strictEqual(reply.result!.content[0].text, 'Syntax is VALID. No errors found.');
            assert.ok(ms < 200, `${ms} ms`);
            // The next render starts its own worker and is stopped at the deadline as usual.
            const next = await session.render('graph TB\nSystem(b, "B", "d")\n');
            assert.match(next.reply.result!.content[0].text!, /^Render TOO SLOW\./);
        } finally {
            await session.close();
        }
    });

    it('a layout that does not end: c4x render stops it at the deadline and exits 3 with no SVG', async () => {
        const run = cliRender(await slowBundle('src/cli/c4xMain.ts', 'slow-c4x.cjs', 60000), 'graph TB\nSystem(a, "A", "d")\n');
        assert.strictEqual(run.status, 3, run.stderr);
        assert.strictEqual(run.stdout, '');
        assert.match(run.stderr, /C4X-RENDER Render took too long[\s\S]*not drawn: the render took longer than 2000 ms and was stopped/);
        assert.ok(run.ms >= RENDER_TIME_BUDGET_MS && run.ms <= RENDER_TIME_BUDGET_MS + MARGIN_MS + CLI_START_MS, `${run.ms} ms`);
    });
});
