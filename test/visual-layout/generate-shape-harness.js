#!/usr/bin/env node

'use strict';

/**
 * Shape round-trip harness for the visual editor (#323).
 *
 * Unlike the hand-written prototype harnesses, this one renders a real C4X
 * source through the host pipeline (parse, model, layout, SvgBuilder) and
 * builds the render payload the way PreviewPanel does, so the editor drags
 * and resizes the exact shapes the host draws. Saving goes through the real
 * writeback transaction (validation ladder included) against an in-memory
 * document.
 *
 *   node generate-shape-harness.js render <source.c4x> <out.html>
 *   node generate-shape-harness.js save <source.c4x> <message.json>
 *       applies an applySemanticEdits message and rewrites <source.c4x>
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');
require('ts-node/register/transpile-only');

// The host modules import `vscode`; the unit-test mock stands in, as in the unit suite.
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
const { SvgBuilder } = require('../../src/render/SvgBuilder');
const { C4ModelTheme } = require('../../src/themes/C4ModelTheme');
const { buildNodeSnapshots } = require('../../src/webview/nodeSnapshots');
const { buildBoundarySnapshots } = require('../../src/webview/boundarySnapshots');
const { elementStyleClientInputs } = require('../../src/webview/elementStyleClient');
const { executeWritebackTransaction } = require('../../src/writeback/WritebackTransaction');
const { applyBoundedEdits, sourcePositionAt } = require('../../src/writeback/SourceRange');

function renderPayload(source, revision) {
  const view = new C4ModelBuilder().build(new C4XParser().parse(source), 'shape-harness').views[0];
  const layout = new DagreLayoutEngine().layoutSync(view);
  const theme = C4ModelTheme;
  return {
    svg: new SvgBuilder().build(layout, { theme, view }),
    visualLayout: {
      revision,
      nodes: buildNodeSnapshots(layout),
      boundaries: buildBoundarySnapshots(layout),
      edges: layout.relationships.map(r => ({
        id: r.id, from: r.relationship.from, to: r.relationship.to,
        label: r.relationship.label, relType: r.relationship.relType, technology: r.relationship.technology,
      })),
    },
    metrics: { parseTime: 1, modelTime: 1, layoutTime: 1, renderTime: 1, totalTime: 4, elements: view.elements.length, relationships: view.relationships.length },
    settings: { autoFitOnOpen: true, legendShow: false },
    presentElementTypes: ['Person', 'Container', 'Relationship'],
    legendSwatchColors: { person: '#297E06', softwareSystem: '#1168BD', container: '#1168BD', component: '#1168BD', deploymentNode: '#444444', external: '#BF101D' },
    elementStyleInputs: elementStyleClientInputs(view, theme),
    scope: 'file:///shape-harness.c4x#' + revision,
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
        if (message.type === 'visualLayout.applySemanticEdits') {
          window.postMessage({ type: 'visualLayout.batchAccepted', protocolVersion: 1, revision: message.revision }, '*');
        }
        if (message.type === 'ready' && window.__visualLayoutRenderPayload) {
          window.postMessage({ type: 'render', payload: window.__visualLayoutRenderPayload }, '*');
        }
      }
    };`;
  return templateMatch[1]
    .replace(/\$\{csp\}/g, "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'")
    .replace(/\$\{nonce\}/g, 'shape-harness')
    .replace('    const vscode = acquireVsCodeApi();', vscodeStub)
    .replace('${buildPreviewClientScript(this.smokeSession)}', () => PREVIEW_CLIENT_SCRIPT)
    .replace('</body>', () => `<script>
    window.__visualLayoutRenderPayload = ${JSON.stringify(payload).replace(/</g, '\\u003c')};
    window.postMessage({ type: 'render', payload: window.__visualLayoutRenderPayload }, '*');
  </script></body>`);
}

async function save(sourcePath, messagePath) {
  let text = fs.readFileSync(sourcePath, 'utf8');
  const message = JSON.parse(fs.readFileSync(messagePath, 'utf8'));
  const document = {
    uri: { fsPath: sourcePath, scheme: 'file' },
    version: Number(message.revision),
    languageId: 'c4x',
    fileName: sourcePath,
    getText: () => text,
    positionAt: offset => sourcePositionAt(text, offset),
  };
  const boundary = {
    getLayoutPersistenceMode: () => 'native',
    getWorkspaceFolder: () => undefined,
    getWorkspaceFolders: () => [],
    readFile: async () => new Uint8Array(),
    writeFile: async () => {},
    deleteFile: async () => {},
    joinPath: (base, ...parts) => ({ ...base, fsPath: [base.fsPath, ...parts].join('/') }),
    file: p => ({ fsPath: p, scheme: 'file' }),
    getWorkingDirectory: () => path.dirname(sourcePath),
    undo: async () => {},
    applyBoundedEdits: async (_doc, edits) => { text = applyBoundedEdits(text, edits); return true; },
  };
  const applied = await executeWritebackTransaction(document, message, undefined, boundary);
  if (!applied) {
    throw new Error('writeback transaction did not apply');
  }
  fs.writeFileSync(sourcePath, text, 'utf8');
}

async function main() {
  const [mode, sourcePath, out] = process.argv.slice(2);
  if (mode === 'render') {
    const revision = process.env.C4X_HARNESS_REVISION || '1';
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, harnessHtml(renderPayload(fs.readFileSync(sourcePath, 'utf8'), revision)), 'utf8');
  } else if (mode === 'save') {
    await save(sourcePath, out);
  } else {
    throw new Error(`unknown mode ${mode}`);
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
