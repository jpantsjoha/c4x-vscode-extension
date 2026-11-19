import * as assert from 'assert';
import {
    elementTextSignature,
    formatCanvasUpdateAnnouncement,
    isGeometryEditAllowed,
    decideDraftRestore,
    isSameDiagram,
    pendingEditMatches,
    planRenderEditState,
    renderTransition,
    PREVIEW_CLIENT_SCRIPT,
    replaceCanvasText,
    type CanvasTextElement,
    type CanvasTextNode,
} from '../../webview/previewClientScript';
import { elementTextMarkup, layoutElementText, TEXT_METRICS, type ElementTextInput } from '../../render/textLayout';

/**
 * Unit coverage for the live canvas preview of staged text edits (#97), which
 * since #340 redraws the node's text with the host's own wrapping and markup.
 * The DOM is faked with plain objects — no jsdom — matching the established
 * webview test style.
 */

/** Fake `<text data-field>`: attributes, and the text of each `<tspan>` (or none). */
class FakeText implements CanvasTextElement {
    removed = false;
    constructor(private readonly attrs: Map<string, string>, readonly spans: string[], readonly content: string, private readonly owner: FakeNode, readonly title?: string) {}
    getAttribute(name: string): string | null { return this.attrs.get(name) ?? null; }
    get textContent(): string { return this.content; }
    querySelectorAll(selector: string): Array<{ textContent: string }> {
        if (selector === 'title') {
            return this.title === undefined ? [] : [{ textContent: this.title }];
        }
        assert.strictEqual(selector, 'tspan');
        return this.spans.map(textContent => ({ textContent }));
    }
    remove(): void {
        this.removed = true;
        this.owner.texts = this.owner.texts.filter(t => t !== this);
    }
}

const unescape = (s: string): string => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Fake `g.node`: holds its drawn text elements; parses inserted markup like a browser would. */
class FakeNode implements CanvasTextNode {
    texts: FakeText[] = [];
    inserted: string[] = [];
    querySelectorAll(selector: string): FakeText[] {
        assert.strictEqual(selector, ':scope > text[data-field]');
        return [...this.texts];
    }
    insertAdjacentHTML(position: 'beforeend', markup: string): void {
        assert.strictEqual(position, 'beforeend');
        this.inserted.push(markup);
        for (const match of markup.matchAll(/<text ([^>]*)>([\s\S]*?)<\/text>/g)) {
            const attrs = new Map<string, string>();
            for (const a of match[1].matchAll(/([\w-]+)="([^"]*)"/g)) { attrs.set(a[1], a[2]); }
            const title = /<title>([\s\S]*?)<\/title>/.exec(match[2]);
            const body = match[2].replace(/<title>[\s\S]*?<\/title>/, '');
            const spans = [...body.matchAll(/<tspan [^>]*>([\s\S]*?)<\/tspan>/g)].map(m => unescape(m[1]));
            this.texts.push(new FakeText(attrs, spans, unescape(match[2].replace(/<[^>]+>/g, '')), this, title ? unescape(title[1]) : undefined));
        }
    }
}

const BOX: ElementTextInput = { x: 100, y: 50, width: 240, height: 130, iconLayout: false, cylinder: false, fontFamily: 'Arial, sans-serif' };

function drawn(input: ElementTextInput): FakeNode {
    const node = new FakeNode();
    node.insertAdjacentHTML('beforeend', elementTextMarkup(layoutElementText(input, TEXT_METRICS), '#000', input.fontFamily));
    node.inserted = [];
    return node;
}

function update(node: FakeNode, input: ElementTextInput): boolean {
    const layout = layoutElementText(input, TEXT_METRICS);
    return replaceCanvasText(node, elementTextMarkup(layout, '#000', input.fontFamily), elementTextSignature(layout));
}

describe('formatCanvasUpdateAnnouncement', () => {
    it('capitalises the field name', () => {
        assert.strictEqual(formatCanvasUpdateAnnouncement('label'), 'Label updated on canvas');
        assert.strictEqual(formatCanvasUpdateAnnouncement('technology'), 'Technology updated on canvas');
        assert.strictEqual(formatCanvasUpdateAnnouncement('description'), 'Description updated on canvas');
    });
});

describe('replaceCanvasText (#97, #340)', () => {
    it('updates the label and keeps the other fields', () => {
        const node = drawn({ ...BOX, label: 'Old Label', technology: 'Java' });
        assert.strictEqual(update(node, { ...BOX, label: 'New Label', technology: 'Java' }), true);
        assert.deepStrictEqual(node.texts.map(t => [t.getAttribute('data-field'), t.textContent]), [['label', 'New Label'], ['technology', '[Java]']]);
    });

    it('brackets a staged technology and draws it even when the field had no text before', () => {
        const node = drawn({ ...BOX, label: 'API' });
        assert.strictEqual(update(node, { ...BOX, label: 'API', technology: 'Go' }), true);
        assert.deepStrictEqual(node.texts.map(t => t.textContent), ['API', '[Go]']);
    });

    it('removes the text of a cleared field and re-centres the rest', () => {
        const node = drawn({ ...BOX, label: 'API', technology: 'Java' });
        const labelY = node.texts[0].getAttribute('y');
        assert.strictEqual(update(node, { ...BOX, label: 'API' }), true);
        assert.deepStrictEqual(node.texts.map(t => t.textContent), ['API']);
        assert.notStrictEqual(node.texts[0].getAttribute('y'), labelY);
    });

    it('returns false and leaves the DOM alone when the canvas already shows the layout', () => {
        const node = drawn({ ...BOX, label: 'Same', description: 'A description long enough to wrap onto more than one line in this box' });
        assert.strictEqual(update(node, { ...BOX, label: 'Same', description: 'A description long enough to wrap onto more than one line in this box' }), false);
        assert.deepStrictEqual(node.inserted, []);
    });

    it('re-wraps a description edited to a long value into tspan lines', () => {
        const node = drawn({ ...BOX, label: 'API', description: 'Short' });
        const long = 'Provides Internet banking functionality to customers via a JSON/HTTPS API and the mobile app';
        assert.strictEqual(update(node, { ...BOX, label: 'API', description: long }), true);
        const description = node.texts.find(t => t.getAttribute('data-field') === 'description')!;
        assert.ok(description.spans.length >= 2, 'wrapped into lines');
        assert.strictEqual(description.spans.join(' '), long);
    });

    it('updates the tooltip when an edit past the cut leaves the visible lines unchanged', () => {
        const small: ElementTextInput = { ...BOX, height: 80 };
        const long = 'word '.repeat(80).trim();
        const node = drawn({ ...small, label: 'API', description: long });
        const before = node.texts.find(t => t.getAttribute('data-field') === 'description')!;
        assert.ok(before.title, 'truncated text carries a tooltip');
        const edited = long + ' ending';
        assert.strictEqual(update(node, { ...small, label: 'API', description: edited }), true);
        const after = node.texts.find(t => t.getAttribute('data-field') === 'description')!;
        assert.deepStrictEqual(after.spans, before.spans, 'visible lines unchanged');
        assert.strictEqual(after.title, edited);
        assert.strictEqual(update(node, { ...small, label: 'API', description: edited }), false);
    });

    it('reverts to the original value on un-stage', () => {
        const node = drawn({ ...BOX, label: 'Original' });
        update(node, { ...BOX, label: 'Staged' });
        assert.strictEqual(node.texts[0].textContent, 'Staged');
        assert.strictEqual(update(node, { ...BOX, label: 'Original' }), true);
        assert.strictEqual(node.texts[0].textContent, 'Original');
    });
});

describe('elementTextSignature', () => {
    it('names each field, its first baseline and its lines', () => {
        const layout = layoutElementText({ ...BOX, label: 'API', technology: 'Go' }, TEXT_METRICS);
        assert.strictEqual(elementTextSignature(layout), `label@${layout.blocks[0].ys[0].toFixed(2)}:API|technology@${layout.blocks[1].ys[0].toFixed(2)}:[Go]`);
    });
});

describe('isGeometryEditAllowed: the one gate for staging geometry (#340 review round 4)', () => {
    // Edit mode on/off x the canvas shows the edit layout or not (view layout of a diagram whose boxes grew).
    const cases: Array<[boolean, string, boolean, boolean, string]> = [
        [true, 'edit', true, true, 'edit mode, edit layout'],
        [true, 'view', true, false, 'edit mode, view layout with grown boxes'],
        [false, 'edit', true, false, 'not in edit mode, edit layout'],
        [false, 'view', true, false, 'not in edit mode, view layout'],
        // A diagram whose boxes did not grow: its view layout is the edit layout.
        [true, 'view', false, true, 'edit mode, view layout that grew nothing'],
        [false, 'view', false, false, 'not in edit mode, view layout that grew nothing'],
    ];
    for (const [editMode, layoutMode, textGrown, expected, name] of cases) {
        it(`${name}: ${expected ? 'allowed' : 'refused'}`, () => {
            assert.strictEqual(isGeometryEditAllowed(editMode, layoutMode, textGrown), expected);
        });
    }

    it('every geometry entry point and staging function in the client goes through the gate', () => {
        const script = PREVIEW_CLIENT_SCRIPT;
        for (const fn of ['onBoundaryPointerDown(event)', 'onBoundaryKeyDown(event)', 'onPointerDown(event)', 'onNodeKeyDown(event)']) {
            const at = script.indexOf(`function ${fn} {`);
            assert.ok(at >= 0, fn);
            assert.ok(script.slice(at, at + 160).includes('if (!geometryEditAllowed()'), `${fn} is gated`);
        }
        for (const fn of ['postMove(nodeEl, input)', 'postBoundaryMove(boundaryId, x, y, input)', 'postBoundaryResize(boundaryId, width, height)']) {
            const at = script.indexOf(`function ${fn} {`);
            assert.ok(at >= 0, fn);
            assert.ok(script.slice(at, at + 120).includes('if (!geometryEditAllowed()) return;'), `${fn} is gated`);
        }
        assert.ok(!/setTimeout\(function\(\) \{[^}]*setEditMode\(true/.test(script), 'no timeout turns edit mode on');
    });
});

describe('decideDraftRestore: a held draft is never applied to other source text (#340 review 7)', () => {
    const draft = (scope: string | undefined, edits = 1) => ({ schemaVersion: 2, scope, stagedEdits: Array.from({ length: edits }, (_, i) => ({ id: `e${i}`, x: 1, y: 2 })) });
    it('nothing to do without a draft that carries staged edits', () => {
        assert.strictEqual(decideDraftRestore(null, 's', true), 'none');
        assert.strictEqual(decideDraftRestore(draft('s', 0), 's', true), 'none');
        assert.strictEqual(decideDraftRestore('garbage', 's', false), 'none');
    });
    for (const editLayoutShown of [true, false]) {
        it(`holds a draft made on other source text, ${editLayoutShown ? 'on the edit layout too' : 'on the view layout'}`, () => {
            assert.strictEqual(decideDraftRestore(draft('file:///a.c4x#c4x-native:m:OLD'), 'file:///a.c4x#c4x-native:m:NEW', editLayoutShown), 'hold-other-source');
        });
    }
    it('defers a draft for this source until the edit layout is shown, then restores it', () => {
        assert.strictEqual(decideDraftRestore(draft('s'), 's', false), 'defer-edit-layout');
        assert.strictEqual(decideDraftRestore(draft('s'), 's', true), 'restore');
    });
    it('leaves an unscoped (legacy) draft to the legacy restore path', () => {
        assert.strictEqual(decideDraftRestore(draft(undefined), 's', true), 'restore');
    });
    it('the client decides with this function, embedded verbatim', () => {
        assert.ok(PREVIEW_CLIENT_SCRIPT.includes('restoreDecision: decideDraftRestore(input.pendingRestoreState, input.currentScope, input.editLayoutShown),'));
        assert.ok(PREVIEW_CLIENT_SCRIPT.includes(decideDraftRestore.toString().replace(/\bexports\./g, '')));
    });
});

describe('isSameDiagram: only the host\'s same-diagram-edit flag for that render keeps edit mode (#340 review 9)', () => {
    const shown = { identity: 'file:///a.md#c4x-block:0', scope: 'A1', viewType: 'container', token: 7, sameDiagramEdit: null };
    const next = (flag: { since: number | null; value: boolean } | null, over: Partial<typeof shown> = {}) =>
        ({ ...shown, scope: 'A2', token: 8, sameDiagramEdit: flag, ...over });
    it('the first render counts as the same diagram', () => {
        assert.strictEqual(isSameDiagram(null, next(null)), true);
    });
    it('an edit inside the diagram (host flag true, since the render on screen) keeps it', () => {
        assert.strictEqual(isSameDiagram(shown, next({ since: 7, value: true })), true);
    });
    it('any change the host could not prove stayed inside ends it, even when element ids overlap', () => {
        assert.strictEqual(isSameDiagram(shown, next({ since: 7, value: false })), false);
    });
    it('without the flag (an older host) it ends', () => {
        assert.strictEqual(isSameDiagram(shown, next(null)), false);
    });
    it('a flag for another render than the one on screen ends it', () => {
        assert.strictEqual(isSameDiagram(shown, next({ since: 6, value: true })), false);
    });
    it('another document identity or view type ends it, even with the flag', () => {
        assert.strictEqual(isSameDiagram(shown, next({ since: 7, value: true }, { identity: 'file:///b.md#c4x-block:0' })), false);
        assert.strictEqual(isSameDiagram(shown, next({ since: 7, value: true }, { viewType: 'component' })), false);
    });
});

describe('pendingEditMatches: an edit request belongs to the diagram it was made on (#340 review 8)', () => {
    it('matches only the same diagram and a later render', () => {
        assert.strictEqual(pendingEditMatches({ afterToken: 3 }, true, 4), true);
        assert.strictEqual(pendingEditMatches({ afterToken: 3 }, false, 4), false, 'another diagram');
        assert.strictEqual(pendingEditMatches({ afterToken: 3 }, true, 3), false, 'not a later render');
        assert.strictEqual(pendingEditMatches(null, true, 4), false, 'no request');
        assert.strictEqual(pendingEditMatches({ afterToken: null }, true, null), true, 'no tokens (older host)');
    });
});

describe('renderTransition: the whole render-time step, behaviourally (#340 review 9)', () => {
    const editRender = (token: number, flag: { since: number | null; value: boolean } | null, scope = 's') =>
        ({ identity: 'file:///a.c4x', scope, viewType: 'container', token, sameDiagramEdit: flag });
    const draft = (scope: string) => ({ schemaVersion: 2, scope, stagedEdits: [{ id: 'a', x: 1, y: 2 }] });
    const idle = { awaiting: false, pendingEditFor: null, editLayoutAbandoned: false, lastRenderDiagram: editRender(1, null) };
    const step = (over: Record<string, unknown>) => renderTransition({
        state: idle, diagram: editRender(2, { since: 1, value: true }), layoutMode: 'view', editLayoutShown: false,
        reportedLayoutMode: 'view', pendingRestoreState: null, currentScope: 's', ...over,
    } as Parameters<typeof renderTransition>[0]);

    it('holds a draft made on other source text: held flag set, restore deferred, nothing requested, in both layouts', () => {
        for (const [layoutMode, editLayoutShown, reported] of [['view', false, 'view'], ['edit', true, 'edit']] as const) {
            const out = step({ layoutMode, editLayoutShown, reportedLayoutMode: reported, pendingRestoreState: draft('old'), currentScope: 'new' });
            assert.strictEqual(out.state.heldDraftForOtherSource, true, layoutMode);
            assert.strictEqual(out.state.restoreDeferred, true, layoutMode);
        }
    });
    it('requests the edit layout for a draft of this source and binds the request to this render', () => {
        const out = step({ pendingRestoreState: draft('s') });
        assert.strictEqual(out.action, 'request-edit-for-restore');
        assert.deepStrictEqual([out.state.awaiting, out.state.pendingEditFor, out.state.heldDraftForOtherSource], [true, { afterToken: 2 }, false]);
    });
    it('restores a draft of this source on the edit layout (no hold, no deferral)', () => {
        const out = step({ layoutMode: 'edit', editLayoutShown: true, reportedLayoutMode: 'edit', pendingRestoreState: draft('s'),
            state: { ...idle, awaiting: true, pendingEditFor: { afterToken: 1 } } });
        assert.strictEqual(out.action, 'enter');
        assert.deepStrictEqual([out.state.heldDraftForOtherSource, out.state.restoreDeferred, out.state.awaiting], [false, false, false]);
    });
    it('a pending request answered by an edit layout after a change outside the diagram leaves instead of entering', () => {
        const out = step({ layoutMode: 'edit', editLayoutShown: true, reportedLayoutMode: 'edit', diagram: editRender(2, { since: 1, value: false }),
            state: { ...idle, awaiting: true, pendingEditFor: { afterToken: 1 } } });
        assert.strictEqual(out.action, 'leave');
        assert.deepStrictEqual([out.state.awaiting, out.state.pendingEditFor], [false, null]);
    });
    it('a re-render after a swap of two fences sharing element ids (no host flag) leaves edit mode', () => {
        const out = step({ layoutMode: 'edit', editLayoutShown: true, reportedLayoutMode: 'edit', diagram: editRender(2, { since: 1, value: false }, 'other') });
        assert.strictEqual(out.action, 'leave');
    });
    it('an edit inside the diagram keeps edit mode on', () => {
        const out = step({ layoutMode: 'edit', editLayoutShown: true, reportedLayoutMode: 'edit', diagram: editRender(2, { since: 1, value: true }, 'edited') });
        assert.strictEqual(out.action, 'enter');
    });
    it('the webview assigns every state field from the step and decides nothing itself', () => {
        const script = PREVIEW_CLIENT_SCRIPT;
        for (const line of ['awaitingEditLayout = editPlan.state.awaiting;', 'pendingEditFor = editPlan.state.pendingEditFor;',
            'heldDraftForOtherSource = editPlan.state.heldDraftForOtherSource;', 'const deferRestore = editPlan.state.restoreDeferred;']) {
            assert.ok(script.includes(line), line);
        }
        assert.ok(script.includes(renderTransition.toString().replace(/\bexports\./g, '')));
    });
});

describe('planRenderEditState: what a render does to edit mode and to a held draft (#340 reviews 4-8)', () => {
    const base = { layoutMode: 'view', reportedLayoutMode: 'view', sameDiagram: true, awaiting: false, pendingMatches: false, restoreDecision: 'none', editLayoutAbandoned: false };
    const act = (over: Partial<typeof base>) => planRenderEditState({ ...base, ...over });
    it('enters edit mode on the edit layout of the diagram the request was for', () => {
        assert.strictEqual(act({ layoutMode: 'edit', reportedLayoutMode: 'edit', awaiting: true, pendingMatches: true }).action, 'enter');
        assert.strictEqual(act({ layoutMode: 'edit', reportedLayoutMode: 'edit' }).action, 'enter', 'a re-render of the same diagram while editing');
    });
    it('leaves on the edit layout of another diagram, and when the pending request was made on another diagram', () => {
        assert.strictEqual(act({ layoutMode: 'edit', reportedLayoutMode: 'edit', sameDiagram: false }).action, 'leave');
        assert.strictEqual(act({ layoutMode: 'edit', reportedLayoutMode: 'edit', awaiting: true, pendingMatches: false }).action, 'leave');
    });
    it('keeps waiting only for a view render of the same diagram while the request is pending', () => {
        assert.strictEqual(act({ reportedLayoutMode: 'edit', awaiting: true, pendingMatches: true }).action, 'keep-waiting');
        assert.strictEqual(act({ reportedLayoutMode: 'edit', awaiting: true, pendingMatches: false }).action, 'view', 'a switch cancels the request');
    });
    it('holds a draft made on other source text quietly, in every layout mode, and never restores it', () => {
        for (const layoutMode of ['view', 'edit']) {
            const plan = act({ layoutMode, restoreDecision: 'hold-other-source' });
            assert.strictEqual(plan.heldForOtherSource, true);
            assert.strictEqual(plan.deferRestore, true);
        }
        assert.strictEqual(act({ restoreDecision: 'hold-other-source' }).action, 'hold-quiet');
    });
    it('asks for the edit layout once for a draft of this source, and not again after a give-up', () => {
        assert.strictEqual(act({ restoreDecision: 'defer-edit-layout' }).action, 'request-edit-for-restore');
        assert.strictEqual(act({ restoreDecision: 'defer-edit-layout', editLayoutAbandoned: true }).action, 'hold-quiet');
        assert.deepStrictEqual(act({ restoreDecision: 'restore' }), { action: 'view', heldForOtherSource: false, deferRestore: false });
    });
    it('the webview takes the held-draft and deferral decisions from this plan, verbatim', () => {
        const script = PREVIEW_CLIENT_SCRIPT;
        assert.ok(script.includes(planRenderEditState.toString().replace(/\bexports\./g, '')));
        assert.ok(script.includes('restoreDecision: decideDraftRestore(input.pendingRestoreState, input.currentScope, input.editLayoutShown),'));
        assert.ok(!/heldForOtherSource = (false|true)/.test(script), 'no hard-coded held-draft decision');
    });
});
