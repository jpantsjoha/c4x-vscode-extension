#!/usr/bin/env node
// Per-directory coverage floors for the unit tier (#367).
//
// Reads the c8 json-summary written by `pnpm run coverage:floors` and compares
// each source directory's aggregate lines, statements, functions and branches
// with scripts/coverage-floors.json. Fails when any measured figure is below
// its floor, when a directory has no floor, or when a floor names a directory
// that no longer exists. Raising a floor is optional; lowering one is a
// reviewed change to the data file (docs/validation/TEST-STRATEGY.md,
// "Coverage floors").
//
// Usage:
//   node scripts/check-coverage-floors.js [--summary <file>]
//   node scripts/check-coverage-floors.js --print-floors   # measured values rounded down, as JSON

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const METRICS = ['lines', 'statements', 'functions', 'branches'];
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const flag = name => args.indexOf(name);
const summaryPath = path.resolve(root, flag('--summary') >= 0 ? args[flag('--summary') + 1] : '.coverage/unit-all/coverage-summary.json');
const floorsPath = path.join(root, 'scripts', 'coverage-floors.json');

function fail(message) {
    console.error(`coverage floors: ${message}`);
    process.exit(1);
}

if (!fs.existsSync(summaryPath)) fail(`no summary at ${path.relative(root, summaryPath)}; run \`pnpm run coverage\` first`);
const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const config = JSON.parse(fs.readFileSync(floorsPath, 'utf8'));
const exempt = new Set(config.exempt.map(entry => entry.path));

// Aggregate covered/total per directory (first segment under src/). Files
// directly under src/ are keyed by their own name.
const measured = {};
const seenExempt = new Set();
for (const [file, entry] of Object.entries(summary)) {
    if (file === 'total') continue;
    const rel = path.relative(root, file).split(path.sep).join('/');
    if (!rel.startsWith('src/')) continue;
    if (exempt.has(rel)) { seenExempt.add(rel); continue; }
    const rest = rel.slice('src/'.length);
    const key = rest.includes('/') ? rest.split('/')[0] : rest;
    const bucket = (measured[key] ||= { files: 0 });
    bucket.files += 1;
    for (const metric of METRICS) {
        const cell = (bucket[metric] ||= { covered: 0, total: 0 });
        cell.covered += entry[metric].covered;
        cell.total += entry[metric].total;
    }
}
for (const path_ of exempt) if (!seenExempt.has(path_)) fail(`exempt path ${path_} is not in the summary; remove it from coverage-floors.json`);

const pct = cell => (cell.total === 0 ? null : (cell.covered * 100) / cell.total);
const floorOf = cell => (cell.total === 0 ? null : Math.floor((cell.covered * 100) / cell.total));

if (flag('--print-floors') >= 0) {
    const floors = {};
    for (const key of Object.keys(measured).sort()) {
        floors[key] = {};
        for (const metric of METRICS) {
            const value = floorOf(measured[key][metric]);
            if (value !== null) floors[key][metric] = value;
        }
    }
    console.log(JSON.stringify(floors, null, 2));
    process.exit(0);
}

const problems = [];
const rows = [];
for (const key of Object.keys(measured).sort()) {
    const floor = config.floors[key];
    if (!floor) { problems.push(`${key}: measured but has no floor in scripts/coverage-floors.json`); continue; }
    for (const metric of METRICS) {
        const value = pct(measured[key][metric]);
        const min = floor[metric];
        if (value === null) {
            if (min !== undefined) problems.push(`${key}: ${metric} has a floor of ${min} but nothing to measure`);
            continue;
        }
        if (min === undefined) { problems.push(`${key}: ${metric} measured at ${value.toFixed(2)} but has no floor`); continue; }
        const ok = value >= min;
        rows.push({ key, metric, value, min, ok });
        if (!ok) problems.push(`${key}: ${metric} ${value.toFixed(2)}% is below the floor of ${min}%`);
    }
}
for (const key of Object.keys(config.floors)) {
    if (!measured[key]) problems.push(`${key}: has a floor but is not in the summary`);
}

const width = Math.max(...Object.keys(measured).map(k => k.length), 9);
console.log(`${'directory'.padEnd(width)}  ${METRICS.map(m => m.padStart(15)).join('')}   (measured / floor)`);
for (const key of Object.keys(measured).sort()) {
    const cells = METRICS.map(metric => {
        const row = rows.find(r => r.key === key && r.metric === metric);
        return (row ? `${row.value.toFixed(2)}/${row.min}${row.ok ? '' : ' FAIL'}` : 'n/a').padStart(15);
    });
    console.log(`${key.padEnd(width)}  ${cells.join('')}`);
}
for (const entry of config.exempt) console.log(`exempt: ${entry.path} - ${entry.reason}`);

if (problems.length > 0) {
    console.error(`\ncoverage floors FAILED (${problems.length}):`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
}
console.log(`\ncoverage floors passed for ${Object.keys(measured).length} directories`);
