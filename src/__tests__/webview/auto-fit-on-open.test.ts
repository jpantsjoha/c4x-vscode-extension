import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { PREVIEW_CLIENT_SCRIPT, shouldAutoFitOnOpen } from '../../webview/previewClientScript';

/**
 * Unit coverage for auto-fit on open (#111): the firstRender/setting gating
 * is pure; the setting registration is verified against package.json.
 */

describe('shouldAutoFitOnOpen', () => {
    it('fits on the first render when the setting is enabled', () => {
        assert.strictEqual(shouldAutoFitOnOpen(true, true), true);
    });

    it('does not fit on the first render when the setting is disabled', () => {
        assert.strictEqual(shouldAutoFitOnOpen(true, false), false);
    });

    it('never re-fits on later renders (save-triggered refreshes)', () => {
        assert.strictEqual(shouldAutoFitOnOpen(false, true), false);
        assert.strictEqual(shouldAutoFitOnOpen(false, false), false);
    });

    it('pins the "Diagram zoomed to fit" polite announcement', () => {
        assert.ok(
            PREVIEW_CLIENT_SCRIPT.includes('Diagram zoomed to fit'),
            'PREVIEW_CLIENT_SCRIPT must contain the exact string "Diagram zoomed to fit"',
        );
    });
});

describe('c4x.canvas.autoFitOnOpen setting registration', () => {
    const pkg = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8'),
    );
    const properties = pkg?.contributes?.configuration?.properties ?? {};
    const setting = properties['c4x.canvas.autoFitOnOpen'];

    it('is registered in contributes.configuration', () => {
        assert.ok(setting, 'c4x.canvas.autoFitOnOpen must be registered in package.json');
    });

    it('is a boolean defaulting to true', () => {
        assert.strictEqual(setting.type, 'boolean');
        assert.strictEqual(setting.default, true);
    });

    it('has a non-empty description like neighbouring c4x.* settings', () => {
        assert.ok(typeof setting.description === 'string' && setting.description.length > 0);
    });
});
