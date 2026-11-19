/**
 * The render deadline (#353): render_c4x and `c4x render` draw in a worker
 * thread, and the caller waits at most RENDER_TIME_BUDGET_MS for it. Past
 * the deadline the worker is terminated and the result says the render took
 * too long, with the findings and no SVG; a partial SVG is never returned.
 * Layout is synchronous and cannot be interrupted from inside, so the
 * deadline is enforced from outside the thread that runs it.
 *
 * The worker runs the same bundle file as its caller (`__filename` in the
 * bundle): no second file, no new dependency. Each bundle's entry calls
 * `runRenderWorkerIfWorker()` first, which does the job and returns true in
 * a render worker, so the worker never starts a server or reads arguments.
 *
 * The wait is synchronous (Atomics.wait on a shared flag, then
 * receiveMessageOnPort), so the adapters keep their synchronous shape: the
 * MCP server answers the call after the render, as it did before, and goes
 * on serving after a timeout.
 */
import { MessageChannel, Worker, isMainThread, receiveMessageOnPort, workerData, type MessagePort } from 'worker_threads';
import { RENDER_TIME_BUDGET_MS } from './limits';
import { checkC4xSource, prepareRender, renderFinding, type RenderOptions, type RenderOutcome } from './renderSource';

/**
 * Test-only: a busy wait, in milliseconds, before the worker draws. esbuild
 * defines it as `undefined` for every shipped bundle, so the branch below is
 * removed from them; only a bundle a test builds with its own define has it.
 */
declare const __C4X_TEST_RENDER_DELAY_MS__: number | undefined;

interface RenderJob {
    readonly c4xRenderJob: true;
    readonly source: string;
    readonly options: RenderOptions;
    readonly flag: Int32Array;
    readonly port: MessagePort;
}

type WorkerReply = { readonly outcome: RenderOutcome } | { readonly error: string };

/** Where the worker's code comes from: a script file (the bundle), or code to evaluate (tests). */
export interface WorkerSpec {
    readonly script: string;
    readonly eval?: boolean;
}

/** The message for a render stopped at the deadline. */
export function tooLongMessage(deadlineMs: number): string {
    return `Render took too long: stopped after ${deadlineMs} ms, the limit for one render. Split the diagram into several views or shorten its text.`;
}

/**
 * In a render worker, draw the job from workerData, post the outcome, wake
 * the caller and return true. Anywhere else, return false and do nothing.
 */
export function runRenderWorkerIfWorker(): boolean {
    if (isMainThread) { return false; }
    const job = workerData as RenderJob | undefined;
    if (!job || job.c4xRenderJob !== true) { return false; }
    let reply: WorkerReply;
    try {
        if (typeof __C4X_TEST_RENDER_DELAY_MS__ !== 'undefined' && __C4X_TEST_RENDER_DELAY_MS__ !== undefined) {
            const until = Date.now() + __C4X_TEST_RENDER_DELAY_MS__;
            while (Date.now() < until) { /* test-only: stand in for a layout that never ends */ }
        }
        reply = { outcome: checkC4xSource(job.source, job.options) };
    } catch (error) {
        reply = { error: error instanceof Error ? error.message : String(error) };
    }
    job.port.postMessage(reply);
    Atomics.store(job.flag, 0, 1);
    Atomics.notify(job.flag, 0);
    return true;
}

/**
 * Check `source` here (options, parse, limits, model, lint, element and
 * relationship caps: the first line of defence), then draw it in a worker
 * and wait at most `deadlineMs` from the start of the call. Past the
 * deadline the worker is terminated and the outcome is `timed-out`, with the
 * findings and a C4X-RENDER finding, and no SVG. Throws an Error with the
 * worker's message when the engine itself failed (as `checkC4xSource` throws
 * LintEngineError), so adapters report it as before.
 */
export function renderWithDeadline(
    source: string,
    options: RenderOptions,
    deadlineMs: number = RENDER_TIME_BUDGET_MS,
    spec: WorkerSpec = { script: __filename },
): RenderOutcome {
    const started = Date.now();
    const prepared = prepareRender(source, options);
    if ('outcome' in prepared) { return prepared.outcome; }
    const timedOut = (): RenderOutcome => {
        const message = tooLongMessage(deadlineMs);
        return { status: 'timed-out', findings: [...prepared.findings, renderFinding(message)], theme: prepared.themeName, message };
    };
    const remaining = deadlineMs - (Date.now() - started);
    if (remaining <= 0) { return timedOut(); }

    const flag = new Int32Array(new SharedArrayBuffer(4));
    const { port1, port2 } = new MessageChannel();
    const job: RenderJob = { c4xRenderJob: true, source, options, flag, port: port2 };
    const worker = new Worker(spec.script, { eval: spec.eval ?? false, workerData: job, transferList: [port2] });
    // A worker that never answers must not keep the process alive.
    worker.unref();
    // A worker that fails to start reports through 'error'; the wait below then ends at the deadline.
    worker.on('error', () => undefined);
    let reply: { message: WorkerReply } | undefined;
    try {
        Atomics.wait(flag, 0, 0, remaining);
        reply = receiveMessageOnPort(port1) as { message: WorkerReply } | undefined;
    } finally {
        port1.close();
        void worker.terminate();
    }
    // No answer, or one that came after the deadline: never a late or partial SVG.
    if (!reply || Date.now() - started > deadlineMs) {
        return timedOut();
    }
    if ('error' in reply.message) {
        throw new Error(reply.message.error);
    }
    return reply.message.outcome;
}

/** Workers started by renderWithDeadlineAsync that have not exited yet (for tests). */
let liveWorkers = 0;
export function liveRenderWorkers(): number {
    return liveWorkers;
}

/** The message for a render stopped because the caller cancelled the request. */
export const CANCELLED_MESSAGE = 'Render cancelled: the request was cancelled and the render was stopped.';

/**
 * renderWithDeadline without blocking the caller's thread, for the MCP
 * server: its event loop keeps answering pings, cancellations and other
 * requests while a render runs. The deadline covers the whole call: the
 * clock starts before the checks (which the input limits bound), and the
 * worker gets what remains. The result settles on the worker's message,
 * error or exit, on the deadline timer, or on `signal` (MCP request
 * cancellation); the timer and the listeners are cleared on every path, and
 * a worker still running is terminated, and awaited, before the result is
 * returned. Never a partial or late SVG.
 */
export async function renderWithDeadlineAsync(
    source: string,
    options: RenderOptions,
    deadlineMs: number = RENDER_TIME_BUDGET_MS,
    spec: WorkerSpec = { script: __filename },
    signal?: AbortSignal,
): Promise<RenderOutcome> {
    const started = Date.now();
    const prepared = prepareRender(source, options);
    if ('outcome' in prepared) { return prepared.outcome; }
    const stopped = (message: string): RenderOutcome =>
        ({ status: 'timed-out', findings: [...prepared.findings, renderFinding(message)], theme: prepared.themeName, message });
    const remaining = deadlineMs - (Date.now() - started);
    if (remaining <= 0) { return stopped(tooLongMessage(deadlineMs)); }
    if (signal?.aborted) { return stopped(CANCELLED_MESSAGE); }

    const flag = new Int32Array(new SharedArrayBuffer(4));
    const { port1, port2 } = new MessageChannel();
    const job: RenderJob = { c4xRenderJob: true, source, options, flag, port: port2 };
    const worker = new Worker(spec.script, { eval: spec.eval ?? false, workerData: job, transferList: [port2] });
    liveWorkers++;
    let exited = false;
    const exit = new Promise<void>(resolve => worker.once('exit', () => { exited = true; liveWorkers--; resolve(); }));

    type Settled = { kind: 'reply'; reply: WorkerReply } | { kind: 'timeout' } | { kind: 'cancelled' } | { kind: 'failed' };
    let timer: NodeJS.Timeout | undefined;
    let onAbort: (() => void) | undefined;
    const settled = await new Promise<Settled>(resolve => {
        timer = setTimeout(() => resolve({ kind: 'timeout' }), remaining);
        port1.once('message', (reply: WorkerReply) => resolve({ kind: 'reply', reply }));
        worker.once('error', () => resolve({ kind: 'failed' }));
        // An exit can be delivered before the posted reply: read the port before calling it a failure.
        worker.once('exit', () => {
            const pending = receiveMessageOnPort(port1) as { message: WorkerReply } | undefined;
            resolve(pending ? { kind: 'reply', reply: pending.message } : { kind: 'failed' });
        });
        if (signal) {
            onAbort = () => resolve({ kind: 'cancelled' });
            signal.addEventListener('abort', onAbort, { once: true });
        }
    });
    clearTimeout(timer);
    if (signal && onAbort) { signal.removeEventListener('abort', onAbort); }
    port1.close();
    if (!exited) { await worker.terminate(); }
    await exit;

    switch (settled.kind) {
        case 'timeout': return stopped(tooLongMessage(deadlineMs));
        case 'cancelled': return stopped(CANCELLED_MESSAGE);
        case 'failed': {
            const message = 'Render failed: the render worker stopped before it answered.';
            return { status: 'invalid', findings: [...prepared.findings, renderFinding(message)], theme: prepared.themeName, message };
        }
        default:
            if (Date.now() - started > deadlineMs) { return stopped(tooLongMessage(deadlineMs)); }
            if ('error' in settled.reply) { throw new Error(settled.reply.error); }
            return settled.reply.outcome;
    }
}
