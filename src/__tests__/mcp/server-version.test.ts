import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { MCP_SERVER_NAME, MCP_SERVER_VERSION } from '../../../mcp/serverInfo';

describe('MCP server identity', () => {
    const root = path.resolve(__dirname, '..', '..', '..');
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { version: string };

    it('reports the package.json version', () => {
        assert.strictEqual(MCP_SERVER_VERSION, pkg.version);
    });

    it('keeps no second hard-coded version literal in the server source', () => {
        const source = fs.readFileSync(path.join(root, 'mcp', 'c4x-mcp-server.ts'), 'utf8');
        assert.ok(!/version:\s*["'][0-9]+\.[0-9]+\.[0-9]+["']/.test(source), 'literal version in c4x-mcp-server.ts');
        assert.ok(source.includes('version: MCP_SERVER_VERSION'));
        assert.strictEqual(MCP_SERVER_NAME, 'c4x-validator');
    });

    it('the committed bundle reports the package.json version', () => {
        // Read the minified bundle text rather than running it: executing the
        // 5 MB bundle inside the unit tier distorts the c8 function coverage.
        const bundle = fs.readFileSync(path.join(root, 'mcp', 'c4x-mcp-server.bundle.cjs'), 'utf8');
        const info = /name:([\w$]+),version:([\w$]+)/.exec(bundle);
        assert.ok(info, 'server identity not found in bundle');
        const resolve = (id: string, depth = 0): string | undefined => {
            const escaped = id.replace(/\$/g, '\\$');
            const literal = new RegExp(`[;,\\s]${escaped}="([^"]*)"`).exec(bundle);
            if (literal) { return literal[1]; }
            const alias = new RegExp(`[;,\\s]${escaped}=([\\w$]+)[;,]`).exec(bundle);
            return alias && depth < 5 ? resolve(alias[1], depth + 1) : undefined;
        };
        assert.strictEqual(resolve(info[1]), 'c4x-validator');
        assert.strictEqual(resolve(info[2]), pkg.version);
    });
});
