import * as assert from 'assert';
import { describeGenerationFailure } from '../../ai/FallbackStrategy';

/**
 * The previous message blamed model selection for every failure, including an
 * expired API key. A user whose key had lapsed was told to change a setting
 * that was already correct.
 */
describe('describeGenerationFailure', () => {
    it('names the API key when the key is rejected', () => {
        const message = describeGenerationFailure(
            'gemini-3.6-flash',
            new Error('[400 Bad Request] API key not valid. Please pass a valid API key.')
        );
        assert.ok(/api key was rejected/i.test(message), message);
        assert.ok(message.includes('Set Gemini API Key'), 'should name the command that fixes it');
        assert.ok(!/change it in settings/i.test(message), 'must not blame the model setting');
    });

    it('names the model when the model is gone', () => {
        const message = describeGenerationFailure(
            'gemini-3.1-flash-image-preview',
            new Error('[404 Not Found] models/gemini-3.1-flash-image-preview is not found for API version v1beta')
        );
        assert.ok(message.includes('gemini-3.1-flash-image-preview'), message);
        assert.ok(/not available to your API key|retired/i.test(message), message);
    });

    it('names quota when the limit is hit', () => {
        const message = describeGenerationFailure('gemini-3.6-flash', new Error('429 RESOURCE_EXHAUSTED: quota exceeded'));
        assert.ok(/rate limit or quota/i.test(message), message);
    });

    it('names the network when the call never left', () => {
        const message = describeGenerationFailure('gemini-3.6-flash', new Error('fetch failed'));
        assert.ok(/could not reach the gemini api/i.test(message), message);
    });

    it('passes an unrecognised error through rather than inventing a diagnosis', () => {
        const message = describeGenerationFailure('gemini-3.6-flash', new Error('kaboom in the widget factory'));
        assert.ok(message.includes('kaboom in the widget factory'), 'the original words must survive');
    });

    it('survives a non-Error being thrown', () => {
        const message = describeGenerationFailure('gemini-3.6-flash', 'just a string');
        assert.ok(message.includes('just a string'), message);
        const empty = describeGenerationFailure('gemini-3.6-flash', undefined);
        assert.ok(empty.includes('no error detail'), empty);
    });
});
