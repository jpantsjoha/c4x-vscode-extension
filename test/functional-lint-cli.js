#!/usr/bin/env node

'use strict';

// Functional test of the tracked c4x-lint bundle (#216): the file a hook or CI
// job actually runs. It is copied alone into a scratch directory, away from
// node_modules, to prove it is self-contained, then driven through its exit
// codes and formats. The in-process unit tests cover the logic in depth.

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const bundlePath = path.join(root, 'cli', 'c4x-lint.cjs');

const CLEAN = [
    '%%{ c4: system-context }%%',
    'graph TB',
    '    customer[Customer<br/>Person]',
    '    banking[Internet Banking<br/>Software System]',
    '    customer -->|Views balances using| banking',
    '',
].join('\n');

const NO_PROTOCOL = [
    '%%{ c4: container }%%',
    'graph TB',
    '    Container(api, "API Application", "Java and Spring Boot", "Serves the API")',
    '    Container(db, "Database", "PostgreSQL", "Stores accounts")',
    '    api -->|Reads accounts from| db',
    '',
].join('\n');

function main() {
    assert.ok(fs.existsSync(bundlePath), 'Tracked c4x-lint bundle is missing. Run "pnpm run build:mcp".');
    const bundle = fs.readFileSync(bundlePath, 'utf8');
    assert.ok(bundle.startsWith('#!/usr/bin/env node\n'), 'the bundle starts with a node shebang');
    assert.doesNotMatch(bundle, /require\(["']vscode["']\)/, 'the bundle never requires vscode');
    assert.doesNotMatch(bundle, /node_modules\//, 'the bundle embeds no third-party package path');

    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-lint-bundle-'));
    try {
        const cli = path.join(scratch, 'c4x-lint.cjs');
        fs.copyFileSync(bundlePath, cli);
        fs.mkdirSync(path.join(scratch, 'docs'));
        fs.writeFileSync(path.join(scratch, 'docs', 'clean.c4x'), CLEAN);
        fs.writeFileSync(path.join(scratch, 'docs', 'guide.md'), `# Guide\n\n\`\`\`c4x\n${NO_PROTOCOL}\`\`\`\n`);

        const lint = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd: scratch, encoding: 'utf8' });

        const clean = lint('docs/**/*.{c4x,md}');
        assert.equal(clean.status, 0, clean.stderr);
        assert.match(clean.stdout, /^docs\/guide\.md:8:5: info C4X-L004 /m);
        assert.match(clean.stdout, /2 files checked: 0 errors, 0 warnings, 1 info\n$/);

        const strict = lint('docs', '--max-severity', 'info', '--format', 'github');
        assert.equal(strict.status, 1);
        assert.match(strict.stdout, /^::notice file=docs\/guide\.md,line=8,col=5,/m);

        fs.writeFileSync(path.join(scratch, 'docs', 'broken.c4x'), 'graph TB\nNotARealElement[]\n');
        const broken = lint('docs', '--format', 'sarif');
        assert.equal(broken.status, 1);
        const sarif = JSON.parse(broken.stdout);
        assert.equal(sarif.version, '2.1.0');
        assert.deepEqual(sarif.runs[0].results.map(result => result.ruleId), ['C4X-SYNTAX', 'C4X-L004']);

        const usage = lint('--nope');
        assert.equal(usage.status, 2);
        assert.match(usage.stderr, /unknown option --nope/);
    } finally {
        fs.rmSync(scratch, { recursive: true, force: true });
    }

    console.log('c4x-lint bundle functional validation passed.');
}

try {
    main();
} catch (error) {
    console.error(error);
    process.exitCode = 1;
}
