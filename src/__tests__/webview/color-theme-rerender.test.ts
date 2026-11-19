/**
 * An open preview re-renders when the editor's colour theme changes (#329), so
 * a theme with a dark variant switches variant without reopening the panel.
 * The render goes through the gate that defers it while staged edits are
 * unsaved (#408): a render clears the webview's draft, so it does NOT keep
 * staged edits. theme-rerender-dirty-gate.test.ts proves that behaviour.
 * Structural: PreviewPanel needs a full VS Code host to construct.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

describe('PreviewPanel colour-theme re-render (#329)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'webview', 'PreviewPanel.ts'), 'utf-8');

    it('subscribes to onDidChangeActiveColorTheme and re-renders through the dirty-state gate', () => {
        const m = /onDidChangeActiveColorTheme\(\(\)\s*=>\s*\{([^}]*)\}\)/.exec(src);
        assert.ok(m, 'listener registered');
        assert.ok(m![1].includes('this.requestNonSourceRender()'), 'defers the render while staged edits are unsaved');
    });

    it('registers the subscription for disposal', () => {
        const start = src.indexOf('private registerEventListeners');
        const end = src.indexOf('onDidChangeActiveColorTheme');
        assert.ok(src.slice(start, end).includes('this.disposables.push('));
    });
});
