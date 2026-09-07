import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { randomUUID } from 'node:crypto';
import { runTests, downloadAndUnzipVSCode } from '@vscode/test-electron';
import packageJson from '../package.json';

async function main() {
  let tempDir: string | null = null;
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
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-test-'));

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

    // If we're using temp dir, also use temp paths for extensions and user data
    if (tempDir) {
      const tempExtensionsDir = path.join(tempDir, 'extensions');
      const tempUserDataDir = path.join(tempDir, 'user-data');
      fs.mkdirSync(tempExtensionsDir, { recursive: true });
      fs.mkdirSync(tempUserDataDir, { recursive: true });
      launchArgs.push(`--extensions-dir=${tempExtensionsDir}`);
      launchArgs.push(`--user-data-dir=${tempUserDataDir}`);
    }

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
  } catch (err) {
    console.error('❌ Failed to run tests:', err);
    process.exit(1);
  } finally {
    fs.rmSync(receiptDir, { recursive: true, force: true });
    // Cleanup temp directory (but not immediately - VS Code may still be running)
    // Note: The temp directory will be cleaned up by the OS eventually
    if (tempDir) {
      console.log(`   Temp directory (will be cleaned by OS): ${tempDir}`);
    }
  }
}

main();
