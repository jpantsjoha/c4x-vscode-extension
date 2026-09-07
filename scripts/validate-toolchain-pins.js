#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const packageJson = require(path.join(projectRoot, 'package.json'));
const workflow = fs.readFileSync(path.join(projectRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
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

assert(toolchain && typeof toolchain === 'object', 'package.json must define c4xToolchain');
assert(Array.isArray(toolchain.node) && toolchain.node.length > 0, 'c4xToolchain.node must list exact Node.js versions');
assert(typeof toolchain.pnpm === 'string', 'c4xToolchain.pnpm must be an exact version');
assert(typeof toolchain.vscode === 'string', 'c4xToolchain.vscode must be an exact version');
assert(Array.isArray(toolchain.runners) && toolchain.runners.length === 3, 'c4xToolchain.runners must list the three CI runner families');
assert(toolchain.actions && typeof toolchain.actions === 'object', 'c4xToolchain.actions must record immutable Action SHAs');
assert(packageJson.packageManager === `pnpm@${toolchain.pnpm}`, 'packageManager and c4xToolchain.pnpm must match');
assert(nvmVersion === toolchain.node[0], '.nvmrc must select the primary Node.js version');
assert(actualPnpm === toolchain.pnpm, `pnpm mismatch: expected ${toolchain.pnpm}, received ${actualPnpm || 'unknown'}`);
assert(configuredVSCode === toolchain.vscode, `VS Code mismatch: expected ${toolchain.vscode}, received ${configuredVSCode}`);
if (expectedNode) {
  assert(toolchain.node.includes(expectedNode), `Expected Node.js ${expectedNode} is not declared in c4xToolchain.node`);
  assert(actualNode === expectedNode, `Node.js mismatch: expected ${expectedNode}, received ${actualNode}`);
}

const workflowPins = [
  ...toolchain.node,
  toolchain.pnpm,
  toolchain.vscode,
  ...toolchain.runners,
  ...Object.values(toolchain.actions),
];
for (const pin of workflowPins) {
  assert(workflow.includes(pin), `CI workflow does not contain manifest pin: ${pin}`);
}

const forbiddenFloatingValues = [
  '20.x',
  '26.x',
  'ubuntu-latest',
  'macos-latest',
  'windows-latest',
  'actions/checkout@v',
  'actions/setup-node@v',
  'actions/upload-artifact@v',
  'actions/download-artifact@v',
  'pnpm/action-setup@v',
];
for (const value of forbiddenFloatingValues) {
  assert(!workflow.includes(value), `CI workflow retains floating toolchain value: ${value}`);
}

assert(!smokeScript.includes("|| 'stable'"), 'Packaged-VSIX smoke must not default to floating VS Code stable');
assert(!hostRunner.includes("|| 'stable'"), 'Extension Host tests must not default to floating VS Code stable');

const actionLines = workflow.split('\n').filter((line) => line.trimStart().startsWith('uses:'));
for (const line of actionLines) {
  const reference = line.split('@')[1]?.trim().split(' ')[0];
  const isImmutableSha = reference?.length === 40 && [...reference].every((character) => '0123456789abcdef'.includes(character));
  assert(isImmutableSha, `GitHub Action is not pinned to an immutable commit SHA: ${line.trim()}`);
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
  actions: toolchain.actions,
}, null, 2));
