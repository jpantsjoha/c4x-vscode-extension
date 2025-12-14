import { C4XParseError, ParseResult } from './types';
import * as pegParser from './c4x.generated.js';

export class C4XParser {
    public parse(input: string): ParseResult {
        // Preprocess: ensure a default graph direction exists to reduce syntax friction
        // If user omitted 'graph TB|BT|LR|RL', inject 'graph TB' after an optional directive
        const hasGraphDirective = /\bgraph\s+(TB|BT|LR|RL)\b/.test(input);
        let processedInput = input;
        if (!hasGraphDirective) {
            const directiveMatch = /^\s*%%\{[^\n]*\}%%\s*/m.exec(input);
            if (directiveMatch) {
                const insertPos = directiveMatch.index + directiveMatch[0].length;
                processedInput = input.slice(0, insertPos) + 'graph TB\n' + input.slice(insertPos);
            } else {
                processedInput = 'graph TB\n' + input;
            }
        }

        try {
            const result = pegParser.parse(processedInput);

            // Normalize c4xicons (Syntax Sugar) -> Internal Keys
            // c4xicons.aws.s3-bucket -> aws-s3-bucket
            // c4xicons.std.person -> person
            const normalizeSprite = (sprite: string | undefined): string | undefined => {
                if (!sprite || !sprite.startsWith('c4xicons.')) { return sprite; }

                if (sprite.startsWith('c4xicons.aws.')) { return 'aws-' + sprite.substring(13); } // c4xicons.aws.
                if (sprite.startsWith('c4xicons.azure.')) { return 'azure-' + sprite.substring(15); } // c4xicons.azure.
                if (sprite.startsWith('c4xicons.gcp.')) { return 'gcp-' + sprite.substring(13); } // c4xicons.gcp.
                if (sprite.startsWith('c4xicons.std.')) { return sprite.substring(13); } // c4xicons.std.

                return sprite;
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const traverseAndNormalize = (elements: any[]) => {
                for (const el of elements) {
                    if (el.sprite) { el.sprite = normalizeSprite(el.sprite); }
                    if (el.children) { traverseAndNormalize(el.children); }
                }
            };

            // Allow searching in boundaries too if they are separate structure, but ParseResult 
            // usually puts everything in elements or boundaries.
            traverseAndNormalize(result.elements);
            if (result.boundaries) {
                // Check boundary containers (if they have sprites? usually only elements have sprites)
                traverseAndNormalize(result.boundaries);
                // Also traverse elements inside boundaries if strictly hierarchical? 
                // The parser flattens or keeps structure. 'result.elements' usually contains ALL elements.
                // But let's be safe.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                result.boundaries.forEach((b: any) => {
                    if (b.elements) { traverseAndNormalize(b.elements); }
                });
            }

            return result;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const error = e as any;
            if (error.location) {
                throw new C4XParseError(error.message, error.location.start);
            } else {
                throw new C4XParseError(error.message, { line: 1, column: 1 });
            }
        }
    }
}

export const c4xParser = new C4XParser();
