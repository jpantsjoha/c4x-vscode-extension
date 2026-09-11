#!/usr/bin/env node

/**
 * generate-large-diagram-harness.js
 *
 * Generates a deterministic HTML harness containing a large synthetic C4X diagram
 * (~120 elements, ~158 relationships) for edit-mode performance tests.
 *
 * Counts (deterministic — no randomness):
 *   Nodes : 120  (10 columns × 12 rows; types cycle Person/SoftwareSystem/Container/Component)
 *   Edges : 158  (110 column-down + 48 within-row chains)
 *
 * Usage:
 *   node test/visual-layout/generate-large-diagram-harness.js [outputPath]
 *
 * Environment variables:
 *   C4X_LARGE_DIAGRAM_HARNESS — override output path (same as the env var read by the spec)
 */

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

// ---------------------------------------------------------------------------
// Fixture generation — deterministic, no randomness
// ---------------------------------------------------------------------------

const NODE_TYPES = ['Person', 'SoftwareSystem', 'Container', 'Component'];
const GRID_COLS = 10;
const GRID_ROWS = 12;
const NODE_W = 160;
const NODE_H = 80;
const H_GAP = 40;
const V_GAP = 40;

/** Build visualLayout payload (nodes + edges). */
function buildFixture() {
  const nodes = [];
  let seq = 0;

  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      seq++;
      const id = 'n' + String(seq).padStart(3, '0');
      const type = NODE_TYPES[(seq - 1) % NODE_TYPES.length];
      const x = col * (NODE_W + H_GAP) + 80;
      const y = row * (NODE_H + V_GAP) + 80;
      nodes.push({
        id,
        label: 'Element ' + seq,
        type,
        x,
        y,
        width: NODE_W,
        height: NODE_H,
      });
    }
  }

  const edges = [];
  let eseq = 0;

  // Column-down edges: 10 cols × 11 inter-row gaps = 110
  for (let row = 0; row < GRID_ROWS - 1; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      eseq++;
      edges.push({
        id: 'e' + String(eseq).padStart(3, '0'),
        from: nodes[row * GRID_COLS + col].id,
        to: nodes[(row + 1) * GRID_COLS + col].id,
      });
    }
  }

  // Within-row chain edges: 12 rows × 4 consecutive pairs = 48
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < 4; col++) {
      eseq++;
      edges.push({
        id: 'e' + String(eseq).padStart(3, '0'),
        from: nodes[row * GRID_COLS + col].id,
        to: nodes[row * GRID_COLS + col + 1].id,
      });
    }
  }

  return { nodes, edges };
}

/** Build an SVG string for the fixture nodes and edges. */
function buildSvg(nodes, edges) {
  const totalW = GRID_COLS * (NODE_W + H_GAP) + 80;
  const totalH = GRID_ROWS * (NODE_H + V_GAP) + 80;

  const FILL_BY_TYPE = {
    Person: '#08427b',
    SoftwareSystem: '#1168bd',
    Container: '#438dd5',
    Component: '#85bbf0',
  };
  const STROKE_BY_TYPE = {
    Person: '#052f58',
    SoftwareSystem: '#0b477f',
    Container: '#2e6295',
    Component: '#5d83b8',
  };

  const edgeParts = edges.map((edge) => {
    const from = nodes.find((n) => n.id === edge.from);
    const to = nodes.find((n) => n.id === edge.to);
    if (!from || !to) return '';
    const x1 = from.x + from.width / 2;
    const y1 = from.y + from.height;
    const x2 = to.x + to.width / 2;
    const y2 = to.y;
    return `<g class="edge" data-id="${edge.id}"><path d="M${x1},${y1} L${x2},${y2}" fill="none" stroke="#707070" stroke-width="1.5"/></g>`;
  });

  const nodeParts = nodes.map((node) => {
    const fill = FILL_BY_TYPE[node.type] || '#1168bd';
    const stroke = STROKE_BY_TYPE[node.type] || '#0b477f';
    const cx = node.x + node.width / 2;
    const cy = node.y + node.height / 2;
    return `<g class="node" data-id="${node.id}">` +
      `<rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>` +
      `<text x="${cx}" y="${cy + 5}" text-anchor="middle" fill="#ffffff" font-size="11">${node.label}</text>` +
      `</g>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" role="img">` +
    `<rect x="0" y="0" width="${totalW}" height="${totalH}" fill="#ffffff"/>` +
    `<g class="diagram-content">` +
    `<g class="edges">${edgeParts.join('')}</g>` +
    `<g class="nodes">${nodeParts.join('')}</g>` +
    `</g>` +
    `</svg>`;
}

// ---------------------------------------------------------------------------
// Assemble harness
// ---------------------------------------------------------------------------

const { nodes, edges } = buildFixture();
const svg = buildSvg(nodes, edges);

const payload = {
  svg,
  visualLayout: {
    revision: 'large-diagram-v1',
    nodes,
    boundaries: [],
    edges,
  },
  metrics: {
    parseTime: 45,
    modelTime: 12,
    layoutTime: 180,
    renderTime: 60,
    totalTime: 297,
    elements: nodes.length,
    relationships: edges.length,
  },
  settings: {
    autoFitOnOpen: true,
    legendShow: true,
  },
  presentElementTypes: ['Person', 'SoftwareSystem', 'Container', 'Component', 'Relationship'],
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
          if (window.__visualLayoutRejectNextMove) {
            window.__visualLayoutRejectNextMove = false;
            window.postMessage({
              type: 'visualLayout.rejected',
              protocolVersion: 1,
              revision: message.revision,
              code: 'stale_revision',
              reason: 'Large-diagram harness rejected a stale revision.',
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
  .replace(/\$\{nonce\}/g, 'large-diagram-perf')
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

const outputPath = process.argv[2] ||
  process.env.C4X_LARGE_DIAGRAM_HARNESS ||
  path.join(root, 'test/visual-layout/large-diagram-harness.html');

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, html, 'utf8');
console.log(outputPath);
