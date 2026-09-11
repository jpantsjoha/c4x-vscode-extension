// Default C4X Expert Visual Architect guidelines (v2.0).
//
// Used as the in-memory fallback by GeminiService when neither
// docs/C4X-GENERATION-GUIDELINES.md nor GEMINI.md is available in the
// workspace.
//
// Source of truth: docs/prompts/c4x-default-guidelines.md
// (See ADR/TDR-015 — externalised AI prompt. Keep this file and the doc in sync;
// `make check-prompts` (planned, see IMPROVEMENT-PLAN.md WS-5 T5.5) will diff them.)
//
// Extracted from GeminiService.ts on 2026-05-02 as the first WS-5 decomposition step.

export const DEFAULT_GUIDELINES = `
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
