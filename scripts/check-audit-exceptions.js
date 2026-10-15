#!/usr/bin/env node
'use strict';

/**
 * Machine-enforced expiry for accepted dependency-advisory exceptions.
 *
 * scripts/audit-exceptions.json lists each exception with an `expires` date.
 * This check fails when any exception has expired, or when it disagrees with
 * package.json `pnpm.auditConfig.ignoreGhsas` (an id ignored without a dated
 * entry, or a dated entry that is no longer ignored). `make cve-scan` runs it
 * before `pnpm audit`.
 *
 * Usage: node scripts/check-audit-exceptions.js [--today YYYY-MM-DD]
 * `--today` fakes the clock so the expiry path can be shown to work.
 */

const fs = require('fs');
const path = require('path');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) { return false; }
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * @param {{exceptions: Array<{id: string, package?: string, expires: string}>}} registry
 * @param {string[]} ignoredIds package.json pnpm.auditConfig.ignoreGhsas
 * @param {string} today YYYY-MM-DD
 * @returns {string[]} problems; empty when the exceptions are current
 */
function checkExceptions(registry, ignoredIds, today) {
  const problems = [];
  if (!isRealDate(today)) { return [`today "${today}" is not a YYYY-MM-DD date`]; }
  const entries = Array.isArray(registry && registry.exceptions) ? registry.exceptions : [];
  const listed = new Set();
  for (const entry of entries) {
    listed.add(entry.id);
    if (!isRealDate(entry.expires)) {
      problems.push(`${entry.id}: "expires" must be a real YYYY-MM-DD date, got ${JSON.stringify(entry.expires)}`);
    } else if (entry.expires < today) {
      problems.push(
        `${entry.id}${entry.package ? ` (${entry.package})` : ''}: exception expired on ${entry.expires} (today ${today}). ` +
        'Renew it with a new accepted/expires date in scripts/audit-exceptions.json, or remove it ' +
        'and its id from package.json pnpm.auditConfig.ignoreGhsas.'
      );
    }
  }
  for (const id of ignoredIds) {
    if (!listed.has(id)) {
      problems.push(`${id}: ignored in package.json but has no dated entry in scripts/audit-exceptions.json`);
    }
  }
  for (const id of listed) {
    if (!ignoredIds.includes(id)) {
      problems.push(`${id}: dated entry in scripts/audit-exceptions.json is not in package.json pnpm.auditConfig.ignoreGhsas; remove the stale entry`);
    }
  }
  return problems;
}

function main(argv) {
  const i = argv.indexOf('--today');
  const today = i >= 0 ? argv[i + 1] : new Date().toISOString().slice(0, 10);
  const root = path.join(__dirname, '..');
  const registry = JSON.parse(fs.readFileSync(path.join(__dirname, 'audit-exceptions.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const ignored = (pkg.pnpm && pkg.pnpm.auditConfig && pkg.pnpm.auditConfig.ignoreGhsas) || [];
  const problems = checkExceptions(registry, ignored, today);
  if (problems.length > 0) {
    for (const p of problems) { console.error(`audit exception: ${p}`); }
    return 1;
  }
  console.log(`audit exceptions current (${registry.exceptions.length} listed, checked ${today})`);
  return 0;
}

if (require.main === module) { process.exit(main(process.argv.slice(2))); }

module.exports = { checkExceptions, isRealDate };
