import * as vscode from 'vscode';
import { C4XParseError, c4xParser } from '../parser';
import { loadBinding, saveBinding, clearBinding } from './editorBinding';
import { parseStructurizrDSL, StructurizrLexerError, StructurizrParserError } from '../parser/structurizr';
import { parsePlantUMLtoC4Model } from '../parser/plantuml';
import { c4ModelBuilder } from '../model/C4ModelBuilder';
import { C4Element } from '../model/C4Model';
import { isRelationshipLegal } from '../model/c4Legality';
import { dagreLayoutEngine } from '../layout/DagreLayoutEngine';
import { svgBuilder } from '../render/SvgBuilder';
import { themeManager } from '../themes/ThemeManager';
import { computePresentElementTypes } from './legendCatalog';
import {
    isVisualLayoutMessage,
    isRequestSourceDiffMessage,
    isResolveConflictMessage,
    isAddRelationshipMessage,
    MoveAcceptedMessage,
    BatchAcceptedMessage,
    MoveRejectionCode,
    MoveRejectedMessage,
    SourceDiffMessage,
    ExternalChangeConflictMessage,
    VisualLayoutSnapshot,
    VisualLayoutBoundarySnapshot,
    VISUAL_LAYOUT_PROTOCOL_VERSION,
} from './visualLayoutProtocol';
import { materialiseDraft } from '../writeback/draftMaterialiser';
import { computeLineDiff } from '../writeback/lineDiff';
import { PREVIEW_CLIENT_SCRIPT } from './previewClientScript';
import { executeWritebackTransaction, WritebackTransactionError } from '../writeback/WritebackTransaction';
import { applySidecarLayoutOverrides } from '../writeback/SidecarPersistence';
import { captureAnchor, createNativeDocumentBlock, findC4xFencedBlocks, resolveAnchor, SaveAnchor } from '../writeback/SaveAnchor';
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
}

export class PreviewPanel {
    private static instance: PreviewPanel | undefined;
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
    private currentLayoutSnapshot: VisualLayoutSnapshot | undefined;
    /** Tracks whether the webview has reported unsaved staged edits. */
    private hasDirtyState = false;
    /** Tracks whether we are in a conflict state (external change while dirty). */
    private inConflictState = false;

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
            vscode.workspace.onDidSaveTextDocument((document) => {
                if (this.isWatchedDocument(document)) {
                    this.currentLayoutSnapshot = undefined;
                    // If we are in conflict state already, do not trigger another
                    // conflict notification — the user must resolve first.
                    if (!this.inConflictState) {
                        this.scheduleRender();
                    }
                }
            }),
            vscode.workspace.onDidChangeTextDocument((event) => {
                if (!this.isWatchedDocument(event.document)) {
                    return;
                }
                // Reject moves immediately while a newer document revision is awaiting render.
                this.currentLayoutSnapshot = undefined;

                // If the editor has an unsaved draft, check whether the anchored
                // block changed.  If so, enter conflict state instead of silently
                // discarding the draft with a re-render.
                if (this.hasDirtyState && !this.inConflictState) {
                    if (this.hasAnchoredBlockChanged(event.document)) {
                        this.enterConflictState(event.document);
                        return;
                    }
                }

                if (!this.inConflictState) {
                    this.scheduleRender(250);
                }
            }),
            vscode.window.onDidChangeActiveTextEditor(() => {
                this.tryUpdateActiveDocument();
            })
        );
    }

    private hasAnchoredBlockChanged(document: vscode.TextDocument): boolean {
        const anchor = this.activeSaveAnchor;
        if (!anchor) {
            return false;
        }
        return !resolveAnchor(document, anchor).valid;
    }

    private enterConflictState(document: vscode.TextDocument): void {
        this.inConflictState = true;
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
        const conflictMsg: ExternalChangeConflictMessage = {
            type: 'visualLayout.externalChangeConflict',
            protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
            reason,
        };
        void this.panel.webview.postMessage(conflictMsg);
    }

    private async handleWebviewMessage(message: unknown): Promise<void> {
        const messageType = typeof message === 'object' && message !== null && 'type' in message
            ? String((message as { type: unknown }).type)
            : '(untyped)';
        this.log(`webview message received: ${messageType}`);

        if (this.isReadyMessage(message)) {
            void this.render();
            return;
        }

        if (this.isDirtyStateChangedMessage(message)) {
            this.hasDirtyState = message.dirty;
            // If all staged edits were discarded, exit conflict state automatically.
            if (!message.dirty && this.inConflictState) {
                this.inConflictState = false;
            }
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
                'The diagram changed while it was being edited. Refresh and try again.'
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
            const success = await executeWritebackTransaction(writebackDoc, message, transactionAnchor, boundary);
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

                    this.activeSaveAnchor = rebasedAnchor;
                    this.inConflictState = false;
                    void this.panel.webview.postMessage({
                        type: 'visualLayout.conflictActionAcknowledged',
                        protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
                        action: 'rebaseAccepted',
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

    private isDirtyStateChangedMessage(
        message: unknown,
    ): message is { type: 'dirtyStateChanged'; dirty: boolean } {
        return typeof message === 'object' && message !== null &&
            'type' in message && (message as { type: unknown }).type === 'dirtyStateChanged' &&
            'dirty' in message && typeof (message as { dirty: unknown }).dirty === 'boolean';
    }

    private tryUpdateActiveDocument(): void {
        // Markdown-block panels are permanently locked; never follow editor focus.
        if (this.markdownBlock) {
            return;
        }
        const newDocument = this.getActiveDiagramDocument();
        if (newDocument?.uri.toString() !== this.activeDocument?.uri.toString()) {
            this.activeDocument = newDocument;
            this.activeSaveAnchor = newDocument ? this.captureDocumentAnchor(newDocument) : undefined;
            this.currentLayoutSnapshot = undefined;
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

    private scheduleRender(delay = 100): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
            void this.render();
        }, delay);
    }

    private async render(): Promise<void> {
        const activeDocument = this.activeDocument;
        if (!activeDocument) {
            this.currentLayoutSnapshot = undefined;
            void this.panel.webview.postMessage({
                type: 'error',
                message: 'No active diagram document selected.',
            });
            return;
        }

        const documentRevision = String(activeDocument.version);
        const documentUri = activeDocument.uri.toString();

        // For Markdown-block panels extract only the fenced body for parsing.
        let text: string;
        if (this.markdownBlock) {
            const fullText = activeDocument.getText();
            if (!fullText || fullText.trim().length === 0) {
                this.currentLayoutSnapshot = undefined;
                void this.panel.webview.postMessage({ type: 'error', message: 'Document is empty.' });
                return;
            }
            const blocks = findC4xFencedBlocks(activeDocument);
            const block = blocks[this.markdownBlock.blockOrdinal];
            if (!block) {
                this.currentLayoutSnapshot = undefined;
                void this.panel.webview.postMessage({
                    type: 'error',
                    message: `C4X fence block ${this.markdownBlock.blockOrdinal} not found in the document. It may have been deleted or moved.`,
                });
                return;
            }
            text = fullText.slice(block.bodyRange.start, block.bodyRange.end);
            // Refresh the anchor whenever we re-render so the next save
            // resolves against the latest fence state.
            this.activeSaveAnchor = captureAnchor(activeDocument, block);
        } else {
            text = activeDocument.getText();
        }

        if (!text || text.trim().length === 0) {
            this.currentLayoutSnapshot = undefined;
            void this.panel.webview.postMessage({ type: 'error', message: 'Document is empty.' });
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

            const layoutStart = performance.now();
            const layout = await dagreLayoutEngine.layout(view);
            const layoutTime = performance.now() - layoutStart;

            const renderStart = performance.now();
            // Resolve the theme once so the SVG and the legend overlay swatch
            // colours (#98) always come from the same snapshot.
            const theme = themeManager.getCurrentTheme();
            const svg = svgBuilder.build(layout, { theme });
            const renderTime = performance.now() - renderStart;

            const elementIdSet = new Set(layout.elements.map(el => el.id));
            const boundaryIdSet = new Set(layout.boundaries?.map(b => b.id) ?? []);

            const visualLayout: VisualLayoutSnapshot = {
                revision: documentRevision,
                nodes: layout.elements.map(element => ({
                    id: element.id,
                    label: element.element.label,
                    type: element.element.type,
                    x: element.x,
                    y: element.y,
                    width: element.width,
                    height: element.height,
                    locked: element.element.metadata?.locked === 'true',
                    description: element.element.description,
                    technology: element.element.technology,
                    tags: element.element.tags,
                    sprite: element.element.sprite,
                })),
                boundaries: (layout.boundaries ?? []).map(boundary => {
                    const childNodeIds: string[] = [];
                    const childBoundaryIds: string[] = [];
                    for (const childId of boundary.boundary.elements) {
                        if (elementIdSet.has(childId)) {
                            childNodeIds.push(childId);
                        } else if (boundaryIdSet.has(childId)) {
                            childBoundaryIds.push(childId);
                        }
                    }
                    return {
                        id: boundary.id,
                        label: boundary.boundary.label,
                        x: boundary.x,
                        y: boundary.y,
                        width: boundary.width,
                        height: boundary.height,
                        childNodeIds,
                        childBoundaryIds,
                    } satisfies VisualLayoutBoundarySnapshot;
                }),
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
                legendSwatchColors: {
                    person: theme.colors.person.fill,
                    softwareSystem: theme.colors.softwareSystem.fill,
                    container: theme.colors.container.fill,
                    component: theme.colors.component.fill,
                    deploymentNode: theme.colors.deploymentNode.fill,
                    external: theme.colors.externalSystem.fill,
                },
            };

            if (!this.activeDocument ||
                this.activeDocument.uri.toString() !== documentUri ||
                String(this.activeDocument.version) !== documentRevision) {
                this.currentLayoutSnapshot = undefined;
                this.scheduleRender();
                return;
            }

            void this.panel.webview.postMessage({ type: 'render', payload });
            this.currentSvg = svg;
            this.currentLayoutSnapshot = visualLayout;
            if (!this.markdownBlock) {
                // For native docs, refresh anchor on every render.
                this.activeSaveAnchor = this.captureDocumentAnchor(activeDocument);
            }
            // For Markdown blocks the anchor is refreshed at the top of render().
        } catch (error) {
            this.currentSvg = undefined;
            this.currentLayoutSnapshot = undefined;
            if (error instanceof C4XParseError) {
                this.panel.webview.postMessage({
                    type: 'error',
                    message: `${error.message} (Line ${error.location.line}, Column ${error.location.column})`,
                });
            } else if (error instanceof StructurizrLexerError || error instanceof StructurizrParserError) {
                this.panel.webview.postMessage({
                    type: 'error',
                    message: error.message,
                });
            } else if (error instanceof Error) {
                this.panel.webview.postMessage({ type: 'error', message: error.message });
            } else {
                this.panel.webview.postMessage({ type: 'error', message: 'Unknown error while rendering preview.' });
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
    .canvas-toolbar {
      position: absolute;
      bottom: 20px;
      left: 20px;
      display: flex;
      gap: 6px;
      background: var(--vscode-editorWidget-background, rgba(30, 30, 30, 0.8));
      backdrop-filter: blur(8px);
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border, #444));
      border-radius: 6px;
      padding: 4px;
      box-shadow: 0 4px 12px var(--vscode-widget-shadow, rgba(0, 0, 0, 0.25));
      z-index: 100;
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
       the canvas toolbar. Default anchor follows audit Appendix B. */
    #legend-overlay {
      position: absolute;
      bottom: 20px;
      right: 20px;
      min-width: 140px;
      max-width: 240px;
      background: var(--vscode-editorWidget-background, rgba(30, 30, 30, 0.8));
      backdrop-filter: blur(8px);
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border, #444));
      border-radius: 6px;
      padding: 8px 10px;
      box-shadow: 0 4px 12px var(--vscode-widget-shadow, rgba(0, 0, 0, 0.25));
      z-index: 100;
      cursor: grab;
      user-select: none;
      touch-action: none;
      font-size: 12px;
      color: var(--vscode-foreground);
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
      <!-- Global stats reference (#160). One node, two homes: floating in the
           canvas corner while previewing, docked at the top of the sidebar
           above the Properties Inspector once the sidebar is open. setEditMode
           moves it; the id stays unique either way. -->
      <div id="diagram-stats" class="stats-floating">
        <h3>Diagram Stats</h3>
        <div id="metrics"></div>
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

    ${PREVIEW_CLIENT_SCRIPT}
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
        if (this.disposed) {
            return;
        }
        this.disposed = true;
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

    public static refresh(): boolean {
        if (!PreviewPanel.instance) {
            return false;
        }

        PreviewPanel.instance.scheduleRender();
        return true;
    }
}
