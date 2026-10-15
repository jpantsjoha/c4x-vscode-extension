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
const { VSIX_BUDGET_BYTES, vsixFindings } = require('./vsix-budget');
const { bundleRuntimeFindings, installedBundlePath } = require('./bundle-runtime');
const { NOTICES_FILE, bundledPackageDirectories, listedPackages } = require('./third-party-notices');
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
  'NOTICE.md',
  'package.json',
  'README.md',
  'snippets/c4x.json',
  'syntaxes/c4x.tmLanguage.json',
  'THIRD_PARTY_NOTICES.txt',
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

// The notices file is generated from the build's metafile; this checks
// it against different evidence, the shipped bundle itself. esbuild writes a
// `// node_modules/<path>` comment above every module in the unminified bundle
// or a preserved c4x-module comment in whitespace-compacted output, so every
// package the VSIX redistributes must appear as a `Package:` entry, at the
// version installed, with licence text.
//
// Both files are read from the extension as VS Code installed it from the VSIX
// (installedDir), never from the working tree, so the check proves what ships.
// Only the package versions come from the working tree's node_modules, because
// the VSIX carries no node_modules; they are the versions the bundle was built from.
function installedExtensionDir(extensionsDir) {
  const prefix = `${packageJson.publisher}.${packageJson.name}-${packageJson.version}`.toLowerCase();
  const matches = fs.readdirSync(extensionsDir).filter((entry) => entry.toLowerCase().startsWith(prefix));
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one installed ${prefix}* directory under ${extensionsDir}, found ${matches.length}.`);
  }
  return path.join(extensionsDir, matches[0]);
}

function assertThirdPartyNotices(installedDir) {
  const noticesPath = path.join(installedDir, NOTICES_FILE);
  if (!fs.existsSync(noticesPath)) {
    throw new Error(`${NOTICES_FILE} is missing from the installed extension; the VSIX ships without third-party licence notices.`);
  }
  const notices = fs.readFileSync(noticesPath, 'utf8');
  const listed = new Set(listedPackages(notices));
  const bundle = fs.readFileSync(path.join(installedDir, 'dist', 'extension.js'), 'utf8');
  const bundled = bundledPackageDirectories(bundle).map((directory) => {
    const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, directory, 'package.json'), 'utf8'));
    return `${manifest.name}@${manifest.version}`;
  });
  if (bundled.length === 0) {
    throw new Error('Found no dependency module provenance in dist/extension.js; the notices cannot be checked against it.');
  }
  const unlisted = [...new Set(bundled)].filter((id) => !listed.has(id)).sort();
  if (unlisted.length > 0) {
    throw new Error(`${NOTICES_FILE} does not cover every bundled package; missing: ${unlisted.join(', ')}.`);
  }
  // One-way: a listed package the bundle no longer contains over-attributes
  // (tree-shaken inputs still appear in the esbuild metafile), which is
  // harmless, so it warns instead of failing.
  const bundledSet = new Set(bundled);
  const extra = [...listed].filter((id) => !bundledSet.has(id)).sort();
  if (extra.length > 0) {
    console.warn(`Warning: ${NOTICES_FILE} lists packages not found in dist/extension.js (over-attribution, not a failure): ${extra.join(', ')}.`);
  }
  console.log(
    `Third-party notices check passed: ${NOTICES_FILE} covers all ${new Set(bundled).size} packages in dist/extension.js ` +
      `(${listed.size} listed).`,
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

  // The package ceiling is 2.5 MB; the figure was declared and never asserted (#203).
  const overBudget = vsixFindings(expectedVsix);
  if (overBudget.length > 0) {
    throw new Error(`VSIX budget check failed (${overBudget.join(', ')}); the package ceiling is ${VSIX_BUDGET_BYTES} bytes.`);
  }
  console.log(`VSIX size ${fs.statSync(expectedVsix).size} bytes, within the ${VSIX_BUDGET_BYTES}-byte package ceiling.`);

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

    // What activation below cannot show: a module the bundle requires but the
    // VSIX does not ship fails only on first AI use, and so does an SDK that is
    // evaluated at activation instead of on first use (#181). Checked on the
    // bundle VS Code just installed from the VSIX, not on dist/ in this tree,
    // which may have been rebuilt since the VSIX was packaged.
    const installedBundle = installedBundlePath(extensionsDir, packageJson);
    const bundleFindings = bundleRuntimeFindings(installedBundle);
    if (bundleFindings.length > 0) {
      throw new Error(`Bundle runtime check failed on the installed bundle ${installedBundle}: ${bundleFindings.join(', ')}.`);
    }
    console.log(`Bundle runtime check passed on the installed bundle (${path.relative(extensionsDir, installedBundle)}): every required module ships or is provided, and the Gemini SDK is not loaded at activation.`);
    assertThirdPartyNotices(installedExtensionDir(extensionsDir));

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
