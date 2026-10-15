#!/usr/bin/env node

'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const trackedServerPath = path.join(root, 'mcp', 'c4x-mcp-server.bundle.cjs');
const trackedNoticesPath = path.join(root, 'mcp', 'THIRD_PARTY_NOTICES.txt');
const requestTimeoutMs = 5000;
const resourceFixtures = {
    'c4x://guidelines': 'docs/C4X-GENERATION-GUIDELINES.md',
    'c4x://examples/event-driven': 'samples/advanced/event-driven-architecture.md',
    'c4x://examples/serverless': 'samples/advanced/serverless-data-pipeline.md',
    'c4x://examples/oauth2': 'samples/advanced/oauth2-authentication-flow.md',
    'c4x://examples/healthcare': 'samples/real-world/healthcare-patient-management.md',
    'c4x://examples/graphql': 'samples/component/graphql-api-gateway.md',
    'c4x://examples/grpc': 'samples/container/grpc-microservices.md',
    'c4x://syntax': 'docs/c4x-syntax.md',
};

class JsonRpcClient {
    constructor(serverPath) {
        this.buffer = '';
        this.closing = false;
        this.nextId = 1;
        this.pending = new Map();
        this.stderr = '';
        this.stdoutLineCount = 0;

        this.process = spawn(process.execPath, [serverPath], {
            cwd: os.tmpdir(),
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        this.process.stdout.setEncoding('utf8');
        this.process.stderr.setEncoding('utf8');
        this.process.stdout.on('data', chunk => this.handleStdout(chunk));
        this.process.stderr.on('data', chunk => {
            this.stderr += chunk;
        });
        this.process.on('error', error => this.rejectPending(error));
        this.process.on('exit', (code, signal) => {
            if (!this.closing) {
                this.rejectPending(new Error(`MCP server exited unexpectedly (code ${code}, signal ${signal}).\n${this.stderr}`));
            }
        });
    }

    handleStdout(chunk) {
        this.buffer += chunk;

        while (this.buffer.includes('\n')) {
            const newline = this.buffer.indexOf('\n');
            const line = this.buffer.slice(0, newline).replace(/\r$/, '');
            this.buffer = this.buffer.slice(newline + 1);

            if (!line) {
                continue;
            }

            let message;
            try {
                message = JSON.parse(line);
            } catch (error) {
                this.rejectPending(new Error(`Non-JSON output on MCP stdout: ${line}\n${error.message}`));
                this.process.kill();
                return;
            }

            this.stdoutLineCount += 1;
            const pending = this.pending.get(message.id);
            if (pending) {
                clearTimeout(pending.timer);
                this.pending.delete(message.id);
                pending.resolve(message);
            }
        }
    }

    rejectPending(error) {
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timer);
            pending.reject(error);
        }
        this.pending.clear();
    }

    request(method, params) {
        const id = this.nextId++;
        const request = { jsonrpc: '2.0', id, method, params };

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`Timed out waiting for MCP response to ${method}.\n${this.stderr}`));
            }, requestTimeoutMs);

            this.pending.set(id, { resolve, reject, timer });
            this.process.stdin.write(`${JSON.stringify(request)}\n`);
        });
    }

    notify(method, params = {}) {
        this.process.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
    }

    async close() {
        this.closing = true;
        this.process.stdin.end();

        if (this.process.exitCode !== null) {
            return;
        }

        await new Promise(resolve => {
            const timer = setTimeout(() => {
                this.process.kill('SIGKILL');
                resolve();
            }, 1000);
            this.process.once('exit', () => {
                clearTimeout(timer);
                resolve();
            });
        });
    }
}

function assertResult(response) {
    assert.equal(response.jsonrpc, '2.0');
    assert.ok(response.result, `Expected JSON-RPC result, received: ${JSON.stringify(response)}`);
    return response.result;
}

async function main() {
    assert.ok(fs.existsSync(trackedServerPath), 'Tracked MCP bundle is missing. Run "pnpm run build:mcp".');
    assert.ok(fs.existsSync(trackedNoticesPath), 'Tracked MCP third-party notices are missing. Run "pnpm run build:mcp".');

    const trackedServer = fs.readFileSync(trackedServerPath, 'utf8');
    const trackedNotices = fs.readFileSync(trackedNoticesPath, 'utf8');
    assert.match(trackedServer, /Third-party licenses: \.\/THIRD_PARTY_NOTICES\.txt/);
    assert.doesNotMatch(trackedServer, /node_modules\/\.pnpm\//);
    for (const packageName of ['@modelcontextprotocol/sdk', 'ajv', 'fast-uri', 'zod']) {
        assert.match(trackedNotices, new RegExp(packageName.replace('/', '\\/')));
    }

    for (const configPath of ['.mcp.json', '.codex/config.toml']) {
        const absolutePath = path.join(root, configPath);
        if (!fs.existsSync(absolutePath)) {
            continue;
        }
        const config = fs.readFileSync(absolutePath, 'utf8');
        assert.match(config, /mcp\/c4x-mcp-server\.bundle\.cjs/);
        assert.doesNotMatch(config, /out\/mcp\/c4x-mcp-server\.js/);
        assert.match(config, /cwd/);
    }

    const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-mcp-install-'));
    const isolatedMcpDirectory = path.join(isolatedRoot, 'mcp');
    const isolatedDocsDirectory = path.join(isolatedRoot, 'docs');
    const isolatedServerPath = path.join(isolatedMcpDirectory, 'c4x-mcp-server.bundle.cjs');
    fs.mkdirSync(isolatedMcpDirectory, { recursive: true });
    fs.mkdirSync(isolatedDocsDirectory, { recursive: true });
    fs.copyFileSync(trackedServerPath, isolatedServerPath);
    fs.copyFileSync(trackedNoticesPath, path.join(isolatedMcpDirectory, 'THIRD_PARTY_NOTICES.txt'));
    for (const relativePath of Object.values(resourceFixtures)) {
        const destination = path.join(isolatedRoot, relativePath);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(path.join(root, relativePath), destination);
    }

    const client = new JsonRpcClient(isolatedServerPath);

    try {
        const initialize = assertResult(await client.request('initialize', {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'c4x-functional-test', version: '1.0.0' },
        }));
        assert.equal(initialize.serverInfo.name, 'c4x-validator');
        client.notify('notifications/initialized');

        const tools = assertResult(await client.request('tools/list', {}));
        assert.deepEqual(tools.tools.map(tool => tool.name), ['validate_c4x', 'lint_c4x']);
        const lintTool = tools.tools.find(tool => tool.name === 'lint_c4x');
        assert.deepEqual(lintTool.inputSchema.required, ['code']);
        assert.deepEqual(lintTool.inputSchema.properties.rules.additionalProperties.enum, ['off', 'ignore', 'info', 'warning', 'error']);

        const listedResources = assertResult(await client.request('resources/list', {}));
        assert.deepEqual(listedResources.resources.map(resource => resource.uri), Object.keys(resourceFixtures));

        const valid = assertResult(await client.request('tools/call', {
            name: 'validate_c4x',
            arguments: {
                code: '%%{ c4: container }%%\ngraph TB\nSystem(A, "System", "")\n',
            },
        }));
        assert.equal(valid.content[0].text, 'Syntax is VALID. No errors found.');
        assert.equal(valid.isError, undefined);

        const invalid = assertResult(await client.request('tools/call', {
            name: 'validate_c4x',
            arguments: { code: 'graph TB\nNotARealElement[]\n' },
        }));
        assert.equal(invalid.isError, true);
        assert.match(invalid.content[0].text, /Syntax ERROR/);
        assert.match(invalid.content[0].text, /Line: \d+/);

        const missingCode = assertResult(await client.request('tools/call', {
            name: 'validate_c4x',
            arguments: {},
        }));
        assert.equal(missingCode.isError, true);
        assert.match(missingCode.content[0].text, /required 'code' field/);

        const oversized = assertResult(await client.request('tools/call', {
            name: 'validate_c4x',
            arguments: { code: 'x'.repeat((1024 * 1024) + 1) },
        }));
        assert.equal(oversized.isError, true);
        assert.match(oversized.content[0].text, /must not exceed 1 MiB/);

        const cleanLint = assertResult(await client.request('tools/call', {
            name: 'lint_c4x',
            arguments: {
                code: '%%{ c4: system-context }%%\ngraph TB\n    customer[Customer<br/>Person]\n'
                    + '    banking[Internet Banking<br/>Software System]\n    customer -->|Views balances using| banking\n',
            },
        }));
        assert.equal(cleanLint.content[0].text, 'Lint CLEAN. No findings.');
        assert.equal(cleanLint.isError, undefined);

        const noProtocol = '%%{ c4: container }%%\ngraph TB\n'
            + '    Container(api, "API Application", "Java and Spring Boot", "Serves the API")\n'
            + '    Container(db, "Database", "PostgreSQL", "Stores accounts")\n'
            + '    api -->|Reads accounts from| db\n';
        const findings = assertResult(await client.request('tools/call', {
            name: 'lint_c4x',
            arguments: { code: noProtocol },
        }));
        assert.equal(findings.isError, undefined, 'Lint findings are advice, not a tool error.');
        const [heading, ...lines] = findings.content[0].text.split('\n');
        assert.equal(heading, 'Lint FINDINGS. 1 total: 0 error, 0 warning, 1 info.');
        assert.deepEqual(lines.map(line => line.split(' ').slice(0, 3).join(' ')), ['5:5 info C4X-L004']);

        const raised = assertResult(await client.request('tools/call', {
            name: 'lint_c4x',
            arguments: { code: noProtocol, rules: { 'C4X-L004': 'error', 'C4X-NOPE': 'error' } },
        }));
        assert.match(raised.content[0].text, /^Lint FINDINGS\. 1 total: 1 error, 0 warning, 0 info\.\nNote: unknown rule "C4X-NOPE" ignored\n5:5 error C4X-L004 /);

        const typo = assertResult(await client.request('tools/call', {
            name: 'lint_c4x',
            arguments: { code: noProtocol, rules: { 'C4X-L004': 'off', 'C4X-L003': 'loud' } },
        }));
        assert.equal(typo.content[0].text, 'Lint CLEAN. No findings.\nNote: C4X-L003 must be one of off, ignore, info, warning, error; using its default');

        // 150 containers with no description, technology or relationship: 450 findings.
        const crowded = ['%%{ c4: container }%%', 'graph TB']
            .concat(Array.from({ length: 150 }, (_, index) => `    Container(c${index}, "Container ${index}")`))
            .join('\n');
        const capped = assertResult(await client.request('tools/call', { name: 'lint_c4x', arguments: { code: crowded } }));
        const cappedLines = capped.content[0].text.split('\n');
        assert.equal(cappedLines[0], 'Lint FINDINGS. 450 total: 0 error, 0 warning, 450 info.');
        assert.equal(cappedLines.length, 1 + 200 + 1, 'heading, 200 findings, and one line for the rest');
        assert.equal(cappedLines[cappedLines.length - 1], '… 250 more findings not shown.');

        const silenced = assertResult(await client.request('tools/call', {
            name: 'lint_c4x',
            arguments: { code: noProtocol, rules: { 'C4X-L004': 'off' } },
        }));
        assert.equal(silenced.content[0].text, 'Lint CLEAN. No findings.');

        const lintSyntax = assertResult(await client.request('tools/call', {
            name: 'lint_c4x',
            arguments: { code: 'graph TB\nNotARealElement[]\n' },
        }));
        assert.equal(lintSyntax.isError, true);
        assert.match(lintSyntax.content[0].text, /^Syntax ERROR\. Lint needs code that parses/);
        assert.match(lintSyntax.content[0].text, /\n2:\d+ error C4X-SYNTAX /);

        const lintMissing = assertResult(await client.request('tools/call', {
            name: 'lint_c4x',
            arguments: { rules: {} },
        }));
        assert.equal(lintMissing.isError, true);
        assert.match(lintMissing.content[0].text, /required 'code' field/);

        const lintOversized = assertResult(await client.request('tools/call', {
            name: 'lint_c4x',
            arguments: { code: 'x'.repeat((1024 * 1024) + 1) },
        }));
        assert.equal(lintOversized.isError, true);
        assert.match(lintOversized.content[0].text, /must not exceed 1 MiB/);

        for (const uri of Object.keys(resourceFixtures)) {
            const resource = assertResult(await client.request('resources/read', { uri }));
            assert.equal(resource.contents[0].uri, uri);
            assert.equal(resource.contents[0].mimeType, 'text/markdown');
            assert.ok(resource.contents[0].text.length > 50, `${uri} should contain documentation.`);
        }

        const unknownResource = await client.request('resources/read', { uri: 'c4x://unknown' });
        assert.ok(unknownResource.error);
        assert.match(unknownResource.error.message, /Unknown C4X resource URI/);
        assert.doesNotMatch(unknownResource.error.message, /\/Users\/|\\Users\\|\/tmp\//);

        assert.ok(client.stdoutLineCount >= 7);
        assert.match(client.stderr, /C4X MCP Server running on stdio/);
    } finally {
        await client.close();
        fs.rmSync(isolatedRoot, { recursive: true, force: true });
    }

    console.log('C4X MCP functional validation passed.');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
