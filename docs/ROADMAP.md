# C4X Product Roadmap

## Shipped — August 2026

| Version | Theme | What landed |
|---|---|---|
| **1.6.4** | Where the key goes | `C4X: Set Gemini API Key` and `C4X: Clear Gemini API Key`. Adding a key previously had no entry point: the only way in was to trigger an error and click a toast. A key change now takes effect without reloading the window. Six invented command names corrected across user docs |
| **1.6.3** | Model currency | Default image model was retired by Google on 2026-07-17 and still shipping. Migrated every default to a generally available id, added `gemini-3.6-flash`, and a live generation gate that calls the real API against every shipped model |
| **1.6.2** | Editor polish | Elements stay where you drop them, diagrams open centred, session controls grouped |
| **1.6.0–1.6.1** | Visual C4 Editor | Drag-to-edit with guarded writeback, connect mode, boundary reposition and resize, staged changes with source diff |

## Now: harness hardening

The v1.6.x sequence shipped three defects that every gate passed. The gates
tested parts; nobody walked the journey. The active backlog is in
[`IMPROVEMENT-PLAN.md`](../IMPROVEMENT-PLAN.md), summarised here:

| | Item | State |
|---|---|---|
| H1 | Retire the dead image models | **Done**, 1.6.3 |
| H2 | Doc-claim linter, now six rules (R1–R6) | **Done**, gating `make verify-docs` |
| H3 | Definition-of-Done hooks that actually fail | **Done** |
| H4 | Journey and perception test rules in the QA skill | **Done** |
| H5 | Schedule `/track-models`; R4 fails the build when the registry goes stale | Partly done |
| H6 | Status-claim verifier, so a wrong sentence in STATUS.md cannot block a release | Open |
| H7 | `VSCE_PAT` as a repo secret, red Node 20 matrix leg, mirror parity | Open |
| H8 | Run the sync auditor in CI rather than by hand | Open |
| H9 | Discover models at runtime instead of shipping ids | Open, wants its own release |

## Next

**H9 is the one that changes the shape of the product.** Model ids are shipped
constants today, so every retirement needs a release. `models.list` can tell us
what a user's key can actually reach, which removes that treadmill for
everything except deprecation, since Google publishes no lifecycle state in the
API. Design is recorded in `IMPROVEMENT-PLAN.md`.

**Deferred beyond v1.6**, and openly so: an element palette, and delete for
elements and relationships. Both are authoring gestures whose write-back
consequences deserve their own release.

## Historical detail

> **Vision**: C4X makes architecture diagrams as easy as Mermaid, native to VS Code and Markdown, with carefully bounded Gemini assistance.
> **Product contract**: docs as code; deterministic output; source-controlled customisation; no hidden diagram truth.
> **Last revised**: 2026-08-05 — v1.6.1 fast-follow COMPLETE (#137, #138, #66 all merged); `main` green on every local gate (quick-check exit 0, 1328 unit, 103/103 Playwright); release blocked only on Actions billing, #79 UAT evidence and the #46/#66 bundle-budget decision. Prior entry (2026-07-20): v1.6 release sprint code-complete on `main` (PRs #120–#135, #144); v1.6.1 fast-follow tranche (#137, #138, #66) in progress. Both P0 audit findings resolved: overlap-persistence fixed (#107/#109/#114), relationship label editing end-to-end (#114/#116). Layout spacing presets shipped (#115). v1.6 release sprint scoped 2026-07-18: eleven issues across six phases — #96, #97, #111, #119 (UX correctness; #119 edge-repaint fix implemented ahead of Phase 1, pending UAT), #98 (legend polish), #46 (bundle budget), #72 (Playwright closure), #74/#79/#82 (docs + UAT evidence), #118 (HLD/ADR coherence) — all assigned to milestone v1.6.0. Guided UAT can proceed. Wiki publication deferred to P3 [#76](https://github.com/jpantsjoha/c4x-vscode-extension/issues/76). Marketplace publish held pending v1.6 DoD.

## How to read this roadmap

- **Shipped** means released behaviour.
- **Merged** means proven on private `main` but not necessarily released.
- **Committed** means represented by an active GitHub milestone and scoped issues.
- **Gated** means implementation may be built and reviewed but cannot merge until the stated dependency closes.
- **Candidate** means valuable direction without a committed delivery slot.
- **Out of scope** is an explicit non-goal.

GitHub milestones and issues are the execution ledger. This file records product sequencing and acceptance boundaries; [`STATUS.md`](../STATUS.md) records the current snapshot.

## 2026-07-16 (afternoon) checkpoint

### Maturity attained

**The original 15-item MVP slice is implemented (now merged to `main`), ready for guided native `.c4x` UAT.** The verified current path is **open a native `.c4x` standalone Preview → click "Edit C4 Diagram" → select a node → stage property, identifier, or position changes → Save Changes → source updates in-place.** All safety guarantees (SaveAnchor + revision race + overlap guard + inverse-WorkspaceEdit rollback) fire on every writeback.

Markdown `c4x` fences are no longer rendering-only: B18 (#77, merged) delivers the Markdown Preview edit entry and fence-scoped writeback at the same safety level as the native `.c4x` journey. Create/delete/connect and relationship authoring remain rendering-only and must not be represented as shipped.

- **Wave A (foundation)**: 5/5 merged and closed — #50, #51, #52, #53, #54.
- **Wave C (audit hardening)**: 2/2 merged and closed — #62, #63.
- **Wave B (UI capability)**: native MVP increments #55, #58, #56, #59, #70, and #72 are implemented on the integration worktree; add/delete/connect remain deferred.
- Deferred beyond MVP (per stated user scope): #60, #66, #64, #68, #69 (palette + connect + delete).

### Formal completion and release delta

- **#70 B15** — implementation and focused automated evidence are pushed; installed-extension source-round-trip evidence remains before formal tracker closure.
- **#72 B17** — 14 browser-harness scenarios are locally green; installed-extension evidence and a decision on the now-native-only Markdown criterion remain before formal tracker closure.
- **#73 D1** — superseded for active planning by P3 [#76](https://github.com/jpantsjoha/c4x-vscode-extension/issues/76): in-repository Wiki source is complete, but publication is deferred and does not block UAT.
- **#74 D2** — documentation now matches the native `.c4x` implementation; real installed-VS Code screenshots remain an evidence gap.

**B16 #71** conflict-recovery banner is nice-to-have (anchor-guard already fails closed at save; missing only the UI banner). Not blocking MVP but strongly recommended before marketplace.

### PR #75 UAT-first completion order

1. Begin guided UAT on the native `.c4x` editor now; it does not depend on Wiki publication.
2. Confirm the MCP generated-artifact reproducibility fix with green Node 20/26 checks, then obtain three-platform packaged-VSIX evidence.
3. Capture installed-extension screenshots and source-round-trip evidence, then record architect and technical-writer UAT outcomes.
4. Resolve Markdown editor scope and B16 recovery UX for Marketplace readiness.
5. Complete P3 [#76](https://github.com/jpantsjoha/c4x-vscode-extension/issues/76) to publish the Wiki after UAT-critical work.

### Release gate

Do not estimate or announce a Marketplace date until full local validation, clean three-platform package CI, formal UAT, and the Markdown-entry scope decision are complete. Wiki publication is tracked separately as P3 #76.

### Merged achievements

| Outcome | Evidence | Result |
|---|---|---|
| Deterministic Extension Host gate | PR #35; Node.js 20/26, docs, unit and VSIX CI green | Merged; issue #34 closed |
| Standalone preview restored | PR #36; open/refresh commands, menus, shortcut, recovery UX, unit and Extension Host coverage | Merged; issue #33 closed |
| Real quality and clean-VSIX gate increment | PR #38; focused integration, P95 benchmark, honest all-source coverage, Node 20/26 and Ubuntu/macOS/Windows package smoke | Merged at `08da38a` |
| Reproducible quality toolchain | PR #42 head `686ee9f`; exact Node/pnpm/VS Code inputs, immutable action commits, fixed runner families and fresh three-OS package proof | Merged at `cd24e6e` |
| UI architecture and delivery checkpoint | PR #39; roadmap, status, HLD/LLD, proposed ADR-018, user guidance, validation decisions, runbooks, and launch guardrails | Merged at `b61fe28` |
| P0 Harness Validation | `make validate-harness`, fail-closed validators, complete adapters/hooks aligned with `AGENTS.md` | Implementation merged; Epic #28 formal tracker closeout remains open |
| Visual Layout Foundation (Core + Writeback) | Bounded `WorkspaceEdit` transaction layer, AST validation, rollback, coordinate reset, sidecar persistence, interactive canvas | PR #44 merged; Issues #21, #22, #23, #25 closed; #24 deferred post-v1.6 (2026-07-19); #30 closed 2026-07-19 as substantially delivered |
| v1.6 audit-blocker remediation | Rollback via explicit inverse `WorkspaceEdit` + reparse verify; document.version re-check pre-`applyEdit`; overlap guard in write path; polite/assertive a11y live regions | PR #48 in flight (fix/v1.6-audit-blockers) |
| ADR-019 + TDR-017 governance | ADR-019 formalises semantic-authoring scope; supersedes ADR-018 for authoring surface. TDR-017 documents Tier A/B coverage model. Restores intent + feature + how-to docs to `main` | PR #49 in flight (docs/adr-019-and-coverage-exemption) |

### Completion assessment

The Visual C4 Editor is implemented on `main` through PR #117. **v1.6 as a marketplace release is not complete.** Remaining work is the v1.6 release sprint scoped 2026-07-18: five UX issues (#96, #97, #98, #111, #119 — #119 implemented, pending UAT), bundle budget (#46), test evidence (#72), documentation and UAT evidence (#74, #79, #82), and HLD/ADR coherence (#118) — sequenced in six phases in the 'v1.6 release sprint' section below.

| Capability | Evidence-backed state |
|---|---|
| Static preview baseline | Complete and merged |
| Native source writeback (layout metadata) | Complete and merged; PR #48 closes the 4 audit blockers |
| Sidecar persistence | Complete and merged; C11 residual hardening open |
| Source-controlled controls/presets | Complete and merged; `c4x.resetLayout` operational |
| Layout/routing/constraints | Implemented; C12 shape-agnostic a11y + Dagre NaN guard open |
| Interactive canvas (layout mode) | Complete and merged: drag/select, zoom/pan, keyboard movement, ARIA announcements, bounded writeback |
| **Edit C4 diagram entry point** | Native `.c4x` standalone Preview toolbar toggle and Markdown Preview entry (CodeLens, context menu, hover toolbar) both merged |
| **Staged draft + Save/Cancel chrome** | Implemented for native `.c4x` and Markdown fence UAT; draft survives webview reload; close-while-dirty protection (#84) |
| **Property inspector (read + writeback)** | Native label, technology, description, tags, sprite, and identifier rename implemented; lock toggle (#86) and live inline validation (#87) merged to `main`; relationship editing remains deferred |
| **C4-legal palette (add elements)** | Not implemented — #60 (B10), #68 (B11) |
| **Connect mode (add relationships)** | Not implemented — #66 (B12) |
| **Delete element/relationship with cascade preview** | Not implemented — #64 (B13), #69 (B14) |
| **External-change conflict recovery** | Merged to `main` — banner + Reload/Diff/Rebase (#71) |
| **Source diff before Save** | Merged to `main` (#83) |
| **Un-stage individual changes** | Merged to `main` (#85) |
| **Zoom-to-fit + multi-select group move** | Merged to `main` (#88) |
| **Theme/a11y sweep of editor chrome** | Merged to `main` (#90) |
| **Edit-mode performance budget** | 120-node latency spec merged to `main` (#89) |
| **Dependency CVE gate** | Restored via osv-scanner + bundle-size reporting, merged to `main` (#81/#46) |
| **Semantic-editor E2E acceptance** | 14-scenario browser harness + refinement specs: 64 scenarios green after the #92 fix (`5c67507`); Phase 4 scenario additions for #96/#97/#98/#111 and installed-extension release proof remain (#72) |
| **Wiki + living documentation** | Source/docs reconciled; Wiki publication and installed-extension screenshots remain |
| Visual/a11y/performance/package release proof | Remote CI proves Node 20/26 and Linux/macOS/Windows clean-package smoke; UAT and release closeout remain |

### v1.6 release sprint (scoped 2026-07-18)

The final sprint to marketplace release. All work items have detailed GH issues with acceptance criteria.

**Phase 1 — UX Correctness: COMPLETE 2026-07-19**
- #119 Edge repaint during node drag — merged (PR #120); E2E regression pin added (PR #127)
- #97 Live canvas preview of staged text edits — merged (PR #122)
- #96 Exit-edit-mode confirmation when dirty — merged (PR #122); visible discard status fix (PR #130)
- #111 Auto-fit on open + adaptive content padding — merged (PR #122)

**Phase 2 — UX Polish: COMPLETE 2026-07-19**
- #98 Legend drag/reposition + contextual content — merged (PR #126)
- #124 Markdown preview responsive scaling (UAT-found) — merged (PR #125)
- #128 `c4x.markdown.previewScale` default 0.5 (maintainer-directed) — merged (PR #129)

**Phase 3 — Bundle & Release Engineering: MERGED, target accepted**
- #46 VSIX bundle budget remediation + .vscodeignore cleanup — merged (PR #123): VSIX 6.91MB → 3.61MB; TDR-006 revised (≤2.5MB VSIX / ≤3.5MB production bundle); further size optimization deferred to the marketplace-listing phase (maintainer decision, 2026-07-19)

**Phase 4 — Test Evidence: COMPLETE 2026-07-19**
- #72 B17 Playwright acceptance closure — CLOSED: 77 scenarios green (68 pre-existing + 9 new), closure table in the issue body (PRs #127, #130, #131)

**Phase 5 — Documentation & Release Proof: DOCS COMPLETE, UAT PENDING**
- #82 Doc micro-fixes — CLOSED (PR #135)
- #118 HLD and ADR coherence update — CLOSED (PR #135)
- #74 Living docs v1.6 reconciliation — docs merged (PR #135); CHANGELOG [Unreleased] → [1.6.0] promotion remains (Phase 6)
- #79 UAT evidence: installed-VSIX walkthrough + real screenshots — PENDING (human gate)

**UAT-found fixes (added to sprint scope):**
- #132 "Waiting for render..." hang — negative layout origin rejected by webview validation — fixed and merged (PR #133)
- #134 Editor initial zoom matches `c4x.markdown.previewScale` — merged (PR #144)

**Phase 6 — Final Gate (~1 day):**
- #46 Version bump 1.6.0-uat.4 → 1.6.0 + release closeout checklist (CHANGELOG promotion, ADR status flips, three-OS proof once CI is restored)

**Elapsed: 2 days** for Phases 1–5 (scoped 2026-07-18, code-complete 2026-07-19) against the ~11-16 day estimate.

### v1.6.1 — Editor authoring fast-follow (COMPLETE 2026-08-05)

Pulled forward by maintainer decision after UAT (reverses the ADR-019 first-release deferral for this tranche; milestone `v1.6.1 — Editor authoring fast-follow`). All three items merged:

1. #137 Boundary frame reposition + resize — grammar → model → layout → payload → client → writeback chain — **merged (PR #148)**
2. #138 Relationship property editing beyond label — technology, relType, endpoint re-assignment — **merged (PR #146)**
3. #66 Connect mode — create relationships with legality-validated endpoints — **merged (PR #154)**

The 2026-08-05 delivery audit found #66's backend uncommitted in the `main` working tree with `feat/66-connect-mode` holding none of it, and no UI at all. Rescuing and completing it also surfaced two defects that would otherwise have shipped: a stale-range guard that checked geometry rather than identity (PR #152), and a structural-equivalence check that broke connect mode on any multi-view document (PR #154).

Milestone gates on `main`: `make quick-check` exit 0 · 1328 unit · 103/103 Playwright · 3/3 performance budgets.

**Deviation on record:** #66 set a ≤4 KB bundle-regression budget; the measured production regression is +18.5 KB (3443.8 → 3462.3 KB). Flagged for re-baselining alongside #46 rather than silently accepted.

### Remaining before the v1.6.1 publish

No code work is outstanding. Two maintainer actions gate the release:

1. **Restore GitHub Actions billing** — every run has aborted in under six seconds since 2026-07-19, blocking the three-platform packaged-VSIX proof. The spend reductions in PR #150 take effect the moment it is restored.
2. **#79 UAT evidence** — installed-VSIX walkthrough plus six real screenshots.
3. ~~Bundle budget decision~~ — **resolved 2026-08-05.** VSIX cut 3.64 MB → **1.17 MB** (68%) by dropping a shipped source map and marketplace imagery that `vsce` already serves from GitHub. First time inside the TDR-006 2.5 MB target; the #66 in-bundle regression is immaterial at this size.

### Explicitly deferred (post-v1.6)

- #60/#68 Add element palette (B10/B11) — ADR-019 §16: "Not planned for first release"
- ~~#66 Connect mode (B12)~~ — pulled into the v1.6.1 fast-follow and **shipped 2026-08-05 (PR #154)**
- #64/#69 Delete element/relationship (B13/B14) — ADR-019 §16: "Not planned for first release"
- #76 Wiki publication — P3, does not block UAT or marketplace release
- #80 Repo hygiene — P2, no user impact
- #110 Save latency on iCloud — already mitigated (sidecar read skip, fence cache)
- #24 Hybrid layout/routing/constraint quality — large scope; removed from the v1.6 milestone (2026-07-19)

## Current sequencing

```text
Visual Layout Foundation (MERGED on main via PR #44)
       │
       ▼
PR #48 (audit blockers) ──> PR #49 (ADR-019 + TDR-017) ──> main
       │
       ▼
Wave A — Foundation plumbing (parallel)
  ├─ #50 A1 vscode-seam extraction for Tier A coverage
  ├─ #51 A2 typed protocol schemas
  ├─ #53 A3 SaveAnchor resolver
  ├─ #52 A4 C4-legality validator
  └─ #54 A5 webviewA11y module
       │
       ▼
Wave B — UI capability (sequential)
  ├─ #55 B6  Edit C4 diagram entry point (placeholder editor)
  ├─ #58 B7  Read-only property inspector
  ├─ #56 B8  Property inspector writeback (description)
  ├─ #59 B9  Editor chrome (dirty state, changes list, Save/Cancel)
  ├─ #60 B10 Palette: add-Container-in-System_Boundary
  ├─ #68 B11 Palette: add remaining element types
  ├─ #66 B12 Connect mode (add relationship)
  ├─ #64 B13 Delete element with cascade preview
  ├─ #69 B14 Delete relationship
  ├─ #70 B15 Inspector remaining fields + safe identifier rename (supersedes #27)
  ├─ #71 B16 External-change conflict recovery
  └─ #72 B17 Playwright acceptance suite (full journey)
       │
       ▼
Wave C — Residual audit hardening (parallel to A/B)
  ├─ #63 C11 Sidecar hardening (precision, -0, newline, serialization, locked)
  └─ #62 C12 Dagre NaN guard + shape-agnostic a11y selectors
       │
       ▼
Documentation (rolls with Wave B)
  ├─ #73 D1 Wiki: Visual C4 Editor page
  └─ #74 D2 Capability matrix + how-to sync
       │
       ▼
Refinement batch (MERGED to main, PRs #93–#117)
  ├─ #83 source-diff panel · #84 draft survival · #85 un-stage · #71 conflict banner  ✓
  ├─ #86 lock toggle · #87 inline validation · #88 zoom-fit/multi-select · #90 theme sweep  ✓
  ├─ #81/#46 CVE gate restore · #89 perf budget · #91 docs/marketing sync  ✓
  ├─ #92 regression fix · #105 relationship label editing · #111 spacing presets  ✓
  └─ #107/#109/#114 audit P0 remediations (overlap pinning, containment, re-wrap)  ✓
       │
       ▼
v1.6 release sprint (scoped 2026-07-18)
  ├─ Phase 1 (parallel): #119 edge repaint on drag (fixed, in UAT) · #97 live canvas text preview · #96 exit-edit confirmation · #111 auto-fit on open + adaptive padding
  ├─ Phase 2: #98 legend drag/reposition + contextual content (after Phase 1)
  ├─ Phase 3 (parallel): #46 .vscodeignore cleanup + VSIX budget remediation
  ├─ Phase 4: #72 Playwright acceptance closure for Phase 1–2 changes
  ├─ Phase 5: #82 doc micro-fixes · #74 living docs · #79 UAT evidence · #118 HLD/ADR coherence
  └─ Phase 6 (gate): version bump 1.6.0 + #46 release closeout → v1.6 Marketplace publish
```

All 21 sub-issues live under milestone `v1.6.0 — Visual Layout Mode` and epic #47. Labels: `codex` (Codex-ready), `wave-a-foundation`, `wave-b-ui-capability`, `wave-c-audit-hardening`.

## Foundation gate — P0 Agent Harness 2.0

**Milestone**: P0 — Agent Harness 2.0
**Epic**: #28
**Purpose**: make CI authoritative and keep every supported coding surface aligned with one engineering contract.

| Issue | Committed outcome | Checkpoint state |
|---:|---|---|
| #10 | Canonical cross-IDE skills and thin adapters | Open; body revised to vendor-neutral scope |
| #15 | Canonical local, Git, and CI quality gates | Open; PR #38 increment merged; canonical Make/harness and >=80% coverage remain |
| #17 | Harness schemas and self-validator | Open; fail-closed negative proof remains |
| #18 | Reproducible Linux/macOS/Windows CI and clean-VSIX smoke | Open; PR #42 merged at `cd24e6e` after all six required jobs in run `29285494087` passed for head `686ee9f`, but the canonical Make-target failure path remains |
| #19 | Diagram UX/Layout and DevEx ownership | Open |
| #20 | Hook portability and documentation reconciliation | Open |

### P0 exit criteria

- `make quick-check`, `make check`, `make check-full`, and `make validate-harness` execute real commands.
- Deliberately invalid fixtures prove validators and strict documentation checks return nonzero.
- Unit, integration, coverage, benchmark, Extension Host, documentation, build, and package gates are reproducible.
- CI toolchain inputs are pinned, resolved versions are logged, and a rerun can reproduce the declared environment.
- A clean VSIX installs, activates, exposes the core commands, and opens the preview on Linux, macOS, and Windows.
- Adapters and hooks remain repository-relative and cannot weaken the canonical contract.
- CI is green and ADR-018 has the required Product, Engineering, QA, Security, and UX acceptance.

## Committed — v1.6.0 Visual C4 Editor (full semantic authoring)

**Milestone**: v1.6.0 — Visual Layout Mode
**Epic**: #47 (Visual C4 Editor: source-authoritative user journey)
**Governing decisions**: [ADR-018](adrs/018-source-controlled-visual-layout-mode.md) (foundation), [ADR-019](adrs/019-visual-c4-editor-semantic-authoring.md) (authoring scope), [TDR-017](adrs/TDR-017-coverage-tiering-and-exemptions.md) (coverage model), [intent doc](architecture/visual-c4-editor-intent-and-delivery-plan.md)
**Product outcome (target, not current implementation)**: users select a rendered C4X diagram in Markdown Preview, click **Edit C4 diagram**, refine the C4 model visually (move, edit fields, add/delete elements + boundaries, add/change/delete relationships) in a staged draft with source diff and Save/Cancel, and see the persisted source re-render immediately after one atomic validated `WorkspaceEdit`.

### Wave A — Foundation plumbing (parallel; no user-visible capability)

| Issue | Outcome | Completion boundary |
|---:|---|---|
| #50 (A1) | Extract vscode boundary from WritebackTransaction + SidecarPersistence | Both files clear the Tier A c8 floor; extension-host tests unchanged |
| #51 (A2) | Extend visualLayoutProtocol with typed semantic operations | Schemas + runtime validators for add/update/delete Element+Relationship + setPresentationOption; unit-tested |
| #53 (A3) | SaveAnchor type + resolver | Anchor captured on open, re-resolved before every applyEdit; fails closed on uri/ordinal/fingerprint/model mismatch |
| #52 (A4) | C4-legality validator | Pure function; 100% branch coverage; powers palette + preflight |
| #54 (A5) | webviewA11y module | Polite/assertive live-region emitter extracted from previewClientScript; jsdom-tested |

### Wave B — UI capability (sequential; each ships one visible increment)

| Issue | Outcome | Completion boundary |
|---:|---|---|
| #55 (B6) | c4x.editDiagramInPreview command + Preview entry | Hover toolbar + context menu + keybinding; placeholder editor opens; anchor captured |
| #58 (B7) | Read-only property inspector | Selection → inspector data flow proven; no writeback |
| #56 (B8) | Property inspector writeback (description) | Full validation ladder end-to-end for one field; source diff pre-save |
| #59 (B9) | Editor chrome (dirty state, changes list, Save/Cancel, reset-draft) | Staged draft container; wraps all operations |
| #60 (B10) | Palette: add-Container-in-System_Boundary | Smallest add-element increment; palette → planner pipeline proven |
| #68 (B11) | Palette: all remaining element types | Person/System/Component/Boundary/Node + _ext variants, C4-legality-gated |
| #66 (B12) | Connect mode: add relationship | Source→target picking; typed emission; keyboard-operable |
| #64 (B13) | Delete element with cascade preview | Confirmation modal; multi-edit atomic |
| #69 (B14) | Delete relationship | Single-select delete |
| #70 (B15) | Inspector remaining fields + safe identifier rename | name/technology/tags/sprite; id rename updates all Rel references atomically (supersedes #27) |
| #71 (B16) | External-change conflict recovery | Banner + Reload/Diff/Rebase actions; assertive announcement — merged to `main` (see refinement batch below) |
| #72 (B17) | Playwright acceptance suite | 14-scenario E2E; keyboard-only path; visual snapshots |

### Wave C — Residual v1.6 audit hardening (independent)

| Issue | Outcome |
|---:|---|
| #63 (C11) | Sidecar precision + `-0` + trailing newline + write serialization + `locked` preservation |
| #62 (C12) | Dagre `Number.isFinite` guard + shape-agnostic selection/lock CSS |

### Documentation (rolling)

| Issue | Outcome |
|---:|---|
| #73 (D1) | GitHub Wiki: Visual C4 Editor page + link from docs index |
| #74 (D2) | Capability confirmation matrix + how-to sync with shipped UI (living docs) |

### Refinement batch (post-MVP hardening for UAT) — MERGED

Sequential UI tickets R1–R8 plus toolchain/perf work. All merged to `main` (PRs #93–#117). The #92 regression was fixed at `5c67507`.

| Issue | Outcome | Definition of done |
|---:|---|---|
| #83 (R1) | Source-diff panel before Save | Collapsible sidebar diff of the pending writeback; unit + host coverage |
| #84 (R2) | Close-while-dirty protection + draft survival | Staged draft survives webview reload; explicit discard path; unit coverage |
| #85 (R3) | Un-stage individual changes | Per-entry remove in the changes list; Save applies only remaining edits |
| #71 (B16/R4) | External-change conflict banner | Reload/Diff/Rebase recovery actions; assertive a11y announcement |
| #86 (R5) | Lock toggle in property inspector | Locked checkbox round-trips through writeback; locked elements non-movable |
| #87 (R6) | Live inline validation in inspector | Field-level messages as-you-type; invalid edits never stage |
| #88 (R7) | Zoom-to-fit + multi-select group move | Toolbar Fit button; group drag + keyboard move for multi-selection |
| #90 (R8) | Theme sweep of new editor chrome | Static audit: no unapproved hardcoded hex; focus-visible per control; three-theme contrast via theme tokens |
| #81/#46 (T4) | Restore dependency CVE gate | osv-scanner gate + bundle-size reporting in Make/CI (TDR-006/TDR-007) |
| #89 (R9) | Edit-mode performance budget | 120-node interaction latency spec in the Playwright suite |
| #91 (R10) | Docs + marketing sync | STATUS/ROADMAP/CHANGELOG/how-to/feature doc reflect the batch; Medium draft staged under `docs/marketplace/` |
| #92 | Regression fix: 6 B17 scenarios | All 24 `visual-c4-editor` scenarios green; root cause in commit body |

### Definition of done (v1.6 marketplace publish)

Per epic #47 (mirrored here as the release gate). Marketplace publish requires ALL of:

- All 21 sub-issues (A1-A5, B6-B17, C11-C12, D1, D2) merged into `main`.
- ADR-019 approval evidence recorded: Product Owner, Diagram UX/Layout, Code Reviewer + Security Auditor, Delivery Manager, TDR-006 bundle-budget recheck.
- Extension Host + Playwright suites cover the full journey (B17).
- Keyboard-only completion of the journey passes (B17 scenario 12).
- Screen-reader announcements verified with VoiceOver + NVDA for selection, dirty state, validation errors, save success, and conflict banner.
- UAT: at least one architect and one technical writer complete the journey without a runbook (per epic #47 DoD).
- CHANGELOG, README, docs/README, feature doc, how-to, Wiki reflect actual shipped behaviour (D2).
- Three-OS clean-VSIX smoke + package-budget under TDR-006 (recheck required if bundle grows >10%).
- #46 release-closeout checklist complete.

## Shipped product foundation

### v1.4.0 — Stability and Trust

- C4X parser and C1/C2/C3/dynamic rendering.
- Markdown fenced-diagram integration.
- Dagre-based automatic layout and SVG rendering.
- Classic, Modern, Muted, High Contrast, Auto, and C4 Standard themes.
- SVG, PNG, clipboard, HTML, and print-preview workflows.
- Gemini-assisted DSL and image generation with validation/fallback.
- MCP C4X validator and bundled syntax/guideline resources.

### Post-v1.4 merged baseline

- Self-contained MCP bundle and deterministic protocol checks.
- Node.js 26-compatible unit runner.
- Deterministic offline Extension Host tests.
- Restored standalone open/refresh preview commands and C4X grammar loading.
- Real focused integration, P95 benchmark, honest all-source coverage, and three-OS clean-VSIX smoke gates.

See the [changelog](../CHANGELOG.md) for detailed release history.

## Parallel product candidates

These remain valuable but do not displace the active P0 and v1.6 sequence:

| Candidate | Product value | Re-entry condition |
|---|---|---|
| Copilot Chat participant | Discoverability and conversational architecture workflows | Separate milestone after the UI gate is stable |
| Mermaid-to-C4X import | Lowers migration friction | Evidence of import demand and bounded validation design |
| Architecture critique | Differentiated Gemini value | Product signal and explicit privacy/context boundary |
| Standalone MCP package | Ecosystem reach | Release/publisher capacity |
| Vertex AI enterprise integration | Regional and enterprise controls | Enterprise customer demand and security review |

## Explicit non-goals

Per ADR-019 §16:

- A general-purpose drawing, wireframing, or presentation application.
- Arbitrary HTML, image, script, filesystem, command, or text injection from the webview.
- Auto-saving every gesture to the source document.
- A persistent hidden canvas model or untracked temporary file.
- Silent full-document or cross-document rewrites.
- Loss of comments/formatting without an explicit reviewed replacement.
- Full semantic editing of Structurizr/PlantUML in the first release (layout-only sidecar remains supported per ADR-018).
- Automatic AI regeneration on Save without a user-visible source diff and normal validation.
- Public mirror sync or marketplace publication as part of the current private-repository development session.

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Visual Layout Foundation is mistaken for the finished v1.6 release | High | High | ADR-018 marked superseded for authoring scope; ADR-019 formalises full scope; ROADMAP + STATUS + epic #47 name every missing capability; CHANGELOG deferred until v1.6 marketplace publish |
| Scope expansion delays v1.6 marketplace publish indefinitely | High | High | 21 sub-issues under epic #47 with named DoD; Codex delegation for Wave A/B/C; weekly checkpoint against the sequencing diagram; #46 release closeout as the final gate |
| Approval bottleneck holds Wave B before implementation | Medium | High | ADR-019 §Approval evidence enumerates all 5 required sign-offs; Product Owner + Delivery Manager can pre-approve Wave A (foundation-only) to run in parallel |
| Source writeback corrupts user-authored text | Low (post-PR#48) | Critical | Parser-derived UTF-16 ranges, strict allowlist, revision re-check pre-`applyEdit`, overlap guard, one transaction, reparse + rollback (all landed in PR #48) |
| Semantic writeback regresses layout writeback | Medium | High | Every Wave B PR runs the existing #26 layout regression suite; B17 adds semantic-editor E2E suite |
| Webview messages cross the trust boundary unchecked | Low | High | Typed A2 protocol; runtime schema validation; every op re-validated in extension host; no free-form text posts |
| Visual proof is synthetic or subjective | High | High | Production-backed browser/Extension Host tests, geometric assertions, snapshots, a11y with real screen readers, human UAT |
| Bundle size regression breaks TDR-006 budget | Medium | Medium | Every Wave B issue names a bundle-size regression ceiling; TDR-006 recheck required before v1.6 publish |
| Coverage regression hides in Tier B set | Medium | Medium | TDR-017 enforcement rules: exclude-list additions require Tier B row; A1 brings flagship files back into Tier A |
| CI is green on one platform but package fails elsewhere | Medium | High | Three-OS clean-VSIX install/activation/preview smoke |

## Governance

- The P0 harness workstream introduces the root `AGENTS.md` engineering contract; until that branch merges, accepted ADRs and this roadmap remain the visible policy on `main`.
- Accepted ADRs define architectural boundaries.
- This roadmap defines committed product scope and sequencing.
- [`STATUS.md`](../STATUS.md) records evidence-backed state.
- GitHub issues and PRs record acceptance, ownership, and closure evidence.
