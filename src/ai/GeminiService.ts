import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import * as vscode from 'vscode';
import { FileContext } from './CodeContextExtractor';
import { C4XParser } from '../parser/C4XParser';

export class GeminiService {
    private genAI: GoogleGenerativeAI | undefined;
    private model: GenerativeModel | undefined;

    private context: vscode.ExtensionContext;

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
        await this.initialize();
    }

    public async initialize() {
        const config = vscode.workspace.getConfiguration('c4x.ai');
        let apiKey = config.get<string>('apiKey');

        // Check Secrets first (User entered via InputBox)
        if (!apiKey || apiKey.trim() === '') {
            apiKey = await this.context.secrets.get('c4x.ai.apiKey');
        }

        // Fallback to process.env for development/testing
        if (!apiKey || apiKey.trim() === '') {
            apiKey = process.env.GEMINI_API_KEY;
        }

        if (apiKey) {
            this.genAI = new GoogleGenerativeAI(apiKey);
            const modelName = config.get<string>('model') || 'gemini-3.1-pro-preview';
            this.model = this.genAI.getGenerativeModel({ model: modelName });
        }
    }

    public async generateDiagram(files: FileContext[], instruction: string, options?: { direction?: 'TB' | 'LR' }): Promise<string> {
        if (!this.model) {
            // Re-try initialization in case key was added late?
            this.initialize();
            if (!this.model) {
                throw new Error('Gemini API Key not configured. Set "c4x.ai.apiKey" in settings or GEMINI_API_KEY env var.');
            }
        }

        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "C4X AI Agent",
            cancellable: false
        }, async (progress) => {
            progress.report({ message: "Analyzing context & generating diagram..." });

            const prompt = await this.buildPrompt(files, instruction, options);

            // Log prompt for debugging transparency
            console.log('[GeminiService] GENERATED PROMPT PREVIEW:', prompt.substring(0, 500) + '...');

            try {
                // Pass the progress object down to update status during validation/retry
                const result = await this.generateWithFallback(prompt, progress);
                return result;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (error: any) {
                console.error('Gemini Generation Error:', error);
                throw new Error(`Failed to generate diagram: ${error.message}`);
            }
        });
    }

    private async generateWithFallback(prompt: string, progress?: vscode.Progress<{ message?: string }>): Promise<string> {
        if (!this.model) { throw new Error("Model not initialized"); }

        // BUILD_ID for debugging version issues
        const BUILD_ID = '20260302-GEMINI31-MIGRATION';
        console.log(`[GeminiService] BUILD_ID: ${BUILD_ID}`);

        const parser = new C4XParser();
        const maxRetries = 3; // Integrated self-correction

        const executeGeneration = async (modelInstance: GenerativeModel, modelName: string, currentPrompt: string, attempt: number): Promise<string> => {
            const isRetry = attempt > 1;
            const statusMsg = isRetry
                ? `Auto-Correcting Syntax Error (Attempt ${attempt}/${maxRetries})...`
                : `Generating with ${modelName}...`;

            progress?.report({ message: statusMsg });
            console.log(`[GeminiService] ${statusMsg}`);

            const result = await modelInstance.generateContent(currentPrompt);
            const response = await result.response;
            const rawText = response.text();

            // Log raw response for debugging
            console.log(`[GeminiService] Raw Response (${rawText.length} chars)`);

            // Self-Correction: Validate with Parser
            try {
                // Clean the response (may throw on lazy sprite syntax)
                const cleanedText = this.cleanResponse(rawText);

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

                    const fixPrompt = `
The previous C4X DSL generation had a SYNTAX ERROR. 
ERROR: "${validationError.message}"

FAILED CODE:
\`\`\`c4x
${rawText}
\`\`\`

COMMON FIXES:
1. **Subgraph Syntax**: Must be \`subgraph ID {\` (no usage of brackets [] in subgraph definition).
2. **Missing Braces**: Ensure all \`{\` are closed with \`}\`.
3. **Invalid Arrows**: Use \`-->\` (standard) or \`..>\`. Do NOT use \`->\`.
4. **Directives**: Ensure \`%%{ c4: container }%%\` is at the very top.
5. **Element Type Whitelist**: ONLY use \`Person\`, \`System\`, \`System_Ext\`, \`Container\`, \`ContainerDb\`, \`Component\`, \`Node\`. Do NOT invent types like \`Goal()\`, \`Reason()\`, \`Decision()\`, \`Process()\`.

You MUST fix this error. 
Output ONLY the corrected C4X DSL code block.
Do NOT output any conversational text.
`;
                    return executeGeneration(modelInstance, modelName, fixPrompt, attempt + 1);
                }

                // If retries exhausted, throw validation error to trigger fallback mechanism
                throw validationError;
            }
        };

        const config = vscode.workspace.getConfiguration('c4x.ai');
        // Default to gemini-3.1-pro-preview (Gemini 3.1 Pro - best reasoning, replaces gemini-3-pro-preview)
        const primaryModelName = config.get<string>('model') || 'gemini-3.1-pro-preview';

        // Helper to get model instance
        const getModel = (name: string) => this.genAI?.getGenerativeModel({ model: name });

        try {
            return await executeGeneration(this.model, primaryModelName, prompt, 1);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            // Smart fallback: Elevate to gemini-3.1-pro-preview if user's model fails.
            // If already on 3.1-pro, try gemini-3-flash-preview as alternative.
            let fallbackModelName = 'gemini-3.1-pro-preview';
            if (primaryModelName === 'gemini-3.1-pro-preview') {
                fallbackModelName = 'gemini-3-flash-preview';
            }

            if (primaryModelName !== fallbackModelName) {
                progress?.report({ message: `Model failed. Trying ${fallbackModelName}...` });
                console.warn(`[GeminiService] "${primaryModelName}" failed: ${error.message}. Falling back to "${fallbackModelName}".`);

                const fallbackModel = getModel(fallbackModelName);
                if (fallbackModel) {
                    try {
                        return await executeGeneration(fallbackModel, fallbackModelName, prompt, 1);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    } catch (fallbackError: any) {
                        console.error(`[GeminiService] Fallback "${fallbackModelName}" also failed: ${fallbackError.message}`);
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

    private async buildPrompt(files: FileContext[], instruction: string, options?: { direction?: 'TB' | 'LR' }): Promise<string> {
        const fileDump = files.map(f => `### File: ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n');

        // Reading context files from extension path or workspace
        let geminiParam = "";
        let examplesParam = "";

        // Try to find GEMINI.md and EXAMPLES.md in the workspace root first
        if (vscode.workspace.workspaceFolders) {
            const root = vscode.workspace.workspaceFolders[0].uri;

            // Try comprehensive guidelines first (v2.0)
            try {
                const guidelinesUri = vscode.Uri.joinPath(root, 'docs', 'C4X-GENERATION-GUIDELINES.md');
                const guidelinesData = await vscode.workspace.fs.readFile(guidelinesUri);
                geminiParam = Buffer.from(guidelinesData).toString('utf8');
                console.log('[GeminiService] Loaded comprehensive C4X-GENERATION-GUIDELINES.md');
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (e) {
                // Fallback to legacy GEMINI.md if guidelines not found
                try {
                    const geminiUri = vscode.Uri.joinPath(root, 'GEMINI.md');
                    const geminiData = await vscode.workspace.fs.readFile(geminiUri);
                    geminiParam = Buffer.from(geminiData).toString('utf8');
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                } catch (e2) { /* Ignore if missing */ }
            }

            try {
                // Try root first
                let examplesUri = vscode.Uri.joinPath(root, 'EXAMPLES.md');
                try {
                    const examplesData = await vscode.workspace.fs.readFile(examplesUri);
                    examplesParam = Buffer.from(examplesData).toString('utf8');
                } catch {
                    // Try docs/ folder if root missing
                    examplesUri = vscode.Uri.joinPath(root, 'docs', 'EXAMPLES.md');
                    const examplesData = await vscode.workspace.fs.readFile(examplesUri);
                    examplesParam = Buffer.from(examplesData).toString('utf8');
                }
            } catch { /* Ignore if missing */ }
        }

        // Fallback: If not in workspace, use built-in Expert Guidelines (v2.0 - Enhanced)
        const DEFAULT_GUIDELINES = `
## 🎨 Expert Visual Architect - Layout Strategy (v2.0)

### Core Principle: Visual Coherence
C4X diagrams must be **tidy, consistent, elegant, well-aligned, and visually appealing**.

### Element Organization Pattern
\`\`\`c4x
graph TB
  # 1. External actors FIRST (top of diagram)
  Person(user, "User", "End user")
  System_Ext(external, "External System", "Third party")

  # 2. Main system boundary
  subgraph MainSystem {
    # Entry point
    Container(gateway, "API Gateway", "Kong", "Router")

    # Core services (in execution order)
    Container(auth, "Auth Service", "Node.js", "Authentication")
    Container(business, "Business Logic", "Java", "Processing")

    # Data layer LAST
    ContainerDb(db, "Database", "PostgreSQL", "Storage")
  }

  # 3. External storage/systems (bottom)
  System_Ext(storage, "File System", "S3")

  # 4. Relationships follow execution flow
  user --> gateway
  gateway --> auth
  auth --> business
  business --> db
  business --> storage
\`\`\`

### Layout Rules
1. **Vertical Chaining**: Force vertical layout with dependency chains (User → Web → API → DB)
2. **Anti Fan-Out**: User connects ONLY to entry point(s), not to every node
3. **Declaration Order = Visual Order**: Define A before B if A calls B
4. **Grouping**: Use \`subgraph\` for related components (> 6 nodes)
5. **Direction Choice**:
   - **TB (Top-Bottom)**: Default for most diagrams (> 6 elements)
   - **LR (Left-Right)**: Linear pipelines, sequences, user-provided ASCII flow

### Syntax Constraints
- **Subgraph**: \`subgraph ID {\` (NO quotes, NO brackets)
- **Arrows**: \`-->\` (solid), \`-.->\` (async/dotted), \`==>\` (data flow)
- **Labels**: Plain text in relationships, \`<br/>\` allowed in node labels ONLY
- **Directives**: \`%%{ c4: container }%%\` at very top

### Advanced Patterns (from 108 validated examples)
- **Event-Driven**: Use \`-.->\` for async events
- **Service Mesh**: Show sidecars explicitly
- **GraphQL**: DataLoader batching pattern
- **Microservices**: Clear service boundaries in subgraphs

Reference: Extension includes 108 validated examples in /samples for grounding.
`;

        const contextSection = geminiParam ? `\n## DESIGN GUIDELINES & RULES (Adhere Strictly):\n${geminiParam}` : `\n## DESIGN GUIDELINES & RULES (Built-in Defaults):\n${DEFAULT_GUIDELINES}`;
        const examplesSection = examplesParam ? `\n## REFERENCE EXAMPLES:\n${examplesParam}` : "";

        // Construct dynamic layout rule
        let layoutRule = "";
        if (options?.direction) {
            // Strict override
            layoutRule = `\n   - **FORCE LAYOUT**: You MUST use \`graph ${options.direction}\` because the user requested it. Override all other layout rules.`;
        } else {
            // Default heuristics
            layoutRule = `
   - **Respect Input**: If the user provides ASCII art or a text flow (e.g. \`A -> B -> C\`), MATCH that orientation.
   - **Small Diagrams (<= 6 Nodes)**: PREFER \`graph LR\` (Left-Right). Linear flows are easier to read.
   - **Large Diagrams (>= 7 Nodes)**: PREFER \`graph TB\` (Top-Bottom) to avoid wide scrolling.
   - **Loops/Cycles**: ALWAYS use \`graph LR\` for cyclical processes.`;
        }

        return `
You are an expert Software Architect and C4 Model specialist via the C4X extension.
Your task is to analyze the following source code and generate a MATCHING, VALID C4X DSL diagram.

${contextSection}

${examplesSection}

## CRITICAL SYNTAX RULES (OVERRIDE ANY OTHERS):
1. **Subgraph IDs**: MUST NOT contain quotes.
   - ❌ Invalid: \`subgraph "My System"\`
   - ✅ Valid: \`subgraph MySystem {\`
   - Always use \`subgraph ID {\` syntax (braces included).
2. **Directives**: Start with \`%%{ c4: container }%%\`.
3. **Arrows**: Use \`-->\` (standard) or \`..>\` (dotted). Do NOT use \`->\`.
4. **Relationship Labels**: PLAIN TEXT ONLY. NO HTML TAGS.
   - ❌ Invalid: \`User -->|Clicks<br>Button| App\`
   - ✅ Valid: \`User -->|Clicks Button| App\`

5. **ELEMENT TYPE WHITELIST (CRITICAL)**: ONLY these types are valid:
   - \`Person(alias, label, descr)\` — Human actors
   - \`System(alias, label, descr)\` / \`System_Ext(...)\` — Software systems
   - \`Container(alias, label, tech)\` / \`ContainerDb(...)\` — Apps, databases
   - \`Component(alias, label, descr)\` — Internal modules
   - \`Node(alias, label, descr)\` — Deployment nodes
   - ❌ NEVER invent types like \`Goal()\`, \`Reason()\`, \`Decision()\`, \`Process()\`, \`Action()\`
   - C4 is for STRUCTURE, not behavior. Model components that implement processes, not abstract steps.
6. **Node Labels**: \`ID[Label<br/>Type<br/>Tech]\`. Use \`<br/>\` for newlines in Nodes ONLY.
7. **Layout Strategy ("Smart Visuals")**:${layoutRule}
   - **User at Top**: Define User FIRST. Connect User ONLY to the initial entry point.
   - **Execution Order**: Define components in the order they are called.
   - **Vertical Stack**: Create dependency chains (\`User --> Web --> API --> DB\`) to force vertical depth.
   - **Grouping**: Use \`subgraph\` to cluster components.

USER INSTRUCTION:
"${instruction}"

SOURCE CODE CONTEXT:
${fileDump}

Now, generate the C4X DSL diagram. Output ONLY the code block.
`;
    }

    public async recommendDiagramType(text: string): Promise<{ types: string[], direction: 'TB' | 'LR', confidence: number }> {
        const fallback = { types: ['C1', 'C2', 'C3'], direction: 'TB' as const, confidence: 0 };
        if (!this.model) { return fallback; }

        const prompt = `
You are an expert C4 Model architect. Analyze the following text and determine the SINGLE BEST C4 diagram level.

TEXT TO ANALYZE:
"""
${text.substring(0, 2000)}
"""

DETECTION RULES (follow strictly):

**C1 - System Context** (High confidence signals):
- Mentions "users", "customers", "actors", "external systems", "third-party"
- Describes overall business capabilities or system boundaries
- Very high-level, no technical details

**C2 - Container** (High confidence signals):
- Mentions "services", "APIs", "databases", "applications", "microservices"
- References technologies: "Node.js", "PostgreSQL", "Redis", "React", "Docker"
- Describes how components communicate (HTTP, REST, gRPC, queues)

**C3 - Component** (High confidence signals):
- Mentions "classes", "modules", "functions", "controllers", "repositories"
- Contains code-like structures, imports, method names
- Describes internal structure of a single application

ORIENTATION:
- **LR**: Horizontal arrows (A -> B -> C), pipeline/flow descriptions, sequences
- **TB**: Bullet lists, hierarchies, structures (default if unsure)

RESPOND WITH ONLY THIS JSON (no markdown):
{
  "bestType": "C2",
  "confidence": 0.85,
  "direction": "TB"
}

Rules for confidence:
- 0.9+: Very clear signals for ONE level only
- 0.7-0.89: Strong signals but some ambiguity
- <0.7: Mixed signals, user should confirm
`;
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

    private cleanResponse(text: string): string {
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

        const prompt = `
You are a diagram framework classifier. Analyze the following text and determine the BEST visualization framework.

TEXT TO ANALYZE:
"""
${text.substring(0, 2000)}
"""

FRAMEWORK OPTIONS:

**C4 (Structural Architecture)** — Use when:
- Text describes WHAT things ARE (systems, containers, components, databases)
- Keywords: "system", "container", "component", "database", "API", "service", "microservice", "architecture"
- Pattern: Describing static structure, not behavior

**Sequence (Behavioral/Ordered Interactions)** — Use when:
- Text describes WHEN things happen in ORDER
- Keywords: "then", "next", "calls", "responds", "step 1", "after", "before", "returns", "sends"
- Pattern: Time-ordered events, numbered steps, API call sequences, user journeys
- Pattern: Loops like "Reason → Act → Observe → Repeat"

**Flowchart (Process/Decision Logic)** — Use when:
- Text describes conditional logic or process flows
- Keywords: "if", "else", "decision", "loop", "while", "branch", "parallel", "approve", "reject"
- Pattern: Decision points, conditional branching, process steps

CRITICAL RULES:
1. C4 is for STRUCTURE (what exists). Sequence/Flowchart are for BEHAVIOR (what happens).
2. If the text contains NUMBERED STEPS (1. 2. 3.) or time-based keywords ("then", "next"), choose **Sequence**, EVEN IF it describes Systems/Containers.
3. If the text describes a LOOP or CYCLE (e.g., "Reason → Act → Observe"), choose Sequence or Flowchart.
4. Only choose C4 if the text describes a STATIC structure or hierarchy.

RESPOND WITH ONLY THIS JSON (no markdown):
{
  "framework": "C4",
  "confidence": 0.85,
  "reasoning": "Text describes software systems and their relationships"
}
`;

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
        const imageModelName = config.get<string>('imageModel') || 'gemini-3.1-flash-image-preview';
        const imageModel = this.genAI.getGenerativeModel({ model: imageModelName });

        // Step 1: Detect the best diagram framework (or use override)
        let frameworkResult = frameworkOverride;
        if (!frameworkResult) {
            frameworkResult = await this.detectDiagramFramework(sanitizedText);
        }

        const { framework, confidence, reasoning } = frameworkResult;
        console.log(`[GeminiService] Using framework: ${framework} (confidence: ${confidence})`);

        // Step 2: Select reference images based on framework
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const refParts: any[] = [];
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
        const layoutDirection = direction === 'LR' ? 'Left-to-Right flow' : 'Top-to-Bottom hierarchy';
        let promptText: string;

        if (framework === 'Sequence') {
            // 4. Layout:
            //    - Use ${layoutDirection}.

            promptText = `
Generate a professional SEQUENCE/COLLABORATION diagram as a clean, presentation-ready image.

CONTEXT:
"""
${sanitizedText.substring(0, 3000)}
"""

VISUAL GUIDELINES (STRICT COMPLIANCE):
1. **Style**: This is a C4 Dynamic/Sequence diagram showing ORDERED INTERACTIONS.

2. **Numbered Steps**: Each interaction MUST be numbered (1, 2, 3...) showing the ORDER of events.

3. **Color Palette (C4 Compatible)**:
   - **Person**: #08427B (Dark Blue), White Text, Stick figure icon.
   - **System/Container**: #438DD5 (Light Blue), White Text.
   - **External System**: #999999 (Grey), White Text.

4. **Layout**:
   - Use ${layoutDirection}.
   - Actors/Systems as rounded rectangles (NOT lifelines unless explicitly UML).
   - Arrows MUST show direction of interaction.
   - Label arrows with both NUMBER and ACTION (e.g., "1. Sends request").

5. **Loops/Cycles**:
   - If the flow loops back (e.g., A→B→C→A), show it clearly with a curved return arrow.
   - Use dotted lines for async/optional interactions.

6. **Legend**: Include a Key box showing what the numbers represent.

7. **Spacing Preference**: ${layoutHint}

VISUAL STYLE CONTEXT: ${userGrounding}
LAYOUT PREFERENCE: ${layoutPreference}

Generate the diagram image now. The detected context is: ${reasoning}
`;
            // 4. Layout:
            //    - Use ${layoutDirection}.

        } else if (framework === 'Flowchart') {
            promptText = `
Generate a professional FLOWCHART/PROCESS diagram as a clean, presentation-ready image.

CONTEXT:
"""
${sanitizedText.substring(0, 3000)}
"""

VISUAL GUIDELINES (STRICT COMPLIANCE):
1. **Style**: This is a process flowchart showing DECISION LOGIC and PROCESS STEPS.

2. **Shape Standards**:
   - **Start/End**: Rounded rectangles or ovals (Green/Red).
   - **Process Steps**: Rectangles (#438DD5 Light Blue).
   - **Decisions**: DIAMONDS with Yes/No branches (#08427B Dark Blue).
   - **Data/Input**: Parallelograms.

3. **Color Palette (C4 Compatible)**:
   - Primary: #438DD5 (Light Blue) for processes.
   - Decisions: #08427B (Dark Blue).
   - External: #999999 (Grey).

4. **Layout**:
   - Use ${layoutDirection}.
   - Decision diamonds MUST have exactly 2 outgoing arrows labeled "Yes" and "No" (or equivalent).
   - Loops should be clearly visible with return arrows.

5. **Arrows**:
   - Solid lines for main flow.
   - Dotted lines for optional/async paths.
   - All arrows MUST have labels describing the condition or action.

6. **Spacing Preference**: ${layoutHint}

7. **Legend**: Include a Key box explaining the shapes.

VISUAL STYLE CONTEXT: ${userGrounding}
LAYOUT PREFERENCE: ${layoutPreference}

Generate the diagram image now. The detected context is: ${reasoning}
`;
        } else {
            // C4 Model (default)
            const levelDescriptions: Record<string, string> = {
                'C1': 'System Context - showing users, the main system, and external systems',
                'C2': 'Container - showing applications, databases, and services within the system',
                'C3': 'Component - showing internal modules, classes, and their relationships'
            };
            const levelDesc = levelDescriptions[c4Level] || 'Container';

            promptText = `
Generate a professional C4 Model ${levelDesc} diagram as a clean, presentation-ready image.

ARCHITECTURE CONTEXT:
"""
${sanitizedText.substring(0, 3000)}
"""

VISUAL GUIDELINES (STRICT COMPLIANCE REQUIRED):
1. **Color Palette (Official C4 - EXACT COLORS MANDATORY)**:
   - **Person**: #08427B (Dark Blue), White Text.
   - **Software System**: #1168BD (Blue), White Text.
   - **External System**: #999999 (Grey), White Text.
   - **Container**: #438DD5 (Light Blue), White Text.
   - **Database**: #438DD5 (Light Blue), Cylinder Shape.
   - **Component**: #85BBF0 (Lighter Blue), Black Text.
   - **FORBIDDEN COLORS**: DO NOT use green, red, yellow, or orange for structural elements.
   - **Status Colors (ONLY for status indicators)**: Green = Active/Success, Red = Error/Critical, Yellow = Warning.

2. **Shapes & Sizing**:
   - **Person**: Stick figure icon above rounded rectangle.
   - **Nodes**: Rounded rectangles. UNIFORM SIZE for same-type elements.
   - **Database**: Must use Cylinder shape.

3. **Arrows**:
   - **Style**: Solid lines (Uses) or Dashed (Async).
   - **Heads**: Filled triangles.
   - **Layout**: ${layoutDirection}.

4. **Layout Algorithm (CRITICAL for Visual Coherence)**:
   - **User/Person Placement**: TOP-LEFT or TOP-CENTER only.
   - **Vertical Chaining**: Force vertical depth by chaining dependencies: User → Web App → API → DB.
   - **Anti Fan-Out**: User connects ONLY to main entry point(s), NOT to every node.
   - **Element Alignment**: Same-type elements should align vertically or horizontally.
   - **Minimize Crossing**: Route arrows to avoid overlaps. Use orthogonal routing.
   - **Logical Grouping**: Visually cluster related elements in proximity.
   - **Spacing Preference**: ${layoutHint}
   - **Goal**: Tidy, consistent, elegant, well-aligned diagram

5. **Boundaries**:
   - Group related elements using visual boundary boxes (subgraphs).
   - System/Container boundaries MUST have dashed borders and transparent backgrounds.
   - Nodes are visually filled; Boundaries are not.

6. **Legend**: Include a Key box in the bottom-right corner.

7. **CRITICAL**: This is a STRUCTURAL diagram. Only use C4 element types:
   - Person, System, System_Ext, Container, ContainerDb, Component
   - DO NOT invent types like Goal(), Reason(), Decision(), Action(), Process().

VISUAL STYLE CONTEXT: ${userGrounding}
LAYOUT PREFERENCE: ${layoutPreference}

Generate the ${c4Level} diagram image now.
`;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parts: any[] = [promptText, ...refParts];

        if (refParts.length > 0) {
            console.log(`[GeminiService] Included ${refParts.length} reference images for ${framework}`);
        } else {
            console.warn('[GeminiService] No reference images found. Generating from text descriptions only.');
        }

        try {
            const result = await imageModel.generateContent(parts);
            const response = await result.response;
            const candidates = response.candidates;

            if (!candidates || candidates.length === 0) {
                return null;
            }

            const resParts = candidates[0].content?.parts || [];
            for (const part of resParts) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if ((part as any).inlineData && (part as any).inlineData.mimeType?.startsWith('image/')) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    return (part as any).inlineData.data;
                }
            }

            return null;
        } catch (error) {
            console.error('Visual diagram generation failed:', error);
            return null;
        }
    }
}
