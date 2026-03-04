import * as assert from 'assert';
import { spawn } from 'child_process';
import * as path from 'path';

describe('MCP Server Tests', () => {
    it('validate_c4x tool should validate correct C4X syntax', async function () {
        this.timeout(30000); // 30 seconds for MCP server startup
        const scriptPath = path.resolve(__dirname, '../../mcp/c4x-mcp-server.js');
        const mcpProcess = spawn('node', [scriptPath], { stdio: ['pipe', 'pipe', 'pipe'] });

        return new Promise<void>((resolve, reject) => {
            let output = '';
            let errorOutput = '';

            mcpProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
                console.error('[MCP Server stderr]:', data.toString());
            });

            mcpProcess.stdout.on('data', (data) => {
                output += data.toString();
                if (output.includes('"id":1')) {
                    try {
                        const lines = output.trim().split('\n');
                        // Get the JSON-RPC response packet containing id: 1
                        const responseLine = lines.find(line => line.includes('"id":1'));
                        if (!responseLine) { throw new Error('Response not found'); }

                        const lastResponse = JSON.parse(responseLine);
                        assert.strictEqual(lastResponse.id, 1);
                        assert.strictEqual(lastResponse.result.content[0].text, 'Syntax is VALID. No errors found.');
                        assert.strictEqual(lastResponse.result.isError, undefined);
                        mcpProcess.kill();
                        resolve();
                    } catch (e) {
                        mcpProcess.kill();
                        reject(e);
                    }
                }
            });

            mcpProcess.on('error', (err) => {
                reject(new Error(`MCP Server process error: ${err.message}\nstderr: ${errorOutput}`));
            });

            mcpProcess.on('exit', (code) => {
                if (code !== 0 && code !== null) {
                    reject(new Error(`MCP Server exited with code ${code}\nstderr: ${errorOutput}`));
                }
            });

            // Send a valid JSON-RPC request
            const request = {
                jsonrpc: "2.0",
                id: 1,
                method: "tools/call",
                params: {
                    name: "validate_c4x",
                    arguments: {
                        code: "%%{ c4: container }%%\ngraph TB\nSystem(A, \"Sys\", \"\")\n"
                    }
                }
            };

            mcpProcess.stdin.write(JSON.stringify(request) + '\n');
        });
    });

    it('validate_c4x tool should report errors for invalid C4X syntax', async function () {
        this.timeout(30000); // 30 seconds for MCP server startup
        const scriptPath = path.resolve(__dirname, '../../mcp/c4x-mcp-server.js');
        const mcpProcess = spawn('node', [scriptPath], { stdio: ['pipe', 'pipe', 'pipe'] });

        return new Promise<void>((resolve, reject) => {
            let output = '';
            let errorOutput = '';

            mcpProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
                console.error('[MCP Server stderr]:', data.toString());
            });

            mcpProcess.stdout.on('data', (data) => {
                output += data.toString();
                if (output.includes('"id":2')) {
                    try {
                        const lines = output.trim().split('\n');
                        const responseLine = lines.find(line => line.includes('"id":2'));
                        if (!responseLine) { throw new Error('Response not found'); }

                        const lastResponse = JSON.parse(responseLine);
                        assert.strictEqual(lastResponse.id, 2);
                        assert.ok(lastResponse.result.content[0].text.includes('Syntax ERROR'));
                        assert.strictEqual(lastResponse.result.isError, true);
                        mcpProcess.kill();
                        resolve();
                    } catch (e) {
                        mcpProcess.kill();
                        reject(e);
                    }
                }
            });

            mcpProcess.on('error', (err) => {
                reject(new Error(`MCP Server process error: ${err.message}\nstderr: ${errorOutput}`));
            });

            mcpProcess.on('exit', (code) => {
                if (code !== 0 && code !== null) {
                    reject(new Error(`MCP Server exited with code ${code}\nstderr: ${errorOutput}`));
                }
            });

            // Send an INVALID JSON-RPC request
            const request = {
                jsonrpc: "2.0",
                id: 2,
                method: "tools/call",
                params: {
                    name: "validate_c4x",
                    arguments: {
                        code: "%%{ c4: container }%%\ngraph TB\nInvalidSyntax[]\n"
                    }
                }
            };

            mcpProcess.stdin.write(JSON.stringify(request) + '\n');
        });
    });
});
