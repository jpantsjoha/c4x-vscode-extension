import * as assert from 'assert';

// Mock vscode module before importing PromptBuilder (which imports vscode at module level)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]) {
    if (request === 'vscode') {
        // Return path to our mock — uses the __mocks__ convention
        return require.resolve('../__mocks__/vscode');
    }
    return originalResolveFilename.call(this, request, ...args);
};

import { buildVisualDiagramPrompt, buildVisualFixPrompt } from '../../ai/PromptBuilder';

describe('buildVisualDiagramPrompt', () => {
    const sampleText = 'A web application with a React frontend, Node.js API, and PostgreSQL database';
    const defaultArgs = {
        sanitizedText: sampleText,
        c4Level: 'C2',
        direction: 'TB' as const,
        framework: 'C4' as const,
        reasoning: 'Text describes containers',
        userGrounding: 'Elegant, simple C4 model diagram',
        layoutPreference: 'balanced',
        layoutHint: 'Use standard spacing between nodes.'
    };

    function callPrompt(overrides: Partial<typeof defaultArgs> = {}): string {
        const args = { ...defaultArgs, ...overrides };
        return buildVisualDiagramPrompt(
            args.sanitizedText,
            args.c4Level,
            args.direction,
            args.framework,
            args.reasoning,
            args.userGrounding,
            args.layoutPreference,
            args.layoutHint
        );
    }

    // =========================================================================
    // C4 Framework — Color Palette
    // =========================================================================

    describe('C4 color palette enforcement', () => {
        it('should include Person color #08427B', () => {
            const prompt = callPrompt();
            assert.ok(prompt.includes('#08427B'), 'Prompt must specify Person color #08427B');
        });

        it('should include Software System color #1168BD', () => {
            const prompt = callPrompt();
            assert.ok(prompt.includes('#1168BD'), 'Prompt must specify Software System color #1168BD');
        });

        it('should include External System color #999999', () => {
            const prompt = callPrompt();
            assert.ok(prompt.includes('#999999'), 'Prompt must specify External System color #999999');
        });

        it('should include Container color #438DD5', () => {
            const prompt = callPrompt();
            assert.ok(prompt.includes('#438DD5'), 'Prompt must specify Container color #438DD5');
        });

        it('should include Component color #85BBF0', () => {
            const prompt = callPrompt();
            assert.ok(prompt.includes('#85BBF0'), 'Prompt must specify Component color #85BBF0');
        });

        it('should include Arrow color #707070', () => {
            const prompt = callPrompt();
            assert.ok(prompt.includes('#707070'), 'Prompt must specify Arrow color #707070');
        });

        it('should forbid green, red, yellow, orange for structural elements', () => {
            const prompt = callPrompt();
            assert.ok(prompt.includes('FORBIDDEN COLORS'), 'Prompt must state forbidden colors');
            assert.ok(prompt.includes('green'), 'Prompt must mention green as forbidden');
            assert.ok(prompt.includes('red'), 'Prompt must mention red as forbidden');
            assert.ok(prompt.includes('yellow'), 'Prompt must mention yellow as forbidden');
            assert.ok(prompt.includes('orange'), 'Prompt must mention orange as forbidden');
        });
    });

    // =========================================================================
    // C4 Framework — Shape Conventions
    // =========================================================================

    describe('C4 shape conventions', () => {
        it('should require stick figure for Person elements', () => {
            const prompt = callPrompt();
            assert.ok(
                prompt.toLowerCase().includes('stick figure'),
                'Prompt must require stick figure icon for Person elements'
            );
        });

        it('should require cylinder shape for Database elements', () => {
            const prompt = callPrompt();
            assert.ok(
                prompt.toLowerCase().includes('cylinder'),
                'Prompt must require cylinder shape for Database elements'
            );
        });

        it('should require rounded rectangles for nodes', () => {
            const prompt = callPrompt();
            assert.ok(
                prompt.toLowerCase().includes('rounded rectangle'),
                'Prompt must specify rounded rectangles for system/container nodes'
            );
        });

        it('should require uniform sizing for same-type elements', () => {
            const prompt = callPrompt();
            assert.ok(
                prompt.includes('UNIFORM SIZE'),
                'Prompt must enforce uniform sizing for same-type elements'
            );
        });

        it('should specify minimum element size', () => {
            const prompt = callPrompt();
            assert.ok(
                prompt.includes('180px') || prompt.includes('Minimum Element Size'),
                'Prompt must specify minimum element dimensions'
            );
        });
    });

    // =========================================================================
    // C4 Framework — Layout Rules
    // =========================================================================

    describe('C4 layout rules', () => {
        it('should enforce person placement at top', () => {
            const prompt = callPrompt();
            assert.ok(
                prompt.includes('TOP-LEFT') || prompt.includes('TOP-CENTER'),
                'Prompt must enforce person placement at top of diagram'
            );
        });

        it('should enforce vertical chaining', () => {
            const prompt = callPrompt();
            assert.ok(
                prompt.includes('Vertical Chaining'),
                'Prompt must enforce vertical chaining of dependencies'
            );
        });

        it('should enforce anti fan-out', () => {
            const prompt = callPrompt();
            assert.ok(
                prompt.includes('Anti Fan-Out'),
                'Prompt must enforce anti fan-out (user connects only to entry points)'
            );
        });

        it('should require orthogonal arrow routing', () => {
            const prompt = callPrompt();
            assert.ok(
                prompt.toLowerCase().includes('orthogonal'),
                'Prompt must require orthogonal (right-angle) arrow routing'
            );
        });
    });

    // =========================================================================
    // C4 Framework — Boundary Rules
    // =========================================================================

    describe('C4 boundary rules', () => {
        it('should require dashed borders for boundaries', () => {
            const prompt = callPrompt();
            assert.ok(
                prompt.toLowerCase().includes('dashed'),
                'Prompt must require dashed borders for boundary boxes'
            );
        });

        it('should require transparent background for boundaries', () => {
            const prompt = callPrompt();
            assert.ok(
                prompt.toLowerCase().includes('transparent') || prompt.includes('NO fill'),
                'Prompt must require transparent/no-fill background for boundaries'
            );
        });
    });

    // =========================================================================
    // C4 Framework — Legend
    // =========================================================================

    describe('C4 legend requirement', () => {
        it('should require a legend in the bottom-right corner', () => {
            const prompt = callPrompt();
            assert.ok(
                prompt.includes('Legend') || prompt.includes('Key'),
                'Prompt must require a legend/key box'
            );
            assert.ok(
                prompt.includes('bottom-right'),
                'Prompt must specify legend placement at bottom-right'
            );
        });
    });

    // =========================================================================
    // C4 Framework — Structural-Only Rule
    // =========================================================================

    describe('C4 structural-only rule', () => {
        it('should forbid invented types like Goal, Decision, Process', () => {
            const prompt = callPrompt();
            assert.ok(prompt.includes('DO NOT invent types'), 'Prompt must forbid inventing types');
            assert.ok(prompt.includes('Goal()'), 'Prompt must explicitly forbid Goal()');
            assert.ok(prompt.includes('Decision()'), 'Prompt must explicitly forbid Decision()');
            assert.ok(prompt.includes('Process()'), 'Prompt must explicitly forbid Process()');
        });
    });

    // =========================================================================
    // C4 Framework — Level-Specific Differentiation
    // =========================================================================

    describe('C4 level-specific rules', () => {
        it('should include C1-specific guidance for System Context level', () => {
            const prompt = callPrompt({ c4Level: 'C1' });
            assert.ok(
                prompt.includes('C1 - System Context') || prompt.includes('System Context'),
                'C1 prompt must identify itself as System Context level'
            );
            assert.ok(
                prompt.includes('CENTER') || prompt.includes('single box'),
                'C1 prompt must describe the central system positioning'
            );
        });

        it('should include C2-specific guidance for Container level', () => {
            const prompt = callPrompt({ c4Level: 'C2' });
            assert.ok(
                prompt.includes('C2 - Container') || prompt.includes('Container'),
                'C2 prompt must identify itself as Container level'
            );
            assert.ok(
                prompt.toLowerCase().includes('protocol') || prompt.toLowerCase().includes('technology'),
                'C2 prompt must require technology/protocol labels on relationships'
            );
        });

        it('should include C3-specific guidance for Component level', () => {
            const prompt = callPrompt({ c4Level: 'C3' });
            assert.ok(
                prompt.includes('C3 - Component') || prompt.includes('Component'),
                'C3 prompt must identify itself as Component level'
            );
            assert.ok(
                prompt.includes('#85BBF0') || prompt.includes('lighter blue'),
                'C3 prompt must specify lighter blue for components'
            );
        });
    });

    // =========================================================================
    // C4 Framework — Direction Handling
    // =========================================================================

    describe('C4 direction handling', () => {
        it('should include Top-to-Bottom for TB direction', () => {
            const prompt = callPrompt({ direction: 'TB' });
            assert.ok(
                prompt.includes('Top-to-Bottom'),
                'TB direction must produce "Top-to-Bottom" in prompt'
            );
        });

        it('should include Left-to-Right for LR direction', () => {
            const prompt = callPrompt({ direction: 'LR' });
            assert.ok(
                prompt.includes('Left-to-Right'),
                'LR direction must produce "Left-to-Right" in prompt'
            );
        });
    });

    // =========================================================================
    // Shared Quality Rules (present in all frameworks)
    // =========================================================================

    describe('shared image quality requirements', () => {
        const frameworks: Array<'C4' | 'Sequence' | 'Flowchart'> = ['C4', 'Sequence', 'Flowchart'];

        for (const framework of frameworks) {
            describe(`${framework} framework`, () => {
                it('should include minimum resolution requirement', () => {
                    const prompt = callPrompt({ framework });
                    assert.ok(
                        prompt.includes('1400px') || prompt.includes('high resolution'),
                        `${framework} prompt must specify minimum resolution`
                    );
                });

                it('should include minimum font size requirement', () => {
                    const prompt = callPrompt({ framework });
                    assert.ok(
                        prompt.includes('14px') || prompt.includes('font size'),
                        `${framework} prompt must specify minimum font size`
                    );
                });

                it('should include text contrast requirement', () => {
                    const prompt = callPrompt({ framework });
                    assert.ok(
                        prompt.includes('contrast') || prompt.includes('WCAG'),
                        `${framework} prompt must enforce text contrast`
                    );
                });

                it('should include negative patterns (common mistakes)', () => {
                    const prompt = callPrompt({ framework });
                    assert.ok(
                        prompt.includes('COMMON MISTAKES TO AVOID') || prompt.includes('NEGATIVE PATTERNS'),
                        `${framework} prompt must include common mistakes to avoid`
                    );
                });

                it('should forbid blurry/pixelated text', () => {
                    const prompt = callPrompt({ framework });
                    assert.ok(
                        prompt.toLowerCase().includes('blurry') || prompt.toLowerCase().includes('pixelated'),
                        `${framework} prompt must forbid blurry or pixelated text`
                    );
                });

                it('should forbid overlapping labels', () => {
                    const prompt = callPrompt({ framework });
                    assert.ok(
                        prompt.toLowerCase().includes('overlap'),
                        `${framework} prompt must forbid overlapping labels`
                    );
                });

                it('should require white background by default', () => {
                    const prompt = callPrompt({ framework });
                    assert.ok(
                        prompt.includes('#FFFFFF') || prompt.toLowerCase().includes('white'),
                        `${framework} prompt must specify white background as default`
                    );
                });

                it('should require anti-aliasing', () => {
                    const prompt = callPrompt({ framework });
                    assert.ok(
                        prompt.toLowerCase().includes('anti-alias'),
                        `${framework} prompt must require anti-aliasing`
                    );
                });

                it('should include diagram title instruction', () => {
                    const prompt = callPrompt({ framework });
                    assert.ok(
                        prompt.toLowerCase().includes('title'),
                        `${framework} prompt must instruct inclusion of a diagram title`
                    );
                });
            });
        }
    });

    // =========================================================================
    // Sequence Framework
    // =========================================================================

    describe('Sequence framework specifics', () => {
        it('should require numbered steps', () => {
            const prompt = callPrompt({ framework: 'Sequence' });
            assert.ok(
                prompt.includes('Numbered Steps') || prompt.includes('numbered'),
                'Sequence prompt must require numbered interaction steps'
            );
        });

        it('should require C4-compatible colors', () => {
            const prompt = callPrompt({ framework: 'Sequence' });
            assert.ok(prompt.includes('#08427B'), 'Sequence prompt must include Person color');
            assert.ok(prompt.includes('#438DD5'), 'Sequence prompt must include System color');
            assert.ok(prompt.includes('#999999'), 'Sequence prompt must include External System color');
        });

        it('should include participant rendering guidance', () => {
            const prompt = callPrompt({ framework: 'Sequence' });
            assert.ok(
                prompt.toLowerCase().includes('participant') || prompt.toLowerCase().includes('actor'),
                'Sequence prompt must include participant rendering guidance'
            );
        });

        it('should require legend for sequence diagrams', () => {
            const prompt = callPrompt({ framework: 'Sequence' });
            assert.ok(
                prompt.includes('Legend') || prompt.includes('Key'),
                'Sequence prompt must require a legend/key'
            );
        });

        it('should handle loops and cycles', () => {
            const prompt = callPrompt({ framework: 'Sequence' });
            assert.ok(
                prompt.toLowerCase().includes('loop'),
                'Sequence prompt must handle loop notation'
            );
        });

        it('should forbid non-C4 colors for participants', () => {
            const prompt = callPrompt({ framework: 'Sequence' });
            assert.ok(
                prompt.includes('FORBIDDEN'),
                'Sequence prompt must forbid non-C4 colors for participants'
            );
        });
    });

    // =========================================================================
    // Flowchart Framework
    // =========================================================================

    describe('Flowchart framework specifics', () => {
        it('should require diamond shape for decisions', () => {
            const prompt = callPrompt({ framework: 'Flowchart' });
            assert.ok(
                prompt.toLowerCase().includes('diamond'),
                'Flowchart prompt must require diamond shapes for decisions'
            );
        });

        it('should require Yes/No labels on decision branches', () => {
            const prompt = callPrompt({ framework: 'Flowchart' });
            assert.ok(
                prompt.includes('Yes') && prompt.includes('No'),
                'Flowchart prompt must specify Yes/No labels on decision branches'
            );
        });

        it('should include Start/End shape guidance', () => {
            const prompt = callPrompt({ framework: 'Flowchart' });
            assert.ok(
                prompt.includes('Start') && prompt.includes('End'),
                'Flowchart prompt must include Start/End shape guidance'
            );
        });

        it('should include color palette for flowchart shapes', () => {
            const prompt = callPrompt({ framework: 'Flowchart' });
            assert.ok(prompt.includes('#438DD5'), 'Flowchart must use blue for process steps');
            assert.ok(prompt.includes('#08427B'), 'Flowchart must use dark blue for decisions');
        });

        it('should require arrow labels on all arrows', () => {
            const prompt = callPrompt({ framework: 'Flowchart' });
            assert.ok(
                prompt.toLowerCase().includes('all arrows must have labels'),
                'Flowchart prompt must require labels on all arrows'
            );
        });

        it('should require orthogonal routing in flowcharts', () => {
            const prompt = callPrompt({ framework: 'Flowchart' });
            assert.ok(
                prompt.toLowerCase().includes('orthogonal'),
                'Flowchart prompt must require orthogonal arrow routing'
            );
        });
    });

    // =========================================================================
    // User Input Passthrough
    // =========================================================================

    describe('user input passthrough', () => {
        it('should include the sanitized text in the prompt', () => {
            const prompt = callPrompt({ sanitizedText: 'My custom architecture description' });
            assert.ok(
                prompt.includes('My custom architecture description'),
                'Prompt must include the user-provided sanitized text'
            );
        });

        it('should truncate long text to 3000 characters', () => {
            const longText = 'A'.repeat(5000);
            const prompt = callPrompt({ sanitizedText: longText });
            // The prompt should include the truncated text (3000 chars)
            // and NOT include the full 5000 chars
            const textOccurrences = prompt.split('A'.repeat(3000));
            assert.ok(
                textOccurrences.length >= 2,
                'Prompt should include at least 3000 chars of the input'
            );
            // Verify truncation happened — the 5000-char string should not appear in full
            assert.ok(
                !prompt.includes('A'.repeat(3001)),
                'Prompt should truncate text at 3000 characters'
            );
        });

        it('should include visual style context', () => {
            const prompt = callPrompt({ userGrounding: 'Dark theme with neon accents' });
            assert.ok(
                prompt.includes('Dark theme with neon accents'),
                'Prompt must include the user grounding/visual style context'
            );
        });

        it('should include layout preference', () => {
            const prompt = callPrompt({ layoutPreference: 'compact' });
            assert.ok(
                prompt.includes('compact'),
                'Prompt must include the layout preference'
            );
        });

        it('should include layout hint', () => {
            const prompt = callPrompt({ layoutHint: 'Use TIGHT spacing' });
            assert.ok(
                prompt.includes('Use TIGHT spacing'),
                'Prompt must include the layout hint'
            );
        });

        it('should include the reasoning context', () => {
            const prompt = callPrompt({ reasoning: 'Detected microservices pattern' });
            assert.ok(
                prompt.includes('Detected microservices pattern'),
                'Prompt must include the AI reasoning context'
            );
        });
    });
});

describe('buildVisualFixPrompt', () => {
    it('should include the failure reason', () => {
        const prompt = buildVisualFixPrompt('original prompt text', 'no image returned');
        assert.ok(
            prompt.includes('no image returned'),
            'Fix prompt must include the failure reason'
        );
    });

    it('should include the original prompt', () => {
        const prompt = buildVisualFixPrompt('Generate a C4 diagram of the banking system', 'empty response');
        assert.ok(
            prompt.includes('Generate a C4 diagram of the banking system'),
            'Fix prompt must include the original prompt'
        );
    });

    it('should include corrective instructions', () => {
        const prompt = buildVisualFixPrompt('original', 'failure');
        assert.ok(
            prompt.includes('CORRECTIVE INSTRUCTIONS'),
            'Fix prompt must include corrective instructions section'
        );
    });

    it('should mention common fixes', () => {
        const prompt = buildVisualFixPrompt('original', 'failure');
        assert.ok(prompt.includes('no image returned'), 'Fix prompt must address no-image scenario');
        assert.ok(prompt.includes('text too small'), 'Fix prompt must address text sizing');
        assert.ok(prompt.includes('wrong colors'), 'Fix prompt must address color issues');
    });

    it('should explicitly require PNG output', () => {
        const prompt = buildVisualFixPrompt('original', 'failure');
        assert.ok(
            prompt.toLowerCase().includes('png') || prompt.includes('image'),
            'Fix prompt must require image/PNG output'
        );
    });
});
