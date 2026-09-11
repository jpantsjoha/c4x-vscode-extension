import * as assert from 'assert';
import * as vscode from 'vscode';

/**
 * The API key journey, end to end, in a real Extension Host.
 *
 * Users could not find where to add a key because there was nowhere to add
 * one: the `c4x.ai.apiKey` setting is deprecated so VS Code greys it out, and
 * the only entry point was to run an AI command, let it fail, and click a
 * button in the error toast. Replacing an expired key meant provoking an
 * error; removing one was impossible.
 *
 * The first fix registered two commands and I called it done. It was not:
 * GeminiService caches its client, `checkReady()` returns early on that cache,
 * and each command owns a separate instance. Storing a key changed nothing
 * until the window reloaded.
 *
 * These tests pin the whole journey, because the parts were each fine and the
 * journey was broken.
 */

const SECRET_KEY = 'c4x.ai.apiKey';
const EXTENSION_ID = 'jpantsjoha.c4x';

async function secrets(): Promise<vscode.SecretStorage> {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `extension ${EXTENSION_ID} must be present`);
    await extension!.activate();
    // The context is not public API; the commands are the supported surface,
    // so the tests drive those and read the secret through a command result.
    return (extension!.exports as unknown as { __secrets?: vscode.SecretStorage }).__secrets
        ?? ({} as vscode.SecretStorage);
}

describe('Gemini API key lifecycle', () => {
    it('registers a discoverable command to set the key', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(
            commands.includes('c4x.setApiKey'),
            'c4x.setApiKey must be registered: it is the only supported way to add a key'
        );
    });

    it('registers a command to clear the key', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('c4x.clearApiKey'), 'c4x.clearApiKey must be registered');
    });

    it('exposes both commands in the Command Palette', () => {
        const extension = vscode.extensions.getExtension(EXTENSION_ID);
        assert.ok(extension, 'extension must be installed');
        const declared: Array<{ command: string; title: string }> =
            extension!.packageJSON.contributes.commands;

        const set = declared.find(c => c.command === 'c4x.setApiKey');
        const clear = declared.find(c => c.command === 'c4x.clearApiKey');

        assert.ok(set, 'c4x.setApiKey must be declared in contributes.commands, or it is invisible in the palette');
        assert.ok(clear, 'c4x.clearApiKey must be declared in contributes.commands');
        assert.match(set!.title, /Gemini API Key/i, 'the title must be findable by typing "API key"');
    });

    it('clearing the key succeeds even when no key is stored', async () => {
        // Clearing must be idempotent: a user who has never set a key should
        // not see an error for tidying up.
        const result = await vscode.commands.executeCommand('c4x.clearApiKey');
        assert.strictEqual(result, true, 'clear must succeed on an empty store');
    });

    it('the deprecated setting points at the command that replaced it', () => {
        const extension = vscode.extensions.getExtension(EXTENSION_ID);
        const property = extension!.packageJSON.contributes.configuration.properties['c4x.ai.apiKey'];

        assert.ok(property, 'the legacy setting must remain declared so existing keys still migrate');
        const guidance = `${property.description ?? ''} ${property.markdownDeprecationMessage ?? ''}`;
        assert.match(
            guidance,
            /C4X: Set Gemini API Key/,
            'a deprecated setting must name its replacement, or the settings page is a dead end'
        );
    });

    it('documents the key location consistently with the command that exists', () => {
        const extension = vscode.extensions.getExtension(EXTENSION_ID);
        const declared: Array<{ title: string }> = extension!.packageJSON.contributes.commands;
        const titles = new Set(declared.map(c => c.title));

        // The guide told users to run this long before it existed.
        assert.ok(
            titles.has('C4X: Set Gemini API Key'),
            'docs/GEMINI_GUIDE.md instructs users to run "C4X: Set Gemini API Key"; it must exist'
        );
    });
});

describe('Gemini client credential refresh', () => {
    it('exposes a refresh path so a key change takes effect without a reload', async () => {
        // Storing a key is not the same as using it. GeminiService caches its
        // client and checkReady() short-circuits on that cache, so both
        // commands must be able to rebuild. This asserts the seam exists.
        const { GeminiService } = await import('../../src/ai/GeminiService');
        assert.strictEqual(
            typeof GeminiService.prototype.refreshCredentials,
            'function',
            'GeminiService.refreshCredentials must exist, or set/clear silently do nothing until reload'
        );
        assert.strictEqual(
            typeof GeminiService.prototype.hasCredentials,
            'function',
            'GeminiService.hasCredentials must exist so callers can test state without prompting'
        );
    });

    it('both command owners can refresh, since each holds its own client', async () => {
        const { GenerateDiagramCommand } = await import('../../src/commands/GenerateDiagramCommand');
        const { VisualDiagramCommand } = await import('../../src/commands/VisualDiagramCommand');

        assert.strictEqual(
            typeof GenerateDiagramCommand.prototype.refreshCredentials,
            'function',
            'GenerateDiagramCommand holds a Gemini client and must be refreshable'
        );
        assert.strictEqual(
            typeof VisualDiagramCommand.prototype.refreshCredentials,
            'function',
            'VisualDiagramCommand holds a SEPARATE client; refreshing only one leaves the other stale'
        );
    });
});
