// Self-correction and response-cleaning logic for AI-generated C4X DSL.
//
// Extracted from GeminiService.ts as part of WS-5 decomposition.
// Independently testable — the core functions are pure (no VS Code state),
// except for progress reporting passed through as an optional callback.

import { GenerativeModel } from '@google/generative-ai';
import * as vscode from 'vscode';
import { C4XParser } from '../parser/C4XParser';
import { buildFixPrompt } from './PromptBuilder';

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
 * Execute a single generation attempt against a model, then validate the
 * output with the C4X parser.  On syntax errors, re-prompt with a fix
 * prompt up to `maxRetries` times (self-correction loop).
 */
export async function executeWithRetry(
    modelInstance: GenerativeModel,
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

    const result = await modelInstance.generateContent(currentPrompt);
    const response = await result.response;
    const rawText = response.text();

    // Log raw response for debugging
    console.log(`[SyntaxValidator] Raw Response (${rawText.length} chars)`);

    // Self-Correction: Validate with Parser
    try {
        // Clean the response (may throw on lazy sprite syntax)
        const cleanedText = cleanResponse(rawText);

        // If the cleaned text is empty, it means we failed to extract a block -> Retry
        if (!cleanedText) { throw new Error("No C4X code block found in response."); }

        progress?.report({ message: "Validating Syntax..." });
        parser.parse(cleanedText);
        return cleanedText; // Valid!
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (validationError: any) {
        console.warn(`Validation failed for ${modelName}: ${validationError.message}`);

        if (attempt < maxRetries) {
            progress?.report({ message: "Syntax Error Detected. Applying Fix..." });
            console.log(`Re-prompting ${modelName} for fix...`);

            const fixPrompt = buildFixPrompt(rawText, validationError.message);
            return executeWithRetry(modelInstance, modelName, fixPrompt, attempt + 1, maxRetries, parser, progress);
        }

        // If retries exhausted, throw validation error to trigger fallback mechanism
        throw validationError;
    }
}
