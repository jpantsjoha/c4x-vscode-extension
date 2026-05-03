import * as vscode from 'vscode';
import { c4xParser } from '../parser/C4XParser';
import { C4XParseError } from '../parser/types';

export class DiagnosticsManager {
    private collection: vscode.DiagnosticCollection;
    private timeouts = new Map<string, NodeJS.Timeout>();

    constructor(context: vscode.ExtensionContext) {
        this.collection = vscode.languages.createDiagnosticCollection('c4x');
        context.subscriptions.push(this.collection);

        // Validate active editor on activation
        if (vscode.window.activeTextEditor) {
            const doc = vscode.window.activeTextEditor.document;
            if (this.isRelevantDocument(doc)) {
                this.validate(doc);
            }
        }

        // Listen for changes — only process documents we care about
        // to avoid interfering with other extensions (e.g. Markdown preview)
        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                if (this.isRelevantDocument(event.document)) {
                    this.validateDebounced(event.document);
                }
            }),
            vscode.workspace.onDidOpenTextDocument(doc => {
                if (this.isRelevantDocument(doc)) {
                    this.validate(doc);
                }
            }),
            vscode.workspace.onDidCloseTextDocument(doc => {
                this.collection.delete(doc.uri);
            })
        );
    }

    /**
     * Check whether a document is relevant for C4X diagnostics.
     * Filters out virtual documents (used by Markdown preview, output channels, etc.)
     * and documents that cannot contain C4X content.
     */
    private isRelevantDocument(document: vscode.TextDocument): boolean {
        // Skip non-file schemes (vscode-markdown-preview, output, untitled virtual docs, etc.)
        // Only process 'file' and 'untitled' schemes to avoid interfering with
        // internal VS Code webview/preview documents
        const scheme = document.uri.scheme;
        if (scheme !== 'file' && scheme !== 'untitled') {
            return false;
        }

        return document.languageId === 'c4x' || document.languageId === 'markdown';
    }

    private validateDebounced(document: vscode.TextDocument): void {
        if (!this.isRelevantDocument(document)) return;
        const key = document.uri.toString();
        const existing = this.timeouts.get(key);
        if (existing) clearTimeout(existing);
        this.timeouts.set(key, setTimeout(() => {
            this.timeouts.delete(key);
            this.validate(document);
        }, 300));
    }

    private validate(document: vscode.TextDocument) {
        const diagnostics: vscode.Diagnostic[] = [];

        if (document.languageId === 'c4x') {
            this.validateC4XContent(document.getText(), 0, diagnostics);
        } else if (document.languageId === 'markdown') {
            const text = document.getText();
            const regex = /```c4x\n([\s\S]*?)\n```/g;
            let match;
            while ((match = regex.exec(text)) !== null) {
                // Calculate start line of the code block
                const startOffset = match.index + match[0].indexOf('\n') + 1;
                const startPos = document.positionAt(startOffset);
                this.validateC4XContent(match[1], startPos.line, diagnostics);
            }
        }

        this.collection.set(document.uri, diagnostics);
    }

    private validateC4XContent(text: string, startLineOffset: number, diagnostics: vscode.Diagnostic[]) {
        if (!text.trim()) { return; }

        try {
            c4xParser.parse(text);
        } catch (e) {
            if (e instanceof C4XParseError) {
                // Peggy parser lines are 1-based
                const lineIndex = startLineOffset + Math.max(0, e.location.line - 1);
                const colIndex = Math.max(0, e.location.column - 1);

                const range = new vscode.Range(
                    lineIndex, colIndex,
                    lineIndex, Number.MAX_VALUE
                );

                const diagnostic = new vscode.Diagnostic(
                    range,
                    `C4X Syntax Error: ${e.message}. See 'C4X-DSL Syntax Guide' in README for valid syntax.`,
                    vscode.DiagnosticSeverity.Error
                );

                if (e.message.includes('Expected "}"')) {
                    diagnostic.message += ' (Did you forget to close a subgraph?)';
                }

                diagnostics.push(diagnostic);
            }
        }
    }

    dispose(): void {
        this.timeouts.forEach(t => clearTimeout(t));
        this.timeouts.clear();
        this.collection.dispose();
    }
}
