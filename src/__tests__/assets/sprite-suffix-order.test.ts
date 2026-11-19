/**
 * Suffix lookup is deterministic (#534, review round 2). Before the data file is read, the SPRITES
 * proxy enumerates the sorted id list; after, the table's insertion order. getSprite's suffix search
 * must not depend on which of the two it sees, or the same name draws a different vendor's icon
 * depending on earlier lookups.
 */
import * as assert from 'assert';

const ICON_MODULES = ['../../assets/icons', '../../assets/cloudIcons'];

function freshIcons(): typeof import('../../assets/icons') {
    for (const name of ICON_MODULES) { delete require.cache[require.resolve(name)]; }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../../assets/icons') as typeof import('../../assets/icons');
}

describe('getSprite suffix lookup order (#534)', () => {
    for (const name of ['gateway', 'database', 'storage', 'function']) {
        it(`"${name}" resolves to the same sprite on the first call, a repeat, and after the table is filled`, () => {
            const icons = freshIcons();
            const first = icons.getSprite(name);
            const repeat = icons.getSprite(name);
            assert.deepStrictEqual(repeat, first, 'a repeated lookup changed vendor');

            const prefilled = freshIcons();
            void prefilled.SPRITES['aws-lambda-lambda-function']; // fill the table before any lookup
            assert.deepStrictEqual(prefilled.getSprite(name), first, 'lookup differs once the table is filled');
        });
    }
});
