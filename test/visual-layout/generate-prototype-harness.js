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
      <g class="edge" data-id="edge-2"><path class="edge-hit-area" d="M500,130 L300,130" fill="none" stroke="transparent" stroke-width="14" pointer-events="stroke" /><path d="M500,130 L300,130" fill="none" stroke="#707070" stroke-width="2" /></g>
      <g class="edge" data-id="edge-3"><path class="edge-hit-area" d="M300,130 L200,230" fill="none" stroke="transparent" stroke-width="14" pointer-events="stroke" /><path d="M300,130 L200,230" fill="none" stroke="#707070" stroke-width="2" /></g>
      <g class="edge" data-id="edge-4"><path class="edge-hit-area" d="M610,130 L610,230" fill="none" stroke="transparent" stroke-width="14" pointer-events="stroke" /><path d="M610,130 L610,230" fill="none" stroke="#707070" stroke-width="2" /></g>
      <g class="edge" data-id="edge-5"><path class="edge-hit-area" d="M610,310 L450,360" fill="none" stroke="transparent" stroke-width="14" pointer-events="stroke" /><path d="M610,310 L450,360" fill="none" stroke="#707070" stroke-width="2" /></g>
    </g>
    <g class="nodes">
      <g class="node" data-id="customer">
        <rect x="100" y="50" width="200" height="100" fill="#08427b" stroke="#052f58" stroke-width="2" />
        <text data-field="label" x="200" y="105" text-anchor="middle" fill="#ffffff">Customer</text>
      </g>
      <g class="node" data-id="payments">
        <rect x="500" y="50" width="220" height="100" fill="#1168bd" stroke="#0b477f" stroke-width="2" />
        <text data-field="label" x="610" y="105" text-anchor="middle" fill="#ffffff">Payments System</text>
      </g>
      <g class="node" data-id="audit">
        <rect x="100" y="230" width="200" height="80" fill="#1168bd" stroke="#0b477f" stroke-width="2" />
        <text data-field="label" x="200" y="275" text-anchor="middle" fill="#ffffff">Audit service</text>
      </g>
      <g class="node" data-id="web">
        <rect x="500" y="230" width="220" height="80" fill="#1168bd" stroke="#0b477f" stroke-width="2" />
        <text data-field="label" x="610" y="275" text-anchor="middle" fill="#ffffff">Web application</text>
      </g>
      <g class="node" data-id="api">
        <rect x="340" y="360" width="220" height="80" fill="#1168bd" stroke="#0b477f" stroke-width="2" />
        <text data-field="label" x="450" y="405" text-anchor="middle" fill="#ffffff">API</text>
      </g>
      <g class="node" data-id="database">
        <rect x="620" y="360" width="150" height="80" fill="#1168bd" stroke="#0b477f" stroke-width="2" />
        <text data-field="label" x="695" y="405" text-anchor="middle" fill="#ffffff">Database</text>
      </g>
    </g>
  </g>
</svg>`;

const payload = {
  svg,
  visualLayout: {
    revision: 'prototype-1',
    nodes: [
      { id: 'customer', label: 'Customer', type: 'Person', x: 100, y: 50, width: 200, height: 100 },
      { id: 'payments', label: 'Payments System', type: 'SoftwareSystem', x: 500, y: 50, width: 220, height: 100 },
      { id: 'audit', label: 'Audit service', type: 'SoftwareSystem', x: 100, y: 230, width: 200, height: 80 },
      { id: 'web', label: 'Web application', type: 'Container', x: 500, y: 230, width: 220, height: 80, technology: 'React' },
      { id: 'api', label: 'API', type: 'Container', x: 340, y: 360, width: 220, height: 80, description: 'Application API', tags: ['Internal'] },
      { id: 'database', label: 'Database', type: 'Container', x: 620, y: 360, width: 150, height: 80, sprite: 'database', locked: true },
    ],
    boundaries: [],
    edges: [
      { id: 'edge-1', from: 'customer', to: 'payments', label: 'Uses' },
      { id: 'edge-2', from: 'payments', to: 'customer', label: 'Serves' },
      { id: 'edge-3', from: 'customer', to: 'audit' },
      { id: 'edge-4', from: 'payments', to: 'web', label: 'Calls API', relType: 'sync', technology: 'REST' },
      { id: 'edge-5', from: 'web', to: 'api' },
    ],
  },
  metrics: {
    parseTime: 4,
    modelTime: 1,
    layoutTime: 8,
    renderTime: 3,
    totalTime: 16,
    elements: 2,
    relationships: 1,
  },
  // Mirrors the RenderPayload the host builds in PreviewPanel: both feature
  // flags default to true, the legend lists exactly the element types present
  // in the fixture (Person, SoftwareSystem, Container) plus the derived
  // Relationship marker (the fixture has edges but no boundaries or
  // external-tagged elements), and the swatch colours match the fixture fills
  // (C4 Standard palette values).
  settings: {
    autoFitOnOpen: true,
    legendShow: true,
  },
  presentElementTypes: ['Person', 'SoftwareSystem', 'Container', 'Relationship'],
  legendSwatchColors: {
    person: '#08427B',
    softwareSystem: '#1168BD',
    container: '#438DD5',
    component: '#85BBF0',
    deploymentNode: '#FFFFFF',
    external: '#999999',
  },
};

// Optional explicit initial zoom (#134): when C4X_HARNESS_INITIAL_ZOOM is set
// to a finite number, the stub payload carries settings.initialZoom — mirroring
// the payload a Markdown-bound PreviewPanel sends. Unset means a standalone
// panel, which keeps the auto-fit-on-open path (#111).
const initialZoomEnv = process.env.C4X_HARNESS_INITIAL_ZOOM;
if (initialZoomEnv !== undefined && Number.isFinite(Number(initialZoomEnv))) {
  payload.settings.initialZoom = Number(initialZoomEnv);
}

const vscodeStub = `
    window.__visualLayoutMessages = [];
    window.__visualLayoutRejectNextMove = false;
    const vscode = {
      postMessage(message) {
        window.__visualLayoutMessages.push(message);
        if (message.type === 'visualLayout.applySemanticEdits') {
          if (window.__visualLayoutSilentNextSave) {
            // Simulate a silent host: record the message but never respond,
            // so the client-side save watchdog can be exercised.
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
              reason: 'Spike harness rejected a stale revision.',
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
  .replace(/\$\{nonce\}/g, 'prototype')
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
    /* The sidebar and the floating overlays default to a DARK widget
       background when this is unset, which put dark theme text on a dark
       surface and made the visual baseline unreadable. A real theme always
       supplies a widget background that matches its foreground. */
    --vscode-editorWidget-background: #ffffff;
    --vscode-widget-border: #d0d7de;
    --vscode-widget-shadow: rgba(31, 35, 40, 0.15);
    --vscode-input-background: #ffffff;
    --vscode-input-foreground: #1f2328;
    --vscode-input-border: #d0d7de;
  }</style></head>`);

const outputPath = process.argv[2] || path.join(root, 'test/visual-layout/prototype-harness.html');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, html, 'utf8');
console.log(outputPath);
