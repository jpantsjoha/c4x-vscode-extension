#!/usr/bin/env node

// Enables a read-only test API in the installed extension. The smoke requires
// a fresh document-scoped acknowledgement from the rendered webview DOM;
// extension activation and the client's earlier "ready" message are not proof.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const {
  downloadAndUnzipVSCode,
  runTests,
  runVSCodeCommand,
} = require('@vscode/test-electron');
const vsce = require('@vscode/vsce');

const projectRoot = path.resolve(__dirname, '..');
const packageJson = require(path.join(projectRoot, 'package.json'));
const expectedVsix = path.join(projectRoot, `${packageJson.name}-${packageJson.version}.vsix`);
const vscodeVersion = process.env.C4X_VSCODE_VERSION || packageJson.c4xToolchain.vscode;

// The VSIX allowlist gate (#162). `vsce package` writes two entries at the
// zip root that are packaging metadata, not extension source, and are
// invariant across every package this toolchain produces:
//   extension.vsixmanifest, [Content_Types].xml
// Everything else lands under an "extension/" prefix inside the zip. The
// list below is that remainder, exactly as vsce reads it off this working
// tree BEFORE it adds that prefix or renames anything -- i.e. what
// `vsce ls --no-dependencies` prints. Note the on-disk name "LICENSE"
// (vsce renames it to "LICENSE.txt" only inside the packaged zip).
const EXPECTED_PACKAGED_FILES = [
  'assets/marketplace/icon.png',
  'assets/scripts/preview.js',
  'assets/styles/markdown.css',
  'CHANGELOG.md',
  'dist/extension.js',
  'language-configuration.json',
  'LICENSE',
  'package.json',
  'README.md',
  'snippets/c4x.json',
  'syntaxes/c4x.tmLanguage.json',
];

// Cross-platform on ubuntu/macos/windows-2025 and adds no dependency: rather
// than spawn the `vsce` CLI binary (whose npm-generated shim differs by
// platform -- `vsce` on POSIX, `vsce.cmd`/`vsce.ps1` on Windows -- and whose
// human-readable `ls` output is free to reformat between vsce releases),
// this calls `@vscode/vsce`'s own programmatic `listFiles()` API directly.
// `vsce ls --no-dependencies` is implemented as exactly this call with
// `packageManager: PackageManager.None`, so the result is identical to
// parsing that command's stdout, without the parsing or the subprocess.
// (`@vscode/vsce`'s own zip reader, `yauzl`, is a transitive dependency and
// is not resolvable from here under pnpm's strict node_modules layout, so
// reading the produced .vsix directly was not an available option.)
async function assertVsixAllowlist() {
  const packaged = await vsce.listFiles({
    cwd: projectRoot,
    packageManager: vsce.PackageManager.None,
  });

  const packagedSet = new Set(packaged);
  const expectedSet = new Set(EXPECTED_PACKAGED_FILES);

  const unexpected = packaged.filter((file) => !expectedSet.has(file)).sort();
  const missing = EXPECTED_PACKAGED_FILES.filter((file) => !packagedSet.has(file)).sort();

  if (unexpected.length > 0 || missing.length > 0) {
    const parts = [];
    if (unexpected.length > 0) {
      parts.push(`unexpected entries: ${unexpected.join(', ')}`);
    }
    if (missing.length > 0) {
      parts.push(`missing entries: ${missing.join(', ')}`);
    }
    throw new Error(
      `VSIX allowlist check failed (${parts.join('; ')}). Expected exactly the ` +
        `${EXPECTED_PACKAGED_FILES.length} allowlisted files (plus the 2 vsce-generated ` +
        'root entries, extension.vsixmanifest and [Content_Types].xml, which this check ' +
        'does not need to see -- vsce always emits them unchanged).',
    );
  }

  console.log(
    `VSIX allowlist check passed: ${packaged.length} packaged files match the allowlist exactly.`,
  );
}

async function runCli(args) {
  const result = await runVSCodeCommand(args, {
    version: vscodeVersion,
    cachePath: process.env.C4X_VSCODE_TEST_CACHE || path.join(os.tmpdir(), 'c4x-vscode-test-cache'),
    spawn: {
      cwd: projectRoot,
    },
  });

  if (result.stdout.length > 0) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr.length > 0) {
    process.stderr.write(result.stderr);
  }

  return result.stdout;
}

async function main() {
  if (!fs.existsSync(expectedVsix)) {
    throw new Error(`Expected packaged extension was not found: ${expectedVsix}`);
  }

  console.log('Checking packaged VSIX contents against the allowlist...');
  await assertVsixAllowlist();

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-vsix-smoke-'));
  const extensionsDir = path.join(tempRoot, 'extensions');
  const userDataDir = path.join(tempRoot, 'user-data');
  const workspaceDir = path.join(tempRoot, 'workspace');
  const receiptPath = path.join(tempRoot, 'render-receipt.json');
  const receiptToken = randomUUID();
  fs.mkdirSync(extensionsDir, { recursive: true });
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(workspaceDir, { recursive: true });

  try {
    console.log(`Pinned VS Code test version: ${vscodeVersion}`);
    const vscodeExecutablePath = await downloadAndUnzipVSCode({
      version: vscodeVersion,
      cachePath: process.env.C4X_VSCODE_TEST_CACHE || path.join(os.tmpdir(), 'c4x-vscode-test-cache'),
    });
    const profileArgs = [
      `--extensions-dir=${extensionsDir}`,
      `--user-data-dir=${userDataDir}`,
    ];

    console.log(`Installing clean VSIX: ${path.basename(expectedVsix)}`);
    await runCli([
      ...profileArgs,
      '--install-extension',
      expectedVsix,
      '--force',
    ]);

    const installed = await runCli([
      ...profileArgs,
      '--list-extensions',
      '--show-versions',
    ]);
    const expectedIdentifier = `${packageJson.publisher}.${packageJson.name}@${packageJson.version}`;
    if (!installed.split(/\r?\n/).includes(expectedIdentifier)) {
      throw new Error(`Installed extension list did not contain ${expectedIdentifier}`);
    }

    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath: path.join(projectRoot, 'test', 'vsix-smoke', 'host'),
      extensionTestsPath: path.join(projectRoot, 'out', 'test', 'vsix-smoke', 'index'),
      launchArgs: [
        workspaceDir,
        ...profileArgs,
        '--disable-gpu',
      ],
      extensionTestsEnv: {
        C4X_VSIX_SMOKE: '1',
        C4X_SMOKE_RECEIPT: receiptPath,
        C4X_SMOKE_RECEIPT_TOKEN: receiptToken,
        C4X_EXPECTED_EXTENSION_ROOT: extensionsDir,
        C4X_EXPECTED_VERSION: packageJson.version,
      },
    });

    if (!fs.existsSync(receiptPath)) {
      throw new Error('VS Code exited without a packaged webview render receipt; the smoke did not complete.');
    }
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    if (receipt.token !== receiptToken || receipt.version !== packageJson.version || receipt.nodeCount !== 2) {
      throw new Error('Invalid packaged webview render receipt');
    }
    console.log('Clean VSIX install, activation, commands, and rendered webview nodes/labels passed.');
  } finally {
    if (process.env.C4X_KEEP_VSIX_SMOKE !== '1') {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } else {
      console.log(`Preserved smoke-test profile: ${tempRoot}`);
    }
  }
}

main().catch((error) => {
  console.error('Clean VSIX smoke failed:', error);
  process.exitCode = 1;
});
