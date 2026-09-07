import { GoogleGenerativeAI, GenerativeModel, Part, InlineDataPart } from '@google/generative-ai';
import * as vscode from 'vscode';
import { FileContext } from './CodeContextExtractor';
import { DEFAULT_MODEL, DEFAULT_IMAGE_MODEL, isKnownModel, getDaysUntilSunset, getSunsetDate } from './models';
import { type DiscoveredModel } from './modelDiscovery';
import {
    announceModelChange,
    healModelAfterFailure,
    type ModelResolution,
    readModelStrategy,
    resolveModelForGeneration,
} from './modelResolution';
import { buildGenerationPrompt, buildRecommendationPrompt, buildFrameworkDetectionPrompt, buildVisualDiagramPrompt, buildVisualFixPrompt } from './PromptBuilder';
import { generateWithFallback, isModelUnavailableError } from './FallbackStrategy';

/**
 * How long the model list may take before discovery gives up.
 *
 * Discovery sits on the generation hot path: every generation resolves its
 * model id first. An unreachable host fails in milliseconds, but a proxy or a
 * captive portal that accepts the connection and then never answers would hang
 * generation for as long as the user was willing to wait. Five seconds is
 * generous for a list of 54 models and short enough that the fallback — call
 * the configured id, as before discovery existed — is barely noticed.
 */
export const DISCOVERY_TIMEOUT_MS = 5000;

/**
 * Fetch the model list for a key. Never throws and never blocks for longer than
 * `timeoutMs`; every failure, the timeout included, comes back as an empty list.
 *
 * A free function rather than a method so a test can drive it with a short
 * timeout and a stubbed `fetch`, without a VS Code extension context.
 */
export async function fetchModelList(
    apiKey: string,
    timeoutMs: number = DISCOVERY_TIMEOUT_MS,
): Promise<DiscoveredModel[]> {
    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=200`,
            { signal: AbortSignal.timeout(timeoutMs) }
        );
        if (!response.ok) {
            return [];
        }
        const json = await response.json() as { models?: Array<{ name?: string; displayName?: string; supportedGenerationMethods?: string[] }> };
        return (json.models ?? [])
            .filter(m => typeof m.name === 'string')
            .map(m => ({
                id: m.name!.replace(/^models\//, ''),
                displayName: m.displayName,
                supportedGenerationMethods: m.supportedGenerationMethods,
            }));
    } catch {
        // Offline, proxied, rate-limited, or timed out — an AbortError from the
        // signal lands here like any other. The pinned defaults still work.
        return [];
    }
}

export class GeminiService {
    private genAI: GoogleGenerativeAI | undefined;
    private model: GenerativeModel | undefined;

    private context: vscode.ExtensionContext;

    /** Track which model IDs have already shown warnings this session to avoid spamming. */
    private modelWarningsShown = new Set<string>();

    /** Prevents showing the plaintext-key migration notice more than once per session. */
    private keyMigrated = false;

    /** Discovered model list, refreshed at most daily. */
    private discoveryCache: { at: number; models: DiscoveredModel[] } | undefined;

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
    /**
     * Ask the API which models this key can actually reach.
     *
     * Cached for a day: the list changes on Google's release cadence, not
     * ours, and an extra network call on every activation buys nothing.
     * Returns an empty array on any failure — discovery is an optimisation,
     * and must never be the reason generation does not run.
     *
     * A failure is never cached. An empty result is a failure as far as this is
     * concerned, so the next generation asks again rather than living with a
     * blank list for a day.
     */
    public async discoverModels(force = false): Promise<DiscoveredModel[]> {
        const DAY_MS = 86_400_000;
        if (!force && this.discoveryCache && Date.now() - this.discoveryCache.at < DAY_MS) {
            return this.discoveryCache.models;
        }

        const apiKey = await this.context.secrets.get('c4x.ai.apiKey');
        if (!apiKey) {
            return [];
        }

        const models = await fetchModelList(apiKey);
        if (models.length > 0) {
            this.discoveryCache = { at: Date.now(), models };
        }
        return models;
    }

    public async refreshCredentials(): Promise<void> {
        this.genAI = undefined;
        this.model = undefined;
        await this.initialize();
    }

    /**
     * The model id to call, resolved from the setting, `c4x.ai.modelStrategy`
     * and what the key can actually reach.
     *
     * Runs before the first API call of a generation. Discovery is cached for a
     * day, so this is a network call once per instance per day, and an empty
     * list — no key, offline, rate-limited — returns the configured id
     * unchanged.
     */
    private async resolveModelId(configured: string): Promise<ModelResolution> {
        const models = await this.discoverModels();
        return resolveModelForGeneration(configured, models, readModelStrategy());
    }

    /**
     * Re-resolve after a call failed with "model not found".
     *
     * Forces a fresh list: the cached one is up to a day old and may be what
     * sent us to a dead id in the first place.
     */
    private async healModelId(failed: string): Promise<ModelResolution | undefined> {
        const models = await this.discoverModels(true);
        return healModelAfterFailure(failed, models, readModelStrategy());
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

            // Resolve the id before the first call: a pinned model the key can
            // no longer reach is replaced here rather than failing, and
            // auto-ga picks up a newer GA model without an extension update.
            const configured = vscode.workspace.getConfiguration('c4x.ai').get<string>('model') || DEFAULT_MODEL;
            const resolution = await this.resolveModelId(configured);
            const modelName = resolution.model;
            // Settings can change after initialization without rebuilding the
            // cached readiness model. Bind this request to its resolved id.
            const model = this.genAI!.getGenerativeModel({ model: modelName });

            try {
                // Pass the progress object down to update status during validation/retry
                const result = await generateWithFallback(this.genAI!, model, prompt, progress, {
                    primaryModelName: modelName,
                    heal: failed => this.healModelId(failed),
                    onPrimaryModelServed: () => {
                        if (resolution.notice) {
                            announceModelChange(
                                resolution.notice.from,
                                resolution.notice.to,
                                resolution.notice.reason,
                            );
                        }
                    },
                    onHealedModelServed: (from, to) => announceModelChange(from, to, 'healed'),
                });
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

        // Use configurable image model (default: Nano Banana 2), resolved the
        // same way as the text tier: the strategy applies to both.
        const config = vscode.workspace.getConfiguration('c4x.ai');
        const configuredImageModel = config.get<string>('imageModel') || DEFAULT_IMAGE_MODEL;
        const imageResolution = await this.resolveModelId(configuredImageModel);
        let imageModelName = imageResolution.model;
        let imageModel = this.genAI.getGenerativeModel({ model: imageModelName });
        let pendingImageNotice = imageResolution.notice;

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
        let corrective = false;
        let hasHealed = false;
        let attempt = 0;
        while (attempt < maxVisualRetries) {
            attempt++;
            try {
                const currentParts = corrective
                    // On retry, use the corrective prompt (text-only, no ref images to reduce noise)
                    ? [buildVisualFixPrompt(promptText, 'No image was returned on the previous attempt. Generate a PNG image.')]
                    : parts;

                console.log(`[GeminiService] Visual generation attempt ${attempt}/${maxVisualRetries} on ${imageModelName}`);
                const result = await imageModel.generateContent(currentParts);
                const response = await result.response;
                const candidates = response.candidates;

                if (!candidates || candidates.length === 0) {
                    console.warn(`[GeminiService] Visual attempt ${attempt}: No candidates returned.`);
                    if (attempt < maxVisualRetries) {
                        console.log('[GeminiService] Retrying visual generation with corrective prompt...');
                        corrective = true;
                        continue;
                    }
                    return null;
                }

                const resParts = candidates[0].content?.parts || [];
                for (const part of resParts) {
                    if (part.inlineData && part.inlineData.mimeType?.startsWith('image/')) {
                        if (pendingImageNotice?.to === imageModelName) {
                            announceModelChange(
                                pendingImageNotice.from,
                                pendingImageNotice.to,
                                pendingImageNotice.reason,
                            );
                            pendingImageNotice = undefined;
                        }
                        console.log(`[GeminiService] Visual generation succeeded on attempt ${attempt}.`);
                        return part.inlineData.data;
                    }
                }

                // Image model returned candidates but no image data — retry
                console.warn(`[GeminiService] Visual attempt ${attempt}: Response contained no image data.`);
                if (attempt < maxVisualRetries) {
                    console.log('[GeminiService] Retrying visual generation with corrective prompt...');
                    corrective = true;
                    continue;
                }

                return null;
            } catch (error) {
                console.error(`[GeminiService] Visual attempt ${attempt} failed:`, error);

                // The image model is gone rather than misbehaving: heal once to
                // the newest GA image model and retry with the original prompt.
                // The retry is free — this attempt never reached the model.
                if (!hasHealed && isModelUnavailableError(error)) {
                    const healedResolution = await this.healModelId(imageModelName);
                    if (healedResolution && healedResolution.model !== imageModelName) {
                        hasHealed = true;
                        imageModelName = healedResolution.model;
                        imageModel = this.genAI.getGenerativeModel({ model: imageModelName });
                        pendingImageNotice = healedResolution.notice;
                        attempt--;
                        continue;
                    }
                    hasHealed = true;
                }

                if (attempt < maxVisualRetries) {
                    console.log('[GeminiService] Retrying visual generation after error...');
                    corrective = true;
                    continue;
                }
                return null;
            }
        }

        return null;
    }
}
