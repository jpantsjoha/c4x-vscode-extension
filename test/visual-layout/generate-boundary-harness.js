#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
require('ts-node/register/transpile-only');

const { PREVIEW_CLIENT_SCRIPT } = require('../../src/webview/previewClientScript');

const root = path.resolve(__dirname, '../..');
const previewSource = fs.readFileSync(path.join(root, 'src/webview/PreviewPanel.ts'), 'utf8');
const templateMatch = previewSource.match(/return `(<!DOCTYPE html>[\s\S]*?<\/html>)`;/);

if (!templateMatch) {
  throw new Error('Could not extract PreviewPanel HTML template.');
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" role="img">
  <rect x="0" y="0" width="800" height="500" fill="#ffffff" />
  <g class="diagram-content">
    <g class="edges">
      <g class="edge" data-id="edge-1">
        <path class="edge-hit-area" d="M300,100 L500,100" fill="none" stroke="transparent" stroke-width="14" pointer-events="stroke" />
        <path d="M300,100 L500,100" fill="none" stroke="#707070" stroke-width="2" />
        <text x="400" y="94" text-anchor="middle" fill="#111111">Uses</text>
      </g>
    </g>
    <g class="boundary" data-id="backend-boundary" style="pointer-events: all;">
      <rect x="320" y="340" width="260" height="120" rx="8" ry="8"
            fill="none" stroke="#707070" stroke-width="2" stroke-dasharray="8,4" opacity="0.7" />
      <text x="330" y="360" fill="#111111" font-size="14" font-family="sans-serif" font-weight="bold">Backend</text>
    </g>
    <g class="nodes">
      <g class="node" data-id="customer">
        <rect x="100" y="50" width="200" height="100" fill="#08427b" stroke="#052f58" stroke-width="2" />
        <text data-field="label" x="200" y="105" text-anchor="middle" fill="#ffffff">Customer</text>
      </g>
      <g class="node" data-id="api">
        <rect x="340" y="360" width="180" height="80" fill="#438dd5" stroke="#0b477f" stroke-width="2" />
        <text data-field="label" x="430" y="405" text-anchor="middle" fill="#ffffff">API</text>
      </g>
      <g class="node" data-id="database">
        <rect x="450" y="360" width="120" height="80" fill="#438dd5" stroke="#0b477f" stroke-width="2" />
        <text data-field="label" x="510" y="405" text-anchor="middle" fill="#ffffff">Database</text>
      </g>
    </g>
  </g>
</svg>`;

const payload = {
  svg,
  visualLayout: {
    revision: 'boundary-1',
    nodes: [
      { id: 'customer', label: 'Customer', type: 'Person', x: 100, y: 50, width: 200, height: 100 },
      { id: 'api', label: 'API', type: 'Container', x: 340, y: 360, width: 180, height: 80 },
      { id: 'database', label: 'Database', type: 'Container', x: 450, y: 360, width: 120, height: 80 },
    ],
    boundaries: [
      {
        id: 'backend-boundary',
        label: 'Backend',
        x: 320,
        y: 340,
        width: 260,
        height: 120,
        childNodeIds: ['api', 'database'],
        childBoundaryIds: [],
      },
    ],
    edges: [
      { id: 'edge-1', from: 'customer', to: 'api', label: 'Uses' },
    ],
  },
  metrics: {
    parseTime: 4,
    modelTime: 1,
    layoutTime: 8,
    renderTime: 3,
    totalTime: 16,
    elements: 3,
    relationships: 1,
  },
  settings: {
    autoFitOnOpen: true,
    legendShow: true,
  },
  presentElementTypes: ['Person', 'Container', 'Relationship'],
  legendSwatchColors: {
    person: '#08427B',
    softwareSystem: '#1168BD',
    container: '#438DD5',
    component: '#85BBF0',
    deploymentNode: '#FFFFFF',
    external: '#999999',
  },
};

const vscodeStub = `
    window.__visualLayoutMessages = [];
    window.__visualLayoutRejectNextMove = false;
    const vscode = {
      postMessage(message) {
        window.__visualLayoutMessages.push(message);
        if (message.type === 'visualLayout.applySemanticEdits') {
          if (window.__visualLayoutSilentNextSave) {
            window.__visualLayoutSilentNextSave = false;
            return;
          }
          if (window.__visualLayoutRejectNextMove) {
            window.__visualLayoutRejectNextMove = false;
            window.postMessage({
              type: 'visualLayout.rejected',
              protocolVersion: 1,
              revision: message.revision,
              code: 'stale_revision',
              reason: 'Boundary harness rejected a stale revision.',
            }, '*');
          } else {
            window.postMessage({
              type: 'visualLayout.batchAccepted',
              protocolVersion: 1,
              revision: message.revision,
            }, '*');
          }
        }
        if (message.type === 'ready' && window.__visualLayoutRenderPayload) {
          window.postMessage({ type: 'render', payload: window.__visualLayoutRenderPayload }, '*');
        }
      }
    };`;

let html = templateMatch[1]
  .replace(/\$\{csp\}/g, "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'")
  .replace(/\$\{nonce\}/g, 'boundary-prototype')
  .replace('    const vscode = acquireVsCodeApi();', vscodeStub)
  .replace('${PREVIEW_CLIENT_SCRIPT}', PREVIEW_CLIENT_SCRIPT)
  .replace('</body>', `<script>
    window.__visualLayoutRenderPayload = ${JSON.stringify(payload)};
    window.postMessage({ type: 'render', payload: window.__visualLayoutRenderPayload }, '*');
  </script></body>`)
  .replace('</head>', `<style>:root {
    --vscode-editor-background: #f3f5f7;
    --vscode-foreground: #1f2328;
    --vscode-panel-border: #d0d7de;
    --vscode-descriptionForeground: #57606a;
    --vscode-button-background: #0969da;
    --vscode-button-foreground: #ffffff;
    --vscode-button-hoverBackground: #0757b8;
    --vscode-focusBorder: #0969da;
    --vscode-editor-inactiveSelectionBackground: #dbeafe;
  }</style></head>`);

const outputPath = process.argv[2] || path.join(root, 'test/visual-layout/boundary-harness.html');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, html, 'utf8');
console.log(outputPath);
