#!/usr/bin/env node
// Documentation tree check. Fails when:
//   1. a relative Markdown link (inline, <angle-bracket>, or a line-initial [ref]: definition) does not resolve to a file or directory;
//   2. a link uses a file:// URL (an absolute path on someone's machine);
//   3. a directory that holds Markdown has no README.md;
//   4. a Markdown file is not linked from the README of its own directory or of an ancestor
//      directory (or from the engineering start page, docs/engineering/README.md, when it exists).
// Reachability is judged section by section, not from the root README.
// docs/archive is history: its files are not checked for links or reachability, but the
// folder must have a README. Dot-directories, node_modules, src/ and agent folders are skipped.
// Usage: node scripts/check-links.js [root]

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const START_HERE = 'docs/engineering/README.md';
const ARCHIVE = 'docs/archive';
const SKIPPED_TOP = new Set(['node_modules', 'src', 'out', 'dist', 'coverage']);

function listMarkdown(root) {
  const git = spawnSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '*.md'], { encoding: 'utf8' });
  let files;
  if (git.status === 0 && git.stdout) {
    files = git.stdout.split('\0').filter(Boolean);
  } else {
    files = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const rel = path.posix.join(dir, entry.name);
        if (entry.isDirectory()) { if (!entry.name.startsWith('.') && !SKIPPED_TOP.has(entry.name)) walk(rel); }
        else if (entry.name.endsWith('.md')) files.push(rel);
      }
    };
    walk('.');
    files = files.map((f) => f.replace(/^\.\//, ''));
  }
  return files
    .map((f) => f.split(path.sep).join('/'))
    .filter((f) => fs.existsSync(path.join(root, f)))
    .filter((f) => !f.split('/').some((part, i, parts) => (i < parts.length - 1 && part.startsWith('.')) || SKIPPED_TOP.has(part) && i === 0));
}

function linksOf(text) {
  const out = [];
  let inFence = false;
  text.split('\n').forEach((raw, index) => {
    if (/^\s*(```|~~~)/.test(raw)) { inFence = !inFence; return; }
    if (inFence) return;
    const line = raw.replace(/`[^`]*`/g, '');
    // Reference definition: only at the start of a line (up to three spaces of indent).
    const def = /^ {0,3}\[[^\]]+\]:[ \t]*(?:<([^>]*)>|(\S+))/.exec(line);
    if (def) { out.push({ target: def[1] ?? def[2], line: index + 1 }); return; }
    // Inline link; the destination may be wrapped in <...> to hold spaces.
    for (const match of line.matchAll(/\]\([ \t]*(?:<([^>]*)>|([^)\s]+))(?:[ \t]+(?:"[^"]*"|'[^']*'))?[ \t]*\)/g)) out.push({ target: match[1] ?? match[2], line: index + 1 });
  });
  return out;
}

function check(root) {
  const failures = [];
  const files = listMarkdown(root);
  const inArchive = (f) => f === ARCHIVE || f.startsWith(`${ARCHIVE}/`);
  const linked = new Map(); // README path -> Set of repo-relative targets

  for (const file of files) {
    const dir = path.posix.dirname(file);
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    const targets = new Set();
    for (const { target, line } of linksOf(text)) {
      if (/^file:/i.test(target)) {
        if (!inArchive(file)) failures.push(`${file}:${line}: file:// link (${target.slice(0, 60)}...)`);
        continue;
      }
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue;
      const clean = decodeURIComponent(target.split('#')[0].split('?')[0]);
      if (!clean) continue;
      const resolved = path.posix.normalize(clean.startsWith('/') ? clean.slice(1) : path.posix.join(dir, clean));
      targets.add(resolved.replace(/\/$/, ''));
      if (!inArchive(file) && !fs.existsSync(path.join(root, resolved))) failures.push(`${file}:${line}: broken link ${target}`);
    }
    if (path.posix.basename(file) === 'README.md') linked.set(file, targets);
  }

  const dirs = new Map();
  for (const file of files) {
    const dir = path.posix.dirname(file);
    if (!dirs.has(dir)) dirs.set(dir, []);
    dirs.get(dir).push(file);
  }
  for (const [dir, members] of dirs) {
    if (dir.startsWith(`${ARCHIVE}/`)) continue;
    // A plugin's folders follow its host's file format: a README.md in plugins/c4x/commands/ would load
    // as a /c4x:README command, and one in an eval case's graders/ as a grader. Links there are still checked.
    if (dir === 'plugins' || dir.startsWith('plugins/')) continue;
    const readme = dir === '.' ? 'README.md' : `${dir}/README.md`;
    if (!members.includes(readme)) { failures.push(`${dir}: has Markdown but no README.md`); continue; }
    if (inArchive(readme)) continue;
    for (const file of members) {
      if (file === readme) continue;
      let ok = false;
      let at = dir;
      for (;;) {
        const candidate = at === '.' ? 'README.md' : `${at}/README.md`;
        if (linked.get(candidate)?.has(file)) { ok = true; break; }
        if (at === '.') break;
        at = path.posix.dirname(at);
      }
      if (!ok && linked.get(START_HERE)?.has(file)) ok = true;
      if (!ok) failures.push(`${file}: not linked from its section README or an ancestor README`);
    }
  }
  return { failures, checked: files.length };
}

module.exports = { check };

if (require.main === module) {
  const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
  const { failures, checked } = check(root);
  if (failures.length) {
    console.error(failures.join('\n'));
    console.error(`\ncheck-links: ${failures.length} problem(s) in ${checked} Markdown files`);
    process.exit(1);
  }
  console.log(`check-links: ${checked} Markdown files, every link resolves, every section has a README that reaches its files`);
}
