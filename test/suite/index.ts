import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

// Ensure deterministic theme during tests regardless of user workspace settings
if (!process.env.C4X_FORCE_THEME) {
  process.env.C4X_FORCE_THEME = 'classic';
}

export function run(): Promise<void> {
  // Create Mocha test runner
  const mocha = new Mocha({
    ui: 'bdd', // BDD-style (describe/it) instead of TDD (suite/test)
    color: true,
    timeout: 10000, // 10 seconds
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
        mocha.run((failures: number) => {
          if (failures > 0) {
            reject(new Error(`${failures} tests failed.`));
          } else {
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
