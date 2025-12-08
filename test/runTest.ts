import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { runTests, downloadAndUnzipVSCode } from '@vscode/test-electron';

async function main() {
  let tempDir: string | null = null;

  try {
    console.log('🧪 Starting C4X extension tests...');

    // Path to extension root (needs to go up 2 levels from out/test/ to project root)
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

    // Path to test suite entry point
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

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
      const vscodeTestDir = path.join(os.tmpdir(), 'c4x-vscode-test-cache');
      console.log(`   Using VS Code cache at: ${vscodeTestDir}`);
      vscodeExecutablePath = await downloadAndUnzipVSCode({
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

    // Download VS Code, unzip, and run tests
    await runTests({
      extensionDevelopmentPath: effectiveExtensionPath,
      extensionTestsPath: effectiveTestsPath,
      vscodeExecutablePath,
      launchArgs
    });

    console.log('✅ All tests passed!');
  } catch (err) {
    console.error('❌ Failed to run tests:', err);
    process.exit(1);
  } finally {
    // Cleanup temp directory (but not immediately - VS Code may still be running)
    // Note: The temp directory will be cleaned up by the OS eventually
    if (tempDir) {
      console.log(`   Temp directory (will be cleaned by OS): ${tempDir}`);
    }
  }
}

main();
