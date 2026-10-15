import * as assert from 'assert';
import { ApiError } from '@google/genai';
import { apiErrorText, describeGenerationFailure } from '../../ai/FallbackStrategy';

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

    it('shows the API\'s words for an unrecognised SDK error, not its JSON envelope', () => {
        // @google/genai puts the API's whole JSON error body in the message.
        const overloaded = new ApiError({
            status: 503,
            message: JSON.stringify({ error: { code: 503, message: 'The model is overloaded. Please try again later.', status: 'UNAVAILABLE' } }),
        });
        const message = describeGenerationFailure('gemini-3.6-flash', overloaded);
        assert.ok(message.includes('503 UNAVAILABLE: The model is overloaded. Please try again later.'), message);
        assert.ok(!message.includes('{"error"'), 'the envelope is syntax, not a diagnosis');
        assert.ok(!message.includes('..'), `no doubled full stop. Got: ${message}`);
    });

    it('leaves anything that is not an API error body as it was', () => {
        assert.strictEqual(apiErrorText(new Error('kaboom')), 'kaboom');
        assert.strictEqual(apiErrorText(new Error('{"not":"an api error"}')), '{"not":"an api error"}');
        assert.strictEqual(apiErrorText(new Error('{"error":{"code":500}}')), '{"error":{"code":500}}', 'no message, nothing to show instead');
        assert.strictEqual(apiErrorText(new Error('{"error":{"message":"only words"}}')), 'only words');
        assert.strictEqual(apiErrorText(undefined), '');
    });

    it('summarises a non-JSON error page instead of pasting its markup', () => {
        // @google/genai wraps a body it cannot parse in the same envelope, with
        // the HTTP status text as `status`. The old SDK dropped such a body.
        const page = `<!DOCTYPE html><html><body>${'<p>upstream unreachable</p>'.repeat(100)}</body></html>`;
        const gateway = new ApiError({
            status: 502,
            message: JSON.stringify({ error: { message: page, code: 502, status: 'Bad Gateway' } }),
        });
        assert.strictEqual(
            apiErrorText(gateway),
            '502 Bad Gateway: the server answered with an HTML page, not a Gemini API error; a proxy may be in the way',
        );
        const message = describeGenerationFailure('gemini-3.6-flash', gateway);
        assert.ok(!message.includes('<'), message);
        // Text that merely mentions a tag is the API's words, and is kept.
        assert.strictEqual(
            apiErrorText(new Error('{"error":{"code":400,"message":"Field <name> is required.","status":"INVALID_ARGUMENT"}}')),
            '400 INVALID_ARGUMENT: Field <name> is required.',
        );
    });

    it('survives a non-Error being thrown', () => {
        const message = describeGenerationFailure('gemini-3.6-flash', 'just a string');
        assert.ok(message.includes('just a string'), message);
        const empty = describeGenerationFailure('gemini-3.6-flash', undefined);
        assert.ok(empty.includes('no error detail'), empty);
    });
});
