# Project Status: C4X Extension

| Metric | Status | Details |
| :--- | :--- | :--- |
| **Version** | v1.3.0 | **Gemini 3.1 Pro Migration + User Model Selection + Agent Team Expansion** |
| **Build** | Pending | Awaiting build verification after model migration |
| **Tests** | Pending | Tests updated for new model names — run `make test` to verify |
| **Linting** | Zero Issues | `eslint` clean |
| **AI** | Advanced | **Gemini 3.1 Pro** + **MCP Grounding** + **Multi-Framework Detection** |

## v1.3.0 Release Notes (2026-03-02)

### 1. Gemini 3.1 Pro Migration (P0 — Critical)
- **Primary**: `gemini-3.1-pro-preview` — Best reasoning (ARC-AGI-2: 77.1%), 1M context.
- **Fallback**: Smart elevation to `gemini-3.1-pro-preview` or `gemini-3-flash-preview`.
- **REMOVED**: `gemini-3-pro-preview` (sunset March 9, 2026) and `gemini-3.1-flash-preview` (invalid model ID).
- **ADR-015**: Documents the migration strategy and rationale.

### 2. User-Configurable Model Selection
- **Free-text model input**: Users can now enter any Gemini model ID their API key supports.
- **No more restrictive enum**: Decouples the extension from Google's model lifecycle.
- **Date-proof**: New models can be used immediately without an extension update.

### 3. Agent Team Expansion (7 Agents)
- **NEW**: GCP AI Architecture Coherence Agent (`gcp-ai-architect.md`)
- **NEW**: Delivery Manager Agent (`delivery-manager.md`)
- **NEW Commands**: `/track-models`, `/audit-architecture`, `/delivery-status`, `/update-roadmap`

## P0 — Critical (Must Do Before Release)

- [x] Migrate from `gemini-3-pro-preview` (sunset March 9, 2026)
- [x] Fix `gemini-3.1-flash-preview` (invalid model ID) — changed to `gemini-3.1-pro-preview`
- [x] Remove sunset models from fallback chain
- [x] Update `package.json` model configuration
- [x] Update test assertions for new model names
- [x] Create ADR-015 for model migration strategy
- [ ] Run full test suite (`make test`) to verify no regressions
- [ ] Build and verify VSIX package (`make package`)

## P1 — High Priority (This Sprint)

- [x] Create GCP AI Architecture Coherence agent
- [x] Create Delivery Manager agent
- [x] Create `/track-models` command
- [x] Create `/audit-architecture` command
- [x] Create `/delivery-status` command
- [x] Create `/update-roadmap` command
- [x] Update CLAUDE.md with agent/skill cross-references
- [ ] Refactor model IDs to constants (eliminate string literals)
- [x] Add `c4x.ai.imageModel` user setting for visual generation model
- [x] Updated to Nano Banana 2 (`gemini-3.1-flash-image-preview`) as default
- [ ] Update GEMINI.md with new model guidance
- [ ] Update FAQ.md with model migration notes
- [x] Update README.md model table
- [ ] Sync to public repo after validation

## P2 — Medium Priority (Next Sprint)

- [ ] Add model validation on extension activation (warn if model ID is invalid)
- [ ] Add sunset warning notification (alert users 30 days before model sunset)
- [x] ~~Explore `gemini-3.1-flash-image-preview` for faster/cheaper image generation~~ (Completed - now default)
- [ ] Add `thinking_level` parameter support for Gemini 3.x models
- [ ] Generate dedicated Flowchart and Sequence reference images
- [ ] Formalize "Visual-Only Frameworks" in documentation
- [ ] Add competitive analysis to Product Owner agent

## P3 — Backlog

- [ ] Explore Vertex AI integration (enterprise customers)
- [ ] Add context caching support for repeat diagram generation
- [ ] Implement batch API for multi-diagram generation
- [ ] Explore URL context feature for web-based architecture docs
- [ ] Add Google Search grounding for up-to-date technology recommendations

## Known Issues

- **Integration Tests**: `GeminiIssueRepro` and `ContextDepth` tests fail consistently in local dev environment.
- **Visuals**: Flowchart generation may yield inconsistent shapes until dedicated reference images are provided.
- **Model Validation**: No runtime check for invalid model IDs — relies on API error messages.

## Architecture Coherence Notes

### Model Registry (as of 2026-03-02)

| Model ID | Purpose | Status | Sunset |
|---|---|---|---|
| `gemini-3.1-pro-preview` | Primary DSL generation | Active | - |
| `gemini-3-flash-preview` | Fallback DSL generation | Active | - |
| `gemini-3.1-flash-image-preview` | **Default** Visual PNG (Nano Banana 2) | Active ⚡ | - |
| `gemini-3-pro-image-preview` | Visual PNG (Pro quality, user option) | Active | - |
| `gemini-2.5-pro` | User option (legacy) | Active | June 17, 2026 |
| `gemini-2.5-flash` | User option (budget) | Active | June 17, 2026 |
| ~~`gemini-3-pro-preview`~~ | **REMOVED** | **Sunset** | March 9, 2026 |
| ~~`gemini-3.1-flash-preview`~~ | **REMOVED** | **Invalid** | N/A |

### Pricing Impact (per 1M tokens)

| Model | Input | Output | Notes |
|---|---|---|---|
| gemini-3.1-pro-preview | $2.00 | $12.00 | Default — best quality |
| gemini-3-flash-preview | Free | Free | Rate-limited, fast |
| gemini-2.5-pro | $1.25 | $10.00 | Sunset June 2026 |

### Gaps & Risks

| ID | Gap | Severity | Status |
|---|---|---|---|
| G1 | Model IDs are string literals across codebase | MEDIUM | P1 - refactor to constants |
| G2 | Image model not user-configurable | LOW | P2 |
| G3 | No runtime model validation | MEDIUM | P2 |
| G4 | No automated sunset alerting | MEDIUM | P2 |
| G5 | `gemini-2.5-*` models sunset June 2026 | LOW | Monitor |

## Agent Team (7 Agents, 9 Commands)

| Agent | File | Focus | Commands |
|---|---|---|---|
| Code Reviewer | `code-reviewer.md` | VS Code API, Security, Perf | `/review-code`, `/check-performance` |
| Product Owner | `product-owner.md` | Features, Roadmap, Value | `/plan-feature`, `/validate-milestone` |
| QA Validator | `qa-validator.md` | Testing, Quality Gates | Direct invoke |
| Documentation | `documentation.md` | Docs, Examples, Guides | Direct invoke |
| Publisher | `publisher.md` | Marketplace, Releases | `/pre-publish-check` |
| **GCP AI Architect** | `gcp-ai-architect.md` | Model Lifecycle, Architecture | `/track-models`, `/audit-architecture` |
| **Delivery Manager** | `delivery-manager.md` | Sprints, Roadmap, Tracking | `/delivery-status`, `/update-roadmap` |

## Roadmap

### v1.3.0 (Current — March 2026)
- Gemini 3.1 Pro migration
- User-configurable model selection
- Agent team expansion (GCP AI Architect, Delivery Manager)
- 4 new commands for delivery workflow

### v1.4.0 (Target — April 2026)
- Model ID constants refactoring
- Image model user configuration
- Sunset warning notifications
- Flowchart/Sequence reference images

### v2.0.0 (Target — Q3 2026)
- Vertex AI enterprise integration
- Context caching for repeat generation
- Batch multi-diagram API
- AI-powered auto-layout optimization
