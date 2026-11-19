import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
import { C4XParseError, c4xParser } from '../parser';
import { loadBinding, saveBinding, clearBinding } from './editorBinding';
import { parseStructurizrDSL, StructurizrLexerError, StructurizrParserError } from '../parser/structurizr';
import { takeUnseenWarnings } from '../model/modelWarnings';
import { parsePlantUMLtoC4Model } from '../parser/plantuml';
import { c4ModelBuilder } from '../model/C4ModelBuilder';
import { buildNodeSnapshots } from './nodeSnapshots';
import { positionalIdentityOf, rebaseRefusal, type PositionalIdentity } from './positionalIdentity';
import { C4Element } from '../model/C4Model';
import { isRelationshipLegal } from '../model/c4Legality';
import { dagreLayoutEngine, resolveLayoutSpacing, type LayoutOptions } from '../layout/DagreLayoutEngine';
import { defaultLayoutWorker, layoutWithDeadline, needsLayoutWorker } from '../layout/layoutDeadline';
import { elementStyleContextFor, svgBuilder } from '../render/SvgBuilder';
import { themeManager } from '../themes/ThemeManager';
import { computeLegendEntries, computeLegendSwatchColors, computePresentElementTypes, type LegendEntry } from './legendCatalog';
import { appendKeyToSvg, computeKeyEntries, keySwatchTheme, readExportIncludeKey, type KeySwatchTheme } from '../render/KeyRenderer';
import type { LayoutResult } from '../layout/DagreLayoutEngine';
import type { C4Theme } from '../themes/Theme';
import type { C4View } from '../model/C4Model';
import { elementStyleClientInputs, type ElementStyleClientInputs } from './elementStyleClient';
import {
    isVisualLayoutMessage,
    isRequestSourceDiffMessage,
    isResolveConflictMessage,
    isAddRelationshipMessage,
    isDirtyStateChangedMessage,
    isLayoutModeMessage,
    isRefreshDeclinedMessage,
    MoveAcceptedMessage,
    BatchAcceptedMessage,
    MoveRejectionCode,
    MoveRejectedMessage,
    SourceDiffMessage,
    ExternalChangeConflictMessage,
    RefreshDeferredMessage,
    VisualLayoutSnapshot,
    VISUAL_LAYOUT_PROTOCOL_VERSION,
    SOURCE_CHANGED_SAVE_REFUSAL,
    rebaseAcceptedNotice,
} from './visualLayoutProtocol';
import { buildBoundarySnapshots } from './boundarySnapshots';
import { type AnchorCheck, decideRenderCompletion, decideSourceEvent, NonSourceRenderGate, type RenderCause } from './nonSourceRenderGate';
import { materialiseDraft } from '../writeback/draftMaterialiser';
import { computeLineDiff } from '../writeback/lineDiff';
import { buildPreviewClientScript } from './previewClientScript';
import { sanitiseSmokeNodes, type SmokeRenderResult } from './smokeTypes';
import { executeWritebackTransaction, WritebackTransactionError } from '../writeback/WritebackTransaction';
import { applySidecarLayoutOverrides } from '../writeback/SidecarPersistence';
import { captureAnchor, computeFenceDraftScope, computeNativeDraftScope, createNativeDocumentBlock, findC4xFencedBlocks, findC4xFencedBlocksInSource, resolveAnchor, SaveAnchor, type SaveAnchorResolution } from '../writeback/SaveAnchor';
import { isSameDiagramEdit } from './sameDiagramEdit';
import { readMarkdownPreviewScale } from '../markdown/c4xPlugin';
import { createMarkdownFenceWritebackBoundary } from '../writeback/MarkdownFenceWritebackBoundary';
import { createDefaultVscodeWritebackTransactionBoundary } from '../writeback/VscodeWritebackBoundary';

interface PerformanceMetrics {
    parseTime: number;
    modelTime: number;
    layoutTime: number;
    renderTime: number;
    totalTime: number;
}

interface RenderPayload {
    svg: string;
    visualLayout: VisualLayoutSnapshot;
    metrics: PerformanceMetrics & {
        elements: number;
        relationships: number;
    };
    /** Webview behaviour settings, snapshotted at render time. */
    settings: {
        autoFitOnOpen: boolean;
        /** Mirrors `c4x.legend.show`: false hides the legend overlay entirely. */
        legendShow: boolean;
        /**
         * Explicit initial zoom for Markdown-bound panels (#134), resolved
         * from `c4x.markdown.previewScale`; takes precedence over
         * auto-fit-on-open on the first render. Undefined for standalone
         * `.c4x` panels, which keep the auto-fit path (#111).
         */
        initialZoom?: number;
    };
    /**
     * Element-type keys present in the current view — drives the contextual
     * legend overlay (#98). Keys match LEGEND_CATALOG in legendCatalog.ts.
     */
    presentElementTypes: string[];
    /**
     * Swatch fill colours for the legend overlay, snapshotted from the active
     * C4 theme at render time so they track `c4x.theme` changes.
     */
    legendSwatchColors: Record<string, string>;
    /**
     * The key derived from the drawn view (#327): one entry per distinct
     * style, with a shape swatch. The overlay lists these instead of the
     * fixed catalogue; exports draw the same list when c4x.export.includeKey is on.
     */
    legendEntries: LegendEntry[];
    /** Swatch colours and widths, so the client redraws key swatches after a staged tag edit (#327). */
    legendKeyTheme: KeySwatchTheme;
    /**
     * Inputs for the client's copy of the style resolver (#322), so a staged
     * tag edit repaints the canvas exactly as the host draws it after Save.
     */
    elementStyleInputs: ElementStyleClientInputs;
    /**
     * Layout mode of this render (#340): `edit` lays the diagram out at the
     * standard box sizes, as a Save of the first move will; `view` lets boxes
     * grow for wrapped text in a diagram with no saved geometry.
     */
    layoutMode: 'edit' | 'view';
    /** True when the view-mode layout of this diagram has boxes taller than standard. */
    textGrown: boolean;
    /**
     * Which diagram this render shows, independent of its source text (#340):
     * the document, and the fence for a Markdown-bound panel. The webview keeps
     * edit mode across re-renders of the same diagram, including after a source
     * edit; the draft scope, which includes the source fingerprint, still
     * decides whether a persisted draft belongs to this source.
     */
    diagramIdentity: string;
    /** C4 view type of the render, with diagramIdentity used to tell diagrams apart (#340). */
    viewType: string;
    /**
     * Whether every source change since the render with token `since` provably
     * stayed inside this diagram (#340 review 9, isSameDiagramEdit). The webview
     * keeps edit mode only with `value: true` for the render it last showed.
     * Set when the render is posted.
     */
    sameDiagramEdit?: { since: number | null; value: boolean };
    /**
     * Identity of the diagram being rendered: the URI plus exact source identity
     * for a standalone panel; for a Markdown-bound panel the URI plus the fence's
     * content identity (model identity + body hash — NOT the block ordinal,
     * which shifts when fences are inserted or reordered). The webview persists
     * it with the draft state and refuses to restore a draft whose scope
     * differs — the panel is reused across documents, and vscode.setState is
     * panel-scoped (#167 review).
     */
    scope: string;
}

/**
 * The conflict reason when a declined refresh does not say which result the
 * webview shows, so the host cannot tell which canvas the draft was made on.
 */
export const UNMATCHED_DECLINE_REASON =
    'The preview could not confirm which version of the diagram your draft was made on. Your draft is preserved.';

/**
 * Lay a view out without blocking the extension host (#454): a large view
 * runs in the layout worker and is stopped at the preview budget, with the
 * message shown in the preview. Small views, and runs with no bundled
 * worker (source runs), lay out in-process as before.
 */
export async function layoutBounded(view: C4View, options: LayoutOptions, signal?: AbortSignal): Promise<{ layout: LayoutResult; grewText: boolean } | undefined> {
    const spec = needsLayoutWorker(view) ? defaultLayoutWorker() : undefined;
    if (!spec) {
        const layout = await dagreLayoutEngine.layout(view, options);
        return { layout, grewText: dagreLayoutEngine.layoutGrewText(layout) };
    }
    const outcome = await layoutWithDeadline(view, { ...options, spacing: options.spacing ?? resolveLayoutSpacing() }, spec, undefined, signal);
    if (outcome.status === 'cancelled') {
        return undefined;
    }
    if (outcome.status !== 'ok') {
        throw new Error(outcome.message);
    }
    return { layout: outcome.layout, grewText: outcome.grewText };
}

export class PreviewPanel {
    private static instance: PreviewPanel | undefined;
    /** Keys of import warnings already shown this session, so a re-render does not repeat them. */
    private static readonly shownImportWarnings = new Set<string>();
    /** Separate instance for Markdown block editing (one at a time). */
    private static markdownInstance: PreviewPanel | undefined;

    public static createOrShow(context: vscode.ExtensionContext): void {
        if (PreviewPanel.instance) {
            PreviewPanel.instance.panel.reveal(vscode.window.activeTextEditor?.viewColumn);
            PreviewPanel.instance.tryUpdateActiveDocument();
            return;
        }

        PreviewPanel.instance = new PreviewPanel(context);
    }

    /**
     * Opens (or re-opens) a visual editor panel locked to a specific c4x
     * fenced block inside a Markdown document.
     *
     * If another Markdown-block panel is already open, it is disposed before
     * the new one is created so the user always edits the block they clicked.
     */
    public static createOrShowForMarkdownBlock(
        context: vscode.ExtensionContext,
        document: vscode.TextDocument,
        blockOrdinal: number,
    ): void {
        // Dispose any existing Markdown-block panel — user intends to switch.
        if (PreviewPanel.markdownInstance) {
            PreviewPanel.markdownInstance.dispose();
            PreviewPanel.markdownInstance = undefined;
        }
        PreviewPanel.markdownInstance = new PreviewPanel(context, { document, blockOrdinal });
    }

    public static dispose(): void {
        PreviewPanel.instance?.dispose();
        PreviewPanel.instance = undefined;
        PreviewPanel.markdownInstance?.dispose();
        PreviewPanel.markdownInstance = undefined;
    }

    /**
     * Returns a WebviewPanelSerializer that VS Code calls when restoring a
     * persisted panel after an extension-host reload. The serializer recreates
     * the panel and lets the webview's own getState() mechanism restore the
     * draft without any host involvement.
     */
    public static createSerializer(context: vscode.ExtensionContext): vscode.WebviewPanelSerializer {
        return {
            async deserializeWebviewPanel(
                webviewPanel: vscode.WebviewPanel,
                _state: unknown,
            ): Promise<void> {
                // Restore the panel's document binding (#100): without it the
                // panel comes back as a zombie — unbound from its document,
                // unable to save, showing "No active diagram document selected".
                const binding = loadBinding(context.workspaceState);
                if (binding?.kind === 'markdown') {
                    try {
                        const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(binding.uri));
                        if (PreviewPanel.markdownInstance) {
                            PreviewPanel.markdownInstance.dispose();
                        }
                        PreviewPanel.markdownInstance = new PreviewPanel(
                            context, { document, blockOrdinal: binding.blockOrdinal }, webviewPanel,
                        );
                        return;
                    } catch {
                        void vscode.window.showInformationMessage(
                            'The C4X editing session could not be restored (document unavailable). Reopen the editor from your Markdown file.',
                        );
                    }
                } else if (binding?.kind === 'native') {
                    try {
                        const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(binding.uri));
                        if (PreviewPanel.instance) {
                            PreviewPanel.instance.dispose();
                            PreviewPanel.instance = undefined;
                        }
                        PreviewPanel.instance = new PreviewPanel(context, undefined, webviewPanel, document);
                        return;
                    } catch {
                        void vscode.window.showInformationMessage(
                            'The C4X editing session could not be restored (document unavailable). Reopen the editor from your diagram.',
                        );
                    }
                }

                // No binding (or restore failed): fall back to the previous
                // behaviour — adopt the panel as the singleton preview.
                if (PreviewPanel.instance) {
                    PreviewPanel.instance.dispose();
                    PreviewPanel.instance = undefined;
                }
                PreviewPanel.instance = new PreviewPanel(context, undefined, webviewPanel);
            },
        };
    }

    private readonly panel: vscode.WebviewPanel;
    private readonly disposables: vscode.Disposable[] = [];
    private activeDocument: vscode.TextDocument | undefined;
    private activeSaveAnchor: SaveAnchor | undefined;
    private debounceTimer: NodeJS.Timeout | undefined;
    private disposed = false;
    private currentSvg: string | undefined;
    /** The same diagram in the export theme (light variant); differs from currentSvg only in a dark editor. */
    private currentExportSvg: string | undefined;
    /** What the export SVG was drawn from, to redraw it with the key when c4x.export.includeKey is on (#327). */
    private currentExportInputs: { layout: LayoutResult; theme: C4Theme; view: C4View } | undefined;
    private currentLayoutSnapshot: VisualLayoutSnapshot | undefined;
    /** Tracks whether the webview has reported unsaved staged edits. */
    private hasDirtyState = false;
    /**
     * Last layout mode the webview reported (#340). In `edit` the diagram is
     * laid out at the standard sizes, so a drag starts from the layout the
     * first Save produces.
     */
    private layoutMode: 'edit' | 'view' = 'view';
    /** Whether the last render's view-mode layout grew boxes for text. */
    private lastRenderTextGrown = false;
    /** Every source change since the last posted render stayed inside the diagram (#340 review 9). */
    private sameDiagramSinceRender = true;
    /** The watched document's text after the last change the panel saw, to locate fences before a change. */
    private lastKnownText: string | undefined;
    /**
     * Set only when the host runs under C4X_VSIX_SMOKE=1. It is the per-panel
     * secret the test-only client block compares, and the gate for every
     * smoke message type: undefined in a normal session, where those types are
     * rejected like any other unknown message.
     */
    private readonly smokeSession: string | undefined = process.env.C4X_VSIX_SMOKE === '1' ? randomUUID() : undefined;
    private smokeActWaiter: {
        token: string;
        finish: (result: { staged: number; editMode: boolean; nodes: SmokeRenderResult['nodes'] }) => void;
    } | undefined;
    private smokeWaiter: {
        token: string;
        uri: string;
        revision: number;
        finish: (result?: SmokeRenderResult, error?: Error) => void;
    } | undefined;
    /** Tracks whether we are in a conflict state (external change while dirty). */
    private inConflictState = false;
    /**
     * The layout snapshot taken at document version `from` still matches the
     * document at version `to`: only text outside the anchored block changed
     * while the preview was dirty (#439). See writebackRevision().
     */
    private snapshotRevisionCarry: { from: string; to: string; fingerprint: string } | undefined;
    /** Token of the last result posted to the webview (see rememberShown). */
    private renderTokenSeq = 0;
    private shownStates: Map<number, {
        snapshot: VisualLayoutSnapshot | undefined;
        anchor: SaveAnchor | undefined;
        positionalIdentity: PositionalIdentity | undefined;
    }> | undefined;
    private static readonly SHOWN_STATES_KEPT = 16;
    /** Newest token the webview is known to have shown (see rememberShown). */
    private shownFloorToken: number | undefined;
    /** Newest marked (declinable) result posted. */
    private lastMarkedToken: number | undefined;
    /**
     * Holds back a theme or refresh render while staged edits are unsaved
     * (#408): every render clears the webview's draft.
     */
    private readonly refreshGate = new NonSourceRenderGate();
    /** Counts conflicts entered, so an in-flight render can tell one began during its awaits (#408). */
    private conflictEpoch = 0;
    /** Positional relationship and boundary ids of the diagram last rendered, for Rebase (#261). */
    private renderedPositionalIdentity: PositionalIdentity | undefined;

    /**
     * When set, this panel is "locked" to a specific Markdown fenced block.
     * Render extracts only that block's body; writeback offsets edits back into
     * the .md file via MarkdownFenceWritebackBoundary.
     */
    private readonly markdownBlock: { document: vscode.TextDocument; blockOrdinal: number } | undefined;

    private readonly outputChannel = vscode.window.createOutputChannel('C4X');

    /** Append a timestamped line to the C4X output channel (UAT diagnosability). */
    private log(line: string): void {
        this.outputChannel.appendLine(`[${new Date().toISOString()}] ${line}`);
    }

    private constructor(
        private readonly context: vscode.ExtensionContext,
        markdownBlock?: { document: vscode.TextDocument; blockOrdinal: number },
        existingPanel?: vscode.WebviewPanel,
        restoredDocument?: vscode.TextDocument,
    ) {
        this.markdownBlock = markdownBlock;
        if (markdownBlock) {
            this.activeDocument = markdownBlock.document;
            this.activeSaveAnchor = this.captureMarkdownBlockAnchor(markdownBlock.document, markdownBlock.blockOrdinal);
            void saveBinding(context.workspaceState, {
                kind: 'markdown',
                uri: markdownBlock.document.uri.toString(),
                blockOrdinal: markdownBlock.blockOrdinal,
            });
        } else {
            this.activeDocument = restoredDocument ?? this.getActiveDiagramDocument();
            this.activeSaveAnchor = this.activeDocument ? this.captureDocumentAnchor(this.activeDocument) : undefined;
            if (this.activeDocument) {
                void saveBinding(context.workspaceState, {
                    kind: 'native',
                    uri: this.activeDocument.uri.toString(),
                });
            }
        }

        const panelTitle = markdownBlock
            ? `C4X — ${markdownBlock.document.fileName.split('/').pop() ?? 'Markdown'} [block ${markdownBlock.blockOrdinal}]`
            : 'C4X Preview';

        if (existingPanel) {
            // Adopt a panel handed to us by the WebviewPanelSerializer (reload restore path).
            this.panel = existingPanel;
            this.panel.webview.options = { enableScripts: true };
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'c4xPreview',
                panelTitle,
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                }
            );
        }

        this.panel.onDidDispose(() => {
            const wasDirty = this.hasDirtyState;
            this.dispose();
            // Clear the static reference when the panel closes.
            if (PreviewPanel.markdownInstance === this) {
                PreviewPanel.markdownInstance = undefined;
            } else if (PreviewPanel.instance === this) {
                PreviewPanel.instance = undefined;
            }
            // Warn the user if they closed with unsaved staged edits.
            // The panel cannot be kept open once onDidDispose fires, so the
            // warning is informational. The draft may survive reload via
            // webview state (setState/getState) if VS Code rehydrates the panel.
            if (wasDirty) {
                const block = this.markdownBlock;
                const context = this.context;
                void vscode.window.showWarningMessage(
                    'C4X: You closed the diagram editor with unsaved staged changes. ' +
                    'Reopen the editor to restore your draft if the webview state was kept.',
                    'Reopen Editor',
                ).then(selection => {
                    if (selection !== 'Reopen Editor') {
                        return;
                    }
                    // Reopen the SAME editor kind the draft belongs to: the
                    // generic preview command cannot reach a Markdown fence
                    // editor and would show "No active diagram document".
                    if (block) {
                        PreviewPanel.createOrShowForMarkdownBlock(context, block.document, block.blockOrdinal);
                    } else {
                        void vscode.commands.executeCommand('c4x.openPreview');
                    }
                });
            }
        }, null, this.disposables);

        this.panel.webview.onDidReceiveMessage((message: unknown) => {
            void this.handleWebviewMessage(message).catch((error: unknown) => {
                // Never let a handler exception die silently: the webview would
                // show the user a dead button with no explanation.
                const detail = error instanceof Error ? error.message : String(error);
                this.log(`unhandled error in webview message handler: ${detail}`);
                this.rejectVisualLayout('validation_failed', `Internal error while processing the request: ${detail}`);
            });
        }, undefined, this.disposables);
        this.disposables.push(this.outputChannel);

        this.panel.webview.html = this.getHtml();

        this.registerEventListeners();

        if (!this.activeDocument) {
            void vscode.window.showInformationMessage('Open a .c4x or .dsl file to start previewing.');
        } else {
            void this.render();
        }
    }

    private registerEventListeners(): void {
        this.disposables.push(
            // A theme with a dark variant is drawn differently when the editor
            // changes colour theme. A render clears the webview's staged
            // edits, so it waits while the preview is dirty (#408).
            vscode.window.onDidChangeActiveColorTheme(() => {
                this.requestNonSourceRender();
            }),
            // A changed c4x.theme setting restyles the open preview (#390),
            // deferred the same way while staged edits are unsaved (#408).
            vscode.workspace.onDidChangeConfiguration((event) => {
                if (event.affectsConfiguration('c4x.theme')) {
                    this.requestNonSourceRender();
                }
            }),
            // A save, or an autosave, changes no text. While the preview is
            // dirty it is not a reason to replace the draft (#439).
            vscode.workspace.onDidSaveTextDocument((document) => {
                if (this.isWatchedDocument(document)) {
                    this.handleSourceEvent(document, 100);
                }
            }),
            vscode.workspace.onDidChangeTextDocument((event) => {
                if (this.isWatchedDocument(event.document)) {
                    this.noteSourceChange(event.document, event.contentChanges);
                    this.handleSourceEvent(event.document, 250);
                }
            }),
            vscode.window.onDidChangeActiveTextEditor(() => {
                this.tryUpdateActiveDocument();
            })
        );
    }

    /**
     * Track whether the changes since the last posted render stayed inside the
     * diagram the panel shows (#340 review 9): the webview keeps edit mode only
     * when they did. An empty change list, a change outside the fence body or
     * its delimiters, a fence added, removed or moved, or a whole-document
     * replacement ends it.
     */
    private noteSourceChange(document: vscode.TextDocument, reported: ReadonlyArray<vscode.TextDocumentContentChangeEvent> | undefined): void {
        // An event with no ranges reported counts as an external change.
        const changes = reported ?? [];
        const after = document.getText();
        const before = this.lastKnownText;
        const native = !this.markdownBlock;
        const same = before !== undefined && isSameDiagramEdit({
            native,
            beforeLength: before.length,
            fencesBefore: native ? undefined : findC4xFencedBlocksInSource(before).map(block => block.bodyRange),
            fencesAfter: native ? undefined : findC4xFencedBlocksInSource(after).map(block => block.bodyRange),
            ordinal: this.markdownBlock?.blockOrdinal,
            changes: changes.map(change => ({ rangeOffset: change.rangeOffset, rangeLength: change.rangeLength, text: change.text })),
        });
        this.sameDiagramSinceRender = this.sameDiagramSinceRender && same;
        this.lastKnownText = after;
    }

    /**
     * A text change to, or a save of, the watched document (see
     * decideSourceEvent in nonSourceRenderGate.ts). Only a render the user
     * authorised reaches a dirty preview unmarked; the automatic render a
     * source event queues is decided again when it fires and completes, and a
     * real change under a draft opens the conflict instead (#439).
     */
    private handleSourceEvent(document: vscode.TextDocument, delay: number): void {
        const check = this.checkDiagramSource(document);
        const decision = decideSourceEvent({
            dirty: this.hasDirtyState,
            conflict: this.inConflictState,
            anchor: check.anchor,
        });
        switch (decision) {
            case 'owe-source':
                // Suppressed while the conflict is open: owed (#408). Do not
                // notify again; the user must resolve first.
                this.currentLayoutSnapshot = undefined;
                this.refreshGate.held('source');
                return;
            case 'enter-conflict':
                // The anchored block changed under an unsaved draft: keep the
                // draft and offer Rebase or Reload instead of a re-render.
                this.currentLayoutSnapshot = undefined;
                this.enterConflictState(document);
                return;
            case 'schedule-auto':
                if (check.anchor === 'unchanged') {
                    // The layout the preview shows is still the one Save
                    // validates against, at this document version too (#439).
                    this.noteUnchangedSource(document, check.resolution);
                } else {
                    // Reject moves immediately while a newer document revision is awaiting render.
                    this.currentLayoutSnapshot = undefined;
                }
                // Automatic: decided again when the timer fires and when the
                // render completes, so a draft staged meanwhile is not cleared.
                this.scheduleRender(delay, 'auto');
                return;
        }
    }

    /**
     * Whether the diagram source differs from what the last posted render
     * showed. Only the content decides: the block is found by its ordinal and
     * compared by identity and fingerprint. The stored offsets go stale when
     * text above a fence is removed, and that alone is not a change to the
     * diagram (#439); a write is still checked against the offsets as they
     * are then.
     */
    private checkDiagramSource(document: vscode.TextDocument | undefined): { anchor: AnchorCheck; resolution?: SaveAnchorResolution } {
        const anchorNow = this.activeSaveAnchor;
        if (!anchorNow || !document) {
            return { anchor: 'unknown' };
        }
        const resolution = resolveAnchor(document, { ...anchorNow, blockRange: { start: 0, end: 0 } });
        return { anchor: resolution.valid ? 'unchanged' : 'changed', resolution };
    }

    /** The diagram source is unchanged: keep the layout for Save and re-anchor at the block's current offsets. */
    private noteUnchangedSource(document: vscode.TextDocument, resolution: SaveAnchorResolution | undefined): void {
        this.carryLayoutSnapshot(document);
        if (resolution?.valid) {
            this.activeSaveAnchor = captureAnchor(document, resolution.block);
        }
    }

    /**
     * An automatic render met a dirty preview whose diagram source changed
     * since the canvas was drawn: the draft was made against that canvas, so
     * open the conflict rather than replace it (#439).
     */
    private autoRenderMetChangedSource(): void {
        this.currentLayoutSnapshot = undefined;
        if (this.activeDocument) {
            this.enterConflictState(this.activeDocument);
        } else {
            this.refreshGate.held('source');
        }
    }

    /**
     * Record that the current layout snapshot, taken at `from`, still matches
     * the document at its new version: the diagram source the anchor covers
     * is byte-identical (#439). Save then translates the webview's revision.
     */
    private carryLayoutSnapshot(document: vscode.TextDocument): void {
        const snapshot = this.currentLayoutSnapshot;
        const anchor = this.activeSaveAnchor;
        if (!snapshot || !anchor) {
            return;
        }
        const version = String(document.version);
        if (version === snapshot.revision) {
            return;
        }
        this.snapshotRevisionCarry = { from: snapshot.revision, to: version, fingerprint: anchor.sourceFingerprint };
    }

    /**
     * Record what the webview will show once it accepts the result being
     * posted now, and return the token the result carries. The host updates
     * its state at post time; a marked result the webview declines was never
     * shown, so refreshDeclined names the token it still shows and
     * restoreShown() puts that state back (#439).
     *
     * Eviction. The FLOOR is the newest token the webview is known to have
     * shown: the newest unmarked result (the webview never declines one) or
     * the newest token a decline named. The webview never goes back to an
     * older result, so every token below the floor can be evicted. Above it,
     * the newest SHOWN_STATES_KEPT tokens are kept, and the floor itself is
     * always kept whatever its age. A token between the floor and that window
     * is evicted; the webview can still be showing it only if it declined
     * every later result, and if such a decline names it, restoreShown()
     * cannot match it and opens the conflict instead (fail safe).
     */
    private rememberShown(marked: boolean): number {
        const token = (this.renderTokenSeq ?? 0) + 1;
        this.renderTokenSeq = token;
        this.shownStates ??= new Map();
        this.shownStates.set(token, {
            snapshot: this.currentLayoutSnapshot,
            anchor: this.activeSaveAnchor,
            positionalIdentity: this.renderedPositionalIdentity,
        });
        if (marked) {
            this.lastMarkedToken = token;
        } else {
            this.shownFloorToken = token;
        }
        this.evictShownStates(token);
        return token;
    }

    private evictShownStates(newest: number): void {
        const floor = this.shownFloorToken;
        for (const key of [...(this.shownStates?.keys() ?? [])]) {
            const belowFloor = floor !== undefined && key < floor;
            const outsideWindow = key <= newest - PreviewPanel.SHOWN_STATES_KEPT && key !== floor;
            if (belowFloor || outsideWindow) {
                this.shownStates?.delete(key);
            }
        }
    }

    /** Forget every recorded result: the panel closed or now shows another document. */
    private forgetShownStates(): void {
        this.shownStates?.clear();
        this.shownFloorToken = undefined;
        this.lastMarkedToken = undefined;
    }

    /**
     * The webview declined a marked result and still shows the result with
     * `token` (undefined when the decline did not say): put back the state
     * that describes it. If the diagram source is unchanged since, the layout
     * still validates Save at the current version; if it changed, the draft
     * was made against the older canvas, so the conflict opens. If the token
     * is missing, unknown or evicted and a marked result was posted after the
     * floor, the host cannot tell which canvas the draft was made on, so the
     * conflict opens too: the draft stays on screen and the user chooses,
     * rather than Save failing and discarding it.
     */
    private restoreShown(token: number | undefined): void {
        // The webview kept an older render: the chain of changes since the one it
        // shows is no longer known, so the next render ends edit mode (#340).
        this.sameDiagramSinceRender = false;
        const shown = token === undefined ? undefined : this.shownStates?.get(token);
        if (!shown || token === undefined) {
            // Only a marked result posted after the floor can leave the host
            // describing something the webview does not show. With none, the
            // host's state already is what the webview shows.
            const marked = this.lastMarkedToken;
            if (marked !== undefined && (this.shownFloorToken === undefined || marked > this.shownFloorToken)) {
                this.declineUnmatched();
            }
            return;
        }
        this.shownFloorToken = token;
        this.evictShownStates(this.renderTokenSeq ?? token);
        this.currentLayoutSnapshot = shown.snapshot;
        this.activeSaveAnchor = shown.anchor;
        this.renderedPositionalIdentity = shown.positionalIdentity;
        this.snapshotRevisionCarry = undefined;
        if (this.inConflictState || !this.activeDocument) {
            return;
        }
        const check = this.checkDiagramSource(this.activeDocument);
        if (check.anchor === 'unchanged') {
            this.noteUnchangedSource(this.activeDocument, check.resolution);
        } else if (check.anchor === 'changed') {
            this.autoRenderMetChangedSource();
        }
    }

    private declineUnmatched(): void {
        if (this.inConflictState) {
            return;
        }
        this.currentLayoutSnapshot = undefined;
        this.snapshotRevisionCarry = undefined;
        if (this.activeDocument) {
            this.enterConflictState(this.activeDocument, UNMATCHED_DECLINE_REASON);
        } else {
            this.refreshGate.held('source');
        }
    }

    /**
     * The revision a writeback is checked against. The webview holds the
     * revision of the render it shows; when only text outside the anchored
     * block changed since (#439), the same diagram source is now at a newer
     * document version, and every condition is checked again here.
     */
    private writebackRevision(message: { revision: string }, activeDoc: vscode.TextDocument): string {
        const carry = this.snapshotRevisionCarry;
        const anchor = this.activeSaveAnchor;
        if (!carry || !anchor ||
            this.currentLayoutSnapshot?.revision !== carry.from ||
            String(message.revision) !== carry.from ||
            String(activeDoc.version) !== carry.to ||
            anchor.sourceFingerprint !== carry.fingerprint ||
            !resolveAnchor(activeDoc, anchor).valid) {
            return message.revision;
        }
        return carry.to;
    }

    private enterConflictState(document: vscode.TextDocument, reasonOverride?: string): void {
        this.inConflictState = true;
        this.conflictEpoch++;
        // The source change that opened the conflict is not rendered now; it
        // is owed, so every exit from the conflict (Discard, Save, Reload,
        // Rebase then a clean report) renders the current source (#408).
        this.refreshGate.held('source');
        const codeLabels: Record<string, string> = {
            fingerprint_mismatch: 'The block content changed.',
            block_ordinal_drift: 'The block was moved or deleted.',
            model_identity_changed: 'The diagram structure changed.',
            range_out_of_bounds: 'The block range changed.',
            uri_mismatch: 'The document URI changed.',
        };
        let reason = 'Source changed elsewhere. Your draft is preserved.';
        const anchor = this.activeSaveAnchor;
        if (anchor) {
            const resolution = resolveAnchor(document, anchor);
            if (!resolution.valid) {
                reason = `Source changed elsewhere. Your draft is preserved. (${codeLabels[resolution.reason] ?? resolution.reason})`;
            }
        }
        if (reasonOverride) {
            reason = reasonOverride;
        }
        const conflictMsg: ExternalChangeConflictMessage = {
            type: 'visualLayout.externalChangeConflict',
            protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
            reason,
        };
        void this.panel.webview.postMessage(conflictMsg);
    }

    private async handleWebviewMessage(message: unknown): Promise<void> {
        // Smoke message types exist only in a C4X_VSIX_SMOKE=1 host and only with
        // this panel's session secret; otherwise they are ordinary unknown messages
        // and fall through to protocol validation below.
        const isSmoke = this.smokeSession !== undefined && typeof message === 'object' && message !== null &&
            (message as { session?: unknown }).session === this.smokeSession;
        if (isSmoke && (message as { type?: unknown }).type === 'smoke.renderFailed') {
            const report = message as Record<string, unknown>;
            if (this.smokeWaiter && report.token === this.smokeWaiter.token) {
                this.smokeWaiter.finish(undefined, new Error('Packaged webview DOM has no visible SVG'));
            }
            return;
        }
        if (isSmoke && (message as { type?: unknown }).type === 'smoke.acted') {
            const report = message as Record<string, unknown>;
            if (this.smokeActWaiter && report.token === this.smokeActWaiter.token && typeof report.staged === 'number') {
                this.smokeActWaiter.finish({ staged: report.staged, editMode: report.editMode === true, nodes: sanitiseSmokeNodes(report.nodes) });
            }
            return;
        }
        if (isSmoke && (message as { type?: unknown }).type === 'smoke.rendered') {
            const report = message as Record<string, unknown>;
            const waiting = this.smokeWaiter;
            if (waiting && report.token === waiting.token &&
                (this.activeDocument?.uri.toString() !== waiting.uri || this.activeDocument.version !== waiting.revision)) {
                waiting.finish(undefined, new Error('Packaged webview document changed during the render probe'));
                return;
            }
            if (waiting && report.token === waiting.token &&
                this.activeDocument?.uri.toString() === waiting.uri && this.activeDocument.version === waiting.revision &&
                typeof report.nodeCount === 'number' && Number.isInteger(report.nodeCount) && report.nodeCount > 0 && report.nodeCount <= 10000 &&
                typeof report.text === 'string' && report.text.length <= 20000) {
                waiting.finish({
                    nodeCount: report.nodeCount,
                    text: report.text,
                    nodes: sanitiseSmokeNodes(report.nodes),
                    theme: themeManager.getCurrentTheme().name,
                    revision: String(waiting.revision),
                });
            }
            return;
        }
        const messageType = typeof message === 'object' && message !== null && 'type' in message
            ? String((message as { type: unknown }).type)
            : '(untyped)';
        this.log(`webview message received: ${messageType}`);

        if (this.isReadyMessage(message)) {
            void this.render();
            return;
        }

        // Edit mode entered or left (#340): re-lay the diagram out in that mode
        // when the two layouts differ. A non-source render: held while the
        // webview holds a draft, like a theme change (nonSourceRenderGate.ts).
        if (isLayoutModeMessage(message)) {
            const changed = message.mode !== this.layoutMode;
            this.layoutMode = message.mode;
            if (changed && this.lastRenderTextGrown) {
                this.requestNonSourceRender();
            }
            return;
        }

        if (isDirtyStateChangedMessage(message)) {
            this.hasDirtyState = message.dirty;
            // If all staged edits were discarded, exit conflict state automatically.
            if (!message.dirty && this.inConflictState) {
                this.inConflictState = false;
            }
            // The draft was saved or discarded (or its last edit removed, or
            // Save refused, or Reload chosen): schedule the render it held
            // back (#408). A post-Save render already scheduled merges into
            // this one through the debounce.
            const owed = this.refreshGate.dirtyChanged(message.dirty);
            if (owed) {
                this.scheduleRender(100, owed);
            }
            return;
        }

        // A theme or refresh render reached a webview that had just staged
        // an edit: it kept the draft, so apply the render after Save or
        // Discard instead (#408).
        if (isRefreshDeclinedMessage(message)) {
            this.hasDirtyState = true;
            this.refreshGate.declined();
            // What the webview still shows, not what was last posted (#439).
            this.restoreShown(typeof message.shownRenderToken === 'number' && Number.isInteger(message.shownRenderToken)
                ? message.shownRenderToken
                : undefined);
            return;
        }

        if (isResolveConflictMessage(message)) {
            void this.handleConflictResolution(message);
            return;
        }

        if (isRequestSourceDiffMessage(message)) {
            void this.handleSourceDiffRequest(message);
            return;
        }

        if (!isVisualLayoutMessage(message)) {
            this.log('message failed visual layout protocol validation → malformed_message');
            this.rejectVisualLayout('malformed_message', 'Unsupported or malformed Visual Layout action.');
            return;
        }

        const snapshot = this.currentLayoutSnapshot;
        if (!snapshot) {
            this.log('writeback rejected: no current layout snapshot (layout_unavailable)');
            this.rejectVisualLayout(
                'layout_unavailable',
                SOURCE_CHANGED_SAVE_REFUSAL
            );
            return;
        }

        const activeDoc = this.activeDocument;
        if (!activeDoc) {
            this.log('writeback rejected: no active document');
            this.rejectVisualLayout(
                'document_not_found',
                'No active document to write back to.',
                message.revision
            );
            return;
        }

        // Connect-mode relationship add: preflight C4 legality against the
        // current model before the writeback transaction plans source edits.
        if (isAddRelationshipMessage(message)) {
            const legality = this.validateRelationshipAddLegality(activeDoc, message);
            if (!legality.legal) {
                this.log(`relationship add rejected: ${legality.reason ?? 'illegal'}`);
                this.rejectVisualLayout('validation_failed', legality.reason ?? 'Illegal relationship.', message.revision);
                return;
            }
        }

        try {
            // For Markdown-block panels, present the fence body text as the
            // document so the planners work with body-relative offsets; the
            // MarkdownFenceWritebackBoundary then shifts those offsets back to
            // the absolute positions inside the full .md file.
            let writebackDoc = activeDoc as Parameters<typeof executeWritebackTransaction>[0];
            let boundary;
            let transactionAnchor = this.activeSaveAnchor;
            if (this.markdownBlock) {
                // Pre-flight: verify the fence anchor against the live document
                // before we construct the virtual body view.  This enforces
                // the same drift/fingerprint guards that assertAnchorResolves
                // provides inside the transaction — applied to the full .md
                // document rather than the virtual body doc.
                if (this.activeSaveAnchor) {
                    const anchorResolution = resolveAnchor(activeDoc, this.activeSaveAnchor);
                    if (!anchorResolution.valid) {
                        this.rejectVisualLayout(anchorResolution.reason, `Markdown fence anchor could not be resolved: ${anchorResolution.reason}`, message.revision);
                        return;
                    }
                }

                const blocks = findC4xFencedBlocks(activeDoc);
                const block = blocks[this.markdownBlock.blockOrdinal];
                if (!block) {
                    this.rejectVisualLayout('document_not_found', 'The C4X fence block could not be located in the document.', message.revision);
                    return;
                }
                const bodyStart = block.bodyRange.start;

                // Present a LIVE virtual document exposing only the fence body:
                // getText() re-slices from the live document on every call so
                // post-apply validation reads the edited body, and positionAt
                // stays absolute-offset correct (the constant-closure version
                // made every post-save validation fail and roll back — #100).
                const bodyRangeEnd = block.bodyRange.end;
                // Cache the fence scan per document version: the transaction
                // calls getText() many times, and re-scanning every fence in
                // the Markdown file each call is wasted work.
                let cachedVersion = -1;
                let cachedBody: string | undefined;
                writebackDoc = {
                    uri: activeDoc.uri,
                    version: activeDoc.version,
                    languageId: 'c4x',
                    fileName: activeDoc.fileName,
                    getText: () => {
                        const version = activeDoc.version as unknown as number;
                        if (version !== cachedVersion || cachedBody === undefined) {
                            const liveBlocks = findC4xFencedBlocks(activeDoc);
                            const liveBlock = liveBlocks[this.markdownBlock!.blockOrdinal];
                            const liveText = activeDoc.getText();
                            cachedBody = liveBlock
                                ? liveText.slice(liveBlock.bodyRange.start, liveBlock.bodyRange.end)
                                : liveText.slice(bodyStart, bodyRangeEnd);
                            cachedVersion = version;
                        }
                        return cachedBody;
                    },
                    positionAt: (offset: number) => activeDoc.positionAt(offset + bodyStart),
                } as Parameters<typeof executeWritebackTransaction>[0];

                const innerBoundary = createDefaultVscodeWritebackTransactionBoundary();
                boundary = createMarkdownFenceWritebackBoundary(innerBoundary, bodyStart, activeDoc);
                // The transaction will create an implicit native anchor from
                // the body text; our fence-level anchor check is done above.
                transactionAnchor = undefined;
            }

            const writebackStart = Date.now();
            const revision = this.writebackRevision(message, activeDoc);
            const writebackMessage = revision === message.revision ? message : { ...message, revision };
            const success = await executeWritebackTransaction(writebackDoc, writebackMessage, transactionAnchor, boundary);
            const editCount = message.type === 'visualLayout.applySemanticEdits' ? message.edits.length : 1;
            this.log(`writeback transaction took ${Date.now() - writebackStart}ms (${editCount} edits)`);
            if (success) {
                this.log(`writeback succeeded (revision ${String(message.revision)}, doc version ${String(activeDoc.version)})`);
                if (message.type === 'visualLayout.moveElement') {
                    const response: MoveAcceptedMessage = {
                        type: 'visualLayout.accepted',
                        protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
                        revision: message.revision,
                        id: message.id,
                        x: message.x,
                        y: message.y,
                        input: message.input,
                        persisted: true,
                    };
                    void this.panel.webview.postMessage(response);
                } else {
                    const response: BatchAcceptedMessage = {
                        type: 'visualLayout.batchAccepted',
                        protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
                        revision: message.revision,
                        persisted: true,
                    };
                    void this.panel.webview.postMessage(response);
                }
                
                // Rerender to ensure sidecar coordinates or native edits are reflected in the view
                this.scheduleRender(50);
            } else {
                // Defensive: executeWritebackTransaction currently throws on
                // every failure, but never leave the webview without a response.
                this.log('writeback returned false without throwing — rejecting');
                this.rejectVisualLayout(
                    'validation_failed',
                    'Writeback did not complete; no changes were applied.',
                    message.revision
                );
            }
        } catch (error) {
            if (error instanceof WritebackTransactionError) {
                this.log(`writeback failed: ${error.code} — ${error.message}`);
                this.rejectVisualLayout(error.code, error.message, message.revision);
            } else {
                this.log(`writeback failed with unexpected error: ${error instanceof Error ? error.message : String(error)}`);
                this.rejectVisualLayout(
                    'validation_failed',
                    error instanceof Error ? error.message : 'Unknown writeback error',
                    message.revision
                );
            }
        }
    }

    private async handleSourceDiffRequest(
        message: import('./visualLayoutProtocol').RequestSourceDiffMessage,
    ): Promise<void> {
        const activeDoc = this.activeDocument;
        if (!activeDoc) {
            const response: SourceDiffMessage = {
                type: 'visualLayout.sourceDiff',
                protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
                revision: message.revision,
                lines: [],
                error: 'No active document.',
            };
            void this.panel.webview.postMessage(response);
            return;
        }

        // Determine source text (same logic as render/writeback paths)
        let originalSource: string;
        let useSidecar = false;
        if (this.markdownBlock) {
            const fullText = activeDoc.getText();
            const blocks = findC4xFencedBlocks(activeDoc);
            const block = blocks[this.markdownBlock.blockOrdinal];
            if (!block) {
                const response: SourceDiffMessage = {
                    type: 'visualLayout.sourceDiff',
                    protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
                    revision: message.revision,
                    lines: [],
                    error: 'C4X fence block not found.',
                };
                void this.panel.webview.postMessage(response);
                return;
            }
            originalSource = fullText.slice(block.bodyRange.start, block.bodyRange.end);
        } else {
            originalSource = activeDoc.getText();
            const textTrim = originalSource.trim();
            useSidecar = activeDoc.languageId === 'structurizr-dsl' ||
                activeDoc.fileName.endsWith('.dsl') ||
                activeDoc.languageId === 'plantuml' ||
                activeDoc.fileName.endsWith('.puml') ||
                textTrim.startsWith('workspace') ||
                textTrim.includes('workspace {') ||
                textTrim.startsWith('@startuml');
        }

        const result = materialiseDraft(originalSource, message.edits, useSidecar);
        let response: SourceDiffMessage;
        if (!result.ok) {
            response = {
                type: 'visualLayout.sourceDiff',
                protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
                revision: message.revision,
                lines: [],
                error: result.reason,
            };
        } else {
            const diffLines = computeLineDiff(originalSource, result.text);
            response = {
                type: 'visualLayout.sourceDiff',
                protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
                revision: message.revision,
                lines: diffLines,
            };
        }

        void this.panel.webview.postMessage(response);
    }

    private async handleConflictResolution(
        message: import('./visualLayoutProtocol').ResolveConflictMessage,
    ): Promise<void> {
        const activeDoc = this.activeDocument;

        if (message.action === 'reloadAndDiscard') {
            this.inConflictState = false;
            this.hasDirtyState = false;
            this.currentLayoutSnapshot = undefined;
            if (activeDoc) {
                this.activeSaveAnchor = this.markdownBlock
                    ? this.captureMarkdownBlockAnchor(activeDoc, this.markdownBlock.blockOrdinal)
                    : this.captureDocumentAnchor(activeDoc);
            }
            void this.render();
            return;
        }

        if (message.action === 'viewDiff') {
            void this.panel.webview.postMessage({
                type: 'visualLayout.conflictActionAcknowledged',
                protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
                action: 'viewDiff',
            });
            return;
        }

        if (message.action === 'rebase') {
            if (activeDoc) {
                const rebasedAnchor = this.markdownBlock
                    ? this.captureMarkdownBlockAnchor(activeDoc, this.markdownBlock.blockOrdinal)
                    : this.captureDocumentAnchor(activeDoc);

                if (rebasedAnchor) {
                    const resolution = this.markdownBlock
                        ? resolveAnchor(activeDoc, rebasedAnchor)
                        : { valid: true as const, block: undefined };

                    if (!resolution.valid && 'reason' in resolution) {
                        void this.panel.webview.postMessage({
                            type: 'visualLayout.conflictActionAcknowledged',
                            protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
                            action: 'rebaseFailed',
                            reason: `Cannot rebase: block not found after external change (${resolution.reason}). Choose Reload and discard draft to continue.`,
                        });
                        return;
                    }

                    const refusal = this.positionalRebaseRefusal(activeDoc, message.stagedKeys);
                    if (refusal) {
                        void this.panel.webview.postMessage({
                            type: 'visualLayout.conflictActionAcknowledged',
                            protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
                            action: 'rebaseFailed',
                            reason: refusal,
                        });
                        return;
                    }

                    const notice = rebaseAcceptedNotice(this.currentLayoutSnapshot !== undefined);
                    this.activeSaveAnchor = rebasedAnchor;
                    this.inConflictState = false;
                    void this.panel.webview.postMessage({
                        type: 'visualLayout.conflictActionAcknowledged',
                        protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
                        action: 'rebaseAccepted',
                        // No render follows a Rebase (it would reset the draft), so
                        // Save has no current layout: say so now, not at Save (#293).
                        ...(notice ? { reason: notice } : {}),
                    });
                    return;
                }
            }

            void this.panel.webview.postMessage({
                type: 'visualLayout.conflictActionAcknowledged',
                protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
                action: 'rebaseFailed',
                reason: 'Cannot rebase: no active document. Choose Reload and discard draft to continue.',
            });
        }
    }

    /**
     * Rebase keeps the staged edits against the changed source. A relationship
     * or boundary edit is keyed by position, so refuse when the change moved
     * the statement one of them names (#261). Formats without positional ids
     * in C4X source (Structurizr, PlantUML) are left to the Save checks.
     */
    private positionalRebaseRefusal(activeDoc: vscode.TextDocument, stagedKeys: readonly string[] | undefined): string | undefined {
        const fileName = activeDoc.fileName.toLowerCase();
        if (activeDoc.languageId === 'structurizr-dsl' || activeDoc.languageId === 'plantuml' ||
            fileName.endsWith('.dsl') || fileName.endsWith('.puml')) {
            return undefined;
        }
        const text = this.markdownBlock
            ? (() => {
                const block = findC4xFencedBlocks(activeDoc)[this.markdownBlock.blockOrdinal];
                return block ? activeDoc.getText().slice(block.bodyRange.start, block.bodyRange.end) : undefined;
            })()
            : activeDoc.getText();
        if (text === undefined) {
            return 'Cannot rebase: the diagram block was not found after the external change. Choose Reload and discard draft to continue.';
        }
        let after: PositionalIdentity;
        try {
            const view = c4ModelBuilder.build(c4xParser.parse(text), this.getWorkspaceName(activeDoc)).views[0];
            after = view ? positionalIdentityOf(view) : new Map();
        } catch {
            return 'Cannot rebase: the changed source could not be parsed, so the staged edits cannot be checked against it. Choose Reload and discard draft to continue.';
        }
        return rebaseRefusal(this.renderedPositionalIdentity, after, stagedKeys);
    }

    private rejectVisualLayout(code: MoveRejectionCode, reason: string, revision?: string): void {
        const response: MoveRejectedMessage = {
            type: 'visualLayout.rejected',
            protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
            code,
            reason,
            ...(revision ? { revision } : {}),
        };
        void this.panel.webview.postMessage(response);
    }

    private validateRelationshipAddLegality(
        activeDoc: vscode.TextDocument,
        message: import('./visualLayoutProtocol').AddRelationshipMessage,
    ): { legal: boolean; reason?: string } {
        const text = this.markdownBlock
            ? (() => {
                const blocks = findC4xFencedBlocks(activeDoc);
                const block = blocks[this.markdownBlock.blockOrdinal];
                return block ? activeDoc.getText().slice(block.bodyRange.start, block.bodyRange.end) : activeDoc.getText();
            })()
            : activeDoc.getText();

        let parseResult;
        try {
            parseResult = c4xParser.parse(text);
        } catch {
            return { legal: false, reason: 'The current document could not be parsed.' };
        }

        let model;
        try {
            model = c4ModelBuilder.build(parseResult, this.getWorkspaceName(activeDoc));
        } catch {
            return { legal: false, reason: 'The current diagram model could not be built.' };
        }

        const findElement = (id: string): C4Element | undefined => {
            const search = (elements: C4Element[]): C4Element | undefined => {
                for (const el of elements) {
                    if (el.id === id) { return el; }
                    if (el.children) {
                        const found = search(el.children);
                        if (found) { return found; }
                    }
                }
                return undefined;
            };
            for (const view of model.views) {
                const found = search(view.elements);
                if (found) { return found; }
            }
            return undefined;
        };

        const sourceEl = findElement(message.sourceId);
        const targetEl = findElement(message.targetId);
        if (!sourceEl || !targetEl) {
            return { legal: false, reason: 'The relationship source or target was not found in the current diagram.' };
        }

        return isRelationshipLegal(sourceEl, targetEl);
    }

    private isReadyMessage(message: unknown): message is { type: 'ready' } {
        return typeof message === 'object' && message !== null &&
            'type' in message && message.type === 'ready';
    }

    private tryUpdateActiveDocument(): void {
        // Markdown-block panels are permanently locked; never follow editor focus.
        if (this.markdownBlock) {
            return;
        }
        // Focusing the webview can leave no active text editor. Keep the
        // diagram binding until an actual text editor supplies a new target.
        if (!vscode.window.activeTextEditor) {
            return;
        }
        const newDocument = this.getActiveDiagramDocument();
        if (newDocument?.uri.toString() !== this.activeDocument?.uri.toString()) {
            this.activeDocument = newDocument;
            this.activeSaveAnchor = newDocument ? this.captureDocumentAnchor(newDocument) : undefined;
            // Another document is another diagram: edit mode ends (#340 review 9).
            this.sameDiagramSinceRender = false;
            this.lastKnownText = typeof newDocument?.getText === 'function' ? newDocument.getText() : undefined;
            this.currentLayoutSnapshot = undefined;
            this.snapshotRevisionCarry = undefined;
            // Results recorded for the previous document describe nothing the
            // new one shows (#439).
            this.forgetShownStates();
            this.scheduleRender();
        }
    }

    private getActiveDiagramDocument(): vscode.TextDocument | undefined {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return undefined;
        }

        const doc = editor.document;
        if (doc.languageId === 'c4x' || doc.fileName.endsWith('.c4x') ||
            doc.languageId === 'structurizr-dsl' || doc.fileName.endsWith('.dsl') ||
            doc.languageId === 'plantuml' || doc.fileName.endsWith('.puml')) {
            return doc;
        }

        return undefined;
    }

    private isWatchedDocument(document: vscode.TextDocument): boolean {
        if (!this.activeDocument) {
            return false;
        }
        return document.uri.toString() === this.activeDocument.uri.toString();
    }

    /**
     * Re-render for a reason other than a source change: a colour-theme or
     * `c4x.theme` change, or Refresh Preview. While the webview holds unsaved
     * staged edits the render is deferred until they are saved or discarded,
     * because a render clears them (#408).
     */
    private requestNonSourceRender(): void {
        if (this.refreshGate.request(this.hasDirtyState || this.inConflictState) === 'schedule') {
            this.scheduleRender(100, 'theme');
            return;
        }
        if (!this.inConflictState) {
            this.notifyRefreshDeferred();
        }
    }

    private notifyRefreshDeferred(): void {
        const notice: RefreshDeferredMessage = {
            type: 'visualLayout.refreshDeferred',
            protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
        };
        void this.panel.webview.postMessage(notice);
    }

    /**
     * @param cause why the render is wanted (see nonSourceRenderGate.ts):
     *   'source' renders (authorised by the user) are never held; 'auto'
     *   renders (triggered by a source event) are decided on the dirty,
     *   conflict and anchor state when the timer fires; 'theme' and 'retry'
     *   renders are held while blocked. Requests merge to the stronger cause.
     */
    private scheduleRender(delay = 100, cause: RenderCause = 'source'): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.refreshGate.scheduled(cause);
        this.debounceTimer = setTimeout(() => {
            this.debounceTimer = undefined;
            let check: ReturnType<PreviewPanel['checkDiagramSource']> | undefined;
            const fired = this.refreshGate.fire(this.hasDirtyState, this.inConflictState, () => {
                check = this.checkDiagramSource(this.activeDocument);
                return check.anchor;
            });
            if (fired.decision === 'conflict') {
                this.autoRenderMetChangedSource();
                return;
            }
            if (fired.decision === 'hold') {
                if (fired.cause === 'auto' && check?.anchor === 'unchanged' && this.activeDocument) {
                    this.noteUnchangedSource(this.activeDocument, check.resolution);
                }
                this.noticeHeld(fired.cause);
                return;
            }
            void this.render(fired.cause);
        }, delay);
    }

    /**
     * Tell the webview a theme change is waiting. Only for a theme render held
     * by a dirty draft: a held retry stays silent so it does not overwrite the
     * Rebase notice, and the conflict banner already speaks for itself.
     */
    private noticeHeld(cause: RenderCause): void {
        if (cause === 'theme' && this.hasDirtyState && !this.inConflictState) {
            this.notifyRefreshDeferred();
        }
    }

    /** Renders started and not yet finished; the smoke quiet probe waits for zero. */
    private renderInFlight = 0;

    /**
     * @param cause a render that is not 'source' is sent with refresh: true,
     *   and a webview holding staged edits declines it rather than lose them
     *   (#408).
     */
    private async render(cause: RenderCause = 'source'): Promise<void> {
        // This render reads the current theme, so it makes a queued
        // theme-only render redundant; the deferred flag is cleared only when
        // the render is actually posted (#408).
        if (this.debounceTimer && this.refreshGate.supersedeScheduled()) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = undefined;
        }
        this.renderInFlight++;
        try {
            await this.renderBody(cause);
        } finally {
            this.renderInFlight--;
        }
    }

    /**
     * The decision a render takes after its awaits, on the panel state as it
     * is now, not as it was when the render started (#408). Returns true when
     * the render may be posted.
     */
    private completeRender(cause: RenderCause, documentUri: string, documentRevision: string, conflictEpochAtStart: number): boolean {
        if (this.disposed) {
            // The panel closed while this render awaited: post nothing,
            // record nothing, schedule nothing (#439).
            return false;
        }
        const stale = !this.activeDocument ||
            this.activeDocument.uri.toString() !== documentUri ||
            String(this.activeDocument.version) !== documentRevision;
        const check = cause === 'auto' && !stale ? this.checkDiagramSource(this.activeDocument) : undefined;
        const decision = decideRenderCompletion({
            stale,
            conflictBegan: this.conflictEpoch !== conflictEpochAtStart,
            dirty: this.hasDirtyState,
            conflict: this.inConflictState,
            cause,
            anchor: check?.anchor,
        });
        if (decision === 'post') {
            return true;
        }
        if (decision === 'conflict') {
            // An automatic render finished after a draft was staged on a
            // canvas whose diagram source has since changed (#439).
            this.autoRenderMetChangedSource();
            return false;
        }
        if (decision === 'hold' && check?.anchor === 'unchanged' && this.activeDocument) {
            this.noteUnchangedSource(this.activeDocument, check.resolution);
        }
        // A render that is not posted changes nothing the webview shows: the
        // layout snapshot (and any revision carry) stays as the source-event
        // listener left it, which already clears it for a real change (#439).
        if (decision === 'retry') {
            // Nobody chose a retry: it is held like a theme render if the
            // draft or a conflict blocks it when its timer fires.
            // An automatic render stays automatic, so its timer decides again.
            this.scheduleRender(100, cause === 'auto' ? 'auto' : cause === 'theme' && !stale ? 'theme' : 'retry');
            return false;
        }
        // Held: owed until the draft is saved or discarded or the conflict
        // resolved; the clean report schedules it.
        this.refreshGate.held(stale ? 'retry' : cause);
        this.noticeHeld(cause);
        return false;
    }

    /** Bumped by every render body; a render whose number is stale never posts (#454 review). */
    private renderGeneration = 0;
    private layoutAbort: AbortController | undefined;

    private async renderBody(cause: RenderCause): Promise<void> {
        const generation = ++this.renderGeneration;
        // A newer render supersedes the one still laying out: stop its worker.
        this.layoutAbort?.abort();
        const abort = new AbortController();
        this.layoutAbort = abort;
        // Only a render that lays out in the worker is cancelled and dropped
        // when superseded (set below): in-process renders are short, and the
        // overlap rules of completeRender (#408, #439) already judge them.
        let heavy = false;
        const superseded = (): boolean => heavy && (generation !== this.renderGeneration || abort.signal.aborted || this.disposed);
        const refresh = cause !== 'source';
        const conflictEpochAtStart = this.conflictEpoch;
        const smokeWaiter = this.smokeWaiter;
        const activeDocument = this.activeDocument;
        if (!activeDocument) {
            this.currentLayoutSnapshot = undefined;
            this.refreshGate.rendered();
            void this.panel.webview.postMessage({
                type: 'error', ...(refresh ? { refresh: true } : {}), renderToken: this.rememberShown(refresh),
                message: 'No active diagram document selected.',
            });
            return;
        }

        const documentRevision = String(activeDocument.version);
        const documentUri = activeDocument.uri.toString();
        // Draft-state identity (#167 review): a standalone panel is scoped to
        // the document; a Markdown-bound panel is scoped to its fence's
        // CONTENT, resolved against the fences present right now, so a fence
        // inserted or reordered above it cannot steal or orphan its draft.
        let draftScope = computeNativeDraftScope(activeDocument);
        let fenceAnchor: SaveAnchor | undefined;

        // For Markdown-block panels extract only the fenced body for parsing.
        let text: string;
        if (this.markdownBlock) {
            const fullText = activeDocument.getText();
            if (!fullText || fullText.trim().length === 0) {
                this.currentLayoutSnapshot = undefined;
                this.refreshGate.rendered();
                void this.panel.webview.postMessage({ type: 'error', ...(refresh ? { refresh: true } : {}), renderToken: this.rememberShown(refresh), message: 'Document is empty.' });
                return;
            }
            const blocks = findC4xFencedBlocks(activeDocument);
            const block = blocks[this.markdownBlock.blockOrdinal];
            if (!block) {
                this.currentLayoutSnapshot = undefined;
                this.refreshGate.rendered();
                void this.panel.webview.postMessage({
                    type: 'error', ...(refresh ? { refresh: true } : {}), renderToken: this.rememberShown(refresh),
                    message: `C4X fence block ${this.markdownBlock.blockOrdinal} not found in the document. It may have been deleted or moved.`,
                });
                return;
            }
            text = fullText.slice(block.bodyRange.start, block.bodyRange.end);
            // The anchor of the fence state this render reads. It replaces
            // the panel's anchor only when the render is posted, so until
            // then the anchor still describes the canvas the user sees (#439).
            fenceAnchor = captureAnchor(activeDocument, block);
            // Missing is impossible here (checked above); fall back to the
            // document scope rather than sending no scope at all.
            draftScope = computeFenceDraftScope(activeDocument, this.markdownBlock.blockOrdinal) ?? documentUri;
        } else {
            text = activeDocument.getText();
        }

        if (!text || text.trim().length === 0) {
            this.currentLayoutSnapshot = undefined;
            this.refreshGate.rendered();
            void this.panel.webview.postMessage({ type: 'error', ...(refresh ? { refresh: true } : {}), renderToken: this.rememberShown(refresh), message: 'Document is empty.' });
            return;
        }

        const workspaceName = this.getWorkspaceName(activeDocument);
        const isStructurizrDsl = activeDocument.languageId === 'structurizr-dsl' ||
                                  activeDocument.fileName.endsWith('.dsl');
        const isPlantUML = activeDocument.languageId === 'plantuml' ||
                           activeDocument.fileName.endsWith('.puml');

        try {
            const parseStart = performance.now();
            let model;
            let parseTime = 0;
            let modelTime = 0;

            if (isStructurizrDsl) {
                // Structurizr DSL: Parse directly to C4Model (no separate model building)
                model = parseStructurizrDSL(text);
                parseTime = performance.now() - parseStart;
                modelTime = 0;
                // Non-fatal import notes (an unusable `code` property): each distinct problem is
                // shown once per session, keyed by element and value rather than by its location.
                for (const warning of takeUnseenWarnings(model.warnings, PreviewPanel.shownImportWarnings)) {
                    void vscode.window.showWarningMessage(`C4X: ${warning.message}`);
                }
            } else if (isPlantUML) {
                // PlantUML C4: Parse directly to C4Model (no separate model building)
                model = parsePlantUMLtoC4Model(text);
                parseTime = performance.now() - parseStart;
                modelTime = 0;
            } else {
                // C4X: Parse then build model (works for native .c4x and Markdown blocks alike)
                const parseResult = c4xParser.parse(text);
                parseTime = performance.now() - parseStart;

                const modelStart = performance.now();
                model = c4ModelBuilder.build(parseResult, workspaceName);
                modelTime = performance.now() - modelStart;
            }

            // Apply visual overrides from the sidecar file — only for the
            // formats/modes that actually persist coordinates there. Native
            // C4X and Markdown blocks keep coordinates in source metadata, so
            // reading .c4x-layout.json on every render is wasted file I/O —
            // and on cloud-synced (e.g. iCloud) workspaces it can stall the
            // render on an evicted file (#110).
            const persistenceMode = vscode.workspace
                .getConfiguration('c4x')
                .get<string>('layout.persistence', 'native');
            const usesSidecarPersistence = isStructurizrDsl || isPlantUML || persistenceMode === 'sidecar';
            if (usesSidecarPersistence) {
                await applySidecarLayoutOverrides(model, activeDocument.uri);
            }

            const view = model.views[0];

            // Resolve the theme once so the layout, the SVG and the legend
            // overlay swatch colours (#98) always come from the same snapshot.
            // The layout needs it because element text wraps in the theme's
            // font and boxes grow to fit (#340).
            const theme = themeManager.getCurrentTheme();
            const exportTheme = themeManager.getExportTheme();

            heavy = needsLayoutWorker(view) && defaultLayoutWorker() !== undefined;
            const layoutStart = performance.now();
            // Edit mode lays out at the standard sizes (#340): the layout a Save
            // of the first move produces, so a drag moves only what it moves.
            const layoutMode = this.layoutMode;
            const growText = layoutMode !== 'edit';
            const bounded = await layoutBounded(view, { theme, growText }, abort.signal);
            if (!bounded || superseded()) { return; }
            const layout = bounded.layout;
            // In view mode read growth off the layout; in edit mode ask without laying out.
            const textGrown = growText ? bounded.grewText : dagreLayoutEngine.wouldGrowText(view, { theme });
            // Exports are read off-editor and always use the view-mode layout.
            // Same font and mode: reuse the preview layout.
            const exportLayout = exportTheme.styles.fontFamily === theme.styles.fontFamily && growText
                ? layout
                : (await layoutBounded(view, { theme: exportTheme }, abort.signal))?.layout;
            if (!exportLayout || superseded()) { return; }
            const layoutTime = performance.now() - layoutStart;

            const renderStart = performance.now();
            const svg = svgBuilder.build(layout, { theme, view });
            const exportSvg = exportTheme === theme && exportLayout === layout ? svg : svgBuilder.build(exportLayout, { theme: exportTheme, view });
            const renderTime = performance.now() - renderStart;

            const visualLayout: VisualLayoutSnapshot = {
                revision: documentRevision,
                nodes: buildNodeSnapshots(layout),
                boundaries: buildBoundarySnapshots(layout),
                edges: layout.relationships.map(relationship => ({
                    id: relationship.id,
                    from: relationship.relationship.from,
                    to: relationship.relationship.to,
                    label: relationship.relationship.label,
                    relType: relationship.relationship.relType,
                    technology: relationship.relationship.technology,
                })),
            };

            const payload: RenderPayload = {
                svg,
                visualLayout,
                metrics: {
                    parseTime,
                    modelTime,
                    layoutTime,
                    renderTime,
                    totalTime: parseTime + modelTime + layoutTime + renderTime,
                    elements: view.elements.length,
                    relationships: view.relationships.length,
                },
                settings: {
                    autoFitOnOpen: vscode.workspace
                        .getConfiguration('c4x')
                        .get<boolean>('canvas.autoFitOnOpen', true),
                    legendShow: vscode.workspace
                        .getConfiguration('c4x')
                        .get<boolean>('legend.show', true),
                    // Only Markdown-fence editors open at the configured
                    // preview scale (#134); standalone panels omit the field
                    // and keep the auto-fit-on-open behaviour (#111).
                    initialZoom: this.markdownBlock ? readMarkdownPreviewScale() : undefined,
                },
                presentElementTypes: computePresentElementTypes(view),
                legendSwatchColors: computeLegendSwatchColors(view, theme),
                legendEntries: computeLegendEntries(layout, theme, elementStyleContextFor(layout, view, theme)),
                legendKeyTheme: keySwatchTheme(theme),
                elementStyleInputs: elementStyleClientInputs(view, theme),
                layoutMode,
                textGrown,
                diagramIdentity: this.markdownBlock ? `${documentUri}#c4x-block:${this.markdownBlock.blockOrdinal}` : documentUri,
                viewType: String(view.type),
                // Draft-state identity (#167 review): a Markdown-bound panel is
                // scoped to its fence's content, a standalone panel to the
                // document and exact source content.
                scope: draftScope,
            };

            if (!this.completeRender(cause, documentUri, documentRevision, conflictEpochAtStart)) {
                return;
            }

            this.refreshGate.rendered();
            // Written only for a render that is posted: Rebase compares the
            // changed source with the diagram the webview actually shows.
            this.renderedPositionalIdentity = view ? positionalIdentityOf(view) : undefined;
            this.currentSvg = svg;
            this.currentExportSvg = exportSvg;
            this.currentExportInputs = { layout: exportLayout, theme: exportTheme, view };
            this.currentLayoutSnapshot = visualLayout;
            this.lastRenderTextGrown = textGrown;
            // Refresh the anchor on every posted render: the next save, and
            // the next source event, resolve against what is now shown.
            this.activeSaveAnchor = fenceAnchor ?? this.captureDocumentAnchor(activeDocument);
            this.snapshotRevisionCarry = undefined;
            // Recorded so a decline can restore what the webview still shows.
            payload.sameDiagramEdit = { since: this.renderTokenSeq ?? null, value: this.sameDiagramSinceRender };
            this.sameDiagramSinceRender = true;
            this.lastKnownText = activeDocument.getText();
            const renderToken = this.rememberShown(refresh);
            void this.panel.webview.postMessage({
                type: 'render', payload,
                ...(refresh ? { refresh: true } : {}),
                renderToken,
                ...(smokeWaiter && smokeWaiter === this.smokeWaiter ? { smokeRequest: smokeWaiter.token } : {}),
            });
        } catch (error) {
            if (superseded()) { return; }
            // A layout failure surfaces after the awaits: the same rule applies
            // before an error replaces the preview (#408).
            if (!this.completeRender(cause, documentUri, documentRevision, conflictEpochAtStart)) {
                return;
            }
            if (fenceAnchor) {
                // As before for a fence: the error is now what is shown.
                this.activeSaveAnchor = fenceAnchor;
            }
            smokeWaiter?.finish(undefined, new Error('Packaged webview render failed: ' + (error instanceof Error ? error.message : String(error))));
            // The error is the current result: posting it retires any owed
            // render, as the early error paths do, so a persistent failure
            // is reported once and then waits for the next real event (#408).
            this.refreshGate.rendered();
            this.currentSvg = undefined;
            this.currentExportSvg = undefined;
            this.currentExportInputs = undefined;
            this.currentLayoutSnapshot = undefined;
            if (error instanceof C4XParseError) {
                this.panel.webview.postMessage({
                    type: 'error', ...(refresh ? { refresh: true } : {}), renderToken: this.rememberShown(refresh),
                    message: `${error.message} (Line ${error.location.line}, Column ${error.location.column})`,
                });
            } else if (error instanceof StructurizrLexerError || error instanceof StructurizrParserError) {
                this.panel.webview.postMessage({
                    type: 'error', ...(refresh ? { refresh: true } : {}), renderToken: this.rememberShown(refresh),
                    message: error.message,
                });
            } else if (error instanceof Error) {
                this.panel.webview.postMessage({ type: 'error', ...(refresh ? { refresh: true } : {}), renderToken: this.rememberShown(refresh), message: error.message });
            } else {
                this.panel.webview.postMessage({ type: 'error', ...(refresh ? { refresh: true } : {}), renderToken: this.rememberShown(refresh), message: 'Unknown error while rendering preview.' });
            }
        }
    }

    private getWorkspaceName(document: vscode.TextDocument): string {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (workspaceFolder) {
            return workspaceFolder.name;
        }
        return document.uri.path.split('/').pop() ?? 'C4X Workspace';
    }

    private captureDocumentAnchor(document: vscode.TextDocument): SaveAnchor {
        return captureAnchor(document, createNativeDocumentBlock(document));
    }

    private captureMarkdownBlockAnchor(document: vscode.TextDocument, blockOrdinal: number): SaveAnchor | undefined {
        const blocks = findC4xFencedBlocks(document);
        const block = blocks[blockOrdinal];
        if (!block) {
            return undefined;
        }
        return captureAnchor(document, block);
    }

    private getHtml(): string {
        const nonce = this.getNonce();
        const csp = [
            "default-src 'none'",
            "img-src data:",
            `style-src 'nonce-${nonce}'`,
            `script-src 'nonce-${nonce}'`,
        ].join('; ');

        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>C4X Preview</title>
  <style nonce="${nonce}">
    :root {
      color-scheme: light dark;
    }
    body {
      font-family: var(--vscode-font-family);
      background-color: var(--vscode-editor-background);
      color: var(--vscode-foreground);
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      height: 100vh;
    }
    /* Title and the whole session-action cluster sit together on the left
       (#160): Edit / Save / Discard are one decision group and read as one. */
    header {
      padding: 10px 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
      display: flex;
      align-items: center;
      justify-content: flex-start;
      flex-wrap: wrap;
      gap: 8px 16px;
    }
    #preview-title {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    #preview-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    #toggle-layout {
      appearance: none;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 3px;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      padding: 5px 10px;
      font: inherit;
      cursor: pointer;
    }
    #toggle-layout:hover:not(:disabled) {
      background: var(--vscode-button-hoverBackground);
    }
    #toggle-layout:disabled {
      cursor: default;
      opacity: 0.65;
    }
    #toggle-layout:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 2px;
    }
    /* #layout-status now lives in the sidebar footer, not the header. The old
       single-line clamp here is deliberately gone: it truncated announcements
       to "Web App moved to 299, …". Presentation is set with .sidebar-actions
       below; only the state modifiers remain here. */
    #layout-status[data-kind="error"] {
      color: var(--vscode-errorForeground);
    }
    #layout-status[data-state="dirty"] {
      font-weight: 600;
    }
    /* Diagram stats: a compact table, not a row of pills (#160). Floating in
       the canvas corner while previewing, docked at the top of the sidebar in
       edit mode. */
    #diagram-stats h3 {
      margin: 0 0 6px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground, #858585);
    }
    #diagram-stats.stats-floating {
      position: absolute;
      top: 12px;
      right: 12px;
      background: var(--vscode-editorWidget-background, rgba(30, 30, 30, 0.8));
      backdrop-filter: blur(8px);
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border, #444));
      border-radius: 6px;
      padding: 8px 10px;
      box-shadow: 0 4px 12px var(--vscode-widget-shadow, rgba(0, 0, 0, 0.25));
      opacity: 0.85;
      z-index: 100;
    }
    #diagram-stats.stats-floating:hover {
      opacity: 1;
    }
    .stats-table {
      border-collapse: collapse;
      font-size: 11px;
      line-height: 1.5;
    }
    .stats-table th {
      text-align: left;
      font-weight: 400;
      color: var(--vscode-descriptionForeground, #858585);
      padding: 0 12px 0 0;
      white-space: nowrap;
    }
    .stats-table td {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      color: var(--vscode-foreground, #cccccc);
    }
    /* The canvas is a fixed window, not a scrolling document: the SVG fills it
       exactly and the camera (viewBox) decides what is visible (#160). */
    #content {
      position: relative;
      flex: 1;
      overflow: hidden;
      min-width: 0;
    }
    #svg-container {
      position: absolute;
      inset: 0;
    }
    #placeholder {
      padding: 16px;
    }
    #error {
      margin: 16px;
      padding: 12px 16px;
      border-radius: 4px;
      background: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      color: var(--vscode-inputValidation-errorForeground);
      display: none;
      white-space: pre-line;
    }
    svg {
      width: 100%;
      height: 100%;
      display: block;
    }
    #content.visual-layout-editing g.node {
      cursor: grab;
      touch-action: none;
    }
    #content.visual-layout-editing g.node:active {
      cursor: grabbing;
    }
    #content.visual-layout-editing g.node:focus-visible {
      outline: 2px solid var(--vscode-focusBorder);
      outline-offset: 3px;
    }
    #content.visual-layout-editing g.node.visual-layout-selected > rect,
    #content.visual-layout-editing g.node.visual-layout-selected > polygon,
    #content.visual-layout-editing g.node.visual-layout-selected > ellipse,
    #content.visual-layout-editing g.node.visual-layout-selected > path:first-child {
      stroke: var(--vscode-focusBorder) !important;
      stroke-width: 4 !important;
    }
    /* Connect mode (#66): eligible endpoints invite the pick, ineligible ones
       recede. Both states are driven by eligibleConnectTargets(), so the
       affordance and the click guard cannot disagree. */
    #content.connect-mode-active g.node {
      cursor: crosshair;
    }
    #content.connect-mode-active g.node.connect-ineligible {
      opacity: 0.4;
      cursor: not-allowed;
    }

    #content.visual-layout-editing g.node.locked > rect,
    #content.visual-layout-editing g.node.locked > polygon,
    #content.visual-layout-editing g.node.locked > ellipse,
    #content.visual-layout-editing g.node.locked > path:first-child {
      stroke: var(--vscode-editorLightBulb-foreground, #f1c40f) !important;
      stroke-dasharray: 5,4 !important;
      stroke-width: 2.5 !important;
    }
    /* Declared AFTER the locked rules on purpose. A locked element is still a
       legal relationship endpoint, so while connect mode is armed its
       eligibility must out-rank the locked dashes rather than be hidden by
       them — the two selectors carry equal specificity, so source order
       decides. Colours avoid the theme's focus border, which is a blue that
       disappears against the blue C4 element fills. */
    #content.connect-mode-active g.node.connect-eligible > rect,
    #content.connect-mode-active g.node.connect-eligible > polygon,
    #content.connect-mode-active g.node.connect-eligible > ellipse,
    #content.connect-mode-active g.node.connect-eligible > path:first-child {
      stroke: var(--vscode-charts-green, #2ea043) !important;
      stroke-dasharray: none !important;
      stroke-width: 4 !important;
    }
    #content.connect-mode-active g.node.connect-source > rect,
    #content.connect-mode-active g.node.connect-source > polygon,
    #content.connect-mode-active g.node.connect-source > ellipse,
    #content.connect-mode-active g.node.connect-source > path:first-child {
      stroke: var(--vscode-charts-orange, #e8912d) !important;
      stroke-dasharray: none !important;
      stroke-width: 6 !important;
    }

    #content.visual-layout-editing g.node.locked.visual-layout-selected > rect,
    #content.visual-layout-editing g.node.locked.visual-layout-selected > polygon,
    #content.visual-layout-editing g.node.locked.visual-layout-selected > ellipse,
    #content.visual-layout-editing g.node.locked.visual-layout-selected > path:first-child {
      stroke: var(--vscode-focusBorder) !important;
      stroke-dasharray: 5,4 !important;
      stroke-width: 4 !important;
    }
    #content.visual-layout-editing g.boundary {
      cursor: grab;
      touch-action: none;
    }
    #content.visual-layout-editing g.boundary:active {
      cursor: grabbing;
    }
    #content.visual-layout-editing g.boundary.boundary-fixed,
    #content.visual-layout-editing g.boundary.boundary-fixed:active {
      cursor: default;
      touch-action: auto;
    }
    #content.visual-layout-editing g.boundary:focus-visible {
      outline: 2px solid var(--vscode-focusBorder);
      outline-offset: 3px;
    }
    #content.visual-layout-editing g.boundary.visual-layout-selected > rect {
      stroke: var(--vscode-focusBorder) !important;
      stroke-width: 4 !important;
    }
    #content.visual-layout-editing g.boundary .boundary-resize-handle {
      cursor: nwse-resize;
      pointer-events: all;
    }
    #content.visual-layout-editing g.boundary .boundary-resize-handle:focus-visible {
      outline: 2px solid var(--vscode-focusBorder);
      outline-offset: 1px;
    }
    #content.visual-layout-editing g.edge {
      cursor: pointer;
    }
    #content.visual-layout-editing g.edge.visual-layout-selected > path:not(.edge-hit-area) {
      stroke: var(--vscode-focusBorder) !important;
      stroke-width: 3 !important;
    }
    /* Bottom overlay dock (#250). The canvas toolbar and the legend share one
       flex row instead of being pinned independently to opposite corners,
       so they can never overlap: side by side when the canvas is wide
       enough, and the legend wraps onto its own line above the toolbar when
       it is not (wrap-reverse puts the first line, the toolbar, at the
       bottom). The dock covers the whole canvas so a dragged legend
       (position: absolute) keeps the canvas as its coordinate space; it lets
       pointer events through everywhere except on its children. */
    #canvas-overlay-dock {
      position: absolute;
      inset: 0;
      box-sizing: border-box;
      padding: 20px;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      pointer-events: none;
      z-index: 100;
    }
    .canvas-overlay-row {
      display: flex;
      flex-wrap: wrap-reverse;
      /* wrap-reverse flips the cross axis: flex-start is the bottom edge, so
         this bottom-aligns the toolbar and the legend on a shared line. */
      align-items: flex-start;
      gap: 12px;
      min-width: 0;
    }
    .canvas-overlay-row > * {
      pointer-events: auto;
    }
    .canvas-toolbar {
      /* Above the legend in the dock's stacking context: a legend the user
         drags onto the toolbar slides underneath it, never over it. */
      position: relative;
      z-index: 1;
      display: flex;
      flex-wrap: wrap;
      max-width: 100%;
      box-sizing: border-box;
      gap: 6px;
      background: var(--vscode-editorWidget-background, rgba(30, 30, 30, 0.8));
      backdrop-filter: blur(8px);
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border, #444));
      border-radius: 6px;
      padding: 4px;
      box-shadow: 0 4px 12px var(--vscode-widget-shadow, rgba(0, 0, 0, 0.25));
    }
    .canvas-toolbar button {
      appearance: none;
      background: transparent;
      border: none;
      border-radius: 4px;
      color: var(--vscode-foreground);
      padding: 6px 10px;
      cursor: pointer;
      font-size: 13px;
      font-family: inherit;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 32px;
      transition: background 0.15s ease;
    }
    .canvas-toolbar button:hover {
      background: var(--vscode-toolbar-hoverBackground, rgba(255, 255, 255, 0.1));
    }
    .canvas-toolbar button:active {
      background: var(--vscode-toolbar-activeBackground, rgba(255, 255, 255, 0.2));
    }
    .canvas-toolbar button:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 1px;
    }
    /* Legend overlay (#98): draggable, keyboard-repositionable, themed like
       the canvas toolbar. Default anchor (audit Appendix B) is bottom-right:
       it sits in the overlay dock's row after the toolbar, pushed right by
       its auto margin, inside the dock's 20px gutter (#250). Once dragged it
       leaves the row (.legend-floating) and takes explicit left/top. */
    #legend-overlay {
      flex: 0 0 auto;
      margin-left: auto;
      min-width: 140px;
      max-width: 240px;
      background: var(--vscode-editorWidget-background, rgba(30, 30, 30, 0.8));
      backdrop-filter: blur(8px);
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border, #444));
      border-radius: 6px;
      padding: 8px 10px;
      box-shadow: 0 4px 12px var(--vscode-widget-shadow, rgba(0, 0, 0, 0.25));
      cursor: grab;
      user-select: none;
      touch-action: none;
      font-size: 12px;
      color: var(--vscode-foreground);
    }
    #legend-overlay.legend-floating {
      position: absolute;
      margin: 0;
    }
    #legend-overlay:active {
      cursor: grabbing;
    }
    #legend-overlay:focus-visible {
      outline: 2px solid var(--vscode-focusBorder);
      outline-offset: 2px;
    }
    #legend-overlay[hidden] {
      display: none;
    }
    #legend-overlay .legend-title {
      font-weight: 600;
      margin-bottom: 6px;
    }
    #legend-items {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    #legend-items li {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    #legend-items .legend-swatch {
      width: 12px;
      height: 12px;
      flex-shrink: 0;
      border-radius: 2px;
      background: var(--vscode-descriptionForeground, #858585);
    }
    #legend-items .legend-swatch-disc {
      border-radius: 50%;
    }
    #legend-items .legend-swatch-dashed-box {
      background: transparent;
      border: 1px dashed var(--vscode-foreground);
    }
    /* Derived key entries (#327): the swatch is a small SVG of the element's
       shape, drawn by the host with the diagram's own geometry and colours. */
    #legend-items .legend-swatch-shape {
      width: 32px;
      height: 22px;
      background: transparent;
      border-radius: 0;
      display: inline-flex;
    }
    #legend-items .legend-swatch-shape svg {
      display: block;
    }
    #legend-items .legend-swatch-dashed-line {
      height: 0;
      border-top: 2px dashed var(--vscode-foreground);
      background: transparent;
      border-radius: 0;
    }
    #main-viewport {
      display: flex;
      flex-direction: row;
      flex: 1;
      overflow: hidden;
      position: relative;
    }
    #editor-sidebar {
      width: 320px;
      background: var(--vscode-editorWidget-background, #252526);
      border-left: 1px solid var(--vscode-panel-border, #3c3c3c);
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow-y: auto;
      box-sizing: border-box;
    }
    .sidebar-section {
      padding: 16px;
      border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c);
    }
    .sidebar-section h3 {
      margin-top: 0;
      margin-bottom: 12px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground, #858585);
    }
    .form-group {
      margin-bottom: 12px;
    }
    .form-group label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      margin-bottom: 4px;
      color: var(--vscode-foreground, #cccccc);
    }
    .form-group input[type="text"],
    .form-group textarea,
    .form-group select {
      width: 100%;
      box-sizing: border-box;
      background: var(--vscode-input-background, #3c3c3c);
      color: var(--vscode-input-foreground, #cccccc);
      border: 1px solid var(--vscode-input-border, #3c3c3c);
      padding: 6px;
      border-radius: 2px;
      font-family: inherit;
      font-size: 13px;
    }
    .form-group select:disabled {
      opacity: 0.65;
      cursor: not-allowed;
    }
    .form-group input[readonly] {
      opacity: 0.65;
      background: var(--vscode-input-background, #2d2d2d);
      cursor: not-allowed;
    }
    .form-group input:disabled,
    .form-group textarea:disabled {
      opacity: 0.65;
      cursor: not-allowed;
    }
    .id-editor-row {
      display: flex;
      gap: 6px;
    }
    .id-editor-row input {
      min-width: 0;
      flex: 1;
    }
    .id-editor-row button {
      padding: 4px 8px;
      white-space: nowrap;
    }
    .id-editor-row button:focus-visible {
      outline: 1px solid var(--vscode-focusBorder, #007acc);
      outline-offset: 2px;
    }
    .form-group textarea {
      resize: vertical;
    }
    .form-group input:focus,
    .form-group input:focus-visible,
    .form-group textarea:focus,
    .form-group textarea:focus-visible,
    .form-group select:focus,
    .form-group select:focus-visible {
      outline: 1px solid var(--vscode-focusBorder, #007acc);
      border-color: var(--vscode-focusBorder, #007acc);
    }
    .form-group input[aria-invalid="true"],
    .form-group textarea[aria-invalid="true"] {
      border-color: var(--vscode-inputValidation-errorBorder, #be1100);
      outline: 1px solid var(--vscode-inputValidation-errorBorder, #be1100);
    }
    .field-error {
      margin: 2px 0 0 0;
      font-size: 11px;
      color: var(--vscode-inputValidation-errorForeground, #f14c4c);
      line-height: 1.4;
      min-height: 0;
    }
    .form-group-checkbox {
      display: flex;
      align-items: center;
      flex-direction: row;
      gap: 8px;
    }
    .form-group-checkbox label {
      display: inline;
      margin-bottom: 0;
    }
    .form-group-checkbox input[type="checkbox"] {
      width: auto;
      cursor: pointer;
    }
    .form-group-checkbox input[type="checkbox"]:disabled {
      opacity: 0.65;
      cursor: not-allowed;
    }
    #staged-changes-list {
      list-style: none;
      padding: 0;
      margin: 0;
      font-size: 12px;
    }
    #staged-changes-list li {
      padding: 6px 8px;
      background: var(--vscode-keybindingTable-rowsBackground, rgba(255, 255, 255, 0.03));
      border: 1px solid var(--vscode-panel-border, #3c3c3c);
      border-radius: 4px;
      margin-bottom: 6px;
      display: flex;
      flex-direction: row;
      align-items: flex-start;
      gap: 4px;
      color: var(--vscode-foreground);
    }
    #staged-changes-list li .change-text {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    #staged-changes-list li .change-title {
      font-weight: 600;
    }
    #staged-changes-list li .change-detail {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
    #staged-changes-list li .change-remove-btn {
      flex-shrink: 0;
      appearance: none;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 3px;
      color: var(--vscode-descriptionForeground);
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
      padding: 1px 4px;
      margin-top: 1px;
    }
    #staged-changes-list li .change-remove-btn:hover {
      background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
      color: var(--vscode-foreground);
      border-color: var(--vscode-panel-border, #3c3c3c);
    }
    #staged-changes-list li .change-remove-btn:focus,
    #staged-changes-list li .change-remove-btn:focus-visible {
      outline: 1px solid var(--vscode-focusBorder, #007acc);
      outline-offset: 1px;
    }
    #staged-changes-list li.empty-changes-text {
      background: transparent;
      border: none;
      font-style: italic;
      color: var(--vscode-descriptionForeground);
      text-align: center;
      padding: 12px 0;
    }
    /* Footer strip of the sidebar. Now carries the status line rather than the
       session buttons, which moved to the header. */
    .sidebar-actions {
      padding: 12px 16px;
      display: flex;
      gap: 8px;
      margin-top: auto;
      border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.35));
      min-height: 20px;
      align-items: center;
    }
    #layout-status {
      font-size: 12px;
      line-height: 1.4;
      color: var(--vscode-descriptionForeground, #9d9d9d);
      /* Full sidebar width, so a move announcement is readable instead of
         being clipped to "Web App moved to 299, …" as it was in the header. */
      overflow-wrap: anywhere;
    }
    #session-actions {
      display: flex;
      gap: 8px;
    }
    #session-actions button {
      appearance: none;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 2px;
      padding: 6px 14px;
      cursor: pointer;
      font-size: 13px;
      font-family: inherit;
      font-weight: 600;
      white-space: nowrap;
    }
    #session-actions button:focus-visible {
      outline: 1px solid var(--vscode-focusBorder, #007acc);
      outline-offset: 2px;
    }
    .sidebar-actions button {
      flex: 1;
      appearance: none;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 2px;
      padding: 8px;
      cursor: pointer;
      font-size: 13px;
      font-family: inherit;
      font-weight: 600;
      text-align: center;
    }
    #save-staged-changes {
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #ffffff);
    }
    #save-staged-changes:hover:not(:disabled) {
      background: var(--vscode-button-hoverBackground, #1177bb);
    }
    #save-staged-changes:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    #discard-staged-changes {
      background: var(--vscode-button-secondaryBackground, #3a3d41);
      color: var(--vscode-button-secondaryForeground, #ffffff);
      border: 1px solid var(--vscode-button-border, transparent);
    }
    #discard-staged-changes:hover {
      background: var(--vscode-button-secondaryHoverBackground, #45494e);
    }
    .sidebar-actions button:focus-visible {
      outline: 1px solid var(--vscode-focusBorder, #007acc);
      outline-offset: 2px;
    }
    #rename-dialog {
      width: min(420px, calc(100vw - 32px));
      color: var(--vscode-foreground, #cccccc);
      background: var(--vscode-editorWidget-background, #252526);
      border: 1px solid var(--vscode-panel-border, #3c3c3c);
      border-radius: 4px;
      padding: 18px;
    }
    #rename-dialog::backdrop {
      background: var(--vscode-widget-shadow, rgba(0, 0, 0, 0.45));
    }
    .rename-dialog-form {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .rename-dialog-form h3,
    .rename-dialog-form p {
      margin: 0;
    }
    #rename-validation {
      color: var(--vscode-errorForeground, #f14c4c);
      min-height: 1.25em;
    }
    .rename-dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .rename-dialog-actions button:focus-visible {
      outline: 1px solid var(--vscode-focusBorder, #007acc);
      outline-offset: 2px;
    }
    /* Conflict banner */
    #conflict-banner{display:none;padding:10px 16px;background:var(--vscode-inputValidation-warningBackground,rgba(255,180,0,.15));border:1px solid var(--vscode-inputValidation-warningBorder,#b89500);border-radius:4px;margin:8px 16px 0;font-size:13px}
    #conflict-banner[data-active="true"]{display:flex;flex-direction:column;gap:8px}
    #conflict-banner-message{font-weight:600;color:var(--vscode-editorWarning-foreground,#cca700)}
    .conflict-actions{display:flex;gap:8px;flex-wrap:wrap}
    .conflict-actions button{appearance:none;border:1px solid var(--vscode-button-border,transparent);border-radius:2px;padding:4px 10px;cursor:pointer;font-size:12px;font-family:inherit;font-weight:500}
    #conflict-reload{background:var(--vscode-button-background,#0e639c);color:var(--vscode-button-foreground,#fff)}
    #conflict-reload:hover{background:var(--vscode-button-hoverBackground,#1177bb)}
    #conflict-diff,#conflict-rebase{background:var(--vscode-button-secondaryBackground,#3a3d41);color:var(--vscode-button-secondaryForeground,#fff)}
    #conflict-diff:hover,#conflict-rebase:hover{background:var(--vscode-button-secondaryHoverBackground,#45494e)}
    .conflict-actions button:focus-visible{outline:1px solid var(--vscode-focusBorder,#007acc);outline-offset:2px}
    /* Exit-edit confirmation banner */
    #exit-edit-banner{display:none;padding:10px 16px;background:var(--vscode-inputValidation-warningBackground,rgba(255,180,0,.15));border:1px solid var(--vscode-inputValidation-warningBorder,#b89500);border-radius:4px;margin:8px 16px 0;font-size:13px}
    #exit-edit-banner[data-active="true"]{display:flex;flex-direction:column;gap:8px}
    #exit-edit-banner:focus-visible{outline:1px solid var(--vscode-focusBorder,#007acc);outline-offset:2px}
    #exit-edit-banner-message{font-weight:600;color:var(--vscode-editorWarning-foreground,#cca700)}
    .exit-edit-actions{display:flex;gap:8px;flex-wrap:wrap}
    .exit-edit-actions button{appearance:none;border:1px solid var(--vscode-button-border,transparent);border-radius:2px;padding:4px 10px;cursor:pointer;font-size:12px;font-family:inherit;font-weight:500}
    #exit-edit-discard{background:var(--vscode-button-background,#0e639c);color:var(--vscode-button-foreground,#fff)}
    #exit-edit-discard:hover{background:var(--vscode-button-hoverBackground,#1177bb)}
    #exit-edit-cancel{background:var(--vscode-button-secondaryBackground,#3a3d41);color:var(--vscode-button-secondaryForeground,#fff)}
    #exit-edit-cancel:hover{background:var(--vscode-button-secondaryHoverBackground,#45494e)}
    .exit-edit-actions button:focus-visible{outline:1px solid var(--vscode-focusBorder,#007acc);outline-offset:2px}
    /* Source diff section */
    .diff-section-toggle {
      appearance: none;
      background: transparent;
      border: none;
      color: inherit;
      cursor: pointer;
      font: inherit;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground, #858585);
      padding: 0;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .diff-section-toggle:focus-visible {
      outline: 1px solid var(--vscode-focusBorder, #007acc);
      outline-offset: 2px;
    }
    .diff-toggle-indicator {
      font-size: 9px;
      transition: transform 0.15s ease;
      display: inline-block;
    }
    .diff-section-toggle[aria-expanded="true"] .diff-toggle-indicator {
      transform: rotate(90deg);
    }
    .diff-status-msg {
      font-size: 11px;
      color: var(--vscode-descriptionForeground, #858585);
      margin-bottom: 6px;
      min-height: 1em;
    }
    .source-diff-pre {
      margin: 0;
      padding: 8px;
      background: var(--vscode-textCodeBlock-background, #1e1e1e);
      border: 1px solid var(--vscode-panel-border, #3c3c3c);
      border-radius: 3px;
      overflow-x: auto;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
      line-height: 1.5;
      white-space: pre;
      max-height: 300px;
      overflow-y: auto;
    }
    .source-diff-pre:focus,
    .source-diff-pre:focus-visible {
      outline: 1px solid var(--vscode-focusBorder, #007acc);
    }
    .diff-line {
      display: block;
    }
    .diff-line[data-kind="added"] {
      color: var(--vscode-gitDecoration-addedResourceForeground, #81b88b);
      background: var(--vscode-diffEditor-insertedLineBackground, rgba(70, 120, 70, 0.15));
    }
    .diff-line[data-kind="removed"] {
      color: var(--vscode-gitDecoration-deletedResourceForeground, #c74e39);
      background: var(--vscode-diffEditor-removedLineBackground, rgba(120, 50, 50, 0.15));
    }
    .diff-line[data-kind="unchanged"] {
      color: var(--vscode-editor-foreground, #cccccc);
    }
    .diff-line::before {
      display: inline-block;
      width: 1ch;
      margin-right: 6px;
      opacity: 0.7;
    }
    .diff-line[data-kind="added"]::before {
      content: '+';
    }
    .diff-line[data-kind="removed"]::before {
      content: '-';
    }
    .diff-line[data-kind="unchanged"]::before {
      content: ' ';
    }
    .diff-empty-msg {
      color: var(--vscode-descriptionForeground, #858585);
      font-style: italic;
    }
  </style>
</head>
<body>
  <header>
    <div id="preview-title">
      <strong>C4X Preview</strong>
      <div id="layout-error" role="alert" aria-live="assertive"></div>
    </div>
    <!-- One cluster, top left, in the order the session runs: enter edit mode,
         then the two decisions that end it. Save and Discard sit here rather
         than at the foot of the sidebar, which scrolls — at the bottom they
         could be pushed out of view exactly when they are needed. The metrics
         moved out of the header entirely (#160); they live in #diagram-stats. -->
    <div id="preview-actions">
      <button id="toggle-layout" type="button" aria-pressed="false" aria-controls="content" disabled>Edit C4 Diagram</button>
      <div id="session-actions">
        <button id="save-staged-changes" type="button" disabled>Save Changes</button>
        <button id="discard-staged-changes" type="button">Discard</button>
      </div>
    </div>
  </header>
  <div id="error"></div>
  <div
    id="conflict-banner"
    role="alert"
    aria-live="assertive"
    aria-atomic="true"
    data-active="false"
  >
    <span id="conflict-banner-message"></span>
    <div class="conflict-actions">
      <button id="conflict-reload" type="button">Reload source and discard draft</button>
      <button id="conflict-diff" type="button">View diff</button>
      <button id="conflict-rebase" type="button">Rebase draft</button>
    </div>
  </div>
  <div
    id="exit-edit-banner"
    role="alert"
    aria-live="assertive"
    aria-atomic="true"
    data-active="false"
    tabindex="-1"
  >
    <span id="exit-edit-banner-message">You have unsaved changes. Discard and exit edit mode?</span>
    <div class="exit-edit-actions">
      <button id="exit-edit-discard" type="button">Discard</button>
      <button id="exit-edit-cancel" type="button">Cancel</button>
    </div>
  </div>
  <div id="main-viewport">
    <div id="content">
      <div id="svg-container"></div>
      <div id="placeholder">Waiting for render...</div>
      <!-- Global stats reference (#160). One node, two homes: floating in the
           canvas corner while previewing, docked at the top of the sidebar
           above the Properties Inspector once the sidebar is open. setEditMode
           moves it; the id stays unique either way. -->
      <div id="diagram-stats" class="stats-floating">
        <h3>Diagram Stats</h3>
        <div id="metrics"></div>
      </div>
      <!-- Bottom overlay dock (#250): toolbar and legend share one wrapping
           row, so the legend never covers a toolbar button. DOM order is the
           Tab order: toolbar first, then the legend. -->
      <div id="canvas-overlay-dock">
        <div class="canvas-overlay-row">
          <div class="canvas-toolbar" role="toolbar" aria-label="Canvas controls">
            <button id="zoom-in" type="button" title="Zoom In" aria-label="Zoom In">+</button>
            <button id="zoom-out" type="button" title="Zoom Out" aria-label="Zoom Out">−</button>
            <button id="zoom-reset" type="button" title="Reset Zoom" aria-label="Reset Zoom">100%</button>
            <button id="zoom-fit" type="button" title="Zoom to Fit" aria-label="Zoom to Fit">Fit</button>
            <button
              id="connect-mode"
              type="button"
              title="Add a relationship between two elements"
              aria-label="Connect: add a relationship"
              aria-pressed="false"
              disabled
            >Connect</button>
          </div>
          <div
            id="legend-overlay"
            role="region"
            aria-label="Diagram legend. Drag to move, or focus and use arrow keys to reposition."
            tabindex="0"
            hidden
          >
            <div class="legend-title">Legend</div>
            <ul id="legend-items"></ul>
          </div>
        </div>
      </div>
    </div>
    <div id="editor-sidebar" style="display: none;">
      <div class="sidebar-section" id="element-inspector">
        <h3>Properties Inspector</h3>
        <div class="form-group">
          <label for="inspector-id">ID</label>
          <div class="id-editor-row">
            <input id="inspector-id" type="text" readonly />
            <button id="rename-element" type="button" aria-haspopup="dialog" disabled>Rename</button>
          </div>
        </div>
        <div class="form-group">
          <label for="inspector-type">Type</label>
          <input id="inspector-type" type="text" readonly />
        </div>
        <div class="form-group">
          <label for="inspector-label">Label</label>
          <input id="inspector-label" type="text" maxlength="120" disabled />
        </div>
        <div class="form-group">
          <label for="inspector-tech">Technology</label>
          <input id="inspector-tech" type="text" maxlength="120" disabled />
        </div>
        <div class="form-group">
          <label for="inspector-tags">Tags</label>
          <input id="inspector-tags" type="text" maxlength="819" placeholder="Comma-separated tags" disabled />
        </div>
        <div class="form-group">
          <label for="inspector-sprite">Sprite</label>
          <input id="inspector-sprite" type="text" maxlength="120" placeholder="Catalogue sprite name" disabled />
        </div>
        <div class="form-group form-group-checkbox">
          <input id="inspector-locked" type="checkbox" disabled />
          <label for="inspector-locked">Locked</label>
        </div>
        <div class="form-group">
          <label for="inspector-desc">Description</label>
          <textarea id="inspector-desc" rows="4" placeholder="No description specified" disabled></textarea>
        </div>
      </div>
      <div class="sidebar-section" id="edge-inspector" hidden>
        <h3>Relationship</h3>
        <div class="form-group">
          <label for="edge-from">From</label>
          <div class="id-editor-row">
            <input id="edge-from" type="text" readonly />
            <button id="reassign-from" type="button" aria-haspopup="dialog" disabled>Reassign…</button>
          </div>
        </div>
        <div class="form-group">
          <label for="edge-to">To</label>
          <div class="id-editor-row">
            <input id="edge-to" type="text" readonly />
            <button id="reassign-to" type="button" aria-haspopup="dialog" disabled>Reassign…</button>
          </div>
        </div>
        <div class="form-group">
          <label for="edge-label">Label</label>
          <input id="edge-label" type="text" maxlength="120" placeholder="No label" disabled />
        </div>
        <div class="form-group">
          <label for="edge-type">Type</label>
          <select id="edge-type" disabled>
            <option value="uses">Uses (-->)</option>
            <option value="async">Async (-.->)</option>
            <option value="sync">Sync (==>)</option>
          </select>
        </div>
        <div class="form-group">
          <label for="edge-technology">Technology</label>
          <input id="edge-technology" type="text" maxlength="120" placeholder="No technology" disabled />
        </div>
        <p id="edge-validation" role="alert" class="edge-inspector-note"></p>
        <p class="edge-inspector-note">Edits to relationship properties are staged like element changes — Save applies them with the same guarded writeback.</p>
      </div>
      <div class="sidebar-section">
        <h3>Staged Changes</h3>
        <ul id="staged-changes-list">
          <li class="empty-changes-text">No changes staged</li>
        </ul>
      </div>
      <div class="sidebar-section" id="source-diff-section">
        <h3>
          <button
            id="source-diff-toggle"
            type="button"
            class="diff-section-toggle"
            aria-expanded="false"
            aria-controls="source-diff-body"
          >Source diff <span class="diff-toggle-indicator" aria-hidden="true">▸</span></button>
        </h3>
        <div id="source-diff-body" hidden>
          <div id="source-diff-status" role="status" aria-live="polite" aria-atomic="true" class="diff-status-msg"></div>
          <pre id="source-diff-pre" class="source-diff-pre" aria-label="Source diff — read only" role="region" tabindex="0"><code id="source-diff-code"></code></pre>
        </div>
      </div>
      <!-- The move/save status lives here rather than in the header, where it
           was truncated to uselessness ("Web App moved to 299, …") next to the
           title. Full width in the sidebar, it can actually be read. -->
      <div class="sidebar-actions">
        <span id="layout-status" role="status" aria-live="polite">Preview mode</span>
      </div>
    </div>
  </div>
  <dialog id="rename-dialog" aria-labelledby="rename-dialog-title">
    <form method="dialog" class="rename-dialog-form">
      <h3 id="rename-dialog-title">Rename element identifier</h3>
      <p id="rename-impact" role="status"></p>
      <label for="rename-new-id">New identifier</label>
      <input id="rename-new-id" type="text" autocomplete="off" maxlength="256" />
      <p id="rename-validation" role="alert"></p>
      <div class="rename-dialog-actions">
        <button id="rename-cancel" type="button">Cancel</button>
        <button id="rename-confirm" type="button" disabled>Rename</button>
      </div>
    </form>
  </dialog>
  <dialog id="connect-dialog" aria-labelledby="connect-dialog-title">
    <form method="dialog" class="rename-dialog-form">
      <h3 id="connect-dialog-title">Add relationship</h3>
      <p id="connect-endpoints" role="status"></p>
      <label for="connect-label">Label</label>
      <input id="connect-label" type="text" autocomplete="off" maxlength="120" />
      <label for="connect-technology">Technology (optional)</label>
      <input id="connect-technology" type="text" autocomplete="off" maxlength="120" />
      <label for="connect-reltype">Direction</label>
      <select id="connect-reltype">
        <option value="uses">Uses (--&gt;)</option>
        <option value="async">Async (-.-&gt;)</option>
        <option value="sync">Sync (==&gt;)</option>
      </select>
      <p id="connect-validation" role="alert"></p>
      <div class="rename-dialog-actions">
        <button id="connect-cancel" type="button">Cancel</button>
        <button id="connect-confirm" type="button" disabled>Add relationship</button>
      </div>
    </form>
  </dialog>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    ${buildPreviewClientScript(this.smokeSession)}
  </script>
</body>
</html>`;
    }

    private getNonce(): string {
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let text = '';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    private dispose(): void {
        this.layoutAbort?.abort();
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.refreshGate.reset();
        this.forgetShownStates();
        this.smokeWaiter?.finish(undefined, new Error('Packaged webview closed before rendering'));
        void clearBinding(this.context.workspaceState);
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = undefined;
        }
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            disposable?.dispose();
        }
        this.panel.dispose();
    }

    public static getCurrentSvg(): string | undefined {
        return this.instance?.currentSvg;
    }

    /** The current diagram drawn in the export theme (light variant of the selected theme). */
    public static getCurrentExportSvg(): string | undefined {
        const instance = this.instance;
        // c4x.export.includeKey (#327) is read when the export runs, so turning it
        // on or off applies to the next export without a re-render. Off returns
        // the SVG as before, byte for byte.
        if (instance?.currentExportInputs && instance.currentExportSvg && readExportIncludeKey()) {
            const { layout, theme, view } = instance.currentExportInputs;
            const entries = computeKeyEntries(layout, theme, elementStyleContextFor(layout, view, theme));
            return appendKeyToSvg(instance.currentExportSvg, entries, theme, layout.width);
        }
        return instance?.currentExportSvg ?? instance?.currentSvg;
    }

    /**
     * Refresh Preview (also run by Change Theme) acts on every open panel: the
     * standalone preview and the Markdown fence editor (#429). Each goes
     * through its own gate, so a panel with unsaved staged edits defers the
     * refresh until Save or Discard (#408). True when any panel was refreshed
     * or deferred.
     */
    public static refresh(): boolean {
        const panels = [PreviewPanel.instance, PreviewPanel.markdownInstance]
            .filter((panel): panel is PreviewPanel => panel !== undefined);
        for (const panel of panels) {
            panel.requestNonSourceRender();
        }
        return panels.length > 0;
    }
}
