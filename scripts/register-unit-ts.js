const path = require('node:path');

process.env.TS_NODE_PROJECT = path.resolve(__dirname, '..', 'tsconfig.unit.json');
require('ts-node/register/transpile-only');
