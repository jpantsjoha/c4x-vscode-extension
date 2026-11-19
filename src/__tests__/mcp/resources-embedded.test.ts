import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';

/**
 * #357: the server ships alone in the VSIX, with no docs/ or samples/ beside it.
 * Run a copy of the bundle from an empty directory and read every resource it
 * advertises: each must come back with text, and the instructions' two
 * resources must be among them.
 */
interface Reply { result?: { resources?: Array<{ uri: string }>; contents?: Array<{ text: string }> }; error?: unknown }

const EXPECTED: Readonly<Record<string, string>> = {
  'c4x://guidelines': 'docs/C4X-GENERATION-GUIDELINES.md',
  'c4x://examples/event-driven': 'samples/advanced/event-driven-architecture.md',
  'c4x://examples/serverless': 'samples/advanced/serverless-data-pipeline.md',
  'c4x://examples/oauth2': 'samples/advanced/oauth2-authentication-flow.md',
  'c4x://examples/healthcare': 'samples/real-world/healthcare-patient-management.md',
  'c4x://examples/graphql': 'samples/component/graphql-api-gateway.md',
  'c4x://examples/grpc': 'samples/container/grpc-microservices.md',
  'c4x://syntax': 'docs/reference/c4x-reference.md',
};

describe('MCP resources are embedded in the bundle (#357)', function () {
  this.timeout(20000);
  const bundle = path.resolve(__dirname, '..', '..', '..', 'mcp', 'c4x-mcp-server.bundle.cjs');

  function talk(file: string, requests: object[]): Promise<Reply[]> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [file], { cwd: path.dirname(file), stdio: ['pipe', 'pipe', 'ignore'] });
      const replies: Reply[] = [];
      let buffer = '';
      const timer = setTimeout(() => { child.kill(); reject(new Error('server did not answer')); }, 15000);
      child.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        let newline: number;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (line) { replies.push(JSON.parse(line)); }
          if (replies.length === requests.length) { clearTimeout(timer); child.kill(); resolve(replies); }
        }
      });
      for (const request of requests) { child.stdin.write(JSON.stringify(request) + '\n'); }
    });
  }

  it('lists resources and reads each one from a directory that holds only the bundle', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-mcp-alone-'));
    try {
      const alone = path.join(dir, 'c4x-mcp-server.bundle.cjs');
      fs.copyFileSync(bundle, alone);
      const [, listed] = await talk(alone, [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } } },
        { jsonrpc: '2.0', id: 2, method: 'resources/list', params: {} },
      ]);
      const uris: string[] = (listed.result?.resources ?? []).map((r) => r.uri);
      assert.ok(uris.includes('c4x://syntax') && uris.includes('c4x://guidelines'), `missing the resources the instructions name: ${uris.join()}`);
      assert.deepStrictEqual([...uris].sort(), Object.keys(EXPECTED).sort(), 'the advertised resources differ from the eight the package promises');
      const replies = await talk(alone, [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } } },
        ...uris.map((uri, index) => ({ jsonrpc: '2.0', id: index + 2, method: 'resources/read', params: { uri } })),
      ]);
      replies.slice(1).forEach((reply, index) => {
        assert.ok(!reply.error, `${uris[index]} could not be read: ${JSON.stringify(reply.error)}`);
        const source = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', EXPECTED[uris[index]]), 'utf8');
        assert.strictEqual(reply.result?.contents?.[0]?.text, source, `${uris[index]} is not the embedded text of ${EXPECTED[uris[index]]}`);
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
