import type { GoogleGenAI, Part } from '@google/genai';
import * as vscode from 'vscode';
import { FileContext } from './CodeContextExtractor';
import { DEFAULT_MODEL, DEFAULT_IMAGE_MODEL, isKnownModel, getDaysUntilSunset, getSunsetDate } from './models';
import { createGeminiClient, fetchModelList, type GenerateContentClient, responseText } from './geminiClient';
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

// Discovery's timeout and list call live beside the client they share, in a
// module the live gate can import without VS Code. Re-exported so callers and
// tests keep one import site for the service.
export { DISCOVERY_TIMEOUT_MS, fetchModelList } from './geminiClient';

const KEY_NOT_CONFIGURED = 'Gemini API Key not configured. Use the "Enter Key" prompt or set GEMINI_API_KEY env var.';

export class GeminiService {
    /**
     * The client, built on the first call that needs one (see `client()`), never
     * at construction: both commands construct a service at activation, and
     * building a client loads the 1.8 MB SDK.
     */
    private genAI: GoogleGenAI | undefined;
    /** The key `initialize()` found. Holding it is "ready"; the client comes later. */
    private apiKey: string | undefined;
    /**
     * The model id bound when the client was built: what the recommendation and
     * framework-detection calls use. Generation resolves its own id per request.
     */
    private modelName: string | undefined;

    private context: vscode.ExtensionContext;

    /** Track which model IDs have already shown warnings this session to avoid spamming. */
    private modelWarningsShown = new Set<string>();

    /** Prevents showing the plaintext-key migration notice more than once per session. */
    private keyMigrated = false;

    /** Discovered model list, refreshed at most daily, for the current key only. */
    private discoveryCache: { at: number; models: DiscoveredModel[] } | undefined;

    /** Bumped by every credential change (refresh, and each applyCredentials), so work started under an older key can tell. */
    private credentialGeneration = 0;

    /** The credential refresh in progress, if any. A request waits for it rather than guess. */
    private refreshing: Promise<void> | undefined;

    /**
     * How every API request leaves this service. It resolves the client for
     * the key held at the moment the request is sent.
     *
     * The rule: nothing here keeps a client across an `await`. A generation
     * spans discovery, a heal, self-correction passes, the failover and reading
     * reference images, and the key can be replaced or cleared by Set/Clear
     * Gemini API Key at any of those points. A captured client kept sending the
     * old key, and kept sending after a clear. FallbackStrategy and
     * SyntaxValidator only ever receive this.
     */
    private get requests(): GenerateContentClient {
        return { models: { generateContent: params => this.sendGenerateContent(params) } };
    }

    /** One request, through the client for the key held now. See `requests`. */
    private async sendGenerateContent(
        params: Parameters<GenerateContentClient['models']['generateContent']>[0],
    ): ReturnType<GenerateContentClient['models']['generateContent']> {
        for (;;) {
            // A Set/Clear in progress decides which key this request may use.
            // If reading the new key fails, the refresh's caller hears about
            // it; this request goes on with the credentials still held.
            while (this.refreshing) {
                await this.refreshing.catch(() => undefined);
            }
            // The one place a client is acquired, immediately before its request.
            const generation = this.credentialGeneration;
            const client = await this.client();
            if (!client) {
                throw new Error(KEY_NOT_CONFIGURED);
            }
            // `await` yields even for a cached client, and a credential change
            // can land in that gap. Dispatch only if none did, with no await
            // between the check and the call: the key is fixed in the client
            // the moment generateContent is called. Otherwise acquire again:
            // the new key's client, or "not configured".
            if (generation === this.credentialGeneration && !this.refreshing) {
                return client.models.generateContent(params);
            }
        }
    }

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.initialize();
    }

    public async checkReady(): Promise<boolean> {
        if (this.hasCredentials()) { return true; }
        await this.initialize();
        return this.hasCredentials();
    }

    public async saveKey(key: string): Promise<void> {
        await this.context.secrets.store('c4x.ai.apiKey', key);
        await this.refreshCredentials();
    }

    /**
     * Drop the cached client and rebuild it from whatever key is stored now.
     *
     * `checkReady()` short-circuits on a cached client, so a key changed
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

        const generation = this.credentialGeneration;
        const apiKey = await this.context.secrets.get('c4x.ai.apiKey');
        if (!apiKey) {
            return [];
        }

        const models = await fetchModelList(apiKey, undefined,
            () => generation === this.credentialGeneration && !this.refreshing);
        // A list fetched for a key that was replaced meanwhile still serves the
        // model choice of the request that asked for it, but is not kept: the
        // new key gets its own list.
        if (models.length > 0 && generation === this.credentialGeneration) {
            this.discoveryCache = { at: Date.now(), models };
        }
        return models;
    }

    /**
     * Re-read the stored key after Set/Clear Gemini API Key.
     *
     * The new key is resolved first and swapped in with everything that
     * depends on it in one synchronous step. Clearing the fields before the
     * read left a window in which a generation was told "key not configured"
     * although the user had just set one. Requests that start during the
     * refresh wait for it (see sendGenerateContent).
     */
    public async refreshCredentials(): Promise<void> {
        const generation = ++this.credentialGeneration;
        this.discoveryCache = undefined;
        const refresh = (async () => {
            const apiKey = await this.resolveCredentials();
            // A later refresh owns the outcome.
            if (generation === this.credentialGeneration) {
                this.applyCredentials(apiKey);
            }
        })();
        this.refreshing = refresh;
        try {
            await refresh;
        } finally {
            if (this.refreshing === refresh) {
                this.refreshing = undefined;
            }
        }
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

    /**
     * The id the recommendation and framework-detection calls use: the model
     * configured when the client was built. `initialize()` sets both together,
     * so the default only covers a client injected without one.
     */
    private boundModelName(): string {
        return this.modelName ?? DEFAULT_MODEL;
    }

    /** True when a key (or an injected client) is held. Does not prompt, initialise or load the SDK. */
    public hasCredentials(): boolean {
        return !!this.genAI || !!this.apiKey;
    }

    /**
     * The client for a call that is about to reach the API. Built from the held
     * key on first use, which is the first time `@google/genai` is loaded.
     */
    private async client(): Promise<GoogleGenAI | undefined> {
        while (!this.genAI && this.apiKey) {
            // Building loads the SDK on first use, which takes real time, and the
            // key can be replaced or cleared meanwhile (refreshCredentials). A
            // client is cached only if the key it was built from is still the
            // held one; otherwise build again for the current key, or return
            // nothing if it was cleared. Caching unconditionally kept sending
            // the old key, and made a cleared service report credentials.
            const generation = this.credentialGeneration;
            const built = await createGeminiClient(this.apiKey);
            if (generation === this.credentialGeneration && !this.genAI) {
                this.genAI = built;
            }
        }
        return this.genAI;
    }

    public async initialize() {
        const generation = this.credentialGeneration;
        const apiKey = await this.resolveCredentials();
        // A refresh that started meanwhile owns the outcome. Without a key, an
        // initialize leaves the service as it was; only a refresh clears.
        if (apiKey && generation === this.credentialGeneration) {
            this.applyCredentials(apiKey);
        }
    }

    /**
     * Hold `apiKey` and drop the client built for any earlier key, together and
     * without an await, so no request can see one without the other. The
     * client, and with it the SDK, is built by client() on first use.
     */
    private applyCredentials(apiKey: string | undefined): void {
        // Work started under the previous credentials (a client being built, a
        // request about to be sent, a model list in flight) sees this and stops.
        this.credentialGeneration++;
        this.genAI = undefined;
        this.apiKey = apiKey;
        this.modelName = apiKey
            ? vscode.workspace.getConfiguration('c4x.ai').get<string>('model') || DEFAULT_MODEL
            : undefined;
        if (this.modelName) {
            // G3/G4: Validate model selection and check sunset dates
            this.validateModelSelection(this.modelName);
        }
    }

    /** The key to use: SecretStorage, then a migrated plaintext setting, then GEMINI_API_KEY. */
    private async resolveCredentials(): Promise<string | undefined> {
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

        return apiKey || undefined;
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
        if (!this.hasCredentials()) {
            // Re-try initialization in case key was added late
            await this.initialize();
            if (!this.hasCredentials()) {
                throw new Error(KEY_NOT_CONFIGURED);
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
            // Settings can change after initialization without rebuilding the
            // cached client. Bind this request to its resolved id.
            const modelName = resolution.model;

            // The key can be cleared while this request is being prepared.
            if (!this.hasCredentials()) {
                throw new Error(KEY_NOT_CONFIGURED);
            }

            try {
                // Pass the progress object down to update status during validation/retry.
                // `this.requests`, not a client: every attempt, heal and failover
                // request uses the key held when it is sent.
                const result = await generateWithFallback(this.requests, prompt, progress, {
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
                if (!this.hasCredentials()) {
                    // Cleared mid-generation: that, not the attempts it cut short, is the cause.
                    throw new Error(KEY_NOT_CONFIGURED);
                }
                throw new Error(`Failed to generate diagram: ${error.message}`);
            }
        });
    }

    public async recommendDiagramType(text: string): Promise<{ types: string[], direction: 'TB' | 'LR', confidence: number }> {
        const fallback = { types: ['C1', 'C2', 'C3'], direction: 'TB' as const, confidence: 0 };
        if (!this.hasCredentials()) { return fallback; }

        const prompt = buildRecommendationPrompt(text);
        try {
            const result = await this.requests.models.generateContent({ model: this.boundModelName(), contents: prompt });
            const response = responseText(result);
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
        if (!this.hasCredentials()) { return fallback; }

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
            const result = await this.requests.models.generateContent({ model: this.boundModelName(), contents: prompt });
            const response = responseText(result);
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
        // Without a key, say so. `null` means "no image came back", which the
        // command reports as a model that cannot generate images.
        if (!this.hasCredentials()) {
            throw new Error(KEY_NOT_CONFIGURED);
        }

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
        let pendingImageNotice = imageResolution.notice;

        // Step 1: Detect the best diagram framework (or use override)
        let frameworkResult = frameworkOverride;
        if (!frameworkResult) {
            frameworkResult = await this.detectDiagramFramework(sanitizedText);
        }

        const { framework, confidence, reasoning } = frameworkResult;
        console.log(`[GeminiService] Using framework: ${framework} (confidence: ${confidence})`);

        // Step 2: Select reference images based on framework
        const refParts: Part[] = [];
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
                // Sent through `this.requests`: the key is the one held now, not
                // the one held before discovery, framework detection or a heal.
                const response = await this.requests.models.generateContent({ model: imageModelName, contents: currentParts });
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
                        // `data` is optional in the SDK's types; the API always
                        // sends it with an image part. null is the "no image" the
                        // caller already handles.
                        return part.inlineData.data ?? null;
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

                // The key was cleared: no retry or heal can succeed, and none
                // should be sent. Not `null`: see the check at the top.
                if (!this.hasCredentials()) {
                    throw new Error(KEY_NOT_CONFIGURED);
                }

                // The image model is gone rather than misbehaving: heal once to
                // the newest GA image model and retry with the original prompt.
                // The retry is free — this attempt never reached the model.
                if (!hasHealed && isModelUnavailableError(error)) {
                    const healedResolution = await this.healModelId(imageModelName);
                    if (healedResolution && healedResolution.model !== imageModelName) {
                        hasHealed = true;
                        imageModelName = healedResolution.model;
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
