#!/usr/bin/env node

// Proves the installed-package smoke bites (#368, #435): it rewrites a COPY of the
// current VSIX with one deliberate fault, runs the smoke against that copy, and
// requires the smoke to fail for that fault, not for some other reason.
//   node scripts/test-vsix-smoke-bite.js                 every mode below, in turn
//   node scripts/test-vsix-smoke-bite.js webview         webview script throws on render
//   node scripts/test-vsix-smoke-bite.js discard         the client's Discard handler is disabled
//   node scripts/test-vsix-smoke-bite.js export-nowrite  SVG export writes nothing
//   node scripts/test-vsix-smoke-bite.js export-empty    SVG export writes an empty file
// Opt-in (about a minute each); not part of any composite gate.
//
// The zip is rewritten with python3's standard library so no dependency is added.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const packageJson = require(path.join(projectRoot, 'package.json'));
const source = path.join(projectRoot, `${packageJson.name}-${packageJson.version}.vsix`);

const literal = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// pattern: a regular expression that must match extension/dist/extension.js exactly once.
// replacement: what replaces it; "$&" stands for the matched text.
const MODES = {
  webview: {
    pattern: literal('function showSvg(svg, metrics, nextVisualLayout, renderSettings, presentElementTypes, legendSwatchColors) {'),
    replacement: "$& throw new Error('bite: broken webview script');",
    expected: /did not acknowledge a rendered SVG|Packaged webview/,
  },
  discard: {
    pattern: literal('function discardStagedChanges() {'),
    replacement: '$& return;',
    expected: /Discard did not revert the staged move/,
  },
  'export-nowrite': {
    pattern: '\\w+\\.workspace\\.fs\\.writeFile\\(saveUri,Buffer\\.from\\(standaloneSvg,"utf8"\\)\\)',
    replacement: 'void 0',
    expected: /c4x\.exportSvg produced no \.svg file/,
  },
  'export-empty': {
    pattern: 'Buffer\\.from\\(standaloneSvg,"utf8"\\)',
    replacement: 'Buffer.alloc(0)',
    expected: /Exported SVG nodes differ from the rendered diagram/,
  },
};

const REWRITE = `
import re, sys, zipfile
src, dst, pattern, replacement = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
regex = re.compile(pattern.encode())
with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        data = zin.read(item.filename)
        if item.filename == "extension/dist/extension.js":
            if len(regex.findall(data)) != 1:
                sys.exit("bite anchor not found exactly once")
            data = regex.sub(lambda m: replacement.encode().replace(b"$&", m.group(0)), data)
        zout.writestr(item, data)
`;

// Unwinds through the cleanup below: an exit code, never process.exit mid-run.
function runMode(mode, spec) {
  if (!fs.existsSync(source)) {
    console.error(`Package the extension first: ${source} not found.`);
    return 2;
  }
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-vsix-bite-'));
  try {
    const broken = path.join(tempRoot, path.basename(source));
    const rewrite = spawnSync('python3', ['-I', '-c', REWRITE, source, broken, spec.pattern, spec.replacement], { encoding: 'utf8' });
    if (rewrite.status !== 0) {
      console.error(`Could not build the broken VSIX copy: ${rewrite.stderr || rewrite.stdout}`);
      return 2;
    }
    const run = spawnSync(process.execPath, [path.join(__dirname, 'test-vsix-smoke.js')], {
      cwd: projectRoot,
      encoding: 'utf8',
      env: { ...process.env, C4X_SMOKE_VSIX: broken },
      maxBuffer: 64 * 1024 * 1024,
    });
    const output = `${run.stdout}\n${run.stderr}`;
    if (run.status === 0 || /Installed-package journeys passed/.test(output)) {
      console.error(`BITE FAILED (${mode}): the smoke passed against a VSIX with the fault.`);
      return 1;
    }
    if (!spec.expected.test(output)) {
      console.error(`BITE INCONCLUSIVE (${mode}): the smoke failed, but not on the injected fault.\n` + output.slice(-2000));
      return 1;
    }
    console.log('Bite test passed (%s): the smoke fails (exit %d) on the injected fault.', mode, run.status);
    return 0;
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function main() {
  const requested = process.argv[2];
  const modes = requested ? [requested] : Object.keys(MODES);
  let worst = 0;
  for (const mode of modes) {
    if (!Object.hasOwn(MODES, mode)) {
      console.error(`Unknown bite mode "${mode}"; use one of: ${Object.keys(MODES).join(', ')}.`);
      return 2;
    }
    // Object.hasOwn above guards this lookup.
    // eslint-disable-next-line security/detect-object-injection
    worst = Math.max(worst, runMode(mode, MODES[mode]));
  }
  return worst;
}

process.exitCode = main();
