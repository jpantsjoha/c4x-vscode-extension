#!/usr/bin/env node
'use strict';
// The npm package `c4x` (#356): stage, audit and pack.
//   npm/package.json   the published manifest (no version: it follows the extension's package.json)
//   npm/README.md      the package README
// The package is built in a staging directory (default dist/npm/c4x) from the committed bundles, so the
// extension's own package.json never becomes the npm package. Nothing here publishes or logs in.
// Usage:
//   node scripts/npm-package.js stage [--out <dir>]    write the package tree
//   node scripts/npm-package.js audit [--out <dir>]    stage, then check manifest and `npm pack --dry-run --json`
//   node scripts/npm-package.js pack  --out <dir> --dest <dir>   stage, then write the tarball into dest; prints its path
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

/** Exactly the files the tarball may hold, as `npm pack --dry-run --json` lists them (sorted). */
const PACKAGE_FILES = [
  'LICENSE',
  'README.md',
  'cli/THIRD_PARTY_NOTICES.txt',
  'cli/c4x-lint.cjs',
  'cli/c4x.cjs',
  'data/cloud-icons.json',
  'mcp/THIRD_PARTY_NOTICES.txt',
  'mcp/c4x-mcp-server.bundle.cjs',
  'package.json',
];

/** Where each package file comes from in the repository. */
const SOURCES = {
  LICENSE: 'LICENSE',
  'README.md': 'npm/README.md',
  'cli/THIRD_PARTY_NOTICES.txt': 'cli/THIRD_PARTY_NOTICES.txt',
  'cli/c4x-lint.cjs': 'cli/c4x-lint.cjs',
  'cli/c4x.cjs': 'cli/c4x.cjs',
  'data/cloud-icons.json': 'data/cloud-icons.json',
  'mcp/THIRD_PARTY_NOTICES.txt': 'mcp/THIRD_PARTY_NOTICES.txt',
  'mcp/c4x-mcp-server.bundle.cjs': 'mcp/c4x-mcp-server.bundle.cjs',
};

const BANNED_SCRIPTS = ['preinstall', 'install', 'postinstall', 'prepublish', 'preprepare', 'prepare', 'postprepare'];
const DEPENDENCY_FIELDS = ['dependencies', 'optionalDependencies', 'peerDependencies', 'peerDependenciesMeta', 'bundledDependencies', 'bundleDependencies'];

const DEFAULT_OUT = path.join(ROOT, 'dist', 'npm', 'c4x');

/** Writes the package tree into `out` (emptied first). Returns the manifest written. */
function stage(out = DEFAULT_OUT, root = ROOT) {
  const template = JSON.parse(fs.readFileSync(path.join(root, 'npm', 'package.json'), 'utf8'));
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  fs.rmSync(out, { recursive: true, force: true });
  for (const [target, source] of Object.entries(SOURCES)) {
    const from = path.join(root, source);
    if (!fs.statSync(from).isFile()) throw new Error(`Package source is not a file: ${source}`);
    fs.mkdirSync(path.dirname(path.join(out, target)), { recursive: true });
    fs.copyFileSync(from, path.join(out, target));
    fs.chmodSync(path.join(out, target), fs.statSync(from).mode & 0o777);
  }
  const manifest = { name: template.name, version, ...template };
  fs.writeFileSync(path.join(out, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

/** Problems in a manifest against the threat-model checklist ("npm package c4x"). Empty when clean. */
function auditManifest(manifest) {
  const problems = [];
  const scripts = manifest.scripts ?? {};
  if (Object.keys(scripts).length > 0) problems.push(`scripts present: ${Object.keys(scripts).join(', ')}`);
  for (const name of BANNED_SCRIPTS) if (name in scripts) problems.push(`lifecycle script ${name}`);
  for (const field of DEPENDENCY_FIELDS) {
    const value = manifest[field];
    if (value !== undefined && (Array.isArray(value) ? value.length : Object.keys(value).length) > 0) problems.push(`${field} is not empty`);
  }
  if (manifest.gypfile) problems.push('gypfile set (native build)');
  if (!Array.isArray(manifest.files)) problems.push('no files allowlist');
  else {
    const listed = [...manifest.files].sort();
    const expected = PACKAGE_FILES.filter(f => f !== 'package.json');
    if (JSON.stringify(listed) !== JSON.stringify(expected)) problems.push(`files allowlist is ${JSON.stringify(listed)}, expected ${JSON.stringify(expected)}`);
  }
  for (const [name, target] of Object.entries(manifest.bin ?? {})) {
    if (!PACKAGE_FILES.includes(target)) problems.push(`bin ${name} points outside the allowlist: ${target}`);
  }
  if (!manifest.bin || !manifest.bin.c4x || !manifest.bin['c4x-mcp']) problems.push('bin must name c4x and c4x-mcp');
  if (manifest.name !== 'c4x' && manifest.name !== '@jpantsjoha/c4x') problems.push(`unexpected package name ${manifest.name}`);
  if (manifest.private) problems.push('private is set; the package could not be published');
  return problems;
}

/**
 * The command and leading arguments that run npm. On Windows npm is a .cmd shim, which Node refuses to spawn
 * without a shell, so run npm's own script with this Node; elsewhere run `npm`. `pathModule` and `execPath`
 * are parameters so a test can simulate win32.
 */
function npmInvocation(platform = process.platform, execPath = process.execPath, pathModule = path) {
  if (platform !== 'win32') return { command: 'npm', args: [] };
  return { command: execPath, args: [pathModule.join(pathModule.dirname(execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')] };
}

/**
 * The real script an installed package's bin entry points at, read from its package.json. node_modules/.bin
 * holds shims on Windows, not JavaScript files, so tests run `process.execPath <script>` instead.
 */
function binScript(installedDir, name, pathModule = path, readFile = (f) => fs.readFileSync(f, 'utf8')) {
  const manifest = JSON.parse(readFile(pathModule.join(installedDir, 'package.json')));
  const target = manifest.bin && manifest.bin[name];
  if (typeof target !== 'string') throw new Error(`The installed package has no bin entry ${name}`);
  return pathModule.join(installedDir, ...target.split('/'));
}

function npm(args, cwd) {
  const invocation = npmInvocation();
  const result = spawnSync(invocation.command, [...invocation.args, ...args], { cwd, encoding: 'utf8', timeout: 120000, env: { ...process.env, npm_config_update_notifier: 'false' } });
  if (result.status !== 0) throw new Error(`npm ${args.join(' ')} exited ${result.status}: ${result.stderr || result.error}`);
  return result.stdout;
}

/** The files `npm pack --dry-run --json` would put in the tarball for a package directory. */
function packedFiles(dir) {
  const report = JSON.parse(npm(['pack', '--dry-run', '--json', '--ignore-scripts'], dir));
  return report[0].files.map(f => f.path).sort();
}

/** Problems with a package directory: manifest rules, and the packed file list equal to the allowlist. */
function auditPackage(dir) {
  const problems = auditManifest(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')));
  const packed = packedFiles(dir);
  const expected = [...PACKAGE_FILES].sort();
  const stray = packed.filter(f => !expected.includes(f));
  const missing = expected.filter(f => !packed.includes(f));
  if (stray.length) problems.push(`tarball would carry files outside the allowlist: ${stray.join(', ')}`);
  if (missing.length) problems.push(`tarball lacks allowlisted files: ${missing.join(', ')}`);
  for (const [target] of Object.entries(SOURCES)) {
    if (!fs.existsSync(path.join(dir, target))) problems.push(`staged file missing: ${target}`);
  }
  return problems;
}

/** Writes the tarball for `dir` into `dest` and returns its path. */
function pack(dir, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const report = JSON.parse(npm(['pack', '--json', '--ignore-scripts', '--pack-destination', dest], dir));
  return path.join(dest, report[0].filename);
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : path.resolve(process.argv[i + 1]);
}

function main() {
  const command = process.argv[2];
  const out = arg('--out') ?? DEFAULT_OUT;
  if (command === 'stage') {
    stage(out);
    console.log(`Staged ${out}`);
  } else if (command === 'audit') {
    stage(out);
    const problems = auditPackage(out);
    if (problems.length) {
      console.error(`npm package audit failed:\n- ${problems.join('\n- ')}`);
      process.exit(1);
    }
    console.log(`npm package audit passed: ${PACKAGE_FILES.length} files, no scripts, no dependencies.`);
  } else if (command === 'pack') {
    stage(out);
    console.log(pack(out, arg('--dest') ?? fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-npm-pack-'))));
  } else {
    console.error('Usage: node scripts/npm-package.js stage|audit|pack [--out dir] [--dest dir]');
    process.exit(2);
  }
}

if (require.main === module) main();
module.exports = { npmInvocation, binScript, PACKAGE_FILES, SOURCES, stage, auditManifest, auditPackage, packedFiles, pack };
