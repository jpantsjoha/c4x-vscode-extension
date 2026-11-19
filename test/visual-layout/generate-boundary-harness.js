#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
require('ts-node/register/transpile-only');

const { buildPreviewClientScript } = require('../../src/webview/previewClientScript');
// A session in C4X_HARNESS_SMOKE_SESSION builds the smoke-mode client (test-only
// handlers); without it the harness runs the normal client, as a user's does.
const PREVIEW_CLIENT_SCRIPT = buildPreviewClientScript(process.env.C4X_HARNESS_SMOKE_SESSION || undefined);

const root = path.resolve(__dirname, '../..');
const previewSource = fs.readFileSync(path.join(root, 'src/webview/PreviewPanel.ts'), 'utf8');
const templateMatch = previewSource.match(/return `(<!DOCTYPE html>[\s\S]*?<\/html>)`;/);

if (!templateMatch) {
  throw new Error('Could not extract PreviewPanel HTML template.');
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 880 900" role="img">
  <rect x="0" y="0" width="880" height="900" fill="#ffffff" />
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
    <g class="boundary" data-id="pinned-boundary" style="pointer-events: all;">
      <rect x="60" y="230" width="220" height="150" rx="8" ry="8"
            fill="none" stroke="#707070" stroke-width="2" stroke-dasharray="8,4" opacity="0.7" />
      <text x="70" y="250" fill="#111111" font-size="14" font-family="sans-serif" font-weight="bold">Pinned</text>
    </g>
    <g class="boundary" data-id="shop-boundary" style="pointer-events: all;">
      <rect x="590" y="40" width="180" height="110" rx="8" ry="8"
            fill="none" stroke="#707070" stroke-width="2" stroke-dasharray="8,4" opacity="0.7" />
      <text x="600" y="60" fill="#111111" font-size="14" font-family="sans-serif" font-weight="bold">Shop</text>
    </g>
    <g class="boundary" data-id="platform-boundary" style="pointer-events: all;">
      <rect x="590" y="170" width="180" height="90" rx="8" ry="8"
            fill="none" stroke="#707070" stroke-width="2" stroke-dasharray="8,4" opacity="0.7" />
      <text x="600" y="190" fill="#111111" font-size="14" font-family="sans-serif" font-weight="bold">Platform</text>
    </g>
    <g class="boundary" data-id="outer-boundary" style="pointer-events: all;">
      <rect x="600" y="340" width="260" height="240" rx="8" ry="8"
            fill="none" stroke="#707070" stroke-width="2" stroke-dasharray="8,4" opacity="0.7" />
      <text x="610" y="360" fill="#111111" font-size="14" font-family="sans-serif" font-weight="bold">Outer</text>
    </g>
    <g class="boundary" data-id="inner-boundary" style="pointer-events: all;">
      <rect x="640" y="400" width="180" height="140" rx="8" ry="8"
            fill="none" stroke="#707070" stroke-width="2" stroke-dasharray="8,4" opacity="0.7" />
      <text x="650" y="420" fill="#111111" font-size="14" font-family="sans-serif" font-weight="bold">Inner</text>
    </g>
    <g class="boundary" data-id="host-boundary" style="pointer-events: all;">
      <rect x="60" y="600" width="260" height="240" rx="8" ry="8"
            fill="none" stroke="#707070" stroke-width="2" stroke-dasharray="8,4" opacity="0.7" />
      <text x="70" y="620" fill="#111111" font-size="14" font-family="sans-serif" font-weight="bold">Host</text>
    </g>
    <g class="boundary" data-id="anchored-boundary" style="pointer-events: all;">
      <rect x="100" y="660" width="180" height="140" rx="8" ry="8"
            fill="none" stroke="#707070" stroke-width="2" stroke-dasharray="8,4" opacity="0.7" />
      <text x="110" y="680" fill="#111111" font-size="14" font-family="sans-serif" font-weight="bold">Anchored</text>
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
      <g class="node" data-id="worker">
        <rect x="100" y="290" width="140" height="60" fill="#438dd5" stroke="#0b477f" stroke-width="2" />
        <text data-field="label" x="170" y="325" text-anchor="middle" fill="#ffffff">Worker</text>
      </g>
      <g class="node" data-id="queue">
        <rect x="140" y="720" width="100" height="40" fill="#438dd5" stroke="#0b477f" stroke-width="2" />
        <text data-field="label" x="190" y="745" text-anchor="middle" fill="#ffffff">Queue</text>
      </g>
      <g class="node" data-id="cache">
        <rect x="680" y="460" width="100" height="40" fill="#438dd5" stroke="#0b477f" stroke-width="2" />
        <text data-field="label" x="730" y="485" text-anchor="middle" fill="#ffffff">Cache</text>
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
      { id: 'worker', label: 'Worker', type: 'Container', x: 100, y: 290, width: 140, height: 60 },
      { id: 'cache', label: 'Cache', type: 'Container', x: 680, y: 460, width: 100, height: 40 },
      { id: 'queue', label: 'Queue', type: 'Container', x: 140, y: 720, width: 100, height: 40 },
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
      // A frame the author pinned with $x/$y (#163). Its origin must survive a
      // child drag, and a later keyboard nudge must start from it.
      {
        id: 'pinned-boundary',
        label: 'Pinned',
        x: 60,
        y: 230,
        width: 220,
        height: 150,
        childNodeIds: ['worker'],
        childBoundaryIds: [],
        manualX: true,
        manualY: true,
      },
      // Declared System_Boundary(...) in source: the grammar has no slot for a
      // position or size, so the host sends movable: false (#271).
      {
        id: 'shop-boundary',
        label: 'Shop',
        x: 590,
        y: 40,
        width: 180,
        height: 110,
        childNodeIds: [],
        childBoundaryIds: [],
        movable: false,
      },
      // Declared Enterprise_Boundary(...) in source: same rule (#271).
      {
        id: 'platform-boundary',
        label: 'Platform',
        x: 590,
        y: 170,
        width: 180,
        height: 90,
        childNodeIds: [],
        childBoundaryIds: [],
        movable: false,
      },
      // An untyped subgraph nested in another (#339). Both frames are
      // auto-positioned at the host's wrap: inner = cache + 40/60/40 padding,
      // outer = inner + the same padding.
      {
        id: 'outer-boundary',
        label: 'Outer',
        x: 600,
        y: 340,
        width: 260,
        height: 240,
        childNodeIds: [],
        childBoundaryIds: ['inner-boundary'],
      },
      {
        id: 'inner-boundary',
        label: 'Inner',
        x: 640,
        y: 400,
        width: 180,
        height: 140,
        childNodeIds: ['cache'],
        childBoundaryIds: [],
      },
      // An auto-positioned frame around a nested frame pinned by $x/$y
      // (#339 review). Moving the outer frame must leave the pinned one, and
      // its contents, where the host keeps them on save.
      {
        id: 'host-boundary',
        label: 'Host',
        x: 60,
        y: 600,
        width: 260,
        height: 240,
        childNodeIds: [],
        childBoundaryIds: ['anchored-boundary'],
      },
      {
        id: 'anchored-boundary',
        label: 'Anchored',
        x: 100,
        y: 660,
        width: 180,
        height: 140,
        childNodeIds: ['queue'],
        childBoundaryIds: [],
        manualX: true,
        manualY: true,
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
    elements: 6,
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
  // Draft-state identity (#167 review): required by isRenderMessage, so the
  // harness must stand in for the host here too.
  scope: 'file:///boundary-harness.c4x',
};

const vscodeStub = `
    window.__visualLayoutMessages = [];
    window.__visualLayoutRejectNextMove = false;
    const vscode = {
      getState() { return window.__visualLayoutSavedState; },
      setState(state) { window.__visualLayoutSavedState = state; },
      postMessage(message) {
        window.__visualLayoutMessages.push(message);
        // Host stand-in for the layout mode (#340): when the payload carries both
        // layouts and the view-mode one grew boxes, answer a mode change with a
        // render in that mode, as PreviewPanel does (a marked, non-source render).
        const modes = window.__visualLayoutRenderPayload && window.__visualLayoutRenderPayload.__modes;
        if (message.type === 'visualLayout.layoutMode' && modes && modes[message.mode] && modes[message.mode].textGrown) {
          const deliver = () => window.postMessage({ type: 'render', payload: modes[message.mode], refresh: true }, '*');
          // window.__visualLayoutHoldModeRender holds the answer until the test
          // calls window.__visualLayoutReleaseModeRender() (a slow host).
          if (window.__visualLayoutHoldModeRender) {
            window.__visualLayoutReleaseModeRender = () => { window.__visualLayoutHoldModeRender = false; deliver(); };
          } else {
            setTimeout(deliver, 50);
          }
        }
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

/**
 * The preview page with the production client, a stubbed VS Code API that
 * accepts every save, and `renderPayload` delivered as the first render.
 * Exported so other harnesses can feed it a payload from the real host
 * pipeline (#346).
 */
function buildHarnessHtml(renderPayload) {
  return templateMatch[1]
  .replace(/\$\{csp\}/g, "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'")
  .replace(/\$\{nonce\}/g, 'boundary-prototype')
  .replace('    const vscode = acquireVsCodeApi();', vscodeStub)
  .replace('${buildPreviewClientScript(this.smokeSession)}', () => PREVIEW_CLIENT_SCRIPT)
  .replace('</body>', `<script>
    window.__visualLayoutRenderPayload = ${JSON.stringify(renderPayload)};
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
}

module.exports = { buildHarnessHtml };

if (require.main === module) {
  const outputPath = process.argv[2] || path.join(root, 'test/visual-layout/boundary-harness.html');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buildHarnessHtml(payload), 'utf8');
  console.log(outputPath);
}
