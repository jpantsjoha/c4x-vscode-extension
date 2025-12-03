import * as vscode from 'vscode';
import { c4xParser } from '../parser/C4XParser';
import { C4XParseError } from '../parser/types';

export class DiagnosticsManager {
    private collection: vscode.DiagnosticCollection;
    private timeout: NodeJS.Timeout | undefined = undefined;

    constructor(context: vscode.ExtensionContext) {
        this.collection = vscode.languages.createDiagnosticCollection('c4x');
        context.subscriptions.push(this.collection);

        // Validate active editor on activation
        if (vscode.window.activeTextEditor) {
            this.validate(vscode.window.activeTextEditor.document);
        }

        // Listen for changes
        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(editor => {
                this.validateDebounced(editor.document);
            }),
            vscode.workspace.onDidOpenTextDocument(doc => {
                this.validate(doc);
            }),
            vscode.workspace.onDidCloseTextDocument(doc => {
                this.collection.delete(doc.uri);
            })
        );
    }

    private validateDebounced(document: vscode.TextDocument) {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = undefined;
        }
        this.timeout = setTimeout(() => {
            this.validate(document);
        }, 500); // 500ms delay
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
                // PEG.js lines are 1-based
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
}
