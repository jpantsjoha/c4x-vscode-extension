import * as assert from 'assert';
import {
    INSPECTOR_LABEL_MAX,
    INSPECTOR_TECH_MAX,
    INSPECTOR_TAG_COUNT_MAX,
    INSPECTOR_TAG_LENGTH_MAX,
    INSPECTOR_TAG_RE,
    INSPECTOR_ID_RE,
    validateLabel,
    validateTechnology,
    validateTagsString,
    validateSprite,
    validateElementId,
} from '../../webview/inspectorValidators';

/**
 * Unit tests for the shared inspector validator module (#87).
 * All validators are pure functions — no DOM or VS Code host needed.
 */
describe('inspectorValidators — bounds constants', () => {
    it('INSPECTOR_LABEL_MAX is 120', () => {
        assert.strictEqual(INSPECTOR_LABEL_MAX, 120);
    });

    it('INSPECTOR_TECH_MAX is 120', () => {
        assert.strictEqual(INSPECTOR_TECH_MAX, 120);
    });

    it('INSPECTOR_TAG_COUNT_MAX is 20', () => {
        assert.strictEqual(INSPECTOR_TAG_COUNT_MAX, 20);
    });

    it('INSPECTOR_TAG_LENGTH_MAX is 40', () => {
        assert.strictEqual(INSPECTOR_TAG_LENGTH_MAX, 40);
    });

    it('INSPECTOR_TAG_RE allows letters, digits, hyphens, underscores', () => {
        assert.ok(INSPECTOR_TAG_RE.test('MyTag'));
        assert.ok(INSPECTOR_TAG_RE.test('my-tag_2'));
        assert.ok(INSPECTOR_TAG_RE.test('A'));
        assert.ok(!INSPECTOR_TAG_RE.test(''));
        assert.ok(!INSPECTOR_TAG_RE.test('tag with space'));
        assert.ok(!INSPECTOR_TAG_RE.test('tag.dot'));
    });

    it('INSPECTOR_ID_RE requires letter/underscore start', () => {
        assert.ok(INSPECTOR_ID_RE.test('myElement'));
        assert.ok(INSPECTOR_ID_RE.test('_private'));
        assert.ok(INSPECTOR_ID_RE.test('A1'));
        assert.ok(!INSPECTOR_ID_RE.test('1leading'));
        assert.ok(!INSPECTOR_ID_RE.test('-dash'));
        assert.ok(!INSPECTOR_ID_RE.test(''));
    });
});

describe('validateLabel', () => {
    it('returns null for a valid label', () => {
        assert.strictEqual(validateLabel('My System'), null);
        assert.strictEqual(validateLabel('A'), null);
    });

    it('rejects an empty string', () => {
        const result = validateLabel('');
        assert.ok(typeof result === 'string' && result.length > 0, 'should return error string for empty');
    });

    it('rejects a whitespace-only string', () => {
        const result = validateLabel('   ');
        assert.ok(typeof result === 'string', 'whitespace-only should fail');
    });

    it(`rejects a label longer than ${INSPECTOR_LABEL_MAX} characters`, () => {
        const tooLong = 'x'.repeat(INSPECTOR_LABEL_MAX + 1);
        const result = validateLabel(tooLong);
        assert.ok(typeof result === 'string', `label of ${INSPECTOR_LABEL_MAX + 1} chars should fail`);
    });

    it(`accepts a label exactly ${INSPECTOR_LABEL_MAX} characters`, () => {
        const exact = 'x'.repeat(INSPECTOR_LABEL_MAX);
        assert.strictEqual(validateLabel(exact), null);
    });

    it('rejects a label containing a double quote', () => {
        const result = validateLabel('Say "hello"');
        assert.ok(typeof result === 'string', 'label with quote should fail');
    });

    it('rejects a label containing a newline', () => {
        assert.ok(typeof validateLabel('line1\nline2') === 'string');
        assert.ok(typeof validateLabel('line1\rline2') === 'string');
    });

    it('returns an error string, not null, for invalid inputs', () => {
        // Type-check: must return string
        const err = validateLabel('');
        assert.strictEqual(typeof err, 'string');
    });
});

describe('validateTechnology', () => {
    it('returns null for a valid technology string', () => {
        assert.strictEqual(validateTechnology('Java 21'), null);
        assert.strictEqual(validateTechnology(''), null); // empty is valid (clear)
    });

    it(`rejects technology longer than ${INSPECTOR_TECH_MAX} characters`, () => {
        const tooLong = 'x'.repeat(INSPECTOR_TECH_MAX + 1);
        const result = validateTechnology(tooLong);
        assert.ok(typeof result === 'string', `tech of ${INSPECTOR_TECH_MAX + 1} chars should fail`);
    });

    it(`accepts technology exactly ${INSPECTOR_TECH_MAX} characters`, () => {
        const exact = 'x'.repeat(INSPECTOR_TECH_MAX);
        assert.strictEqual(validateTechnology(exact), null);
    });

    it('rejects technology with a double quote', () => {
        assert.ok(typeof validateTechnology('C# "unsafe"') === 'string');
    });

    it('rejects technology with a newline', () => {
        assert.ok(typeof validateTechnology('line1\nline2') === 'string');
    });
});

describe('validateTagsString', () => {
    it('returns null for an empty string', () => {
        assert.strictEqual(validateTagsString(''), null);
    });

    it('returns null for a whitespace-only string (treated as no tags)', () => {
        assert.strictEqual(validateTagsString('  '), null);
    });

    it('returns null for a single valid tag', () => {
        assert.strictEqual(validateTagsString('api'), null);
    });

    it('returns null for multiple valid tags', () => {
        assert.strictEqual(validateTagsString('api, backend, v2'), null);
    });

    it(`rejects more than ${INSPECTOR_TAG_COUNT_MAX} tags`, () => {
        const tooMany = Array.from({ length: INSPECTOR_TAG_COUNT_MAX + 1 }, (_, i) => `tag${i}`).join(',');
        assert.ok(typeof validateTagsString(tooMany) === 'string');
    });

    it(`accepts exactly ${INSPECTOR_TAG_COUNT_MAX} tags`, () => {
        const exact = Array.from({ length: INSPECTOR_TAG_COUNT_MAX }, (_, i) => `tag${i}`).join(',');
        assert.strictEqual(validateTagsString(exact), null);
    });

    it(`rejects a single tag longer than ${INSPECTOR_TAG_LENGTH_MAX} characters`, () => {
        const longTag = 'x'.repeat(INSPECTOR_TAG_LENGTH_MAX + 1);
        assert.ok(typeof validateTagsString(longTag) === 'string');
    });

    it(`accepts a single tag exactly ${INSPECTOR_TAG_LENGTH_MAX} characters`, () => {
        const exact = 'x'.repeat(INSPECTOR_TAG_LENGTH_MAX);
        assert.strictEqual(validateTagsString(exact), null);
    });

    it('rejects tags with illegal characters (spaces)', () => {
        assert.ok(typeof validateTagsString('my tag') === 'string');
    });

    it('rejects tags with illegal characters (dots)', () => {
        assert.ok(typeof validateTagsString('my.tag') === 'string');
    });

    it('rejects duplicate tags', () => {
        assert.ok(typeof validateTagsString('api,backend,api') === 'string');
    });

    it('rejects stray commas producing empty entries', () => {
        assert.ok(typeof validateTagsString('api,,backend') === 'string');
    });

    it('allows tags with hyphens and underscores', () => {
        assert.strictEqual(validateTagsString('my-tag, my_tag2'), null);
    });

    it('allows mixed-case tags', () => {
        assert.strictEqual(validateTagsString('MyTag, OtherTag'), null);
    });
});

describe('validateSprite', () => {
    const alwaysTrue = () => true;
    const alwaysFalse = () => false;

    it('returns null for an empty string (clear)', () => {
        assert.strictEqual(validateSprite('', alwaysFalse), null);
    });

    it('returns null for a whitespace-only string (clear)', () => {
        assert.strictEqual(validateSprite('  ', alwaysFalse), null);
    });

    it('returns null when sprite is non-empty and exists', () => {
        assert.strictEqual(validateSprite('person', alwaysTrue), null);
    });

    it('returns an error string when sprite is non-empty and does not exist', () => {
        const result = validateSprite('not-a-sprite', alwaysFalse);
        assert.ok(typeof result === 'string' && result.length > 0);
    });
});

describe('validateElementId', () => {
    it('returns null for valid identifiers', () => {
        assert.strictEqual(validateElementId('myElement'), null);
        assert.strictEqual(validateElementId('_private'), null);
        assert.strictEqual(validateElementId('A1'), null);
    });

    it('returns an error for identifiers starting with a digit', () => {
        assert.ok(typeof validateElementId('1element') === 'string');
    });

    it('returns an error for identifiers containing hyphens', () => {
        assert.ok(typeof validateElementId('my-element') === 'string');
    });

    it('returns an error for empty strings', () => {
        assert.ok(typeof validateElementId('') === 'string');
    });

    it('returns an error for identifiers with spaces', () => {
        assert.ok(typeof validateElementId('my element') === 'string');
    });
});
