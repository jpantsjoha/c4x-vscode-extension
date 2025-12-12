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
            const modelName = config.get<string>('model') || 'gemini-3-preview';
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

        const parser = new C4XParser();
        const maxRetries = 2; // 1 initial + 1 retry

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
            const cleanedText = this.cleanResponse(rawText);

            // Self-Correction: Validate with Parser
            try {
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
${cleanedText || rawText}
\`\`\`

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
        const primaryModelName = config.get<string>('model') || 'gemini-3-preview';

        // Helper to get model instance
        const getModel = (name: string) => this.genAI?.getGenerativeModel({ model: name });

        try {
            return await executeGeneration(this.model, primaryModelName, prompt, 1);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            // If primary is NOT 2.5-pro, and we failed (either API error or Validation exhaust), try 2.5-pro as fallback
            const fallbackModelName = 'gemini-2.5-pro';

            if (primaryModelName !== fallbackModelName) {
                const warnMsg = `Falling back to ${fallbackModelName} due to error: ${error.message}`;
                progress?.report({ message: "Primary model failed. Switching to Backup Model..." });
                console.warn(warnMsg);

                const fallbackModel = getModel(fallbackModelName);
                if (fallbackModel) {
                    return await executeGeneration(fallbackModel, fallbackModelName, prompt, 1);
                }
            }
            throw error;
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
            try {
                const geminiUri = vscode.Uri.joinPath(root, 'GEMINI.md');
                const geminiData = await vscode.workspace.fs.readFile(geminiUri);
                geminiParam = Buffer.from(geminiData).toString('utf8');
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (e) { /* Ignore if missing */ }

            try {
                const examplesUri = vscode.Uri.joinPath(root, 'EXAMPLES.md');
                const examplesData = await vscode.workspace.fs.readFile(examplesUri);
                examplesParam = Buffer.from(examplesData).toString('utf8');
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (e) { /* Ignore if missing */ }
        }

        // Fallback: If not in workspace, use built-in Expert Guidelines
        const DEFAULT_GUIDELINES = `
## 🎨 Expert Visual Architect - Layout Strategy
1. **Containment is Key**: Always use \`subgraph\` to group related containers. Do NOT leave nodes floating.
2. **Backbone First**: Define the "Main Success Scenario" (User -> App -> DB) FIRST to set the vertical spine.
3. **Horizontal vs Vertical (Chaining Rule)**:
    - **Vertical Stack**: Create dependency chains (\`User --> Frontend --> Backend --> DB\`) to force vertical depth.
    - **Avoid Fan-Out**: Minimize connecting one node to many others; it creates wide, messy diagrams.
    - **> 4 Nodes**: ALWAYS use \`graph TB\`.
4. **Proximity & Execution Order**:
    - **Define in Call Order**: If A calls B, define A then B.
    - **Group Neighbors**: Keep connected nodes physically close in the definition.
5. **Sanitized Aesthetics**:
    - **Node Labels**: \`ID[Label<br/>Type<br/>Tech]\`. Use \`<br/>\` for newlines.
    - **Line Labels**: Plain Text ONLY. NO HTML.

## 📝 Syntax Verification
1. **Directive**: Start with \`%%{ c4: container }%%\`.
2. **Brace Check**: \`subgraph ID {\` (not \`[\`).
3. **Arrow Check**: Use \`-->\` (standard) or \`..>\`.
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
   - **Small Diagrams (<= 4 Nodes)**: PREFER \`graph LR\` (Left-Right). Vertical stacks for simple diagrams waste screen space.
   - **Large Diagrams (> 4 Nodes)**: PREFER \`graph TB\` (Top-Bottom) to avoid wide scrolling.`;
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
5. **Node Labels**: \`ID[Label<br/>Type<br/>Tech]\`. Use \`<br/>\` for newlines in Nodes ONLY.
6. **Layout Strategy ("Smart Visuals")**:${layoutRule}
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

    public async recommendDiagramType(text: string): Promise<{ types: string[], direction: 'TB' | 'LR' }> {
        const fallback = { types: ['C1', 'C2', 'C3'], direction: 'TB' as const };
        if (!this.model) { return fallback; }

        const prompt = `
Analyze the following code/text selection and determine:
1. The best C4 Model diagram levels (C1, C2, C3).
2. The intended visual orientation (Vertical/TB or Horizontal/LR).

SELECTION:
"""
${text.substring(0, 2000)}
"""

GUIDELINES:
- **C1 (System Context)**: Users, external systems, high-level.
- **C2 (Container)**: Apps, databases, technologies.
- **C3 (Component)**: Classes, logic, code details.

ORIENTATION DETECTION:
- **LR (Left-Right)**: If text uses horizontal arrows (e.g., "A -> B -> C") or describes a sequence strictly on fewer lines.
- **TB (Top-Bottom)**: If text is a bullet list, vertical ASCII art, or structural hierarchy. (Default to TB if unsure).

RETURN ONLY a JSON object:
{
  "types": ["C1", "C2"],
  "direction": "TB" // or "LR"
}
Do not wrap in markdown blocks. Just the JSON string.
`;
        try {
            const result = await this.model.generateContent(prompt);
            const response = result.response.text();
            const clean = response.replace(/```json/g, '').replace(/```/g, '').trim();
            const recommended = JSON.parse(clean);

            const types = Array.isArray(recommended.types) ? recommended.types : ['C1', 'C2'];
            const direction = ['TB', 'LR'].includes(recommended.direction) ? recommended.direction : 'TB';

            return { types, direction };

        } catch (e) {
            console.warn("Recommendation failed:", e);
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
        clean = clean.replace(/((?:--|\.\.|==|-\.-)>\s*\|)([^|]+)(\|)/g, (match, arrowPart, label, endPipe) => {
            const cleanLabel = label.replace(/<\/?br\s*\/?>/gi, ' ');
            return `${arrowPart}${cleanLabel}${endPipe}`;
        });

        return clean.trim();
    }
}
