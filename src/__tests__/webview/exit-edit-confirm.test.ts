import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
    PREVIEW_CLIENT_SCRIPT,
    shouldConfirmExitEdit,
    shouldEscapeTriggerExitConfirm,
} from '../../webview/previewClientScript';

/**
 * Unit coverage for the exit-edit-mode confirmation when dirty (#96).
 * The decision logic is pure; the banner markup is verified with grep-style
 * assertions against PreviewPanel (same approach as theme-sweep.test.ts).
 * No jsdom, no VS Code host.
 */

function readSrc(relativePath: string): string {
    return fs.readFileSync(path.resolve(__dirname, '../../..', relativePath), 'utf8');
}

describe('shouldConfirmExitEdit', () => {
    it('requires confirmation when the draft is dirty', () => {
        assert.strictEqual(shouldConfirmExitEdit(true), true);
    });

    it('exits silently when there are no staged edits', () => {
        assert.strictEqual(shouldConfirmExitEdit(false), false);
    });
});

describe('shouldEscapeTriggerExitConfirm', () => {
    it('triggers in edit mode, dirty, with nothing selected', () => {
        assert.strictEqual(shouldEscapeTriggerExitConfirm(true, true, 0), true);
    });

    it('does not trigger outside edit mode', () => {
        assert.strictEqual(shouldEscapeTriggerExitConfirm(false, true, 0), false);
    });

    it('does not trigger when the draft is clean', () => {
        assert.strictEqual(shouldEscapeTriggerExitConfirm(true, false, 0), false);
    });

    it('does not trigger while a selection is live (Escape clears it first)', () => {
        assert.strictEqual(shouldEscapeTriggerExitConfirm(true, true, 1), false);
        assert.strictEqual(shouldEscapeTriggerExitConfirm(true, true, 3), false);
    });
});

describe('exit-edit confirmation banner markup (PreviewPanel)', () => {
    const html = readSrc('src/webview/PreviewPanel.ts');

    it('is present with the conflict-banner a11y pattern', () => {
        assert.ok(html.includes('id="exit-edit-banner"'), 'banner element must exist');
        assert.ok(
            /id="exit-edit-banner"[\s\S]{0,200}role="alert"/.test(html),
            'banner must have role=alert',
        );
        assert.ok(
            /id="exit-edit-banner"[\s\S]{0,200}aria-live="assertive"/.test(html),
            'banner must have aria-live=assertive',
        );
        assert.ok(
            /id="exit-edit-banner"[\s\S]{0,200}aria-atomic="true"/.test(html),
            'banner must have aria-atomic=true',
        );
    });

    it('starts hidden via data-active="false" (conflict-banner pattern)', () => {
        assert.ok(
            /id="exit-edit-banner"[\s\S]{0,250}data-active="false"/.test(html),
            'banner must start with data-active=false',
        );
        assert.ok(html.includes('#exit-edit-banner[data-active="true"]'), 'CSS must key off data-active');
    });

    it('is programmatically focusable so focus can move to it on show', () => {
        assert.ok(
            /id="exit-edit-banner"[\s\S]{0,250}tabindex="-1"/.test(html),
            'banner must carry tabindex=-1 for programmatic focus',
        );
    });

    it('asks "You have unsaved changes. Discard and exit edit mode?" with Discard and Cancel actions', () => {
        assert.ok(
            html.includes('You have unsaved changes. Discard and exit edit mode?'),
            'banner must state the confirmation message',
        );
        assert.ok(html.includes('id="exit-edit-discard"'), 'banner must have a Discard button');
        assert.ok(html.includes('id="exit-edit-cancel"'), 'banner must have a Cancel button');
    });

    it('has :focus-visible rules for its interactive controls', () => {
        assert.ok(
            html.includes('.exit-edit-actions button:focus-visible'),
            'banner buttons must have :focus-visible rule',
        );
    });
});

describe('exit-edit announcement strings (static pins)', () => {
    it('pins the "Unsaved changes discarded" assertive announcement', () => {
        assert.ok(
            PREVIEW_CLIENT_SCRIPT.includes('Unsaved changes discarded'),
            'PREVIEW_CLIENT_SCRIPT must contain the exact string "Unsaved changes discarded"',
        );
    });

    it('pins the banner dismissal on re-render and error paths (review fix)', () => {
        // showSvg and showError must both hide the exit-edit banner so it
        // cannot linger over a reset draft.
        const showSvgMatch = /function showSvg\([\s\S]{0,600}?hideExitEditConfirm\(\)/.test(PREVIEW_CLIENT_SCRIPT);
        const showErrorMatch = /function showError\([\s\S]{0,600}?hideExitEditConfirm\(\)/.test(PREVIEW_CLIENT_SCRIPT);
        assert.ok(showSvgMatch, 'showSvg must call hideExitEditConfirm()');
        assert.ok(showErrorMatch, 'showError must call hideExitEditConfirm()');
    });
});
