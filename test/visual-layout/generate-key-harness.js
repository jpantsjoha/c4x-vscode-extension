#!/usr/bin/env node

'use strict';

/**
 * Diagram key harness (#327).
 *
 * Renders a real C4X source through the host pipeline (parse, model, layout,
 * SvgBuilder) in the c4-model theme and builds the render payload the way
 * PreviewPanel does, derived key entries included, so the preview client
 * shows the overlay exactly as the extension would.
 *
 *   node generate-key-harness.js <source.c4x> <out.html> [--key-svg <out.svg>]
 *
 * With --key-svg it also writes the export SVG with the key band
 * (c4x.export.includeKey on), for the documentation screenshot.
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');
require('ts-node/register/transpile-only');

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === 'vscode') {
    return require.resolve('../../src/__tests__/__mocks__/vscode');
  }
  return originalResolve.call(this, request, ...args);
};

const root = path.resolve(__dirname, '../..');
const { PREVIEW_CLIENT_SCRIPT } = require('../../src/webview/previewClientScript');
const { C4XParser } = require('../../src/parser/C4XParser');
const { C4ModelBuilder } = require('../../src/model/C4ModelBuilder');
const { DagreLayoutEngine } = require('../../src/layout/DagreLayoutEngine');
const { SvgBuilder, elementStyleContextFor } = require('../../src/render/SvgBuilder');
const { C4ModelTheme } = require('../../src/themes/C4ModelTheme');
const { buildNodeSnapshots } = require('../../src/webview/nodeSnapshots');
const { buildBoundarySnapshots } = require('../../src/webview/boundarySnapshots');
const { elementStyleClientInputs } = require('../../src/webview/elementStyleClient');
const { computeLegendEntries, computeLegendSwatchColors, computePresentElementTypes } = require('../../src/webview/legendCatalog');
const { appendKeyToSvg, computeKeyEntries, keySwatchTheme } = require('../../src/render/KeyRenderer');

function build(source) {
  const view = new C4ModelBuilder().build(new C4XParser().parse(source), 'key-harness').views[0];
  const theme = C4ModelTheme;
  const layout = new DagreLayoutEngine().layoutSync(view, { theme });
  return { view, theme, layout };
}

function renderPayload({ view, theme, layout }) {
  return {
    svg: new SvgBuilder().build(layout, { theme, view }),
    visualLayout: {
      revision: '1',
      nodes: buildNodeSnapshots(layout),
      boundaries: buildBoundarySnapshots(layout),
      edges: layout.relationships.map(r => ({
        id: r.id, from: r.relationship.from, to: r.relationship.to,
        label: r.relationship.label, relType: r.relationship.relType, technology: r.relationship.technology,
      })),
    },
    metrics: { parseTime: 1, modelTime: 1, layoutTime: 1, renderTime: 1, totalTime: 4, elements: view.elements.length, relationships: view.relationships.length },
    settings: { autoFitOnOpen: true, legendShow: true },
    presentElementTypes: computePresentElementTypes(view),
    legendSwatchColors: computeLegendSwatchColors(view, theme),
    legendEntries: computeLegendEntries(layout, theme, elementStyleContextFor(layout, view, theme)),
    legendKeyTheme: keySwatchTheme(theme),
    elementStyleInputs: elementStyleClientInputs(view, theme),
    scope: 'file:///key-harness.c4x#1',
  };
}

function harnessHtml(payload) {
  const previewSource = fs.readFileSync(path.join(root, 'src/webview/PreviewPanel.ts'), 'utf8');
  const templateMatch = previewSource.match(/return `(<!DOCTYPE html>[\s\S]*?<\/html>)`;/);
  if (!templateMatch) {
    throw new Error('Could not extract PreviewPanel HTML template.');
  }
  const vscodeStub = `
    window.__visualLayoutMessages = [];
    const vscode = {
      getState() { return window.__visualLayoutSavedState; },
      setState(state) { window.__visualLayoutSavedState = state; },
      postMessage(message) {
        window.__visualLayoutMessages.push(message);
        if (message.type === 'ready' && window.__visualLayoutRenderPayload) {
          window.postMessage({ type: 'render', payload: window.__visualLayoutRenderPayload }, '*');
        }
      }
    };`;
  return templateMatch[1]
    .replace(/\$\{csp\}/g, "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'")
    .replace(/\$\{nonce\}/g, 'key-harness')
    .replace('    const vscode = acquireVsCodeApi();', vscodeStub)
    .replace('${buildPreviewClientScript(this.smokeSession)}', () => PREVIEW_CLIENT_SCRIPT)
    .replace('</body>', () => `<script>
    window.__visualLayoutRenderPayload = ${JSON.stringify(payload).replace(/</g, '\\u003c')};
    window.postMessage({ type: 'render', payload: window.__visualLayoutRenderPayload }, '*');
  </script></body>`);
}

function main() {
  const [sourcePath, out, flag, keySvgOut] = process.argv.slice(2);
  const built = build(fs.readFileSync(sourcePath, 'utf8'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, harnessHtml(renderPayload(built)), 'utf8');
  if (flag === '--key-svg' && keySvgOut) {
    const { view, theme, layout } = built;
    const plain = new SvgBuilder().build(layout, { theme, view, viewType: view.type });
    const entries = computeKeyEntries(layout, theme, elementStyleContextFor(layout, view, theme));
    fs.writeFileSync(keySvgOut, appendKeyToSvg(plain, entries, theme, layout.width), 'utf8');
  }
}

main();
