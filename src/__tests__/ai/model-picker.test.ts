import * as assert from 'assert';
import { buildModelPickItems } from '../../commands/selectModel';
import { DEFAULT_MODEL } from '../../ai/models';
import type { DiscoveredModel } from '../../ai/modelDiscovery';

const LIVE: DiscoveredModel[] = [
    { id: DEFAULT_MODEL, displayName: 'Gemini 3.8 Flash' },
    { id: 'gemini-3.6-flash', displayName: 'Gemini 3.6 Flash' },
    { id: 'gemini-3.5-flash', displayName: 'Gemini 3.5 Flash' },
    { id: 'gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro' },
    { id: 'gemini-omni-1.1-flash', displayName: 'Gemini Omni 1.1 Flash' },
    { id: 'gemini-3.1-flash-image', displayName: 'Nano Banana 2' },
    { id: 'gemini-3.1-flash-image-preview', displayName: 'Nano Banana 2' },
    { id: 'gemini-flash-latest', displayName: 'Gemini Flash Latest' },
    { id: 'text-embedding-004', displayName: 'Embedding' },
];

describe('model picker', () => {
    it('offers text models for the text setting and image models for the image one', () => {
        const text = buildModelPickItems(LIVE, DEFAULT_MODEL, 'text').map(i => i.modelId);
        const image = buildModelPickItems(LIVE, 'gemini-3.1-flash-image', 'image').map(i => i.modelId);

        assert.ok(text.includes(DEFAULT_MODEL));
        assert.ok(!text.some(id => id.includes('image')), 'image models must not appear in the text picker');
        assert.ok(image.every(id => id.includes('image')), 'only image models in the image picker');
    });

    it('drops models that are not one of our tiers', () => {
        const ids = buildModelPickItems(LIVE, DEFAULT_MODEL, 'text').map(i => i.modelId);
        assert.ok(!ids.includes('text-embedding-004'), 'an embedding model is not a diagram generator');
    });

    it('marks the current selection and the shipped default', () => {
        const items = buildModelPickItems(LIVE, 'gemini-3.5-flash', 'text');
        const current = items.find(i => i.modelId === 'gemini-3.5-flash');
        const shipped = items.find(i => i.modelId === DEFAULT_MODEL);
        assert.match(current!.description!, /current/);
        assert.match(shipped!.description!, /default/);
    });

    it('flags retired models rather than hiding them', () => {
        // Someone pinned to a retired id must be able to see why it is wrong.
        const items = buildModelPickItems(LIVE, 'gemini-3.1-flash-image-preview', 'image');
        const retired = items.find(i => i.modelId === 'gemini-3.1-flash-image-preview');
        assert.ok(retired, 'a retired model the user is pinned to must still be listed');
        assert.match(retired!.description!, /RETIRED/);
    });

    it('flags preview models', () => {
        const items = buildModelPickItems(LIVE, DEFAULT_MODEL, 'text');
        const preview = items.find(i => i.modelId === 'gemini-3.1-pro-preview');
        assert.match(preview!.description!, /preview/);
    });

    it('offers Omni as a marked specialist model for deliberate selection', () => {
        const items = buildModelPickItems(LIVE, DEFAULT_MODEL, 'text');
        const omni = items.find(i => i.modelId === 'gemini-omni-1.1-flash');
        assert.ok(omni, 'Omni must remain manually selectable');
        assert.match(omni.description!, /specialist/);
    });

    it('ranks generally available models above unstable ones', () => {
        const ids = buildModelPickItems(LIVE, DEFAULT_MODEL, 'text').map(i => i.modelId);
        const firstUnstable = ids.findIndex(id => id.includes('preview') || id.endsWith('-latest'));
        const lastStable = ids.map(id => !id.includes('preview') && !id.endsWith('-latest')).lastIndexOf(true);
        assert.ok(firstUnstable === -1 || lastStable < firstUnstable, `unstable models must sort last: ${ids.join(', ')}`);
    });

    it('puts the newest generally available model first', () => {
        const ids = buildModelPickItems(LIVE, 'gemini-3.5-flash', 'text').map(i => i.modelId);
        assert.strictEqual(ids[0], DEFAULT_MODEL);
    });
});
