/**
 * Entry point of the `c4x` bundle (`cli/c4x.cjs`, #353). Kept apart from
 * `./renderCli.ts` so importing the runner in tests does not run it. In a
 * render worker (a thread on this same bundle, ./renderWorker.ts) it draws
 * the job and stops instead.
 */
import { renderProcessIo, runC4x } from './renderCli';
import { runRenderWorkerIfWorker } from './renderWorker';

if (!runRenderWorkerIfWorker()) {
    process.exitCode = runC4x(process.argv.slice(2), renderProcessIo());
}
