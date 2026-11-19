import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { randomUUID } from 'node:crypto';
import { runTests, downloadAndUnzipVSCode } from '@vscode/test-electron';
import packageJson from '../package.json';

async function main() {
  // VS Code's control socket lives under the user-data directory, and a unix
  // socket path is capped at 104 bytes. A deep checkout path (a worktree, a
  // sandbox) blows that cap and the host never starts, so user data and
  // extensions always go to a short temp directory.
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-test-'));
  const receiptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-host-receipt-'));
  const receiptPath = path.join(receiptDir, 'result.json');
  const receiptToken = randomUUID();

  try {
    console.log('🧪 Starting C4X extension tests...');

    // Path to extension root (needs to go up 2 levels from out/test/ to project root)
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

    // Path to test suite entry point
    const extensionTestsPath = path.resolve(__dirname, './suite/index');
    const vscodeVersion = process.env.C4X_VSCODE_VERSION || packageJson.c4xToolchain.vscode;
    console.log(`Pinned VS Code test version: ${vscodeVersion}`);

    // VS Code test electron has issues with paths containing spaces
    // Create symlinks in tmp directory if the path contains spaces
    let effectiveExtensionPath = extensionDevelopmentPath;
    let effectiveTestsPath = extensionTestsPath;
    let vscodeExecutablePath: string | undefined;

    if (extensionDevelopmentPath.includes(' ')) {
      console.log('⚠️  Path contains spaces, creating temp environment...');

      // Create symlink for extension development path
      const extLink = path.join(tempDir, 'extension');
      fs.symlinkSync(extensionDevelopmentPath, extLink);
      effectiveExtensionPath = extLink;

      // Adjust tests path relative to the symlink
      effectiveTestsPath = path.join(extLink, 'out', 'test', 'suite', 'index');

      // Download VS Code to a stable temp directory to avoid re-downloading every time
      // We use a fixed name 'c4x-vscode-test-cache' in the system temp dir
      const vscodeTestDir = process.env.C4X_VSCODE_TEST_CACHE || path.join(os.tmpdir(), 'c4x-vscode-test-cache');
      console.log(`   Using VS Code cache at: ${vscodeTestDir}`);
      vscodeExecutablePath = await downloadAndUnzipVSCode({
        version: vscodeVersion,
        cachePath: vscodeTestDir
      });

      console.log(`   Extension path: ${effectiveExtensionPath}`);
      console.log(`   Tests path: ${effectiveTestsPath}`);
      console.log(`   VS Code executable: ${vscodeExecutablePath}`);
    }

    // Prepare launch args with proper paths
    const launchArgs = [
      effectiveExtensionPath, // Open the extension folder as a workspace
      '--disable-extensions', // Disable other extensions
      '--disable-gpu',        // Faster execution
      '--disable-dev-shm-usage', // Prevent shared memory exhaustion on ARM64 macOS
      '--no-sandbox',         // Reduce process overhead
    ];

    // Keep extensions, user data and therefore the control socket on a short
    // path, whatever the checkout path looks like.
    const tempExtensionsDir = path.join(tempDir, 'extensions');
    const tempUserDataDir = path.join(tempDir, 'user-data');
    fs.mkdirSync(tempExtensionsDir, { recursive: true });
    fs.mkdirSync(tempUserDataDir, { recursive: true });
    launchArgs.push(`--extensions-dir=${tempExtensionsDir}`);
    launchArgs.push(`--user-data-dir=${tempUserDataDir}`);

    // Capture CLI arguments (specific test files)
    const testArgs = process.argv.slice(2);
    const extensionTestsEnv: Record<string, string> = {
      C4X_HOST_RECEIPT: receiptPath,
      C4X_HOST_RECEIPT_TOKEN: receiptToken,
    };
    if (testArgs.length > 0) {
      extensionTestsEnv['C4X_TEST_FILES'] = testArgs.join(',');
      console.log('🎯 Running specific tests:', testArgs);
    }

    // Download VS Code, unzip, and run tests
    await runTests({
      extensionDevelopmentPath: effectiveExtensionPath,
      extensionTestsPath: effectiveTestsPath,
      vscodeExecutablePath,
      version: vscodeVersion,
      launchArgs,
      extensionTestsEnv // Pass environment variables
    });

    if (!fs.existsSync(receiptPath)) {
      throw new Error('Extension host exited without a completed test receipt; no tests are proven.');
    }
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    if (receipt.token !== receiptToken || !(receipt.passes > 0) || receipt.failures !== 0) {
      throw new Error('Invalid extension-host test receipt');
    }
    console.log(`✅ Extension-host receipt: ${receipt.passes} passed, ${receipt.pending} pending.`);

    // Upgrade proof (#366), a second short launch so the suite above keeps its
    // workspace: a temporary workspace and a user profile seeded BEFORE the
    // extension first activates, as for someone updating from 1.8.0. See
    // test/upgrade-activation/index.ts for what it asserts.
    if (testArgs.length === 0) {
      const upgradeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-upgrade-'));
      try {
        const upgradeReceipt = path.join(upgradeDir, 'receipt.json');
        const upgradeToken = randomUUID();
        const workspaceDir = path.join(upgradeDir, 'workspace');
        const userDataDir = path.join(upgradeDir, 'user-data');
        fs.mkdirSync(path.join(workspaceDir, '.vscode'), { recursive: true });
        fs.mkdirSync(path.join(userDataDir, 'User'), { recursive: true });
        fs.mkdirSync(path.join(upgradeDir, 'extensions'), { recursive: true });
        const fixtureDir = [
          path.resolve(__dirname, '../../test/fixtures/upgrade-1.8.0'),
          path.resolve(__dirname, 'fixtures/upgrade-1.8.0'),
        ].find(candidate => fs.existsSync(candidate));
        if (!fixtureDir) { throw new Error('upgrade-1.8.0 fixtures not found'); }
        const userSettings = path.join(userDataDir, 'User', 'settings.json');
        const workspaceSettings = path.join(workspaceDir, '.vscode', 'settings.json');
        fs.copyFileSync(path.join(fixtureDir, 'user-settings.json'), userSettings);
        fs.copyFileSync(path.join(fixtureDir, 'workspace-settings.json'), workspaceSettings);
        const upgradeTests = path.join(path.dirname(effectiveTestsPath), '..', 'upgrade-activation', 'index');
        await runTests({
          extensionDevelopmentPath: effectiveExtensionPath,
          extensionTestsPath: path.resolve(upgradeTests),
          vscodeExecutablePath,
          version: vscodeVersion,
          launchArgs: [workspaceDir, '--disable-extensions', '--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox',
            `--extensions-dir=${path.join(upgradeDir, 'extensions')}`, `--user-data-dir=${userDataDir}`],
          extensionTestsEnv: {
            C4X_UPGRADE_USER_SETTINGS: userSettings,
            C4X_UPGRADE_WORKSPACE_SETTINGS: workspaceSettings,
            C4X_UPGRADE_FIXTURES: fixtureDir,
            C4X_UPGRADE_RECEIPT: upgradeReceipt,
            C4X_UPGRADE_RECEIPT_TOKEN: upgradeToken,
          },
        });
        // Electron exiting 0 proves nothing: the entry writes this receipt only
        // after every one of its assertions has passed.
        if (!fs.existsSync(upgradeReceipt)) {
          throw new Error('Upgrade activation launch exited without a completed receipt; nothing is proven.');
        }
        const upgradeResult = JSON.parse(fs.readFileSync(upgradeReceipt, 'utf8'));
        if (upgradeResult.token !== upgradeToken || upgradeResult.passed !== true) {
          throw new Error('Invalid upgrade activation receipt');
        }
        console.log('✅ Upgrade activation launch passed.');
      } finally {
        removeQuietly(upgradeDir);
      }
    }

    // Change Theme with no folder open (#479, R181-02): a third launch with no
    // workspace, so the real settings API rejects a workspace-scope write.
    if (testArgs.length === 0) {
      const noFolderDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-nofolder-'));
      try {
        const receipt = path.join(noFolderDir, 'receipt.json');
        const token = randomUUID();
        const userDataDir = path.join(noFolderDir, 'user-data');
        fs.mkdirSync(path.join(userDataDir, 'User'), { recursive: true });
        fs.mkdirSync(path.join(noFolderDir, 'extensions'), { recursive: true });
        const userSettings = path.join(userDataDir, 'User', 'settings.json');
        fs.writeFileSync(userSettings, '{}\n');
        const noFolderTests = path.join(path.dirname(effectiveTestsPath), '..', 'no-folder-theme', 'index');
        await runTests({
          extensionDevelopmentPath: effectiveExtensionPath,
          extensionTestsPath: path.resolve(noFolderTests),
          vscodeExecutablePath,
          version: vscodeVersion,
          launchArgs: ['--disable-extensions', '--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox',
            `--extensions-dir=${path.join(noFolderDir, 'extensions')}`, `--user-data-dir=${userDataDir}`],
          extensionTestsEnv: {
            C4X_NOFOLDER_USER_SETTINGS: userSettings,
            C4X_NOFOLDER_RECEIPT: receipt,
            C4X_NOFOLDER_RECEIPT_TOKEN: token,
          },
        });
        if (!fs.existsSync(receipt)) {
          throw new Error('No-folder launch exited without a completed receipt; nothing is proven.');
        }
        const result = JSON.parse(fs.readFileSync(receipt, 'utf8'));
        if (result.token !== token || result.passed !== true) {
          throw new Error('Invalid no-folder theme receipt');
        }
        console.log('✅ No-folder Change Theme launch passed.');
      } finally {
        removeQuietly(noFolderDir);
      }
    }
  } catch (err) {
    console.error('❌ Failed to run tests:', err);
    // Not process.exit: that terminates synchronously and the finally below
    // never runs, so a FAILING run — the one you repeat — leaked every time.
    process.exitCode = 1;
  } finally {
    // The host has exited by the time this runs. The receipt is spent either way;
    // the profile goes only when the run passed — on failure its logs are the
    // diagnostic, so it stays and its path is printed. Cleanup must never turn a
    // green run red, so a removal failure is reported rather than thrown.
    removeQuietly(receiptDir);
    if (process.exitCode) {
      console.log(`   Profile kept for diagnosis (delete when done): ${tempDir}`);
    } else {
      removeQuietly(tempDir);
    }
  }
}

/**
 * Removes a directory this process created. Retries because on Windows a helper
 * of the just-closed extension host can still hold a file for a moment, and a
 * cleanup failure must not fail an otherwise green run.
 */
function removeQuietly(dir: string) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch (err) {
    console.warn(`⚠️  Could not remove ${dir}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

main();
