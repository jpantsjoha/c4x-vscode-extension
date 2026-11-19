// The provider-neutral generation loop (#393).
//
// Every generation route — Gemini with the user's key, and any other provider —
// sends its prompt through `runRepairLoop`. A provider supplies one thing: a
// `complete(prompt) → text` function that makes one request and nothing else.
// The loop owns cleaning, validation and repair, so the attempt budget, the fix
// prompt and the progress messages are the same code for every provider.
//
// No provider SDK is imported here. Gemini's binding lives in SyntaxValidator
// (`geminiCompletion`, `executeWithRetry`); Gemini's heal and tier failover
// stay in FallbackStrategy, wrapped around this loop.

import type * as vscode from 'vscode';
import { C4XParser } from '../parser/C4XParser';
import { buildFixPrompt } from './PromptBuilder';
import { styleShapeNames } from '../render/elementStyle';
import { STYLE_DIAGNOSTIC_CODES } from '../model/styleDiagnostics';
import { c4ModelBuilder } from '../model/C4ModelBuilder';
import type { ParseResult } from '../parser/types';

/**
 * The first unknown `$shape` the model builder reports (C4X-L110), as a message
 * with the closest valid name. An unknown shape parses (the element is drawn as
 * the theme rectangle), so the parser never says so; the loop asks the model to
 * fix it while attempts remain (#330). It reads parsed values, so a comment
 * that mentions a shape is ignored and an unquoted value is caught.
 */
export function unknownShapeProblem(parsed: ParseResult): string | undefined {
    try {
        const model = c4ModelBuilder.build(parsed, 'lint');
        const found = (model.diagnostics ?? []).find(d => d.code === STYLE_DIAGNOSTIC_CODES.unknownShape);
        return found ? `${found.message} Valid shapes: ${styleShapeNames().join(', ')}.` : undefined;
    } catch {
        return undefined; // a model error is not a shape problem
    }
}

/**
 * One request to a model: the prompt in, the answer's text out.
 *
 * A provider's function must make exactly one request and must not retry: the
 * loop counts every call against the attempt budget. It rejects when the
 * request itself fails (a refused key, no consent, a quota, a lost model); the
 * loop passes that rejection straight to its caller without a repair pass,
 * because a repair prompt cannot fix a request that never reached the model.
 * An empty answer resolves to '' and counts as a failed attempt.
 */
export type CompleteFn = (prompt: string) => Promise<string>;

/**
 * Attempts per model: one initial attempt plus at most two repair passes.
 */
export const ATTEMPTS_PER_MODEL = 3;

/**
 * Strip markdown fences and sanitise HTML tags from relationship labels.
 *
 * Returns the cleaned C4X DSL string ready for the parser, or an empty
 * string when no code block could be extracted.
 */
export function cleanResponse(text: string): string {
    let clean = text.trim();

    // 1. Extract Code Block if present
    const codeBlockRegex = /```(?:c4x)?\s*([\s\S]*?)```/i;
    const match = text.match(codeBlockRegex);
    if (match && match[1]) {
        clean = match[1].trim();
    } else {
        // Fallback: cleaning of common conversational usage if no block found
        if (clean.startsWith('```c4x')) { clean = clean.substring(6); }
        else if (clean.startsWith('```')) { clean = clean.substring(3); }
        if (clean.endsWith('```')) { clean = clean.substring(0, clean.length - 3); }
    }

    // 2. Sanitize Relationship Labels: Remove <br>, <br/>, </br> tags
    // Matches: -->, ..>, ==>, -.-> followed by |Label|
    clean = clean.replace(/((?:--|\.\.|-\.-|==)>\s*\|)([^|]+)(\|)/g, (match, arrowPart, label, endPipe) => {
        const cleanLabel = label.replace(/<\/?br\s*\/?>/gi, ' ');
        return `${arrowPart}${cleanLabel}${endPipe}`;
    });

    return clean.trim();
}

/**
 * Make one attempt through `complete`, validate the answer with the C4X parser,
 * and on a syntax error re-prompt with the fix prompt until `maxRetries`
 * attempts have been made (self-correction loop). Throws the last validation
 * error when the budget is spent, or the request's own error at once.
 *
 * `modelName` is only reported (progress and log); `complete` is already bound
 * to the model it calls.
 */
export async function runRepairLoop(
    complete: CompleteFn,
    modelName: string,
    currentPrompt: string,
    attempt: number,
    maxRetries: number,
    parser: C4XParser,
    progress?: vscode.Progress<{ message?: string }>
): Promise<string> {
    const isRetry = attempt > 1;
    const statusMsg = isRetry
        ? `Auto-Correcting Syntax Error (Attempt ${attempt}/${maxRetries})...`
        : `Generating with ${modelName}...`;

    progress?.report({ message: statusMsg });
    console.log(`[SyntaxValidator] ${statusMsg}`);

    // Rejects when the request fails, like a blocked Gemini answer; '' for an
    // empty one, which the validation below turns into a self-correction pass.
    const rawText = await complete(currentPrompt);

    // Log raw response for debugging
    console.log(`[SyntaxValidator] Raw Response (${rawText.length} chars)`);

    // Self-Correction: Validate with Parser
    try {
        // Clean the response (may throw on lazy sprite syntax)
        const cleanedText = cleanResponse(rawText);

        // If the cleaned text is empty, it means we failed to extract a block -> Retry
        if (!cleanedText) { throw new Error("No C4X code block found in response."); }

        progress?.report({ message: "Validating Syntax..." });
        const parsed = parser.parse(cleanedText);
        const shapeProblem = unknownShapeProblem(parsed);
        if (shapeProblem && attempt < maxRetries) { throw new Error(shapeProblem); }
        return cleanedText; // Valid! (an unknown shape on the last attempt is a lint warning, not a failure)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (validationError: any) {
        console.warn(`Validation failed for ${modelName}: ${validationError.message}`);

        if (attempt < maxRetries) {
            progress?.report({ message: "Syntax Error Detected. Applying Fix..." });
            console.log(`Re-prompting ${modelName} for fix...`);

            const fixPrompt = buildFixPrompt(rawText, validationError.message);
            return runRepairLoop(complete, modelName, fixPrompt, attempt + 1, maxRetries, parser, progress);
        }

        // If retries exhausted, throw validation error to trigger fallback mechanism
        throw validationError;
    }
}
