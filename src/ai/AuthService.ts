import * as vscode from 'vscode';

/**
 * Shared authentication service for Gemini API key management.
 *
 * Centralises the auth-flow that was previously duplicated in
 * GenerateDiagramCommand and VisualDiagramCommand.
 *
 * Keys are stored exclusively in VS Code SecretStorage (encrypted).
 * The `c4x.ai.apiKey` VS Code setting is deprecated and will be
 * auto-migrated on first access — see GeminiService.initialize().
 */

/**
 * Prompt the user for a Gemini API key and store it in SecretStorage.
 *
 * @returns the trimmed API key, or `undefined` if the user cancelled.
 */
export async function promptForApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
    const key = await vscode.window.showInputBox({
        placeHolder: 'Paste your Google Gemini API Key here (starts with AIza...)',
        prompt: 'Enter API Key to enable C4X AI Architect',
        password: true,
        ignoreFocusOut: true
    });

    if (key && key.trim().length > 0) {
        const trimmed = key.trim();
        await context.secrets.store('c4x.ai.apiKey', trimmed);
        return trimmed;
    }

    return undefined;
}

/**
 * Show a warning that the API key is missing and offer options to
 * obtain or enter one.  Returns the key if the user completes the
 * flow, or `undefined` if they cancel.
 */
export async function ensureApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
    const choice = await vscode.window.showWarningMessage(
        'Gemini API Key is missing. Connect to Google Gemini to proceed.',
        'Get Free Key',
        'Enter Key'
    );

    if (choice === 'Get Free Key') {
        vscode.env.openExternal(vscode.Uri.parse('https://aistudio.google.com/app/apikey'));
        return await promptForApiKey(context);
    } else if (choice === 'Enter Key') {
        return await promptForApiKey(context);
    }

    return undefined;
}
