import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';
import { writeFileSync } from 'node:fs';

// Ensure deterministic theme during tests regardless of user workspace settings
if (!process.env.C4X_FORCE_THEME) {
  process.env.C4X_FORCE_THEME = 'classic';
}

/**
 * The activation budget (#201) is judged on a measurement taken here, before any
 * suite runs: the first suite mocha loads activates the extension itself, so a
 * measurement taken inside a test always found it already active. If the host had
 * activated it before this runner was even entered, `wasActive` says so and the
 * budget test fails rather than passing on a number nobody took.
 */
async function measureColdActivation(): Promise<void> {
  const vscode = await import('vscode');
  const extension = vscode.extensions.getExtension('jpantsjoha.c4x');
  if (!extension) {
    (globalThis as Record<string, unknown>).__c4xActivation = { missing: true, wasActive: false, ms: NaN };
    return;
  }
  // VS Code infers activation from contributions; the explicit onUri event
  // also stays idle here. None fires in the empty test
  // workspace before this runner is entered, which is why isActive is false here
  // and activate() below is the cold path. isActive cannot see an activation that
  // is in flight; if one ever were, ms would be short of the real cost, not over.
  const wasActive = extension.isActive;
  const startedAt = Date.now();
  await extension.activate();
  (globalThis as Record<string, unknown>).__c4xActivation = { missing: false, wasActive, ms: Date.now() - startedAt };
}

export async function run(): Promise<void> {
  await measureColdActivation();
  // Create Mocha test runner
  const mocha = new Mocha({
    ui: 'bdd', // BDD-style (describe/it) instead of TDD (suite/test)
    color: true,
    timeout: 30000, // 30 seconds (ARM64 macOS needs more time under symlinks)
  });

  const testsRoot = path.resolve(__dirname, '..');

  return new Promise((resolve, reject) => {
    // Check if specific files requested via runTest.ts
    const specificFiles = process.env.C4X_TEST_FILES ? process.env.C4X_TEST_FILES.split(',') : [];

    if (specificFiles.length > 0) {
      // Map source paths to compiled paths
      // Input: test/integration/ContextDepth.test.ts
      // Output: integration/ContextDepth.test.js
      const mappedFiles = specificFiles.map(f => {
        let relative = f;
        if (relative.startsWith('test/')) relative = relative.substring(5); // strip test/
        if (relative.endsWith('.ts')) relative = relative.replace(/\.ts$/, '.js');
        return relative;
      });

      console.log('🎯 Running specific tests (mapped):', mappedFiles);
      mappedFiles.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));
      runMocha();
    } else {
      // Find all test files
      glob('**/**.test.js', { cwd: testsRoot }).then((files) => {
        files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));
        runMocha();
      }).catch(err => reject(err));
    }

    function runMocha() {
      try {
        // Run tests
        const runner = mocha.run((failures: number) => {
          if (failures > 0) {
            reject(new Error(`${failures} tests failed.`));
          } else if (!runner.stats?.passes) {
            reject(new Error('Extension host completed without any passing tests.'));
          } else {
            if (process.env.C4X_HOST_RECEIPT) {
              writeFileSync(process.env.C4X_HOST_RECEIPT, JSON.stringify({
                token: process.env.C4X_HOST_RECEIPT_TOKEN,
                passes: runner.stats.passes,
                pending: runner.stats.pending,
                failures,
              }));
            }
            resolve();
          }
        });
      } catch (err) {
        console.error(err);
        reject(err);
      }
    }
  });
}
