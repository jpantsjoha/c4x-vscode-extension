# Project Status: C4X Extension

| Metric | Status | Details |
| :--- | :--- | :--- |
| **Version** | v1.3.0 | Gemini 3.1 Pro Migration + User Model Selection + Visual Customization |
| **Build** | Passing | 117ms (esbuild) |
| **Tests** | 474 Passing | 6 pending (API-gated) |
| **Linting** | Zero Issues | `eslint` clean |
| **AI** | Advanced | **Gemini 3.1 Pro** + **MCP Grounding** + **Multi-Framework Detection** |

## v1.3.0 Release Notes (2026-03-04)

### 1. Gemini 3.1 Pro Migration
- **Primary**: `gemini-3.1-pro-preview` — Best reasoning (ARC-AGI-2: 77.1%), 1M context.
- **Fallback**: Smart elevation to `gemini-3.1-pro-preview` or `gemini-3-flash-preview`.
- **Removed**: `gemini-3-pro-preview` (sunset March 9, 2026) and `gemini-3.1-flash-preview` (invalid model ID).

### 2. User-Configurable Model Selection
- **Free-text model input**: Users can now enter any Gemini model ID their API key supports.
- **No restrictive enum**: Decouples the extension from Google's model lifecycle.
- **Future-proof**: New models work immediately without an extension update.

### 3. Visual Customization
- **Image model**: Upgraded to Nano Banana 2 (`gemini-3.1-flash-image-preview`) as default.
- **User-configurable image model**: New `c4x.ai.imageModel` setting.
- **Visual presets**: dark, light, pastel, corporate styles for PNG generation.
- **Layout preferences**: balanced, compact, spacious spacing options.
- **Custom grounding context**: Free-text visual style descriptions.

### 4. MCP Validator Server
- New MCP server for C4X syntax validation (`mcp/c4x-mcp-server.ts`).
- Validates diagrams via `validate_c4x` tool.
- Exposes example resources for AI grounding.

### 5. Enhanced Validation
- Element type error detection (catches invalid types like `Class`, `Goal`, etc.).
- Defensive error handling in markdown-it plugin.
- Context scanning depth fix for C4 diagram levels.

### 6. 113 New Examples
- Comprehensive C4X diagram examples across all C4 levels.
- Real-world patterns: event-driven, microservices, GraphQL, OAuth2, healthcare.

## Model Registry (as of 2026-03-04)

| Model ID | Purpose | Status | Sunset |
|---|---|---|---|
| `gemini-3.1-pro-preview` | Primary DSL generation | Active | - |
| `gemini-3-flash-preview` | Fallback DSL generation | Active | - |
| `gemini-3.1-flash-image-preview` | **Default** Visual PNG (Nano Banana 2) | Active | - |
| `gemini-3-pro-image-preview` | Visual PNG (Pro quality, user option) | Active | - |
| `gemini-2.5-pro` | User option (legacy) | Active | June 17, 2026 |
| `gemini-2.5-flash` | User option (budget) | Active | June 17, 2026 |
| ~~`gemini-3-pro-preview`~~ | **REMOVED** | **Sunset** | March 9, 2026 |
| ~~`gemini-3.1-flash-preview`~~ | **REMOVED** | **Invalid** | N/A |

## Known Issues

- **Flowchart Visuals**: Flowchart generation may yield inconsistent shapes until dedicated reference images are provided.
- **Model Validation**: No runtime check for invalid model IDs — relies on API error messages.

## Roadmap

### v1.3.0 (Current — March 2026)
- Gemini 3.1 Pro migration
- User-configurable model selection
- Visual customization features
- MCP validator server

### v1.4.0 (Target — April 2026)
- Model ID constants refactoring
- Sunset warning notifications
- Flowchart/Sequence reference images

### v2.0.0 (Target — Q3 2026)
- Vertex AI enterprise integration
- Context caching for repeat generation
- Batch multi-diagram API
- AI-powered auto-layout optimization
