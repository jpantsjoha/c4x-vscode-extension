import * as assert from 'assert';
import {
    formatCanvasTextValue,
    formatCanvasUpdateAnnouncement,
    updateCanvasTextInNode,
    type CanvasTextNode,
} from '../../webview/previewClientScript';

/**
 * Unit coverage for the live canvas preview of staged text edits (#97).
 * The DOM is faked with plain objects — no jsdom — matching the established
 * webview test style.
 */

/** Fake `<text>` element — only textContent is exercised. */
class FakeTextElement {
    textContent = '';
}

/**
 * Fake `g.node` element: resolves `text[data-field="..."]` selectors to
 * registered fake targets, mirroring the markup ElementRenderer emits.
 */
class FakeNodeElement implements CanvasTextNode {
    readonly texts = new Map<string, FakeTextElement>();

    static withFields(fields: Record<string, string>): FakeNodeElement {
        const node = new FakeNodeElement();
        for (const [field, content] of Object.entries(fields)) {
            const text = new FakeTextElement();
            text.textContent = content;
            node.texts.set(field, text);
        }
        return node;
    }

    querySelector(selector: string): FakeTextElement | null {
        const match = /^text\[data-field="([^"]+)"\]$/.exec(selector);
        if (!match) {
            return null;
        }
        return this.texts.get(match[1]) ?? null;
    }
}

describe('formatCanvasTextValue', () => {
    it('returns the label value unchanged', () => {
        assert.strictEqual(formatCanvasTextValue('label', 'Payments'), 'Payments');
    });

    it('returns the description value unchanged', () => {
        assert.strictEqual(formatCanvasTextValue('description', 'Handles card payments'), 'Handles card payments');
    });

    it('wraps technology in brackets like ElementRenderer', () => {
        assert.strictEqual(formatCanvasTextValue('technology', 'Kubernetes'), '[Kubernetes]');
    });

    it('renders a cleared (null) value as empty text', () => {
        assert.strictEqual(formatCanvasTextValue('technology', null), '');
        assert.strictEqual(formatCanvasTextValue('description', null), '');
        assert.strictEqual(formatCanvasTextValue('label', null), '');
    });

    it('renders an empty value as empty text (no stray brackets)', () => {
        assert.strictEqual(formatCanvasTextValue('technology', ''), '');
    });
});

describe('formatCanvasUpdateAnnouncement', () => {
    it('capitalises the field name', () => {
        assert.strictEqual(formatCanvasUpdateAnnouncement('label'), 'Label updated on canvas');
        assert.strictEqual(formatCanvasUpdateAnnouncement('technology'), 'Technology updated on canvas');
        assert.strictEqual(formatCanvasUpdateAnnouncement('description'), 'Description updated on canvas');
    });
});

describe('updateCanvasTextInNode', () => {
    it('updates the label text of a faked node element', () => {
        const node = FakeNodeElement.withFields({ label: 'Old Label' });
        const updated = updateCanvasTextInNode(node, 'label', 'New Label');
        assert.strictEqual(updated, true);
        assert.strictEqual(node.texts.get('label')?.textContent, 'New Label');
    });

    it('wraps staged technology in brackets on the canvas', () => {
        const node = FakeNodeElement.withFields({ technology: '[Java]' });
        const updated = updateCanvasTextInNode(node, 'technology', 'Go');
        assert.strictEqual(updated, true);
        assert.strictEqual(node.texts.get('technology')?.textContent, '[Go]');
    });

    it('clears the text when the staged value is null (explicit clear)', () => {
        const node = FakeNodeElement.withFields({ technology: '[Java]' });
        const updated = updateCanvasTextInNode(node, 'technology', null);
        assert.strictEqual(updated, true);
        assert.strictEqual(node.texts.get('technology')?.textContent, '');
    });

    it('returns false and does not throw when the field has no rendered text element', () => {
        // ElementRenderer omits <text> for empty fields (e.g. no technology).
        const node = FakeNodeElement.withFields({ label: 'Only Label' });
        const updated = updateCanvasTextInNode(node, 'technology', 'Go');
        assert.strictEqual(updated, false);
    });

    it('returns false when the content is already up to date', () => {
        const node = FakeNodeElement.withFields({ label: 'Same' });
        const updated = updateCanvasTextInNode(node, 'label', 'Same');
        assert.strictEqual(updated, false);
    });

    it('reverts to the original value on un-stage', () => {
        const node = FakeNodeElement.withFields({ label: 'Original' });
        // Stage an edit — canvas shows the staged value.
        updateCanvasTextInNode(node, 'label', 'Staged');
        assert.strictEqual(node.texts.get('label')?.textContent, 'Staged');
        // Un-stage — canvas reverts to the snapshot (original) value.
        const reverted = updateCanvasTextInNode(node, 'label', 'Original');
        assert.strictEqual(reverted, true);
        assert.strictEqual(node.texts.get('label')?.textContent, 'Original');
    });

    it('reverts a staged clear back to the original bracketed technology', () => {
        const node = FakeNodeElement.withFields({ technology: '[Java]' });
        updateCanvasTextInNode(node, 'technology', null);
        assert.strictEqual(node.texts.get('technology')?.textContent, '');
        updateCanvasTextInNode(node, 'technology', 'Java');
        assert.strictEqual(node.texts.get('technology')?.textContent, '[Java]');
    });

    it('ignores unrelated selectors defensively', () => {
        const node = FakeNodeElement.withFields({ label: 'X' });
        assert.strictEqual(node.querySelector('path'), null);
    });
});
