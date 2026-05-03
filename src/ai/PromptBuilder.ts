// Prompt construction logic for the C4X AI Agent.
//
// Extracted from GeminiService.ts as part of WS-5 decomposition.
// Pure functions — no side effects, no VS Code API calls beyond reading
// workspace files (which are passed in or read via vscode.workspace.fs).

import * as vscode from 'vscode';
import { FileContext } from './CodeContextExtractor';
import { DEFAULT_GUIDELINES } from './prompts/defaultGuidelines';
import {
    C4_PERSON_FILL,
    C4_SYSTEM_FILL,
    C4_EXTERNAL_FILL,
    C4_CONTAINER_FILL,
    C4_COMPONENT_FILL,
    C4_BOUNDARY_STROKE,
    C4_TEXT_WHITE,
    C4_TEXT_DARK,
    C4_ARROW_STROKE,
} from '../themes/c4-palette';

/**
 * Build the full generation prompt sent to Gemini for C4X DSL diagram generation.
 *
 * Reads optional workspace guideline/example files, then assembles
 * the system prompt with syntax rules, layout heuristics, user instruction,
 * and source-code context.
 */
export async function buildGenerationPrompt(
    files: FileContext[],
    instruction: string,
    options?: { direction?: 'TB' | 'LR' }
): Promise<string> {
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
            console.log('[PromptBuilder] Loaded comprehensive C4X-GENERATION-GUIDELINES.md');
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

    // Fallback: If not in workspace, use the built-in Expert Guidelines.
    // Prompt body lives in src/ai/prompts/defaultGuidelines.ts (mirror of
    // docs/prompts/c4x-default-guidelines.md — see TDR-015).
    const contextSection = geminiParam ? `\n## DESIGN GUIDELINES & RULES (Adhere Strictly):\n${geminiParam}` : `\n## DESIGN GUIDELINES & RULES (Built-in Defaults):\n${DEFAULT_GUIDELINES}`;
    const examplesSection = examplesParam ? `\n## REFERENCE EXAMPLES:\n${examplesParam}` : "";

    // Construct dynamic layout rule
    let layoutRule = "";
    if (options?.direction) {
        // Strict override
        layoutRule = `\n   - **FORCE LAYOUT**: You MUST use \`graph ${options.direction}\` because the user requested it. Override all other layout rules.`;
    } else {
        // Default heuristics — threshold aligns with DagreLayoutEngine.autoDetectDirection()
        layoutRule = `
   - **Respect Input**: If the user provides ASCII art or a text flow (e.g. \`A -> B -> C\`), MATCH that orientation.
   - **Small Diagrams (<= 4 top-level elements)**: PREFER \`graph LR\` (Left-Right). Horizontal layout is easier to read for compact diagrams.
   - **Large Diagrams (>= 5 top-level elements)**: PREFER \`graph TB\` (Top-Bottom) to avoid wide scrolling.
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

/**
 * Build the prompt for diagram-type recommendation (C1/C2/C3 + direction).
 */
export function buildRecommendationPrompt(text: string): string {
    return `
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
}

/**
 * Build the prompt for diagram-framework detection (C4 / Sequence / Flowchart).
 */
export function buildFrameworkDetectionPrompt(text: string): string {
    return `
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
}

/**
 * Build the self-correction / fix prompt sent when the parser rejects
 * AI-generated DSL.
 */
export function buildFixPrompt(rawText: string, errorMessage: string): string {
    return `
The previous C4X DSL generation had a SYNTAX ERROR.
ERROR: "${errorMessage}"

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
}

/**
 * Build the visual-diagram prompt for a specific framework
 * (C4, Sequence, or Flowchart).
 */
export function buildVisualDiagramPrompt(
    sanitizedText: string,
    c4Level: string,
    direction: 'TB' | 'LR',
    framework: 'C4' | 'Sequence' | 'Flowchart',
    reasoning: string,
    userGrounding: string,
    layoutPreference: string,
    layoutHint: string
): string {
    const layoutDirection = direction === 'LR' ? 'Left-to-Right flow' : 'Top-to-Bottom hierarchy';

    // Shared quality rules injected into every visual prompt
    const sharedQualityRules = `
IMAGE QUALITY REQUIREMENTS (MANDATORY):
- **Resolution**: Render at high resolution (minimum 1400px wide). Text must be crisp and readable at 100% zoom.
- **Font Size**: All labels MUST be at least 14px equivalent. Relationship labels at least 12px. Never render text smaller than 11px.
- **Text Contrast**: White text on dark backgrounds, black/dark text on light backgrounds. Every label must pass WCAG AA contrast.
- **Text Wrapping**: Long labels must wrap gracefully inside their shapes. Never overflow or clip text outside a box.
- **Background**: Clean white (#FFFFFF) background unless the visual style context specifies otherwise.
- **Anti-aliasing**: All shapes and text must be anti-aliased. No jagged edges.
- **Diagram Title**: Include the diagram title at the top-center in bold, 18px+ font.

COMMON MISTAKES TO AVOID (NEGATIVE PATTERNS):
- DO NOT render blurry or pixelated text.
- DO NOT overlap labels with arrows or other labels.
- DO NOT use inconsistent font sizes across same-level elements.
- DO NOT place elements randomly; every placement must follow the layout algorithm.
- DO NOT draw arrows that cross through element boxes.
- DO NOT leave orphan elements (every element must connect to at least one other).
- DO NOT use decorative 3D effects, drop shadows, or gradients on structural elements.
- DO NOT add watermarks, signatures, or branding to the image.`;

    if (framework === 'Sequence') {
        return `
Generate a professional SEQUENCE/COLLABORATION diagram as a clean, presentation-ready image.

CONTEXT:
"""
${sanitizedText.substring(0, 3000)}
"""

VISUAL GUIDELINES (STRICT COMPLIANCE):
1. **Style**: This is a C4 Dynamic/Sequence diagram showing ORDERED INTERACTIONS.

2. **Numbered Steps**: Each interaction MUST be numbered (1, 2, 3...) showing the ORDER of events.
   - Numbers must appear at the START of each arrow label.
   - Use consistent formatting: "1. Action description" (period after number).

3. **Color Palette (C4 Compatible - EXACT HEX VALUES)**:
   - **Person**: ${C4_PERSON_FILL} (Dark Blue) fill, White Text, Stick figure icon above label.
   - **System/Container (Internal)**: ${C4_CONTAINER_FILL} (Light Blue) fill, White Text.
   - **External System**: ${C4_EXTERNAL_FILL} (Grey) fill, White Text.
   - **Arrows**: ${C4_ARROW_STROKE} (Dark Grey) lines with ${C4_ARROW_STROKE} filled arrowheads.
   - **FORBIDDEN COLORS**: DO NOT use green, red, yellow, or orange for participants.

4. **Participant Rendering**:
   - Actors/Systems as rounded rectangles with uniform width (minimum 120px).
   - Each participant box must show: Name (bold, 14px+) and Type/Technology (regular, 12px+).
   - Person participants MUST include a stick-figure icon above the rectangle.
   - Participants should be spaced evenly with at least 40px gap between them.

5. **Layout**:
   - Use ${layoutDirection}.
   - Arrows MUST show direction of interaction with filled triangular arrowheads.
   - Label arrows with both NUMBER and ACTION (e.g., "1. Sends request").
   - Response/return arrows: use dashed lines with return label (e.g., "2. Returns JWT token").
   - Vertical spacing between interaction rows: at least 30px.

6. **Loops/Cycles**:
   - If the flow loops back (e.g., A->B->C->A), show it clearly with a curved return arrow.
   - Use dotted lines for async/optional interactions.
   - Label loop boundaries with "loop [condition]" notation.

7. **Legend**: Include a Key box in the bottom-right corner showing:
   - Participant color meanings (internal vs external).
   - Arrow style meanings (solid = sync, dashed = response/async).

8. **Spacing Preference**: ${layoutHint}

${sharedQualityRules}

VISUAL STYLE CONTEXT: ${userGrounding}
LAYOUT PREFERENCE: ${layoutPreference}

Generate the diagram image now. The detected context is: ${reasoning}
`;
    } else if (framework === 'Flowchart') {
        return `
Generate a professional FLOWCHART/PROCESS diagram as a clean, presentation-ready image.

CONTEXT:
"""
${sanitizedText.substring(0, 3000)}
"""

VISUAL GUIDELINES (STRICT COMPLIANCE):
1. **Style**: This is a process flowchart showing DECISION LOGIC and PROCESS STEPS.

2. **Shape Standards (STRICT - shapes encode meaning)**:
   - **Start/End**: Rounded rectangles or stadium shapes. Start = #2E7D32 (Green), End = #C62828 (Red). White text.
   - **Process Steps**: Rectangles with rounded corners, ${C4_CONTAINER_FILL} (Light Blue) fill, White Text.
   - **Decisions**: DIAMONDS, ${C4_PERSON_FILL} (Dark Blue) fill, White Text. Must contain a Yes/No question.
   - **Data/Input/Output**: Parallelograms, ${C4_EXTERNAL_FILL} (Grey) fill, White Text.
   - **Sub-process**: Double-bordered rectangle (rectangle with inner border), ${C4_CONTAINER_FILL} fill.
   - All shapes MUST be uniformly sized within their type category.

3. **Color Palette (C4 Compatible)**:
   - Primary Process: ${C4_CONTAINER_FILL} (Light Blue), White Text.
   - Decisions: ${C4_PERSON_FILL} (Dark Blue), White Text.
   - External/Data: ${C4_EXTERNAL_FILL} (Grey), White Text.
   - Start: #2E7D32 (Green), White Text.
   - End: #C62828 (Red), White Text.
   - **FORBIDDEN**: DO NOT use yellow, orange, or purple for any flow shapes.

4. **Layout**:
   - Use ${layoutDirection}.
   - Decision diamonds MUST have exactly 2 outgoing arrows labeled "Yes" and "No" (or equivalent boolean).
   - "Yes" branch goes in the primary flow direction; "No" branch goes perpendicular.
   - Loops should be clearly visible with return arrows routed to avoid crossing other arrows.
   - Maintain consistent spacing between sequential steps (at least 40px gap).

5. **Arrows**:
   - Solid lines (${C4_ARROW_STROKE} Dark Grey) for main flow, 2px stroke width.
   - Dotted lines for optional/async paths.
   - All arrows MUST have labels describing the condition or action.
   - Arrow labels: 12px+ font, positioned to avoid overlapping with other elements.
   - Use orthogonal (right-angle) routing, not diagonal lines.

6. **Spacing Preference**: ${layoutHint}

7. **Legend**: Include a Key box in the bottom-right corner explaining:
   - Shape meanings (rectangle = process, diamond = decision, etc.).
   - Color meanings.

${sharedQualityRules}

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

        // Level-specific guidance to differentiate C1/C2/C3
        const levelGuidance: Record<string, string> = {
            'C1': `
LEVEL-SPECIFIC RULES (C1 - System Context):
- Show the system under discussion at the CENTER, surrounded by its users and external systems.
- The central system MUST be visually larger or more prominent than external systems.
- External systems use GREY (${C4_EXTERNAL_FILL}). The main system uses BLUE (${C4_SYSTEM_FILL}).
- Relationships should describe WHAT is communicated, not HOW (e.g., "Views account balances" not "REST API call").
- Keep it simple: typically 3-10 elements total. If more, consider C2 instead.
- No internal details. The main system is a single box, not decomposed.`,
            'C2': `
LEVEL-SPECIFIC RULES (C2 - Container):
- Show the containers (applications, databases, message queues) INSIDE the system boundary.
- The system boundary MUST be a dashed-border box enclosing all internal containers.
- Each container MUST show: Name (bold), Technology (e.g., "Spring Boot", "PostgreSQL"), and brief Description.
- Databases MUST use cylinder shapes, not rectangles.
- Message queues should use a distinct shape or icon annotation.
- External users and systems sit OUTSIDE the system boundary.
- Relationships should include the protocol/technology (e.g., "Makes API calls [HTTPS/JSON]").`,
            'C3': `
LEVEL-SPECIFIC RULES (C3 - Component):
- Show the components (modules, classes, services) INSIDE a single container boundary.
- The container boundary MUST be a dashed-border box with the container name as title.
- Components use lighter blue (${C4_COMPONENT_FILL}) with black text to distinguish from containers.
- Each component MUST show: Name (bold) and Technology/Responsibility.
- Group related components into logical clusters within the boundary.
- Show interfaces/ports at the boundary edge where external connections enter.
- Relationships describe method calls, events, or data flow between components.`
        };
        const levelSpecific = levelGuidance[c4Level] || levelGuidance['C2'];

        return `
Generate a professional C4 Model ${levelDesc} diagram as a clean, presentation-ready image.

ARCHITECTURE CONTEXT:
"""
${sanitizedText.substring(0, 3000)}
"""

VISUAL GUIDELINES (STRICT COMPLIANCE REQUIRED):
1. **Color Palette (Official C4 - EXACT HEX VALUES MANDATORY)**:
   - **Person**: ${C4_PERSON_FILL} (Dark Blue) fill, White (${C4_TEXT_WHITE}) Text, 14px+ bold label.
   - **Software System (Internal)**: ${C4_SYSTEM_FILL} (Blue) fill, White (${C4_TEXT_WHITE}) Text.
   - **External System**: ${C4_EXTERNAL_FILL} (Grey) fill, White (${C4_TEXT_WHITE}) Text.
   - **Container**: ${C4_CONTAINER_FILL} (Light Blue) fill, White (${C4_TEXT_WHITE}) Text.
   - **Database**: ${C4_CONTAINER_FILL} (Light Blue) fill, Cylinder Shape, White (${C4_TEXT_WHITE}) Text.
   - **Component**: ${C4_COMPONENT_FILL} (Lighter Blue) fill, Black (${C4_TEXT_DARK}) Text.
   - **Boundary Box**: Dashed ${C4_BOUNDARY_STROKE} border, NO fill (transparent), Grey title text.
   - **Arrows**: ${C4_ARROW_STROKE} (Dark Grey) lines, 2px stroke width, with filled triangular arrowheads.
   - **FORBIDDEN COLORS**: DO NOT use green, red, yellow, orange, or purple for structural elements.

2. **Shapes & Sizing (STRICT)**:
   - **Person**: Stick figure icon (circle head + body lines) ABOVE a rounded rectangle label box. The stick figure is mandatory.
   - **System/Container**: Rounded rectangles with consistent corner radius (8-12px).
   - **Database**: MUST use Cylinder shape (3D cylinder, not a rectangle with "DB" label).
   - **UNIFORM SIZE**: All elements of the same type MUST be the same width and height.
   - **Minimum Element Size**: Width >= 180px, Height >= 80px. Each element must comfortably fit its label.
   - **Element Content**: Each box must show up to 3 lines: Name (bold), [Technology] (italic/smaller), Description (regular).

3. **Arrows & Relationships**:
   - **Synchronous**: Solid lines, filled triangular arrowhead.
   - **Asynchronous**: Dashed lines, open triangular arrowhead.
   - **Data Flow**: Solid lines, filled diamond arrowhead (optional).
   - **Arrow Labels**: Centered on the arrow path, 12px+ font, describing the interaction.
   - **Arrow Routing**: Use orthogonal (right-angle) routing. Avoid diagonal lines.
   - **Layout**: ${layoutDirection}.

4. **Layout Algorithm (CRITICAL for Visual Coherence)**:
   - **User/Person Placement**: TOP-LEFT or TOP-CENTER only. Always above all other elements.
   - **Vertical Chaining**: Force vertical depth by chaining dependencies: User -> Web App -> API -> DB.
   - **Anti Fan-Out**: User connects ONLY to main entry point(s), NOT to every node.
   - **Element Alignment**: Same-type elements MUST align on a shared horizontal or vertical axis.
   - **Minimize Crossing**: Route arrows to avoid overlaps. No arrow should cross through an element box.
   - **Logical Grouping**: Visually cluster related elements in proximity within boundary boxes.
   - **Spacing Preference**: ${layoutHint}
   - **Goal**: Tidy, consistent, elegant, well-aligned, professional diagram.

5. **Boundaries (CRITICAL for C4 hierarchy)**:
   - Group related elements using visual boundary boxes.
   - Boundaries MUST have: dashed borders (${C4_BOUNDARY_STROKE}), NO background fill (transparent), title text at top-left.
   - Boundaries represent system or container scope. Label them clearly (e.g., "Internet Banking System [Software System]").
   - Elements INSIDE a boundary are internal. Elements OUTSIDE are external.
   - Nested boundaries are allowed (e.g., a Container boundary inside a System boundary).

6. **Legend (MANDATORY)**:
   - Include a Key/Legend box in the bottom-right corner.
   - The legend MUST show: each shape type with its color and meaning.
   - Legend box: thin solid border, white background, 12px font.

7. **CRITICAL STRUCTURAL RULES**:
   - This is a STRUCTURAL diagram. Only use C4 element types: Person, System, System_Ext, Container, ContainerDb, Component.
   - DO NOT invent types like Goal(), Reason(), Decision(), Action(), Process().
   - Every element MUST have a label. No unlabeled boxes.
   - Every relationship MUST have a label describing the interaction.

${levelSpecific}

${sharedQualityRules}

VISUAL STYLE CONTEXT: ${userGrounding}
LAYOUT PREFERENCE: ${layoutPreference}

Generate the ${c4Level} diagram image now. The detected context is: ${reasoning}
`;
    }
}

/**
 * Build a corrective re-prompt for visual diagram generation when
 * the initial output was empty or failed quality checks.
 *
 * This is the visual equivalent of `buildFixPrompt` for DSL generation.
 */
export function buildVisualFixPrompt(
    originalPrompt: string,
    failureReason: string
): string {
    return `
The previous image generation attempt FAILED or produced an UNSATISFACTORY result.

FAILURE REASON: "${failureReason}"

CORRECTIVE INSTRUCTIONS:
1. You MUST generate a valid PNG image this time.
2. Follow ALL the visual guidelines from the original prompt below.
3. Pay special attention to the failure reason and fix the specific issue.
4. Common fixes:
   - If "no image returned": Ensure you output an image, not just text.
   - If "text too small": Use minimum 14px font for all labels.
   - If "wrong colors": Use EXACT hex values from the color palette.
   - If "missing elements": Include ALL elements described in the context.
   - If "poor layout": Follow the layout algorithm strictly.

ORIGINAL PROMPT (follow this exactly, fixing the noted issue):
${originalPrompt}
`;
}
