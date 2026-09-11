import { GoogleGenerativeAI, GenerativeModel, Part, InlineDataPart } from '@google/generative-ai';
import * as vscode from 'vscode';
import { FileContext } from './CodeContextExtractor';
import { DEFAULT_MODEL, DEFAULT_IMAGE_MODEL, isKnownModel, getDaysUntilSunset, getSunsetDate } from './models';
import { buildGenerationPrompt, buildRecommendationPrompt, buildFrameworkDetectionPrompt, buildVisualDiagramPrompt, buildVisualFixPrompt } from './PromptBuilder';
import { generateWithFallback } from './FallbackStrategy';

export class GeminiService {
    private genAI: GoogleGenerativeAI | undefined;
    private model: GenerativeModel | undefined;

    private context: vscode.ExtensionContext;

    /** Track which model IDs have already shown warnings this session to avoid spamming. */
    private modelWarningsShown = new Set<string>();

    /** Prevents showing the plaintext-key migration notice more than once per session. */
    private keyMigrated = false;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.initialize();
    }

    public async checkReady(): Promise<boolean> {
        if (this.model) { return true; }
        await this.initialize();
        return !!this.model;
    }

    public async saveKey(key: string): Promise<void> {
        await this.context.secrets.store('c4x.ai.apiKey', key);
        await this.refreshCredentials();
    }

    /**
     * Drop the cached client and rebuild it from whatever key is stored now.
     *
     * `checkReady()` short-circuits on a cached `model`, so a key changed
     * underneath a live service was ignored until the window reloaded: setting
     * a new key appeared to succeed while generation kept using the old one,
     * and clearing a key left generation working. Any code path that changes
     * the stored key must call this.
     */
    public async refreshCredentials(): Promise<void> {
        this.genAI = undefined;
        this.model = undefined;
        await this.initialize();
    }

    /** True when a usable client is cached. Does not prompt and does not initialise. */
    public hasCredentials(): boolean {
        return !!this.model;
    }

    public async initialize() {
        const config = vscode.workspace.getConfiguration('c4x.ai');
        let apiKey: string | undefined;

        // ── 1. Check SecretStorage first (the canonical secure location) ──
        apiKey = await this.context.secrets.get('c4x.ai.apiKey');

        // ── 2. Migrate plaintext key from VS Code settings (deprecated) ──
        if (!apiKey || apiKey.trim() === '') {
            const settingsKey = config.get<string>('apiKey');

            if (settingsKey && settingsKey.trim() !== '') {
                // Attempt automatic migration to SecretStorage
                try {
                    await this.context.secrets.store('c4x.ai.apiKey', settingsKey.trim());

                    // Clear the plaintext setting so it is not persisted
                    await config.update('apiKey', undefined, vscode.ConfigurationTarget.Global);
                    await config.update('apiKey', undefined, vscode.ConfigurationTarget.Workspace);

                    apiKey = settingsKey.trim();

                    // Show a one-time migration notice per session
                    if (!this.keyMigrated) {
                        this.keyMigrated = true;
                        vscode.window.showInformationMessage(
                            'C4X: Your API key was stored in VS Code settings (plaintext). ' +
                            'It has been migrated to secure storage and the settings entry has been cleared.'
                        );
                    }

                    console.log('[GeminiService] API key migrated from plaintext settings to SecretStorage.');
                } catch (migrationError) {
                    // Migration failed — keep the key in settings so the user does not lose it
                    console.warn('[GeminiService] Failed to migrate API key to SecretStorage. Key remains in settings.', migrationError);
                    apiKey = settingsKey.trim();
                }
            }
        }

        // ── 3. Fallback to environment variable (CI / development) ──
        if (!apiKey || apiKey.trim() === '') {
            apiKey = process.env.GEMINI_API_KEY;
            if (apiKey) {
                console.log('[GeminiService] Using GEMINI_API_KEY from environment (development mode)');
            }
        }

        if (apiKey) {
            this.genAI = new GoogleGenerativeAI(apiKey);
            const modelName = config.get<string>('model') || DEFAULT_MODEL;
            this.model = this.genAI.getGenerativeModel({ model: modelName });

            // G3/G4: Validate model selection and check sunset dates
            this.validateModelSelection(modelName);
        }
    }

    /**
     * G3 — Runtime model validation: warn if the model is not in the known registry.
     * G4 — Sunset alerting: warn if the model is approaching or past its sunset date.
     *
     * Each warning is shown at most once per session per model ID.
     */
    private validateModelSelection(modelId: string): void {
        // Only show each warning once per session
        if (this.modelWarningsShown.has(modelId)) {
            return;
        }

        // G3: Unknown model warning
        if (!isKnownModel(modelId)) {
            this.modelWarningsShown.add(modelId);
            vscode.window.showWarningMessage(
                `C4X: Model '${modelId}' is not in the known model registry. ` +
                `It may work if your API key supports it, but fallback behavior is not guaranteed.`
            );
            return;
        }

        // G4: Sunset alerting
        const daysLeft = getDaysUntilSunset(modelId);
        if (daysLeft === undefined) {
            // No sunset date — model is fine, no warning needed
            return;
        }

        const sunsetDate = getSunsetDate(modelId);
        const formattedDate = sunsetDate!.toISOString().split('T')[0];

        if (daysLeft <= 0) {
            // Model is already past its sunset date
            this.modelWarningsShown.add(modelId);
            vscode.window.showWarningMessage(
                `C4X: Your selected model '${modelId}' was sunset on ${formattedDate} and may no longer work. ` +
                `Falling back to '${DEFAULT_MODEL}'.`
            );
        } else if (daysLeft <= 30) {
            // Model will sunset within 30 days
            this.modelWarningsShown.add(modelId);
            vscode.window.showWarningMessage(
                `C4X: Your selected model '${modelId}' will be sunset on ${formattedDate}. ` +
                `Consider switching to '${DEFAULT_MODEL}' via Settings > C4X > AI Model.`
            );
        }
    }

    public async generateDiagram(files: FileContext[], instruction: string, options?: { direction?: 'TB' | 'LR' }): Promise<string> {
        if (!this.model) {
            // Re-try initialization in case key was added late
            await this.initialize();
            if (!this.model) {
                throw new Error('Gemini API Key not configured. Use the "Enter Key" prompt or set GEMINI_API_KEY env var.');
            }
        }

        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "C4X AI Agent",
            cancellable: false
        }, async (progress) => {
            progress.report({ message: "Analyzing context & generating diagram..." });

            const prompt = await buildGenerationPrompt(files, instruction, options);

            // Log prompt for debugging transparency
            console.log('[GeminiService] GENERATED PROMPT PREVIEW:', prompt.substring(0, 500) + '...');

            try {
                // Pass the progress object down to update status during validation/retry
                const result = await generateWithFallback(this.genAI!, this.model!, prompt, progress);
                return result;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (error: any) {
                console.error('Gemini Generation Error:', error);
                throw new Error(`Failed to generate diagram: ${error.message}`);
            }
        });
    }

    public async recommendDiagramType(text: string): Promise<{ types: string[], direction: 'TB' | 'LR', confidence: number }> {
        const fallback = { types: ['C1', 'C2', 'C3'], direction: 'TB' as const, confidence: 0 };
        if (!this.model) { return fallback; }

        const prompt = buildRecommendationPrompt(text);
        try {
            const result = await this.model.generateContent(prompt);
            const response = result.response.text();
            const clean = response.replace(/```json/g, '').replace(/```/g, '').trim();
            const recommended = JSON.parse(clean);

            const bestType = ['C1', 'C2', 'C3'].includes(recommended.bestType) ? recommended.bestType : 'C2';
            const confidence = typeof recommended.confidence === 'number' ? recommended.confidence : 0.5;
            const direction = ['TB', 'LR'].includes(recommended.direction) ? recommended.direction : 'TB';

            // If high confidence, return single type; otherwise return multiple for user choice
            if (confidence >= 0.7) {
                return { types: [bestType], direction, confidence };
            } else {
                const allTypes = ['C1', 'C2', 'C3'].filter(t => t !== bestType);
                return { types: [bestType, ...allTypes], direction, confidence };
            }

        } catch {
            return fallback;
        }
    }

    /**
     * Detect the most appropriate diagram framework for the given text.
     * Supports: C4 (structural), Sequence (behavioral/ordered), Flowchart (process/decisions)
     */
    public async detectDiagramFramework(text: string): Promise<{
        framework: 'C4' | 'Sequence' | 'Flowchart';
        confidence: number;
        reasoning: string;
    }> {
        const fallback = { framework: 'C4' as const, confidence: 0.5, reasoning: 'Default fallback' };
        if (!this.model) { return fallback; }

        // Check for explicit user hints first
        const explicitHint = text.match(/\[Framework:\s*(Sequence|Flowchart|C4|Data\s*Flow|State\s*Machine)/i);
        if (explicitHint) {
            const hint = explicitHint[1].toLowerCase();
            if (hint.includes('sequence')) {
                return { framework: 'Sequence', confidence: 1.0, reasoning: 'User explicitly specified Sequence diagram' };
            } else if (hint.includes('flow')) {
                return { framework: 'Flowchart', confidence: 1.0, reasoning: 'User explicitly specified Flowchart' };
            } else if (hint.includes('c4')) {
                return { framework: 'C4', confidence: 1.0, reasoning: 'User explicitly specified C4 diagram' };
            }
        }

        const prompt = buildFrameworkDetectionPrompt(text);

        try {
            const result = await this.model.generateContent(prompt);
            const response = result.response.text();
            const clean = response.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(clean);

            const framework = ['C4', 'Sequence', 'Flowchart'].includes(parsed.framework) ? parsed.framework : 'C4';
            const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;
            const reasoning = parsed.reasoning || 'No reasoning provided';

            console.log(`[GeminiService] Framework detected: ${framework} (confidence: ${confidence})`);
            console.log(`[GeminiService] Reasoning: ${reasoning}`);

            return { framework, confidence, reasoning };

        } catch (e) {
            console.warn('[GeminiService] Framework detection failed, defaulting to C4:', e);
            return fallback;
        }
    }

    /**
     * Generate a visual diagram as a PNG image using Gemini Image model.
     * Automatically detects the best framework (C4, Sequence, Flowchart) based on input.
     */
    public async generateVisualDiagram(
        text: string,
        c4Level: string,
        direction: 'TB' | 'LR',
        frameworkOverride?: { framework: 'C4' | 'Sequence' | 'Flowchart'; confidence: number; reasoning: string }
    ): Promise<string | null> {
        if (!this.genAI) { return null; }

        // Sanitize text: Remove existing image references to prevent the model from identifying
        // filenames (timestamps) in the selection and baking them into the new visual.
        const sanitizedText = text
            .replace(/!\[.*?\]\(.*?\)/g, '')   // Remove Markdown images
            .replace(/<img[^>]*>/g, '')        // Remove HTML images
            .replace(/\[.*?\]\(.*?\.(png|jpg|jpeg|gif|webp).*?\)/g, ''); // Remove other links to images

        // Use configurable image model (default: gemini-3.1-flash-image-preview - Nano Banana 2)
        const config = vscode.workspace.getConfiguration('c4x.ai');
        const imageModelName = config.get<string>('imageModel') || DEFAULT_IMAGE_MODEL;
        const imageModel = this.genAI.getGenerativeModel({ model: imageModelName });

        // Step 1: Detect the best diagram framework (or use override)
        let frameworkResult = frameworkOverride;
        if (!frameworkResult) {
            frameworkResult = await this.detectDiagramFramework(sanitizedText);
        }

        const { framework, confidence, reasoning } = frameworkResult;
        console.log(`[GeminiService] Using framework: ${framework} (confidence: ${confidence})`);

        // Step 2: Select reference images based on framework
        const refParts: InlineDataPart[] = [];
        const loadParamImage = async (filename: string): Promise<void> => {
            try {
                const refUri = vscode.Uri.joinPath(this.context.extensionUri, 'examples', filename);
                const stat = await vscode.workspace.fs.stat(refUri);
                if (stat.type === vscode.FileType.File) {
                    const bytes = await vscode.workspace.fs.readFile(refUri);
                    refParts.push({
                        inlineData: {
                            mimeType: 'image/png',
                            data: Buffer.from(bytes).toString('base64')
                        }
                    });
                }
            } catch (e) {
                console.warn(`Could not load visual reference ${filename}:`, e);
            }
        };

        // Framework-specific reference images
        if (framework === 'Sequence') {
            await loadParamImage('Dynamic-Sequence.png');
            await loadParamImage('Dynamic-Collaboration-key.png');
        } else if (framework === 'Flowchart') {
            await loadParamImage('Flowchart.png');
            await loadParamImage('Flowchart-key.png');
        } else {
            // C4 - use level-specific references
            let refBase = 'Containers';
            if (c4Level === 'C1') { refBase = 'SystemContext'; }
            if (c4Level === 'C3') { refBase = 'Components'; }
            await loadParamImage(`${refBase}.png`);
            await loadParamImage(`${refBase}-key.png`);
        }

        // Step 3: Read user's visual preferences
        const visualPreset = config.get<string>('visualPreset') || 'default';
        const layoutPreference = config.get<string>('layoutPreference') || 'balanced';
        const customGrounding = (config.get<string>('visualGroundingContext') || '').trim().substring(0, 300);

        // Apply visual preset (unless custom grounding provided)
        const presetStyles: Record<string, string> = {
            'default': 'Elegant, simple C4 model diagram against white background, logically organised and well spaced',
            'dark': 'Dark background (#1a1a1a or #0d1117), white/cyan text, neon blue/purple accents, high contrast, modern dark theme aesthetic',
            'light': 'Bright white background, high contrast with standard C4 colors, clean professional appearance, sharp edges',
            'pastel': 'Soft pastel color palette (light blues #B4D4FF, pinks #FFB4D4, purples #D4B4FF), rounded corners, gentle aesthetic, white background',
            'corporate': 'Professional grey-blue palette (Navy #1E3A5F, Steel Blue #4682B4, Light Grey #D3D3D3), sharp rectangular edges, business presentation ready'
        };
        const presetGrounding = presetStyles[visualPreset] || presetStyles['default'];
        const userGrounding = customGrounding || presetGrounding;

        // Apply layout preference hints
        const layoutHints: Record<string, string> = {
            'balanced': 'Use standard spacing between nodes. Arrows should be medium length.',
            'compact': 'Use TIGHT spacing to fit more elements. Keep arrows SHORT. Minimize whitespace.',
            'spacious': 'Use GENEROUS padding between all elements. Make arrows LONG with plenty of label space. Maximize readability.'
        };
        const layoutHint = layoutHints[layoutPreference] || layoutHints['balanced'];

        // Step 4: Build framework-specific prompt
        const promptText = buildVisualDiagramPrompt(
            sanitizedText, c4Level, direction, framework,
            reasoning, userGrounding, layoutPreference, layoutHint
        );

        const parts: (string | Part)[] = [promptText, ...refParts];

        if (refParts.length > 0) {
            console.log(`[GeminiService] Included ${refParts.length} reference images for ${framework}`);
        } else {
            console.warn('[GeminiService] No reference images found. Generating from text descriptions only.');
        }

        // Step 5: Generate with self-remediation retry loop
        const maxVisualRetries = 2; // 1 initial + 1 retry
        for (let attempt = 1; attempt <= maxVisualRetries; attempt++) {
            try {
                const currentParts = attempt === 1
                    ? parts
                    // On retry, use the corrective prompt (text-only, no ref images to reduce noise)
                    : [buildVisualFixPrompt(promptText, 'No image was returned on the previous attempt. Generate a PNG image.')];

                console.log(`[GeminiService] Visual generation attempt ${attempt}/${maxVisualRetries}`);
                const result = await imageModel.generateContent(currentParts);
                const response = await result.response;
                const candidates = response.candidates;

                if (!candidates || candidates.length === 0) {
                    console.warn(`[GeminiService] Visual attempt ${attempt}: No candidates returned.`);
                    if (attempt < maxVisualRetries) {
                        console.log('[GeminiService] Retrying visual generation with corrective prompt...');
                        continue;
                    }
                    return null;
                }

                const resParts = candidates[0].content?.parts || [];
                for (const part of resParts) {
                    if (part.inlineData && part.inlineData.mimeType?.startsWith('image/')) {
                        console.log(`[GeminiService] Visual generation succeeded on attempt ${attempt}.`);
                        return part.inlineData.data;
                    }
                }

                // Image model returned candidates but no image data — retry
                console.warn(`[GeminiService] Visual attempt ${attempt}: Response contained no image data.`);
                if (attempt < maxVisualRetries) {
                    console.log('[GeminiService] Retrying visual generation with corrective prompt...');
                    continue;
                }

                return null;
            } catch (error) {
                console.error(`[GeminiService] Visual attempt ${attempt} failed:`, error);
                if (attempt < maxVisualRetries) {
                    console.log('[GeminiService] Retrying visual generation after error...');
                    continue;
                }
                return null;
            }
        }

        return null;
    }
}
