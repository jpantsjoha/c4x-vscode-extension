import * as vscode from 'vscode';
import * as path from 'path';

export interface FileContext {
    path: string;
    content: string;
}

export class CodeContextExtractor {

    // eslint-disable-next-line @typescript-eslint/naming-convention
    private static readonly IGNORE_PATTERNS = [
        '**/node_modules/**',
        '**/.git/**',
        '**/out/**',
        '**/dist/**',
        '**/build/**',
        '**/bin/**',
        '**/obj/**',
        '**/target/**', // Java/Maven
        '**/vendor/**', // Go/PHP
        '**/.vscode/**',
        '**/.idea/**', // JetBrains
        '**/.DS_Store',
        '**/test/**',
        '**/tests/**',
        'test/**',
        'tests/**',
        '**/spec/**'
    ];

    // Limit scanned files to prevent token overload
    // eslint-disable-next-line @typescript-eslint/naming-convention
    private static readonly MAX_FILE_SIZE = 50 * 1024; // 50KB per file
    // eslint-disable-next-line @typescript-eslint/naming-convention
    private static readonly MAX_TOTAL_FILES = 20; // Increased limit slightly since we have better relevance

    // eslint-disable-next-line @typescript-eslint/naming-convention
    public async extractContext(folderUri: vscode.Uri, _maxDepth: number = 2): Promise<FileContext[]> {
        const directoryPath = folderUri.fsPath;
        const context: FileContext[] = [];

        // Default to recursive search if depth logic causes issues
        const depthPattern = new vscode.RelativePattern(directoryPath, '**/*');

        // Exclude pattern (remove **/ prefix for ignore string construction if needed, 
        // but RelativePattern exclude arg usually takes glob. 
        // We join them with comma for curly brace expansion or just pass array if supported?
        // findFiles takes `include` (GlobPattern) and `exclude` (GlobPattern).
        // A GlobPattern can be a string or RelativePattern.
        const excludeString = `{${CodeContextExtractor.IGNORE_PATTERNS.join(',')}}`;

        const files = await vscode.workspace.findFiles(
            depthPattern,
            excludeString,
            CodeContextExtractor.MAX_TOTAL_FILES
        );

        for (const file of files) {
            try {
                // Double check constraints (robust segment check)
                const segments = file.fsPath.split(path.sep);
                if (segments.includes('.git') || segments.includes('node_modules')) {
                    continue;
                }

                const stat = await vscode.workspace.fs.stat(file);
                if (stat.size > CodeContextExtractor.MAX_FILE_SIZE) {
                    continue; // Skip large files
                }

                const bytes = await vscode.workspace.fs.readFile(file);
                const content = new TextDecoder('utf-8').decode(bytes);

                // naive binary check: if content has null bytes, skip
                if (content.includes('\0')) {
                    continue;
                }

                context.push({
                    path: path.relative(directoryPath, file.fsPath),
                    content: content
                });
            } catch (e) {
                console.warn(`Failed to read file ${file.fsPath}:`, e);
            }
        }

        return context;
    }
}
