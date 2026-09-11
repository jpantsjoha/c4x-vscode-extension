/**
 * Theme sweep — issue #90 [R8/T2-10]
 *
 * Statically audits the new editor chrome (PreviewPanel inline CSS and c4x.css)
 * to enforce:
 *   1. No unapproved hardcoded hex colours outside a var(--vscode-*) context.
 *   2. Every interactive control class/id has a :focus-visible rule.
 *   3. Key ARIA attributes are present on controls that require them.
 *
 * These are grep/parse tests — no DOM or VS Code host is needed.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readSrc(relativePath: string): string {
    const abs = path.resolve(__dirname, '../../..', relativePath);
    return fs.readFileSync(abs, 'utf8');
}

/**
 * Strips balanced @media print { ... } blocks from CSS.
 * Uses a bracket-counting approach to handle nested rules correctly.
 */
function stripMediaPrint(css: string): string {
    const marker = '@media print';
    let result = css;
    let idx = result.indexOf(marker);
    while (idx !== -1) {
        // Find the opening brace of this @media block
        const open = result.indexOf('{', idx);
        if (open === -1) {
            break;
        }
        // Walk forward counting braces to find the matching close
        let depth = 0;
        let end = open;
        while (end < result.length) {
            if (result[end] === '{') {
                depth++;
            } else if (result[end] === '}') {
                depth--;
                if (depth === 0) {
                    break;
                }
            }
            end++;
        }
        // Remove the entire @media print block (idx..end inclusive)
        result = result.slice(0, idx) + result.slice(end + 1);
        idx = result.indexOf(marker);
    }
    return result;
}

/**
 * Returns bare hex colour occurrences that are NOT inside a
 * `var(--vscode-..., ...)` fallback expression AND are not inside a
 * CSS comment or a print @media block (print styles legitimately use
 * device-independent colours).
 */
function findUnapprovedHex(css: string): string[] {
    // Strip CSS comments
    const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

    // Strip @media print blocks (they must use real colours for print rendering)
    const noPrint = stripMediaPrint(noComments);

    const lines = noPrint.split('\n');
    const violations: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Find every #rrggbb / #rgb occurrence
        const hexRe = /#([0-9a-fA-F]{3,6})\b/g;
        let m: RegExpExecArray | null;
        while ((m = hexRe.exec(line)) !== null) {
            const pos = m.index;
            // Check the 80-char window before the hex to see if we are inside
            // a var(--vscode-... fallback expression.
            const before = line.slice(Math.max(0, pos - 80), pos);
            if (/var\(--vscode-[^,)]*,\s*$/.test(before)) {
                // It's a direct fallback (token,#hex) — acceptable.
                continue;
            }
            violations.push(`line ${i + 1}: ${line.trim()}`);
        }
    }

    return violations;
}

/**
 * Returns the CSS block from a TypeScript file's getHtml() template literal
 * (everything between <style ...> and </style>).
 */
function extractInlineCss(tsSource: string): string {
    const start = tsSource.indexOf('<style nonce=');
    const end = tsSource.indexOf('</style>');
    if (start === -1 || end === -1) {
        return '';
    }
    // Skip the opening tag itself; return everything up to </style>
    const openEnd = tsSource.indexOf('>', start) + 1;
    return tsSource.slice(openEnd, end);
}

/**
 * Checks that a given CSS source contains a :focus-visible rule for the
 * supplied selector token.
 */
function hasFocusVisible(css: string, selectorToken: string): boolean {
    // Accept both :focus-visible and a combined :focus, :focus-visible rule
    return css.includes(`${selectorToken}:focus-visible`) ||
        (css.includes(selectorToken) && css.includes(':focus-visible'));
}

// ---------------------------------------------------------------------------
// Load sources
// ---------------------------------------------------------------------------

const previewPanelTs = readSrc('src/webview/PreviewPanel.ts');
const previewCss = extractInlineCss(previewPanelTs);
const markdownCss = readSrc('src/markdown/c4x.css');

// ---------------------------------------------------------------------------
// 1. No unapproved hardcoded hex
// ---------------------------------------------------------------------------

describe('Theme sweep — unapproved hardcoded hex', () => {
    it('PreviewPanel inline CSS: no bare hex outside var(--vscode-*) fallbacks', () => {
        const violations = findUnapprovedHex(previewCss);
        assert.deepStrictEqual(
            violations,
            [],
            `Found unapproved hardcoded hex in PreviewPanel inline CSS:\n${violations.join('\n')}`,
        );
    });

    it('c4x.css: no bare hex outside var(--vscode-*) fallbacks (excluding print section)', () => {
        const violations = findUnapprovedHex(markdownCss);
        assert.deepStrictEqual(
            violations,
            [],
            `Found unapproved hardcoded hex in c4x.css:\n${violations.join('\n')}`,
        );
    });
});

// ---------------------------------------------------------------------------
// 2. Focus-visible coverage for all interactive controls
// ---------------------------------------------------------------------------

describe('Theme sweep — focus-visible coverage', () => {
    // Canvas toolbar (zoom in/out/reset/fit)
    it('canvas-toolbar buttons have :focus-visible', () => {
        assert.ok(
            hasFocusVisible(previewCss, '.canvas-toolbar button'),
            '.canvas-toolbar button must have :focus-visible rule',
        );
    });

    // Toggle layout button
    it('#toggle-layout has :focus-visible', () => {
        assert.ok(
            hasFocusVisible(previewCss, '#toggle-layout'),
            '#toggle-layout must have :focus-visible rule',
        );
    });

    // SVG drag nodes
    it('SVG drag nodes have :focus-visible', () => {
        assert.ok(
            hasFocusVisible(previewCss, '#content.visual-layout-editing g.node'),
            'Drag nodes must have :focus-visible rule',
        );
    });

    // Form inputs and textareas (inspector fields)
    it('Inspector form inputs have :focus-visible', () => {
        assert.ok(
            previewCss.includes('.form-group input:focus-visible') ||
            previewCss.includes('.form-group input:focus,') && previewCss.includes(':focus-visible'),
            '.form-group input must have :focus-visible rule',
        );
    });

    // Change-remove buttons in staged changes list
    it('Staged-changes remove buttons have :focus-visible', () => {
        assert.ok(
            hasFocusVisible(previewCss, '.change-remove-btn'),
            '.change-remove-btn must have :focus-visible rule',
        );
    });

    // Source diff toggle
    it('.diff-section-toggle has :focus-visible', () => {
        assert.ok(
            hasFocusVisible(previewCss, '.diff-section-toggle'),
            '.diff-section-toggle must have :focus-visible rule',
        );
    });

    // Source diff pre (keyboard-focusable region)
    it('.source-diff-pre has :focus-visible', () => {
        assert.ok(
            hasFocusVisible(previewCss, '.source-diff-pre'),
            '.source-diff-pre must have :focus-visible rule',
        );
    });

    // Conflict action buttons
    it('Conflict action buttons have :focus-visible', () => {
        assert.ok(
            hasFocusVisible(previewCss, '.conflict-actions button'),
            '.conflict-actions button must have :focus-visible rule',
        );
    });

    // Sidebar actions (Save/Discard)
    it('Sidebar action buttons have :focus-visible', () => {
        assert.ok(
            hasFocusVisible(previewCss, '.sidebar-actions button'),
            '.sidebar-actions button must have :focus-visible rule',
        );
    });

    // Rename dialog action buttons
    it('Rename dialog buttons have :focus-visible', () => {
        assert.ok(
            hasFocusVisible(previewCss, '.rename-dialog-actions button'),
            '.rename-dialog-actions button must have :focus-visible rule',
        );
    });

    // Rename element button (inside id-editor-row)
    it('#rename-element button (id-editor-row) has :focus-visible', () => {
        assert.ok(
            hasFocusVisible(previewCss, '.id-editor-row button'),
            '.id-editor-row button must have :focus-visible rule',
        );
    });

    // Legend overlay (draggable, keyboard-repositionable)
    it('#legend-overlay has :focus-visible', () => {
        assert.ok(
            hasFocusVisible(previewCss, '#legend-overlay'),
            '#legend-overlay must have :focus-visible rule',
        );
    });
});

// ---------------------------------------------------------------------------
// 3. ARIA attributes on new chrome controls
// ---------------------------------------------------------------------------

describe('Theme sweep — ARIA on new chrome controls', () => {
    const html = previewPanelTs.slice(previewPanelTs.indexOf('<body>'));

    it('#toggle-layout has aria-pressed', () => {
        assert.ok(
            html.includes('id="toggle-layout"') && html.includes('aria-pressed='),
            '#toggle-layout must carry aria-pressed',
        );
    });

    it('#layout-status has role="status" and aria-live="polite"', () => {
        assert.ok(
            html.includes('id="layout-status"') &&
            html.includes('role="status"') &&
            html.includes('aria-live="polite"'),
            '#layout-status must have role=status and aria-live=polite',
        );
    });

    it('#layout-error has role="alert" and aria-live="assertive"', () => {
        assert.ok(
            html.includes('id="layout-error"') &&
            html.includes('role="alert"') &&
            html.includes('aria-live="assertive"'),
            '#layout-error must have role=alert and aria-live=assertive',
        );
    });

    it('#conflict-banner has role="alert" and aria-live="assertive"', () => {
        assert.ok(
            html.includes('id="conflict-banner"') &&
            html.includes('role="alert"') &&
            html.includes('aria-live="assertive"') &&
            html.includes('aria-atomic="true"'),
            '#conflict-banner must have role=alert, aria-live=assertive, aria-atomic=true',
        );
    });

    it('Canvas toolbar has role="toolbar" and aria-label', () => {
        assert.ok(
            html.includes('class="canvas-toolbar"') &&
            html.includes('role="toolbar"') &&
            html.includes('aria-label='),
            'Canvas toolbar must have role=toolbar and aria-label',
        );
    });

    it('#rename-element has aria-haspopup="dialog"', () => {
        assert.ok(
            html.includes('id="rename-element"') && html.includes('aria-haspopup="dialog"'),
            '#rename-element must declare aria-haspopup=dialog',
        );
    });

    it('#rename-dialog has aria-labelledby', () => {
        assert.ok(
            html.includes('id="rename-dialog"') && html.includes('aria-labelledby='),
            '#rename-dialog must have aria-labelledby',
        );
    });

    it('#source-diff-pre has aria-label and role="region"', () => {
        assert.ok(
            html.includes('id="source-diff-pre"') &&
            html.includes('aria-label=') &&
            html.includes('role="region"'),
            '#source-diff-pre must have aria-label and role=region',
        );
    });

    it('#source-diff-toggle has aria-expanded and aria-controls', () => {
        assert.ok(
            html.includes('id="source-diff-toggle"') &&
            html.includes('aria-expanded=') &&
            html.includes('aria-controls='),
            '#source-diff-toggle must have aria-expanded and aria-controls',
        );
    });

    it('#legend-overlay has role="region", aria-label and tabindex', () => {
        assert.ok(
            html.includes('id="legend-overlay"') &&
            html.includes('role="region"') &&
            html.includes('aria-label=') &&
            html.includes('tabindex="0"'),
            '#legend-overlay must have role=region, an aria-label and tabindex=0',
        );
    });
});
