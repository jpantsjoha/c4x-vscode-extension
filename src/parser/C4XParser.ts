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
            return pegParser.parse(processedInput);
        } catch (e: unknown) {
            const error = e as { message: string; location?: { start: { line: number; column: number } } };
            if (error.location) {
                throw new C4XParseError(error.message, error.location.start);
            } else {
                throw new C4XParseError(error.message, {line: 1, column: 1});
            }
        }
    }
}

export const c4xParser = new C4XParser();
