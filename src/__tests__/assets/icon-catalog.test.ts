/**
 * docs/ICONS.md must be exactly what scripts/generate-icon-catalog.ts renders from
 * the shipped sprite map. Before this test the catalogue had drifted to 1,100 rows
 * (19 of them duplicates) against 1,098 vendor sprites, and 15 Azure icons whose
 * names carry a parenthesis or a plus sign were shipped but never listed.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import { SPRITES } from '../../assets/icons';
import { OUT_FILE, renderCatalog } from '../../../scripts/generate-icon-catalog';

describe('docs/ICONS.md', () => {
    it('lists exactly the sprites that ship, in the generated form', () => {
        const committed = fs.readFileSync(OUT_FILE, 'utf8');
        const expected = renderCatalog(Object.keys(SPRITES));
        assert.strictEqual(
            committed,
            expected,
            'docs/ICONS.md differs from the sprite map — run: pnpm exec ts-node --transpile-only scripts/generate-icon-catalog.ts',
        );
    });

    it('lists every shipped key once and nothing that does not ship', () => {
        const committed = fs.readFileSync(OUT_FILE, 'utf8');
        // Every table row is parsed, and a row the parser does not understand fails the
        // test: a regex that only collected the rows it liked would let a malformed row
        // list a key that does not ship.
        const rows = committed.split('\n').filter(line => line.startsWith('| ') && !line.startsWith('| Icon Name') && !line.startsWith('| :---'));
        const listed = rows.map(line => {
            const match = line.match(/^\| [^|]+ \| `(?:c4xicons\.([a-z]+)\.)?([^`]+)` \|$/);
            assert.ok(match, `docs/ICONS.md has a row the catalogue format does not allow: ${line}`);
            return match[1] ? `${match[1]}-${match[2]}` : match[2];
        });
        const shipped = Object.keys(SPRITES).sort();
        assert.deepStrictEqual([...listed].sort(), shipped);
        assert.strictEqual(new Set(listed).size, listed.length, 'a sprite is listed more than once');
    });
});
