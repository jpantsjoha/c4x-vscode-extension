/**
 * Entry point of the `c4x-lint` bundle (`cli/c4x-lint.cjs`). Kept apart from
 * `./c4xLint.ts` so importing the runner in tests does not run it.
 */
import { processIo, runLint } from './c4xLint';

process.exitCode = runLint(process.argv.slice(2), processIo());
