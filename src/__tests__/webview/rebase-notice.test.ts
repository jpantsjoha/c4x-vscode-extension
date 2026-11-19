import * as assert from 'assert';
import {
    rebaseAcceptedNotice,
    SOURCE_CHANGED_REBASE_NOTICE,
    SOURCE_CHANGED_SAVE_REFUSAL,
} from '../../webview/visualLayoutProtocol';

describe('Rebase outcome text (#293)', () => {
    it('warns at Rebase time when Save has no current layout', () => {
        assert.strictEqual(rebaseAcceptedNotice(false), SOURCE_CHANGED_REBASE_NOTICE);
    });

    it('says nothing extra when Save can still succeed', () => {
        assert.strictEqual(rebaseAcceptedNotice(true), undefined);
    });

    it('uses plain wording true for unsaved and saved changes, with no internal terms', () => {
        for (const text of [SOURCE_CHANGED_REBASE_NOTICE, SOURCE_CHANGED_SAVE_REFUSAL]) {
            assert.ok(!/snapshot|revision|layout_unavailable/i.test(text), text);
            assert.ok(!/on disk|re-apply|discard them/i.test(text), text);
            assert.ok(text.includes('cannot be saved'), text);
        }
    });
});
