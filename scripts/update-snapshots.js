#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

const result = spawnSync(
  process.execPath,
  [
    require.resolve('mocha/bin/mocha.js'),
    '--config',
    '.mocharc.unit.yml',
    '--grep',
    'Diagram Snapshot',
  ],
  {
    cwd: process.cwd(),
    env: { ...process.env, UPDATE_SNAPSHOTS: '1' },
    stdio: 'inherit',
  },
);

if (result.error) {
  throw result.error;
}
process.exitCode = result.status === null ? 1 : result.status;
