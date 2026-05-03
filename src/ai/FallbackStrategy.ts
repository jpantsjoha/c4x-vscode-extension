// Smart model fallback / elevation logic for the C4X AI Agent.
//
// Extracted from GeminiService.ts as part of WS-5 decomposition.
// Independently testable — no VS Code UI dependencies beyond progress reporting.

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import * as vscode from 'vscode';
import { C4XParser } from '../parser/C4XParser';
import { DEFAULT_MODEL, PRO_MODEL } from './models';
import { executeWithRetry } from './SyntaxValidator';

// BUILD_ID for debugging version issues
const BUILD_ID = '20260502-V140-FLASH-DEFAULT';

/**
 * Generate C4X DSL with automatic model fallback.
 *
 * Strategy:
 *   1. Try the user's configured model (or DEFAULT_MODEL).
 *   2. If that fails entirely, elevate to PRO_MODEL (unless already on it).
 *   3. If PRO_MODEL also fails, surface a clear error.
 *
 * Each model attempt includes up to `maxRetries` self-correction passes
 * via the parser-driven retry loop in SyntaxValidator.
 */
export async function generateWithFallback(
    genAI: GoogleGenerativeAI,
    primaryModel: GenerativeModel,
    prompt: string,
    progress?: vscode.Progress<{ message?: string }>
): Promise<string> {
    console.log(`[FallbackStrategy] BUILD_ID: ${BUILD_ID}`);

    const parser = new C4XParser();
    const maxRetries = 3; // Integrated self-correction

    const config = vscode.workspace.getConfiguration('c4x.ai');
    // Default to gemini-3-flash-preview (fast, free-tier). User can override via settings.
    const primaryModelName = config.get<string>('model') || DEFAULT_MODEL;

    // Helper to get model instance
    const getModel = (name: string) => genAI.getGenerativeModel({ model: name });

    try {
        return await executeWithRetry(primaryModel, primaryModelName, prompt, 1, maxRetries, parser, progress);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        // Smart fallback: Elevate to PRO_MODEL if user's default model fails.
        // If already on pro, no further fallback — surface the error.
        let fallbackModelName = PRO_MODEL;
        if (primaryModelName === PRO_MODEL) {
            fallbackModelName = DEFAULT_MODEL;
        }

        if (primaryModelName !== fallbackModelName) {
            progress?.report({ message: `Model failed. Trying ${fallbackModelName}...` });
            console.warn(`[FallbackStrategy] "${primaryModelName}" failed: ${error.message}. Falling back to "${fallbackModelName}".`);

            const fallbackModel = getModel(fallbackModelName);
            if (fallbackModel) {
                try {
                    return await executeWithRetry(fallbackModel, fallbackModelName, prompt, 1, maxRetries, parser, progress);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } catch (fallbackError: any) {
                    console.error(`[FallbackStrategy] Fallback "${fallbackModelName}" also failed: ${fallbackError.message}`);
                }
            }
        }

        // Both models failed — surface clear error with guidance
        throw new Error(
            `AI generation failed with "${primaryModelName}". ` +
            `Check your model selection in Settings > C4X > AI > Model. ` +
            `See https://ai.google.dev/gemini-api/docs/models for available models.`
        );
    }
}
