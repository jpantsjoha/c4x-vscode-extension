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

        // #362: a label cannot write control, C1 or bidi characters to the terminal.
        fs.writeFileSync(path.join(scratch, 'docs', 'hostile.c4x'), 'graph TB\nSystem(a, "x\n\u001b[2J\u009b31m\u202eevil", "d")\n');
        const hostile = lint('docs/hostile.c4x');
        assert.equal(hostile.status, 0, hostile.stderr);
        assert.doesNotMatch(hostile.stdout, /[\u001b\u009b\u202e]/);
        assert.match(hostile.stdout, /x\\n\\x1b\[2J\\x9b31m\\u202eevil/);
        assert.equal(hostile.stdout.trim().split('\n').length, 2, 'one finding line and the summary');
        fs.rmSync(path.join(scratch, 'docs', 'hostile.c4x'));

        // #362: input limits are errors with their own rule id, and adversarial input finishes in time.
        fs.writeFileSync(path.join(scratch, 'limit.c4x'), `graph TB\nSystem(a, "${'x'.repeat(4097)}", "d")\n`);
        const limited = lint('limit.c4x');
        assert.equal(limited.status, 1);
        assert.match(limited.stdout, /^limit\.c4x:2:1: error C4X-LIMIT C4X input limit: A label is 4097 characters long/m);
        fs.writeFileSync(path.join(scratch, 'deep.c4x'), 'graph TB\n' + 'subgraph s {\n'.repeat(100000) + '}\n'.repeat(100000));
        const started = Date.now();
        const deep = spawnSync(process.execPath, [cli, 'deep.c4x'], { cwd: scratch, encoding: 'utf8', timeout: 10000 });
        assert.ifError(deep.error);
        assert.equal(deep.status, 1);
        assert.match(deep.stdout, /deep\.c4x:34:12: error C4X-SYNTAX C4X syntax error: Nesting is deeper than 32 levels/);
        assert.ok(Date.now() - started < 10000);

        // #362 RES-1: a file over 4 MiB is reported and not linted; the run exits 2. Exactly 4 MiB is read.
        const atCap = 'graph TB\nSystem(a, "A", "d")\n%%';
        fs.writeFileSync(path.join(scratch, 'at-cap.c4x'), atCap + 'x'.repeat(4 * 1024 * 1024 - atCap.length));
        const fits = lint('at-cap.c4x');
        assert.equal(fits.status, 0, fits.stderr);
        assert.match(fits.stdout, /1 file checked/);
        fs.writeFileSync(path.join(scratch, 'over-cap.c4x'), atCap + 'x'.repeat(4 * 1024 * 1024 + 1 - atCap.length));
        const over = lint('over-cap.c4x');
        assert.equal(over.status, 2);
        assert.match(over.stderr, /over-cap\.c4x: larger than 4 MiB, not linted/);
        fs.rmSync(path.join(scratch, 'at-cap.c4x'));
        fs.rmSync(path.join(scratch, 'over-cap.c4x'));

        // #362: source text the grammar discards is never echoed (a subgraph inside a node, an
        // overwritten attribute value, $sprite on a subgraph, a comment).
        const marker = 'DISCARDED-PAYLOAD' + 'x'.repeat(4097);
        fs.writeFileSync(path.join(scratch, 'discarded.c4x'), [
            '%%{ c4: deployment }%%', 'graph TB', `%% ${marker}`,
            `Node(n, "N", "T", $note="${marker}", $note="ok") {`, '  Container(a, "A", "T", "D")',
            `  subgraph s $note="${marker}", $sprite="${marker}" {`, `    b[${marker}<br/>Container]`, '  }', '}',
        ].join('\n'));
        for (const format of ['text', 'json', 'github']) {
            const discarded = lint('--format', format, 'discarded.c4x');
            assert.ok(discarded.status === 0 || discarded.status === 1, discarded.stderr);
            assert.ok(!(discarded.stdout + discarded.stderr).includes('DISCARDED-PAYLOAD'), `--format ${format} echoed discarded text`);
        }
        fs.rmSync(path.join(scratch, 'discarded.c4x'));

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
