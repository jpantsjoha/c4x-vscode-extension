#!/usr/bin/env node
'use strict';
// Generates every C4X plugin file from one source (#358, #359, #377):
//   scripts/plugin-source.json  name, description, links, server entry, skills
//   package.json                version, licence, author (the plugin version follows the extension)
// Outputs, all committed:
//   .claude-plugin/marketplace.json           Claude Code marketplace; Codex reads it as its legacy-compatible location
//   gemini-extension.json                     Gemini CLI manifest (must sit at the repository root)
//   plugins/c4x/.claude-plugin/plugin.json    Claude Code plugin manifest
//   plugins/c4x/.codex-plugin/plugin.json     Codex plugin manifest
//   plugins/c4x/.mcp.json                     the bundled C4X MCP server (Claude Code)
//   plugins/c4x/codex-mcp.json                the same server for Codex
//   plugins/c4x/server/                       copy of the MCP bundle and its notices (a plugin may not reach outside its root)
//   plugins/c4x/data/cloud-icons.json         copy of the AWS and Azure icon data the bundle reads from ../data (#534)
//   plugins/c4x/skills/<name>/                copy of each root skill
// Hand-written plugin files (commands/, evals/) are not touched.
// Usage: node scripts/generate-plugin-manifests.js [--check]. --check writes nothing and exits 1 on drift.
const fs = require('node:fs');
const path = require('node:path');

const SOURCE = 'scripts/plugin-source.json';

function listFiles(root, relative) {
  const out = [];
  const walk = (rel) => {
    for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === '.DS_Store') continue;
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile()) out.push(child);
      else throw new Error(`Not a regular file: ${child}`);
    }
  };
  walk(relative);
  return out;
}

const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const isExecutable = (file) => (fs.statSync(file).mode & 0o111) !== 0;

/** Returns Map<relativePath, { bytes: Buffer, executable: boolean }> for every generated file. */
function build(root) {
  const source = JSON.parse(fs.readFileSync(path.join(root, SOURCE), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const version = pkg.version;
  const author = { name: pkg.author.name };
  const pluginRoot = source.pluginRoot;
  const out = new Map();
  const put = (rel, bytes, executable = false) => out.set(rel, { bytes, executable });

  const common = {
    name: source.name,
    version,
    description: source.description,
    author,
    homepage: source.homepage,
    repository: source.repository,
    license: pkg.license,
    keywords: source.keywords,
  };

  put(`${pluginRoot}/.claude-plugin/plugin.json`, json({ ...common, displayName: source.displayName }));
  put(`${pluginRoot}/.codex-plugin/plugin.json`, json({
    ...common,
    skills: './skills/',
    mcpServers: './codex-mcp.json',
    interface: { displayName: source.displayName, shortDescription: source.description, category: source.category },
  }));
  put(`${pluginRoot}/.mcp.json`, json({
    mcpServers: { [source.server.name]: { command: 'node', args: [`\${CLAUDE_PLUGIN_ROOT}/${source.server.target}`] } },
  }));
  // Codex does not expand ${CLAUDE_PLUGIN_ROOT} in a server's args; it resolves a relative cwd from the plugin root.
  put(`${pluginRoot}/codex-mcp.json`, json({
    mcpServers: { [source.server.name]: { command: 'node', args: [`./${source.server.target}`], cwd: '.' } },
  }));
  const serverTarget = `${pluginRoot}/${source.server.target}`;
  put(serverTarget, fs.readFileSync(path.join(root, source.server.bundle)), isExecutable(path.join(root, source.server.bundle)));
  put(`${path.posix.dirname(serverTarget)}/THIRD_PARTY_NOTICES.txt`, fs.readFileSync(path.join(root, source.server.notices)));
  // The bundle reads its icon data from ../data beside its own directory (src/assets/cloudIcons.ts).
  put(`${pluginRoot}/${source.server.data}`, fs.readFileSync(path.join(root, source.server.data)));
  for (const skill of source.skills) {
    for (const file of listFiles(root, skill)) {
      put(`${pluginRoot}/${file}`, fs.readFileSync(path.join(root, file)), isExecutable(path.join(root, file)));
    }
  }

  put('.claude-plugin/marketplace.json', json({
    name: source.name,
    description: source.description,
    owner: author,
    plugins: [{
      name: source.name,
      source: `./${pluginRoot}`,
      description: source.description,
      version,
      homepage: source.homepage,
      repository: source.repository,
      category: source.category,
      policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
    }],
  }));
  const sep = '${/}';
  put('gemini-extension.json', json({
    name: source.name,
    version,
    description: source.description,
    mcpServers: {
      [source.server.name]: { command: 'node', args: [`\${extensionPath}${sep}${serverTarget.split('/').join(sep)}`] },
    },
  }));
  // The whole server/ and skills/ folders are generated: a skill removed from or renamed in the source
  // must not leave its old copy behind, where hosts would still discover it.
  return { files: out, generatedDirs: [`${pluginRoot}/server`, `${pluginRoot}/data`, `${pluginRoot}/skills`] };
}

/** Lists drift between the committed tree and a fresh build: changed, missing and stray files. */
function check(root) {
  const { files, generatedDirs } = build(root);
  const problems = [];
  for (const [rel, want] of files) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) { problems.push(`missing: ${rel}`); continue; }
    if (!fs.readFileSync(abs).equals(want.bytes)) problems.push(`stale: ${rel}`);
    else if (isExecutable(abs) !== want.executable) problems.push(`mode: ${rel}`);
  }
  for (const dir of generatedDirs) {
    if (!fs.existsSync(path.join(root, dir))) continue;
    for (const rel of listFiles(root, dir)) if (!files.has(rel)) problems.push(`stray: ${rel}`);
  }
  return problems;
}

function write(root) {
  const { files, generatedDirs } = build(root);
  for (const dir of generatedDirs) fs.rmSync(path.join(root, dir), { recursive: true, force: true });
  for (const [rel, { bytes, executable }] of files) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, bytes);
    fs.chmodSync(abs, executable ? 0o755 : 0o644);
  }
  return [...files.keys()];
}

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  if (process.argv.includes('--check')) {
    const problems = check(root);
    if (problems.length) {
      console.error(`Plugin files are out of date with ${SOURCE}, package.json or the skill/server sources. Run: pnpm run generate:plugin\n  ${problems.join('\n  ')}`);
      process.exit(1);
    }
    console.log('Plugin manifests, server copy and skill copies match their sources.');
  } else {
    console.log(`Wrote ${write(root).length} plugin files.`);
  }
}

module.exports = { build, check, write, SOURCE };
