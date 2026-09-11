import * as assert from 'assert';
import {
    BindingStore,
    clearBinding,
    EditorPanelBinding,
    loadBinding,
    saveBinding,
} from '../../webview/editorBinding';

function createStore(initial?: unknown): BindingStore & { value: unknown } {
    const store = {
        value: initial,
        get<T>(key: string): T | undefined {
            void key;
            return this.value as T | undefined;
        },
        update(key: string, value: unknown): Thenable<void> {
            void key;
            this.value = value;
            return Promise.resolve();
        },
    };
    return store;
}

describe('editorBinding', () => {
    it('round-trips a markdown binding', async () => {
        const store = createStore();
        const binding: EditorPanelBinding = { kind: 'markdown', uri: 'file:///repo/docs.md', blockOrdinal: 2 };
        await saveBinding(store, binding);
        assert.deepStrictEqual(loadBinding(store), binding);
    });

    it('round-trips a native binding', async () => {
        const store = createStore();
        const binding: EditorPanelBinding = { kind: 'native', uri: 'file:///repo/diagram.c4x' };
        await saveBinding(store, binding);
        assert.deepStrictEqual(loadBinding(store), binding);
    });

    it('clears the binding', async () => {
        const store = createStore();
        await saveBinding(store, { kind: 'native', uri: 'file:///repo/diagram.c4x' });
        await clearBinding(store);
        assert.strictEqual(loadBinding(store), undefined);
    });

    it('rejects malformed entries instead of resurrecting a half-bound panel', () => {
        const invalid: unknown[] = [
            undefined,
            null,
            'markdown',
            42,
            {},
            { kind: 'markdown' },
            { kind: 'markdown', uri: '', blockOrdinal: 0 },
            { kind: 'markdown', uri: 'file:///a.md', blockOrdinal: -1 },
            { kind: 'markdown', uri: 'file:///a.md', blockOrdinal: 1.5 },
            { kind: 'markdown', uri: 'file:///a.md', blockOrdinal: '0' },
            { kind: 'native' },
            { kind: 'native', uri: 7 },
            { kind: 'other', uri: 'file:///a.md' },
        ];
        for (const value of invalid) {
            assert.strictEqual(loadBinding(createStore(value)), undefined, `expected rejection of ${JSON.stringify(value)}`);
        }
    });
});
