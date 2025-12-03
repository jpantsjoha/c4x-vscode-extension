#!/bin/bash
set -e

echo "🧪 Validating Extension Manifest..."

echo "Test 1: Valid JSON syntax"
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('✅ Valid JSON')"

echo "Test 2: Required fields present"
node << 'NODETEST'
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const required = {
  'name': pkg.name === 'c4x',
  'displayName': pkg.displayName === 'C4X - C4 Model Diagrams',
  'version': pkg.version === '0.1.2',
  'engines.vscode': pkg.engines?.vscode === '^1.80.0',
  'main': pkg.main === './dist/extension.js',
  'activationEvents': Array.isArray(pkg.activationEvents) && pkg.activationEvents.includes('onCommand:c4x.openPreview'),
  'commands': pkg.contributes?.commands?.[0]?.command === 'c4x.openPreview',
  'languages': pkg.contributes?.languages?.[0]?.id === 'c4x'
};

const entries = Object.entries(required);
const passed = entries.filter(([,v]) => v).length;
const total = entries.length;
console.log(`✅ Passed: ${passed}/${total}`);
for (const [k,v] of entries) console.log(`${v ? '✅' : '❌'} ${k}`);
process.exit(passed === total ? 0 : 1);
NODETEST

echo "Test 3: language-configuration.json exists and is valid"
node -e "JSON.parse(require('fs').readFileSync('language-configuration.json','utf8')); console.log('✅ language-configuration.json valid')"

echo "\n🎉 All validation tests passed!"


