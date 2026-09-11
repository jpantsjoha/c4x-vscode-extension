import * as assert from 'assert';
import pkg from '../../../package.json';
import grammar from '../../../syntaxes/c4x.tmLanguage.json';

const SUPPORTED_EDITOR_CONTEXT =
    'editorLangId == c4x || resourceExtname == .dsl || resourceExtname == .puml';
const SUPPORTED_RESOURCE_CONTEXT =
    'resourceLangId == c4x || resourceExtname == .dsl || resourceExtname == .puml';

describe('Preview command manifest contributions', () => {
    const commands: { command: string; title: string }[] = pkg.contributes.commands;
    const commandIds = commands.map((c) => c.command);

    it('contributes c4x.openPreview', () => {
        assert.ok(
            commandIds.includes('c4x.openPreview'),
            'c4x.openPreview missing from contributes.commands'
        );
    });

    it('contributes c4x.refreshPreview', () => {
        assert.ok(
            commandIds.includes('c4x.refreshPreview'),
            'c4x.refreshPreview missing from contributes.commands'
        );
    });

    it('c4x.openPreview has correct title', () => {
        const entry = commands.find((c) => c.command === 'c4x.openPreview');
        assert.ok(entry, 'c4x.openPreview entry not found');
        assert.ok(entry.title.includes('Preview'), `Title should mention Preview, got: ${entry.title}`);
    });

    it('c4x.refreshPreview has correct title', () => {
        const entry = commands.find((c) => c.command === 'c4x.refreshPreview');
        assert.ok(entry, 'c4x.refreshPreview entry not found');
        assert.ok(entry.title.includes('Preview'), `Title should mention Preview, got: ${entry.title}`);
    });

    describe('keybindings', () => {
        const keybindings: { key?: string; mac?: string; command: string; when?: string }[] =
            pkg.contributes.keybindings ?? [];

        it('has a keybinding for c4x.openPreview', () => {
            const kb = keybindings.find((k) => k.command === 'c4x.openPreview');
            assert.ok(kb, 'No keybinding found for c4x.openPreview');
        });

        it('keybinding uses ctrl+k v / cmd+k v chord', () => {
            const kb = keybindings.find((k) => k.command === 'c4x.openPreview');
            assert.ok(kb, 'No keybinding found for c4x.openPreview');
            assert.strictEqual(kb.key, 'ctrl+k v', `Windows/Linux key should be ctrl+k v, got: ${kb.key}`);
            assert.strictEqual(kb.mac, 'cmd+k v', `Mac key should be cmd+k v, got: ${kb.mac}`);
        });

        it('keybinding is limited to every supported preview source format', () => {
            const kb = keybindings.find((k) => k.command === 'c4x.openPreview');
            assert.ok(kb, 'No keybinding found for c4x.openPreview');
            assert.strictEqual(kb.when, SUPPORTED_EDITOR_CONTEXT);
        });
    });

    describe('menus', () => {
        it('c4x.openPreview appears in editor/context for supported source files', () => {
            const editorContext: { command: string; when?: string }[] =
                pkg.contributes.menus['editor/context'] ?? [];
            const entry = editorContext.find((m) => m.command === 'c4x.openPreview');
            assert.ok(entry, 'c4x.openPreview not found in editor/context menu');
            assert.strictEqual(entry.when, SUPPORTED_RESOURCE_CONTEXT);
        });

        it('c4x.openPreview appears in editor/title/context for supported source files', () => {
            const titleContext: { command: string; when?: string }[] =
                pkg.contributes.menus['editor/title/context'] ?? [];
            const entry = titleContext.find((m) => m.command === 'c4x.openPreview');
            assert.ok(entry, 'c4x.openPreview not found in editor/title/context menu');
            assert.strictEqual(entry.when, SUPPORTED_RESOURCE_CONTEXT);
        });
    });
});

describe('C4X TextMate grammar', () => {
    it('loads as JSON and recognizes a C4 diagram directive', () => {
        const directivePattern = grammar.repository.directives.patterns[0].match;

        assert.strictEqual(grammar.scopeName, 'source.c4x');
        assert.strictEqual(
            directivePattern,
            '%%\\{\\s*c4:\\s*(system-context|container|component)\\s*\\}%%'
        );
        assert.match('%%{ c4: container }%%', /%%\{\s*c4:\s*(system-context|container|component)\s*\}%%/);
    });
});
