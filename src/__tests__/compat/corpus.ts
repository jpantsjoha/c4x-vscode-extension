/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any, security/detect-non-literal-fs-filename, security/detect-non-literal-require, security/detect-object-injection */
/**
 * Compatibility corpus core (#365): discovers every diagram the project publishes and
 * reduces each one to a comparable record (parse outcome, model summary, normalised SVG
 * hashes). Shared by scripts/generate-compat-baseline.js and the corpus unit test, so a
 * baseline and a later comparison are produced by identical code.
 *
 * The record schema and normalisation must not change between a baseline and the tree it
 * is compared with; change them only together with a regenerated baseline.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

const Module = require('node:module');

export type CorpusFormat = 'c4x' | 'plantuml' | 'structurizr';
export interface CorpusItem { id: string; kind: string; format: CorpusFormat; path: string; fence?: number; source: string }
export interface ViewRecord { summary: string; svg: Record<string, string> }
export interface AnalysisRecord { parse: string; views: ViewRecord[] }
export interface Pipeline { parser: any; builder: any; layout: any; svg: any; themes: Record<string, unknown>; plantuml: (source: string) => any; structurizr: (source: string) => any }

/**
 * Every static theme that existed in 1.8.0, plus the `auto` theme's light and dark variants
 * (fixed inputs, so no dependence on the host colour scheme). `classic` was the 1.8.0 default.
 */
export const THEME_KEYS = ['classic', 'modern', 'muted', 'high-contrast', 'c4-standard', 'auto-light', 'auto-dark'];

/** Directories searched for Markdown fences and `.c4x` files, relative to the repository root. */
const MARKDOWN_ROOTS = ['README.md', 'docs', 'samples', 'examples', 'wiki'];
const DIAGRAM_EXTENSIONS: Record<string, CorpusFormat> = { '.c4x': 'c4x', '.puml': 'plantuml', '.dsl': 'structurizr' };
const C4X_FILE_ROOTS = ['samples', 'docs', 'examples', 'wiki', 'src/__tests__', 'test/fixtures'];
const SKIP_DIRS = new Set(['node_modules', 'out', 'dist', '.git', '.vscode-test']);

export function sha(text: string, length: number): string {
    return crypto.createHash('sha256').update(text).digest('hex').slice(0, length);
}

function walk(root: string, rel: string, accept: (rel: string) => boolean, found: string[]): void {
    const abs = path.join(root, rel);
    let stat: fs.Stats;
    try { stat = fs.statSync(abs); } catch { return; }
    if (stat.isFile()) {
        if (accept(rel)) { found.push(rel); }
        return;
    }
    for (const name of fs.readdirSync(abs).sort()) {
        if (SKIP_DIRS.has(name)) { continue; }
        walk(root, rel ? path.posix.join(rel, name) : name, accept, found);
    }
}

/**
 * The fenced blocks the Markdown preview renders: `c4x` and `plantuml` fences found by
 * markdown-it's own tokeniser (the extension's c4xPlugin matches on the first word of the
 * fence info), so a fence nested inside another fence is not a diagram. `markdown-it` is
 * resolved from `root`, so a baseline uses the release's own tokeniser.
 */
export function extractRenderedFences(markdown: string, root: string): Array<{ lang: CorpusFormat; source: string }> {
    const MarkdownIt = require(require.resolve('markdown-it', { paths: [root] }));
    const md = new (MarkdownIt.default ?? MarkdownIt)();
    const found: Array<{ lang: CorpusFormat; source: string }> = [];
    for (const token of md.parse(markdown, {})) {
        if (token.type !== 'fence') { continue; }
        const lang = String(token.info).trim().split(/\s+/)[0];
        if (lang === 'c4x' || lang === 'plantuml') { found.push({ lang, source: token.content }); }
    }
    return found;
}

const SNIPPET_FILE = 'snippets/c4x.json';

/** Expand a VS Code snippet body to its default text: `${1:User}` becomes `User`, bare tabstops vanish. */
export function expandSnippet(body: string | string[]): string {
    const text = Array.isArray(body) ? body.join('\n') : body;
    return text
        .replace(/\$\{\d+\|([^,}|]*)[^}]*\|\}/g, '$1')
        .replace(/\$\{\d+:([^}]*)\}/g, '$1')
        .replace(/\$\{?\d+\}?/g, '');
}

/**
 * Discover the corpus under `root`. Returns items sorted by id. Formats: `.c4x`, `.puml`
 * (PlantUML) and `.dsl` (Structurizr) files; `c4x` and `plantuml` fences in Markdown; and the
 * expanded snippets in snippets/c4x.json.
 */
export function discoverCorpus(root: string): CorpusItem[] {
    const items: CorpusItem[] = [];
    const files: string[] = [];
    for (const r of C4X_FILE_ROOTS) { walk(root, r, p => path.extname(p) in DIAGRAM_EXTENSIONS, files); }
    for (const rel of files) {
        const kind = rel.startsWith('samples/') ? 'sample'
            : (rel.startsWith('src/__tests__/') || rel.startsWith('test/')) ? 'fixture' : 'file';
        items.push({ id: `file:${rel}`, kind, format: DIAGRAM_EXTENSIONS[path.extname(rel)], path: rel, source: fs.readFileSync(path.join(root, rel), 'utf8') });
    }
    const mdFiles: string[] = [];
    for (const r of MARKDOWN_ROOTS) { walk(root, r, p => p.endsWith('.md'), mdFiles); }
    for (const rel of mdFiles) {
        const counts: Record<string, number> = {};
        const kind = rel === 'README.md' ? 'readme-fence' : rel.startsWith('samples/') ? 'sample' : 'doc-fence';
        for (const fence of extractRenderedFences(fs.readFileSync(path.join(root, rel), 'utf8'), root)) {
            const index = counts[fence.lang] = (counts[fence.lang] ?? -1) + 1;
            items.push({ id: `md:${rel}#${fence.lang}:${index}`, kind, format: fence.lang, path: rel, fence: index, source: fence.source });
        }
    }
    const snippetPath = path.join(root, SNIPPET_FILE);
    if (fs.existsSync(snippetPath)) {
        const snippets = JSON.parse(fs.readFileSync(snippetPath, 'utf8')) as Record<string, { body: string | string[] }>;
        for (const name of Object.keys(snippets)) {
            items.push({ id: `snippet:${name}`, kind: 'snippet', format: 'c4x', path: SNIPPET_FILE, source: expandSnippet(snippets[name].body) });
        }
    }
    items.sort((a: CorpusItem, b: CorpusItem) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return items;
}

const GEOMETRY_ATTRIBUTES = 'x|y|x1|x2|y1|y2|cx|cy|r|rx|ry|dx|dy|width|height|d|points|transform|viewBox|offset|stroke-width|stroke-dasharray|font-size';

/**
 * Normalise an SVG for comparison. Floating-point noise is removed (extra decimals past the
 * second are dropped) ONLY inside geometry attributes and path data. Text content, colours and
 * every other attribute compare exactly, so `v1.234` and `v1.239` stay different.
 */
export function normalizeSvg(svg: string): string {
    const geometry = new RegExp(`(\\s(?:${GEOMETRY_ATTRIBUTES})=")([^"]*)(")`, 'g');
    return svg
        .replace(geometry, (_m, open: string, value: string, close: string) =>
            open + value.replace(/(\d+\.\d{2})\d+/g, '$1') + close)
        .replace(/[ \t]+$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Load the parse/model/layout/render pipeline from the source tree at `root`. The caller
 * must already have a TypeScript require hook registered (ts-node or the unit-test hook).
 */
export function loadPipeline(root: string): Pipeline {
    const mock = path.join(root, 'src', '__tests__', '__mocks__', 'vscode');
    const original = Module._resolveFilename;
    Module._resolveFilename = function (this: unknown, request: string, ...rest: unknown[]) {
        if (request === 'vscode') { return require.resolve(mock); }
        return original.call(this, request, ...rest);
    };
    const load = (rel: string): any => require(path.join(root, 'src', rel));
    const auto = load('themes/AutoTheme');
    const themes: Record<string, unknown> = {
        classic: load('themes/ClassicTheme').ClassicTheme,
        modern: load('themes/ModernTheme').ModernTheme,
        muted: load('themes/MutedTheme').MutedTheme,
        'high-contrast': load('themes/HighContrastTheme').HighContrastTheme,
        'c4-standard': load('themes/C4StandardTheme').C4StandardTheme,
        'auto-light': auto.LightTheme,
        'auto-dark': auto.DarkTheme,
    };
    return {
        parser: new (load('parser/C4XParser').C4XParser)(),
        builder: new (load('model/C4ModelBuilder').C4ModelBuilder)(),
        layout: new (load('layout/DagreLayoutEngine').DagreLayoutEngine)(),
        svg: new (load('render/SvgBuilder').SvgBuilder)(),
        themes,
        plantuml: load('parser/plantuml').parsePlantUMLtoC4Model,
        structurizr: load('parser/structurizr').parseStructurizrDSL,
    };
}

function elementSummary(el: any): string {
    const kids = el.children && el.children.length ? `{${el.children.map(elementSummary).join(',')}}` : '';
    return `${el.id}:${el.type}${kids}`;
}

function viewSummary(view: any): string {
    const boundaries = (view.boundaries || []).map((b: any) => `${b.id}[${(b.elements || []).join(',')}]`);
    return [
        `t=${view.type}`,
        `d=${view.direction || '-'}`,
        `e=${view.elements.map(elementSummary).join(',')}`,
        `r=${view.relationships.length}`,
        `b=${boundaries.join(',')}`,
    ].join(' ');
}

function errorText(error: any): string {
    return String(error && error.message ? error.message : error).split('\n')[0].slice(0, 200);
}

/**
 * Reduce one source text to its comparable record:
 * `{ parse: 'ok'|'error: ...', views: [{ summary, svg: { classic, 'c4-standard' } }] }`.
 * A failure in any stage is recorded in `parse`, not thrown.
 */
export function analyse(pipeline: Pipeline, source: string, format: CorpusFormat = 'c4x'): AnalysisRecord {
    let model: any;
    try {
        model = format === 'plantuml' ? pipeline.plantuml(source)
            : format === 'structurizr' ? pipeline.structurizr(source)
            : pipeline.builder.build(pipeline.parser.parse(source), 'compat-corpus');
    } catch (error) {
        return { parse: `error: ${errorText(error)}`, views: [] };
    }
    const views = model.views.map((view: any) => {
        const record: ViewRecord = { summary: viewSummary(view), svg: {} };
        for (const key of THEME_KEYS) {
            let layout: unknown;
            try {
                // Laid out per theme, as the preview does: since #340 the theme's font decides
                // where element text wraps and so box heights. Older releases ignore `{ theme }`.
                layout = pipeline.layout.layoutSync(view, { theme: pipeline.themes[key] });
            } catch (error) {
                record.svg[key] = `error: ${errorText(error)}`;
                continue;
            }
            try {
                // `view` carries elementStyle rules in newer releases and is ignored by older ones.
                record.svg[key] = sha(normalizeSvg(pipeline.svg.build(layout, { theme: pipeline.themes[key], view })), 16);
            } catch (error) {
                record.svg[key] = `error: ${errorText(error)}`;
            }
        }
        return record;
    });
    return { parse: 'ok', views };
}

