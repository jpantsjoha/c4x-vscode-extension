/**
 * An open preview re-renders when the `c4x.theme` setting changes (#390).
 * A render clears the webview's staged edits, so it does not keep a draft:
 * the listener goes through the gate that defers the render while staged
 * edits are unsaved and applies it after Save or Discard (#408).
 * theme-rerender-dirty-gate.test.ts proves that behaviour.
 * Structural: PreviewPanel needs a full VS Code host to construct.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

describe('PreviewPanel theme-setting re-render (#390)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'webview', 'PreviewPanel.ts'), 'utf-8');

    it('re-renders through the dirty-state gate when c4x.theme changes', () => {
        const m = /onDidChangeConfiguration\(\(event\)\s*=>\s*\{\s*if \(event\.affectsConfiguration\('c4x\.theme'\)\)\s*\{([^}]*)\}/.exec(src);
        assert.ok(m, 'listener registered for c4x.theme');
        assert.ok(m![1].includes('this.requestNonSourceRender()'), 'defers the render while staged edits are unsaved');
    });

    it('registers the subscription for disposal', () => {
        const start = src.indexOf('private registerEventListeners');
        const end = src.indexOf("affectsConfiguration('c4x.theme')");
        assert.ok(start >= 0 && end > start && src.slice(start, end).includes('this.disposables.push('));
    });
});
