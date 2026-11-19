/**
 * The preview layout deadline (#454). Layout is synchronous (dagre), so a
 * large diagram inside every headless limit froze the extension host for
 * 14.6 s in the editor preview and the Markdown preview. A diagram above
 * the thresholds below is laid out in a worker thread (dist/layoutWorker.js,
 * bundled from layoutWorkerMain.ts) that the host stops at
 * PREVIEW_LAYOUT_BUDGET_MS, the same figure as the headless render deadline.
 * Smaller diagrams, including every Internet Banking fixture, lay out
 * in-process exactly as before: a worker start costs more than they do.
 *
 * Editor preview: asynchronous, the host thread is never blocked.
 * Markdown preview: markdown-it renders synchronously, so the wait is
 * synchronous (Atomics.wait) but bounded by the same budget.
 *
 * This file must not import `vscode`: the worker bundle includes it.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { MessagePort } from 'worker_threads';
import type { C4Boundary, C4Element, C4View } from '../model/C4Model';
import type { LayoutOptions, LayoutResult } from './DagreLayoutEngine';

/**
 * worker_threads is loaded when a layout first needs it, never at activation:
 * the bundle-runtime check (scripts/bundle-runtime.js) bans it from load time.
 */
function threads(): typeof import('worker_threads') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('worker_threads') as typeof import('worker_threads');
}

/** Hard deadline for one preview layout, ms. Equals RENDER_TIME_BUDGET_MS (src/cli/limits.ts). */
export const PREVIEW_LAYOUT_BUDGET_MS = 2000;

/** Elements (at every level) above which the layout runs in the worker. */
export const LAYOUT_WORKER_ELEMENT_THRESHOLD = 150;
/** Relationships above which the layout runs in the worker. */
export const LAYOUT_WORKER_RELATIONSHIP_THRESHOLD = 400;

export type LayoutOutcome =
    | { readonly status: 'ok'; readonly layout: LayoutResult; readonly grewText: boolean }
    | { readonly status: 'timed-out'; readonly message: string }
    | { readonly status: 'failed'; readonly message: string }
    | { readonly status: 'cancelled' };

export interface LayoutWorkerSpec {
    readonly script: string;
    readonly eval?: boolean;
}

export function countElements(elements: readonly C4Element[]): number {
    let total = 0;
    for (const element of elements) {
        total += 1 + (element.children ? countElements(element.children) : 0);
    }
    return total;
}

/** The message shown in place of a diagram whose layout passed the deadline. */
export function layoutTooLongMessage(view: C4View, deadlineMs: number = PREVIEW_LAYOUT_BUDGET_MS): string {
    return `This diagram has ${countElements(view.elements)} elements and ${view.relationships.length} relationships, and laying it out took longer than ${deadlineMs / 1000} s, the limit for one preview. Split it into several views or reduce its nesting. The editor stays responsive.`;
}

/** Nesting depth above which the layout runs in the worker, whatever the counts. */
export const LAYOUT_WORKER_DEPTH_THRESHOLD = 8;

export function maxDepth(elements: readonly C4Element[]): number {
    let deepest = 0;
    for (const element of elements) {
        deepest = Math.max(deepest, 1 + (element.children ? maxDepth(element.children) : 0));
    }
    return deepest;
}

/**
 * Nesting depth through boundary membership: a boundary's `elements` list the
 * ids of its children, boundaries included, so the parser's nested
 * `System_Boundary` blocks form chains here while `view.elements` stays flat.
 */
export function boundaryDepth(boundaries: readonly C4Boundary[] | undefined): number {
    if (!boundaries || boundaries.length === 0) { return 0; }
    const byId = new Map(boundaries.map(boundary => [boundary.id, boundary]));
    const memo = new Map<string, number>();
    const depthOf = (boundary: C4Boundary, path: ReadonlySet<string>): number => {
        const known = memo.get(boundary.id);
        if (known !== undefined) { return known; }
        const next = new Set(path).add(boundary.id);
        let deepest = 0;
        for (const childId of boundary.elements) {
            const child = byId.get(childId);
            if (child && !next.has(child.id)) { deepest = Math.max(deepest, depthOf(child, next)); }
        }
        memo.set(boundary.id, 1 + deepest);
        return 1 + deepest;
    };
    let result = 0;
    for (const boundary of boundaries) { result = Math.max(result, depthOf(boundary, new Set())); }
    // The element inside the innermost boundary is one level deeper.
    return result + 1;
}

/** Elements and boundaries both become layout nodes (dagre compound nodes). */
export function countLayoutNodes(view: C4View): number {
    return countElements(view.elements) + (view.boundaries?.length ?? 0);
}

export function needsLayoutWorker(view: C4View): boolean {
    return countLayoutNodes(view) > LAYOUT_WORKER_ELEMENT_THRESHOLD
        || view.relationships.length > LAYOUT_WORKER_RELATIONSHIP_THRESHOLD
        || Math.max(maxDepth(view.elements), boundaryDepth(view.boundaries)) > LAYOUT_WORKER_DEPTH_THRESHOLD;
}

/** The message for a worker that stopped before it answered: a failure, not a slow diagram. */
export function layoutFailedMessage(reason: string): string {
    return `The layout worker stopped before it answered (${reason}). The diagram was not drawn; this is not a size limit. Reload the window and report the problem if it repeats.`;
}

/**
 * One host-blocking budget for a whole Markdown render (#454 review): the
 * synchronous waits of every fence draw on it, so n slow fences block the
 * host at most PREVIEW_LAYOUT_BUDGET_MS in total; once spent, later large
 * fences get the budget message at once, without a wait.
 */
export class SharedLayoutBudget {
    private spent = 0;
    constructor(readonly totalMs: number = PREVIEW_LAYOUT_BUDGET_MS) {}
    reset(): void { this.spent = 0; }
    remaining(): number { return Math.max(0, this.totalMs - this.spent); }
    spend(ms: number): void { this.spent += ms; }
}

let workerOverride: LayoutWorkerSpec | undefined;
/** Test-only: the worker to use where no dist/layoutWorker.js sits beside this file. */
export function setLayoutWorkerForTests(spec: LayoutWorkerSpec | undefined): void {
    workerOverride = spec;
}

/** The bundled worker beside the extension bundle, or undefined when absent (unit tests, source runs). */
export function defaultLayoutWorker(): LayoutWorkerSpec | undefined {
    if (workerOverride) { return workerOverride; }
    const script = path.join(__dirname, 'layoutWorker.js');
    return fs.existsSync(script) ? { script } : undefined;
}

interface LayoutJob {
    readonly c4xLayoutJob: true;
    readonly view: C4View;
    readonly options: LayoutOptions;
    readonly flag: Int32Array;
    readonly port: MessagePort;
}
type WorkerReply = { readonly layout: LayoutResult; readonly grewText: boolean } | { readonly error: string };

/**
 * In a layout worker, lay the job out, post the result, wake the caller and
 * return true. Anywhere else return false.
 */
export function runLayoutWorkerIfWorker(layOut: (view: C4View, options: LayoutOptions) => { layout: LayoutResult; grewText: boolean }): boolean {
    const { isMainThread, workerData } = threads();
    if (isMainThread) { return false; }
    const job = workerData as LayoutJob | undefined;
    if (!job || job.c4xLayoutJob !== true) { return false; }
    // A worker that exits before it replies wakes the caller with the failure flag (2).
    process.on('exit', () => {
        if (Atomics.load(job.flag, 0) === 0) {
            Atomics.store(job.flag, 0, 2);
            Atomics.notify(job.flag, 0);
        }
    });
    let reply: WorkerReply;
    try {
        reply = layOut(job.view, job.options);
    } catch (error) {
        reply = { error: error instanceof Error ? error.message : String(error) };
    }
    job.port.postMessage(reply);
    Atomics.store(job.flag, 0, 1);
    Atomics.notify(job.flag, 0);
    return true;
}

function startJob(view: C4View, options: LayoutOptions, spec: LayoutWorkerSpec) {
    const { MessageChannel, Worker } = threads();
    const flag = new Int32Array(new SharedArrayBuffer(4));
    const { port1, port2 } = new MessageChannel();
    const job: LayoutJob = { c4xLayoutJob: true, view, options, flag, port: port2 };
    const worker = new Worker(spec.script, { eval: spec.eval ?? false, workerData: job, transferList: [port2] });
    worker.unref();
    return { flag, port1, worker };
}

function outcomeOf(reply: WorkerReply): LayoutOutcome {
    if ('error' in reply) { throw new Error(reply.error); }
    return { status: 'ok', layout: reply.layout, grewText: reply.grewText };
}

/** Lay out without blocking the caller's thread; stop at the deadline or when `signal` aborts. */
export async function layoutWithDeadline(
    view: C4View,
    options: LayoutOptions,
    spec: LayoutWorkerSpec,
    deadlineMs: number = PREVIEW_LAYOUT_BUDGET_MS,
    signal?: AbortSignal,
): Promise<LayoutOutcome> {
    if (signal?.aborted) { return { status: 'cancelled' }; }
    const { port1, worker } = startJob(view, options, spec);
    let timer: NodeJS.Timeout | undefined;
    let onAbort: (() => void) | undefined;
    const settled = await new Promise<WorkerReply | { failed: string } | 'timeout' | 'cancelled'>(resolve => {
        timer = setTimeout(() => resolve('timeout'), deadlineMs);
        port1.once('message', (reply: WorkerReply) => resolve(reply));
        worker.once('error', error => resolve({ failed: error instanceof Error ? error.message : String(error) }));
        worker.once('exit', code => {
            const pending = threads().receiveMessageOnPort(port1) as { message: WorkerReply } | undefined;
            resolve(pending ? pending.message : { failed: `exit code ${code}` });
        });
        if (signal) {
            onAbort = () => resolve('cancelled');
            signal.addEventListener('abort', onAbort, { once: true });
        }
    });
    clearTimeout(timer);
    if (signal && onAbort) { signal.removeEventListener('abort', onAbort); }
    port1.close();
    await worker.terminate();
    if (settled === 'timeout') { return { status: 'timed-out', message: layoutTooLongMessage(view, deadlineMs) }; }
    if (settled === 'cancelled') { return { status: 'cancelled' }; }
    if ('failed' in settled) { return { status: 'failed', message: layoutFailedMessage(settled.failed) }; }
    return outcomeOf(settled);
}

/** Lay out, blocking the caller at most `deadlineMs` (Markdown preview and export). */
export function layoutWithDeadlineSync(
    view: C4View,
    options: LayoutOptions,
    spec: LayoutWorkerSpec,
    deadlineMs: number = PREVIEW_LAYOUT_BUDGET_MS,
): LayoutOutcome {
    if (!spec.eval && !fs.existsSync(spec.script)) {
        return { status: 'failed', message: layoutFailedMessage('worker script not found') };
    }
    const { flag, port1, worker } = startJob(view, options, spec);
    worker.on('error', () => undefined);
    let reply: { message: WorkerReply } | undefined;
    let exitedEarly = false;
    try {
        Atomics.wait(flag, 0, 0, deadlineMs);
        exitedEarly = Atomics.load(flag, 0) === 2;
        reply = threads().receiveMessageOnPort(port1) as { message: WorkerReply } | undefined;
    } finally {
        port1.close();
        void worker.terminate();
    }
    if (!reply) {
        return exitedEarly
            ? { status: 'failed', message: layoutFailedMessage('the worker exited before replying') }
            : { status: 'timed-out', message: layoutTooLongMessage(view, deadlineMs) };
    }
    return outcomeOf(reply.message);
}
