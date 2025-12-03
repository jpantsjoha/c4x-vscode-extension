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
    // Find all test files
    glob('**/**.test.js', { cwd: testsRoot }).then((files) => {
      // Add files to test suite
      files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

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
    }).catch((err) => {
      return reject(err);
    });
  });
}
