#!/usr/bin/env node

/**
 * Host-pipeline harness for boundary moves (#346).
 *
 * Unlike the hand-built boundary harness, the payload here comes from the real
 * host path: C4X source -> parser -> model -> DagreLayoutEngine -> SvgBuilder
 * and the node/boundary snapshots, exactly as PreviewPanel builds them. A
 * browser test can then drag in the production client and compare what it
 * painted with what the host lays out for the source Save writes.
 *
 * Usage:
 *   node test/visual-layout/generate-host-layout-harness.js harness <source.c4x> <out.html>
 *   node test/visual-layout/generate-host-layout-harness.js layout  <source.c4x>
 *     (prints {"boundaries": {label: {x, y}}, "elements": {id: {x, y}}} as JSON)
 *   node test/visual-layout/generate-host-layout-harness.js save <source.c4x> <edits.json> <out.c4x> <out.svg>
 *     (applies the label, technology and description of posted semantic edits
 *     with the extension's writeback planner, writes the saved source and its
 *     render; #420)
 *
 *   node test/visual-layout/generate-host-layout-harness.js export <source.c4x> <preview.svg> <exported.svg>
 *     (writes the preview SVG and the standalone file Export SVG makes from it)
 *
 * Set C4X_HARNESS_THEME to a theme name (classic, c4-model, c4-standard, modern,
 * muted, high-contrast, auto-light, auto-dark) to lay out and draw in it (#340).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

process.env.TS_NODE_PROJECT = path.resolve(__dirname, '../..', 'tsconfig.unit.json');
require('ts-node/register/transpile-only');

// SvgBuilder reaches the theme manager, which imports `vscode`; the unit
// tests' stand-in is enough to render with the default theme.
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === 'vscode') {
    return require.resolve('../../src/__tests__/__mocks__/vscode');
  }
  return originalResolveFilename.call(this, request, ...args);
};

const { C4XParser } = require('../../src/parser/C4XParser');
const { C4ModelBuilder } = require('../../src/model/C4ModelBuilder');
const { DagreLayoutEngine } = require('../../src/layout/DagreLayoutEngine');
const { svgBuilder } = require('../../src/render/SvgBuilder');
const { buildNodeSnapshots } = require('../../src/webview/nodeSnapshots');
const { buildBoundarySnapshots } = require('../../src/webview/boundarySnapshots');

// C4X_HARNESS_THEME picks the theme (#340: text wraps in the theme's font, so
// the layout and the SVG take the same theme). Unset: the default theme.
const THEMES = {
  classic: () => require('../../src/themes/ClassicTheme').ClassicTheme,
  'c4-model': () => require('../../src/themes/C4ModelTheme').C4ModelTheme,
  'c4-model-dark': () => require('../../src/themes/C4ModelTheme').C4ModelDarkTheme,
  'c4-standard': () => require('../../src/themes/C4StandardTheme').C4StandardTheme,
  modern: () => require('../../src/themes/ModernTheme').ModernTheme,
  muted: () => require('../../src/themes/MutedTheme').MutedTheme,
  'high-contrast': () => require('../../src/themes/HighContrastTheme').HighContrastTheme,
  'auto-light': () => require('../../src/themes/AutoTheme').LightTheme,
  'auto-dark': () => require('../../src/themes/AutoTheme').DarkTheme,
};
const themeName = process.env.C4X_HARNESS_THEME;
if (themeName && !THEMES[themeName]) {
  throw new Error(`unknown C4X_HARNESS_THEME ${themeName}; expected ${Object.keys(THEMES).join(' or ')}`);
}
const theme = themeName ? THEMES[themeName]() : undefined;

function modelOf(source) {
  return new C4ModelBuilder().build(new C4XParser().parse(source), 'host-layout-harness');
}

function layoutOf(source, growText = true) {
  return new DagreLayoutEngine(() => undefined).layoutSync(modelOf(source).views[0], { ...(theme ? { theme } : {}), growText });
}

function svgOf(source, growText = true) {
  const view = modelOf(source).views[0];
  return svgBuilder.build(new DagreLayoutEngine(() => undefined).layoutSync(view, { ...(theme ? { theme } : {}), growText }), theme ? { theme, view } : {});
}

/** Both layout modes (#340): the webview asks for `edit` on entering edit mode. */
function payloadOf(source) {
  const textGrown = new DagreLayoutEngine(() => undefined).wouldGrowText(modelOf(source).views[0], theme ? { theme } : {});
  const view = { ...modePayloadOf(source, 'view'), textGrown };
  const edit = { ...modePayloadOf(source, 'edit'), textGrown };
  return { ...view, __modes: { view, edit } };
}

function modePayloadOf(source, layoutMode) {
  const growText = layoutMode !== 'edit';
  const layout = layoutOf(source, growText);
  return {
    layoutMode,
    diagramIdentity: 'file:///host-layout-harness.c4x',
    // The host's proof that the change since the last render stayed inside this diagram (#340 review 9).
    sameDiagramEdit: { since: null, value: true },
    viewType: String(modelOf(source).views[0].type),
    svg: svgOf(source, growText),
    visualLayout: {
      revision: 'host-layout-1',
      nodes: buildNodeSnapshots(layout),
      boundaries: buildBoundarySnapshots(layout),
      edges: layout.relationships.map(r => ({
        id: r.id, from: r.relationship.from, to: r.relationship.to, label: r.relationship.label,
      })),
    },
    metrics: {
      parseTime: 1, modelTime: 1, layoutTime: 1, renderTime: 1, totalTime: 4,
      elements: layout.elements.length, relationships: layout.relationships.length,
    },
    settings: { autoFitOnOpen: true, legendShow: false },
    presentElementTypes: [],
    legendSwatchColors: {},
    scope: 'file:///host-layout-harness.c4x',
  };
}

function positionsOf(source) {
  const layout = layoutOf(source);
  const boundaries = {};
  for (const b of layout.boundaries || []) { boundaries[b.boundary.label] = { x: b.x, y: b.y }; }
  const elements = {};
  for (const e of layout.elements) { elements[e.id] = { x: e.x, y: e.y }; }
  return { boundaries, elements };
}

/** Apply posted label/technology/description edits as WritebackTransaction plans them. */
function saveTextEdits(source, edits) {
  const { planElementTextUpdates, planMetadataUpdate } = require('../../src/writeback/NativeMutationPlanner');
  const { applyBoundedEdits } = require('../../src/writeback/SourceRange');
  const parsed = new C4XParser().parse(source);
  const planned = [];
  for (const edit of edits) {
    const patch = {};
    for (const key of ['label', 'technology', 'description']) {
      if (edit[key] !== undefined) { patch[key] = edit[key]; }
    }
    const moved = edit.x !== undefined && edit.y !== undefined;
    if (Object.keys(patch).length === 0 && !moved) { continue; }
    // Nested deployment nodes keep their children in `children` (#326).
    const find = list => {
      for (const candidate of list) {
        if (candidate.id === edit.id) { return candidate; }
        const nested = find(candidate.children || []);
        if (nested) { return nested; }
      }
      return undefined;
    };
    const element = find(parsed.elements);
    if (!element || !element.sourceRange) { throw new Error(`no source range for ${edit.id}`); }
    const range = element.sourceRange;
    const target = { elementId: edit.id, range, expectedText: source.slice(range.start.offset, range.end.offset) };
    if (Object.keys(patch).length > 0) { planned.push(...planElementTextUpdates(source, target, patch)); }
    // A staged move saves $x/$y, as the writeback transaction does (#340).
    if (moved) { planned.push(...planMetadataUpdate(source, target, { x: edit.x, y: edit.y })); }
  }
  return applyBoundedEdits(source, planned);
}

const [mode, sourcePath, outputPath] = process.argv.slice(2);
const source = fs.readFileSync(sourcePath, 'utf8');
if (mode === 'harness') {
  const { buildHarnessHtml } = require('./generate-boundary-harness');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buildHarnessHtml(payloadOf(source)), 'utf8');
  console.log(outputPath);
} else if (mode === 'payload') {
  // Both layout-mode payloads as JSON, for a test to post as another diagram's render (#340).
  process.stdout.write(JSON.stringify(payloadOf(source).__modes));
} else if (mode === 'layout') {
  process.stdout.write(JSON.stringify(positionsOf(source)));
} else if (mode === 'save-layout') {
  // Apply posted edits, then print the saved source's layout as `layout` does (#340).
  const [, , editsPath, savedPath] = process.argv.slice(2);
  const saved = saveTextEdits(source, JSON.parse(fs.readFileSync(editsPath, 'utf8')));
  fs.writeFileSync(savedPath, saved, 'utf8');
  process.stdout.write(JSON.stringify(positionsOf(saved)));
} else if (mode === 'save') {
  const [, , editsPath, savedPath, svgPath] = process.argv.slice(2);
  fs.writeFileSync(savedPath, saveTextEdits(source, JSON.parse(fs.readFileSync(editsPath, 'utf8'))), 'utf8');
  fs.writeFileSync(svgPath, svgOf(fs.readFileSync(savedPath, 'utf8')), 'utf8');
} else if (mode === 'export') {
  // The preview SVG and the file the Export SVG command writes from it (#340 review).
  const exportPath = process.argv[5];
  const { SvgExporter } = require('../../src/export/SvgExporter');
  const exportTheme = theme || require('../../src/themes/ClassicTheme').ClassicTheme;
  const preview = svgOf(source);
  fs.writeFileSync(outputPath, preview, 'utf8');
  fs.writeFileSync(exportPath, new SvgExporter().makeStandalone(preview, exportTheme), 'utf8');
} else {
  throw new Error(`unknown mode ${mode}; expected "harness", "layout", "save" or "export"`);
}
