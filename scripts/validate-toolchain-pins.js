#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const packageJson = require(path.join(projectRoot, 'package.json'));
// GitHub Actions is retired (2026-10-01) and the workflows were removed, so the pins are no
// longer cross-checked against ci.yml. They are checked against the files the local gate
// actually runs from: package.json, .nvmrc, the Makefile and the two VS Code launchers.
const makefile = fs.readFileSync(path.join(projectRoot, 'Makefile'), 'utf8');
const nvmVersion = fs.readFileSync(path.join(projectRoot, '.nvmrc'), 'utf8').trim();
const smokeScript = fs.readFileSync(path.join(projectRoot, 'scripts', 'test-vsix-smoke.js'), 'utf8');
const hostRunner = fs.readFileSync(path.join(projectRoot, 'test', 'runTest.ts'), 'utf8');
const toolchain = packageJson.c4xToolchain;
const actualNode = process.version.slice(1);
const pnpmUserAgent = (process.env.npm_config_user_agent || '')
  .split(' ')
  .find((entry) => entry.startsWith('pnpm/'));
const actualPnpm = pnpmUserAgent?.slice('pnpm/'.length);
const expectedNode = process.env.C4X_EXPECTED_NODE_VERSION;
const configuredVSCode = process.env.C4X_VSCODE_VERSION || toolchain?.vscode;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const exactVersion = /^\d+\.\d+\.\d+$/;
assert(toolchain && typeof toolchain === 'object', 'package.json must define c4xToolchain');
assert(Array.isArray(toolchain.node) && toolchain.node.length > 0, 'c4xToolchain.node must list exact Node.js versions');
for (const version of toolchain.node) assert(exactVersion.test(version), `c4xToolchain.node entry is not an exact version: ${version}`);
assert(typeof toolchain.pnpm === 'string' && exactVersion.test(toolchain.pnpm), 'c4xToolchain.pnpm must be an exact version');
assert(typeof toolchain.vscode === 'string' && exactVersion.test(toolchain.vscode), 'c4xToolchain.vscode must be an exact version');
// Runner labels and Action SHAs were pins for hosted CI only. With no workflow left to hold
// them they would be records nothing checks, which is how a pin silently goes stale.
assert(toolchain.runners === undefined, 'c4xToolchain.runners is a hosted-CI pin; GitHub Actions is retired, remove it');
assert(toolchain.actions === undefined, 'c4xToolchain.actions is a hosted-CI pin; GitHub Actions is retired, remove it');
assert(packageJson.packageManager === `pnpm@${toolchain.pnpm}`, 'packageManager and c4xToolchain.pnpm must match');
assert(nvmVersion === toolchain.node[0], '.nvmrc must select the primary Node.js version');
assert(actualPnpm === toolchain.pnpm, `pnpm mismatch: expected ${toolchain.pnpm}, received ${actualPnpm || 'unknown'}`);
assert(configuredVSCode === toolchain.vscode, `VS Code mismatch: expected ${toolchain.vscode}, received ${configuredVSCode}`);
if (expectedNode) {
  assert(toolchain.node.includes(expectedNode), `Expected Node.js ${expectedNode} is not declared in c4xToolchain.node`);
  assert(actualNode === expectedNode, `Node.js mismatch: expected ${expectedNode}, received ${actualNode}`);
}

const forbiddenFloatingValues = ['20.x', '26.x', 'ubuntu-latest', 'macos-latest', 'windows-latest', '@latest', "'stable'", 'insiders'];
// Partial versions follow a moving channel as surely as `latest` does.
const forbiddenFloatingPatterns = [
  [/pnpm@\d+(?:\.\d+)?(?![.\d])/, 'a major- or minor-only pnpm version'],
  [/\bnvm (?:use|install) (?:v?\d+(?:\.\d+)?(?![.\d])|node|lts\S*|--lts)/, 'a partial or aliased nvm version'],
];
function assertNoFloating(text, label) {
  for (const value of forbiddenFloatingValues) {
    assert(!text.includes(value), `${label} retains floating toolchain value: ${value}`);
  }
  for (const [pattern, description] of forbiddenFloatingPatterns) {
    const match = text.match(pattern);
    assert(!match, `${label} retains ${description}: ${match?.[0]}`);
  }
}

// The Makefile is the gate now. It must not override a pin or reach for a moving channel.
assertNoFloating(makefile, 'Makefile');
for (const match of makefile.matchAll(/C4X_VSCODE_VERSION\s*[:?]?=\s*(\S+)/g)) {
  assert(match[1] === toolchain.vscode, `Makefile overrides the VS Code pin with ${match[1]}`);
}
for (const match of makefile.matchAll(/pnpm@(\d+\.\d+\.\d+)/g)) {
  assert(match[1] === toolchain.pnpm, `Makefile names pnpm ${match[1]}, not the pin ${toolchain.pnpm}`);
}

assert(!smokeScript.includes("|| 'stable'"), 'Packaged-VSIX smoke must not default to floating VS Code stable');
assert(!hostRunner.includes("|| 'stable'"), 'Extension Host tests must not default to floating VS Code stable');

// Hosted CI is retired, but a workflow file reintroduced later must not arrive with
// floating runners or mutable Action tags. With no workflow present this loop is empty.
const workflowDir = path.join(projectRoot, '.github', 'workflows');
const workflowFiles = fs.existsSync(workflowDir)
  ? fs.readdirSync(workflowDir).filter((name) => /\.ya?ml$/.test(name))
  : [];
for (const name of workflowFiles) {
  const workflow = fs.readFileSync(path.join(workflowDir, name), 'utf8');
  assertNoFloating(workflow, name);
  // Parse rather than match lines: flow style (`- { uses: x@v4 }`, `steps: [{uses: x@v4}]`) is
  // valid YAML that a line-prefix scan never sees. js-yaml is a development dependency, loaded
  // only when a workflow exists, so the common no-workflow path needs nothing installed.
  let document;
  try { document = require('js-yaml').load(workflow); }
  catch (error) { throw new Error(`${name}: cannot parse workflow YAML (${error.message})`); }
  const jobs = document && typeof document === 'object' && document.jobs && typeof document.jobs === 'object' ? document.jobs : {};
  const references = [];
  for (const [jobName, job] of Object.entries(jobs)) {
    if (!job || typeof job !== 'object') continue;
    if (job.uses !== undefined) references.push([`jobs.${jobName}.uses`, job.uses]);
    for (const [index, step] of (Array.isArray(job.steps) ? job.steps : []).entries()) {
      if (step && typeof step === 'object' && step.uses !== undefined) references.push([`jobs.${jobName}.steps[${index}].uses`, step.uses]);
    }
    for (const label of [job['runs-on']].flat().filter((value) => typeof value === 'string')) {
      assert(!/-latest$/.test(label), `${name}: jobs.${jobName}.runs-on uses a floating runner label: ${label}`);
    }
  }
  for (const [where, value] of references) {
    // Local actions and workflows (`./...`) live in this repository; Docker references pin by digest.
    if (typeof value === 'string' && value.startsWith('./')) continue;
    const reference = typeof value === 'string' ? value.split('@')[1] : undefined;
    const isImmutable = typeof value === 'string' && (value.startsWith('docker://')
      ? /@sha256:[0-9a-f]{64}$/.test(value)
      : /^[0-9a-f]{40}$/.test(reference || ''));
    assert(isImmutable, `${name}: GitHub Action is not pinned to an immutable commit SHA at ${where}: ${value}`);
  }
}

console.log('C4X toolchain pins are exact and internally consistent.');
console.log(JSON.stringify({
  node: actualNode,
  expectedNode: expectedNode || 'local-report-only',
  pnpm: actualPnpm,
  vscode: configuredVSCode,
  runner: {
    os: process.env.RUNNER_OS || process.platform,
    imageOS: process.env.ImageOS || 'local',
    imageVersion: process.env.ImageVersion || 'local',
    architecture: process.arch,
  },
  workflows: workflowFiles,
}, null, 2));
