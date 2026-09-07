import * as assert from 'assert';
import {
    parseModelId,
    selectBestModel,
    resolveModelChoice,
    describeModelChange,
    type DiscoveredModel,
} from '../../ai/modelDiscovery';
import { DEFAULT_MODEL } from '../../ai/models';

/**
 * Fixture taken from a real GET /v1beta/models response on 2026-09-05.
 * It deliberately includes the retired preview ids, because the API really
 * does still list and serve them: that is the fact the design turns on.
 */
const LIVE: DiscoveredModel[] = [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-omni-1.1-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash-lite',
    'gemini-3.1-pro-preview',
    'gemini-2.5-pro',
    'gemini-3-flash-preview',
    'gemini-3-pro-preview',
    'gemini-3.1-flash-image',
    'gemini-3.1-flash-lite-image',
    'gemini-3-pro-image',
    'gemini-2.5-flash-image',
    'gemini-3.1-flash-image-preview',
    'gemini-3-pro-image-preview',
    'gemini-3.1-flash-tts-preview',
    'gemini-3.1-pro-preview-customtools',
    'gemini-flash-latest',
    'gemini-pro-latest',
    'gemini-2.5-flash',
].map(id => ({ id, supportedGenerationMethods: ['generateContent'] }));

describe('parseModelId', () => {
    it('sorts versions numerically, so 3.10 beats 3.5', () => {
        assert.ok(parseModelId('gemini-3.10-flash').version > parseModelId('gemini-3.5-flash').version);
    });

    it('marks preview, experimental and alias ids unstable', () => {
        for (const id of ['gemini-3.1-pro-preview', 'gemini-2.0-flash-exp', 'gemini-flash-latest']) {
            assert.strictEqual(parseModelId(id).unstable, true, `${id} must be unstable`);
        }
        assert.strictEqual(parseModelId('gemini-3.6-flash').unstable, false);
    });

    it('distinguishes the tiers, longest suffix winning', () => {
        assert.strictEqual(parseModelId('gemini-3.1-flash-lite-image').tier, 'flash-lite-image');
        assert.strictEqual(parseModelId('gemini-3.1-flash-image').tier, 'flash-image');
        assert.strictEqual(parseModelId('gemini-3-pro-image').tier, 'pro-image');
        assert.strictEqual(parseModelId('gemini-3.1-flash-lite').tier, 'flash-lite');
        assert.strictEqual(parseModelId('gemini-3.6-flash').tier, 'flash');
    });

    it('excludes single-purpose variants from every tier', () => {
        assert.strictEqual(parseModelId('gemini-3.1-flash-tts-preview').tier, undefined);
        assert.strictEqual(parseModelId('gemini-3.1-pro-preview-customtools').tier, undefined);
    });

    it('marks the omni line as a manually selectable specialist flash model', () => {
        // gemini-omni-1.1-flash has no numeric family version, so it parses as
        // version 0 — but the -flash suffix still matches, and without the
        // specialist marker it would become an automatic flash candidate.
        const omni = parseModelId('gemini-omni-1.1-flash');
        assert.strictEqual(omni.major, 0);
        assert.strictEqual(omni.tier, 'flash');
        assert.strictEqual(omni.specialist, true, 'omni must require deliberate selection');
        assert.strictEqual(parseModelId('gemini-omni-flash-preview').specialist, true);
    });
});

describe('selectBestModel', () => {
    it('picks the newest generally available model in a tier', () => {
        assert.strictEqual(selectBestModel(LIVE, 'flash'), 'gemini-3.8-flash');
        assert.strictEqual(selectBestModel(LIVE, 'flash-image'), 'gemini-3.1-flash-image');
        assert.strictEqual(selectBestModel(LIVE, 'pro-image'), 'gemini-3-pro-image');
    });

    it('guards the shipped floor: the default is the newest GA flash in the live-shaped list', () => {
        assert.strictEqual(DEFAULT_MODEL, 'gemini-3.8-flash');
        assert.strictEqual(selectBestModel(LIVE, 'flash'), DEFAULT_MODEL);
    });

    it('never selects a preview, even when it is the only option in the tier', () => {
        // Take the only GA Pro out of the live list: the answer must be
        // nothing, not gemini-3.1-pro-preview.
        const noGaPro = LIVE.filter(m => m.id !== 'gemini-2.5-pro');
        assert.strictEqual(selectBestModel(noGaPro, 'pro'), undefined);
    });

    it('picks gemini-2.5-pro for the pro tier: the only GA Pro in the 2026-09-05 list', () => {
        assert.strictEqual(selectBestModel(LIVE, 'pro'), 'gemini-2.5-pro');
    });

    it('never selects the omni model, even when it is the only flash in the list', () => {
        const omniOnly = LIVE.filter(m => m.id === 'gemini-omni-1.1-flash');
        assert.strictEqual(selectBestModel(omniOnly, 'flash'), undefined);
    });

    it('never selects the omni model from a mixed automatic-selection list', () => {
        const candidates = LIVE.filter(m => ['gemini-omni-1.1-flash', 'gemini-3.6-flash'].includes(m.id));
        assert.strictEqual(selectBestModel(candidates, 'flash'), 'gemini-3.6-flash');
    });

    it('never selects a -latest alias', () => {
        const chosen = selectBestModel(LIVE, 'flash');
        assert.ok(!chosen!.endsWith('-latest'), `chose an alias: ${chosen}`);
    });

    it('ignores models the key cannot use for this method', () => {
        const textOnly: DiscoveredModel[] = [
            { id: 'gemini-9.0-flash', supportedGenerationMethods: ['embedContent'] },
            { id: 'gemini-3.6-flash', supportedGenerationMethods: ['generateContent'] },
        ];
        assert.strictEqual(selectBestModel(textOnly, 'flash'), 'gemini-3.6-flash');
    });

    it('returns undefined rather than guessing when the tier is empty', () => {
        assert.strictEqual(selectBestModel([], 'flash'), undefined);
    });
});

describe('resolveModelChoice', () => {
    it('keeps the pinned default when the key can still reach it', () => {
        const result = resolveModelChoice('gemini-3.5-flash', LIVE, 'pinned');
        assert.deepStrictEqual(result, { model: 'gemini-3.5-flash', reason: 'pinned' });
    });

    it('heals to the newest GA model when the pinned id is unreachable', () => {
        const withoutPinned = LIVE.filter(m => m.id !== 'gemini-3.6-flash');
        const result = resolveModelChoice('gemini-3.6-flash', withoutPinned, 'pinned');
        assert.strictEqual(result.reason, 'healed');
        assert.strictEqual(result.model, 'gemini-3.8-flash');
    });

    it('heals even in pinned mode, because an uncallable default helps nobody', () => {
        const result = resolveModelChoice('gemini-1.0-flash', LIVE, 'pinned');
        assert.strictEqual(result.reason, 'healed');
        assert.strictEqual(result.model, 'gemini-3.8-flash');
    });

    it('declines to guess when an unreachable id has no recognisable tier', () => {
        // Healing needs to know which tier to heal INTO. Substituting a flash
        // model for something we cannot classify would be worse than failing.
        const result = resolveModelChoice('gemini-1.0-mystery', LIVE, 'pinned');
        assert.deepStrictEqual(result, { model: 'gemini-1.0-mystery', reason: 'pinned' });
    });

    it('does not upgrade in pinned mode', () => {
        assert.strictEqual(resolveModelChoice('gemini-3.5-flash', LIVE, 'pinned').reason, 'pinned');
    });

    it('keeps a reachable specialist chosen manually even when auto-ga is enabled', () => {
        const result = resolveModelChoice('gemini-omni-1.1-flash', LIVE, 'auto-ga');
        assert.deepStrictEqual(result, { model: 'gemini-omni-1.1-flash', reason: 'pinned' });
    });

    it('upgrades to the newest GA model in auto-ga mode', () => {
        const result = resolveModelChoice('gemini-3.5-flash', LIVE, 'auto-ga');
        assert.deepStrictEqual(result, { model: 'gemini-3.8-flash', reason: 'upgraded' });
    });

    it('never upgrades onto a preview, even in auto-ga', () => {
        // Pinned to the preview Pro with no GA Pro reachable: it must stay put.
        const noGaPro = LIVE.filter(m => m.id !== 'gemini-2.5-pro');
        const result = resolveModelChoice('gemini-3.1-pro-preview', noGaPro, 'auto-ga');
        assert.strictEqual(result.model, 'gemini-3.1-pro-preview');
    });

    it('auto-ga moves a preview Pro pin onto the GA Pro when one exists', () => {
        // Today's list has exactly one GA Pro: gemini-2.5-pro.
        const result = resolveModelChoice('gemini-3.1-pro-preview', LIVE, 'auto-ga');
        assert.deepStrictEqual(result, { model: 'gemini-2.5-pro', reason: 'upgraded' });
    });

    it('keeps the pinned id when discovery returns nothing usable', () => {
        const result = resolveModelChoice(DEFAULT_MODEL, [], 'auto-ga');
        assert.deepStrictEqual(result, { model: DEFAULT_MODEL, reason: 'pinned' });
    });

    it('would have healed the v1.6.3 defect', () => {
        // The exact scenario: shipped default retired, still listed by the API.
        // Absence-based healing would NOT have caught this, which is why the
        // caller also heals on a call-time failure. Here we model the id having
        // finally been withdrawn.
        const afterWithdrawal = LIVE.filter(m => m.id !== 'gemini-3.1-flash-image-preview');
        const result = resolveModelChoice('gemini-3.1-flash-image-preview', afterWithdrawal, 'pinned');
        assert.strictEqual(result.model, 'gemini-3.1-flash-image');
        assert.strictEqual(result.reason, 'healed');
    });
});

describe('describeModelChange', () => {
    it('tells the user a substitution happened rather than doing it silently', () => {
        const healed = describeModelChange('gemini-old', 'gemini-new', 'healed');
        assert.ok(healed.includes('gemini-old') && healed.includes('gemini-new'), healed);
        assert.ok(/no longer available/i.test(healed), healed);

        const upgraded = describeModelChange('gemini-old', 'gemini-new', 'upgraded');
        assert.ok(/newer model/i.test(upgraded), upgraded);
        assert.ok(upgraded.includes('modelStrategy'), 'must say how to turn it off');
    });
});
