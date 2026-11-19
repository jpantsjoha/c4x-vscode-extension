import * as vscode from 'vscode';
import * as path from 'path';
import { hasCredentialAssignment } from './credentialAssignments';

export interface FileContext {
    path: string;
    content: string;
}

/** A file the folder scan found but never sends to a model, and why. */
export interface ExcludedFile {
    readonly path: string;
    readonly reason: 'guidelines' | 'credentials' | 'too large' | 'not text';
}

// The workspace guidance documents. They reach a model only through the
// prompt's guidance section (Gemini always; `vscode-lm` only when its setting
// is on), never as source context.
const GUIDELINE_FILE_NAMES = new Set(['c4x-generation-guidelines.md', 'gemini.md', 'examples.md']);

// File names that commonly hold credentials. Never read, never sent.
const CREDENTIAL_FILE_NAME = /^(?:\.env(?:\..*)?|\.envrc|token\.json|secrets?\.properties|.*\.tfvars|.*\.env|\.npmrc|\.netrc|\.pypirc|\.pgpass|\.git-credentials|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|credentials(?:\.[a-z0-9]+)?|.*\.credentials|secrets?\.(?:json|ya?ml|toml|env)|.*\.(?:pem|key|p12|pfx|jks|keystore|ppk|kdbx))$/i;

// Credential stores identified by their folder.
const CREDENTIAL_FILE_PATH = /(?:^|\/)(?:\.docker\/config\.json|\.kube\/config)$/;

// Content that is a credential whatever the file is called. Shapes adapted
// from the gitleaks default rule set (private-key, aws-access-token,
// gcp-api-key, github-*-token, slack-*-token, stripe-access-token,
// npm-access-token, jwt, openai-api-key, anthropic, gitlab, huggingface,
// slack-webhook-url, generic-api-key), reviewed against it on 15 Nov 2026. A
// bare `sk-` prefix is not a key: only the provider shapes below are matched.
// A file holding any of these is never sent. Same set as release/1.8.x (#488),
// except the generic assignment rule, which is now the context-aware scanner
// in credentialAssignments.ts.
const CREDENTIAL_CONTENT: readonly RegExp[] = [
    /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY(?: BLOCK)?-----/,
    /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
    /\bAIza[0-9A-Za-z_-]{35}\b/,
    /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
    /\bgithub_pat_[A-Za-z0-9_]{22,}/,
    /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
    /\b[rs]k_(?:live|test|prod)_[A-Za-z0-9]{10,}/,
    /\bnpm_[A-Za-z0-9]{36}\b/,
    /\bey[A-Za-z0-9_-]{10,}\.ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    /\bsk-(?:proj|svcacct|admin|ant)-[A-Za-z0-9_-]{20,}/,
    /\bglpat-[A-Za-z0-9_-]{20,}/,
    /\bhf_[A-Za-z0-9]{34,}\b/,
    /https:\/\/hooks\.slack\.com\/(?:services|workflows|triggers)\/[A-Za-z0-9+/]{20,}/,
    /\bsk-[A-Za-z0-9]{32,}\b/,
];

/**
 * Why a scanned file must not be sent, or undefined when it may be. Pure: the
 * one rule every provider path applies, in the scan and again when a request
 * is built.
 */
export function classifyContextFile(relativePath: string, content: string): 'guidelines' | 'credentials' | undefined {
    const name = relativePath.split(/[\\/]/).pop() ?? relativePath;
    if (GUIDELINE_FILE_NAMES.has(name.toLowerCase())) {
        return 'guidelines';
    }
    if (CREDENTIAL_FILE_PATH.test(relativePath.replace(/\\/g, '/')) || CREDENTIAL_FILE_NAME.test(name) || CREDENTIAL_CONTENT.some(pattern => pattern.test(content)) || hasCredentialAssignment(name, content)) {
        return 'credentials';
    }
    return undefined;
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
        '**/.vscode-test/**',
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
    public async extractContext(folderUri: vscode.Uri, maxDepth: number = 2): Promise<FileContext[]> {
        return (await this.extractContextDetailed(folderUri, maxDepth)).files;
    }

    /**
     * The folder scan, with the files it left out. Guideline documents and
     * files named like credential stores are not read at all; a file whose
     * content holds a credential is dropped after reading. Neither is ever
     * returned as context.
     */
    public async extractContextDetailed(folderUri: vscode.Uri, maxDepth: number = 2): Promise<{ files: FileContext[]; excluded: ExcludedFile[] }> {
        const directoryPath = folderUri.fsPath;
        const context: FileContext[] = [];
        const excluded: ExcludedFile[] = [];
        const boundedDepth = Number.isFinite(maxDepth) ? Math.max(0, Math.floor(maxDepth)) : 2;

        const depthGlobs = Array.from(
            { length: boundedDepth + 1 },
            (_, depth) => `${'*/'.repeat(depth)}*`
        );
        const depthPattern = new vscode.RelativePattern(
            directoryPath,
            depthGlobs.length === 1 ? depthGlobs[0] : `{${depthGlobs.join(',')}}`
        );

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
                if (
                    segments.includes('.git') ||
                    segments.includes('.vscode-test') ||
                    segments.includes('node_modules')
                ) {
                    continue;
                }

                const relativePath = path.relative(directoryPath, file.fsPath);
                const relativeSegments = relativePath.split(path.sep);
                if (relativeSegments.length - 1 > boundedDepth) {
                    continue;
                }

                // Excluded by name: not even read.
                const byName = classifyContextFile(relativeSegments.join('/'), '');
                if (byName) {
                    excluded.push({ path: relativeSegments.join('/'), reason: byName });
                    continue;
                }

                const stat = await vscode.workspace.fs.stat(file);
                if (stat.size > CodeContextExtractor.MAX_FILE_SIZE) {
                    excluded.push({ path: relativeSegments.join('/'), reason: 'too large' });
                    continue; // Skip large files
                }

                const bytes = await vscode.workspace.fs.readFile(file);
                const content = new TextDecoder('utf-8').decode(bytes);

                // naive binary check: if content has null bytes, skip
                if (content.includes('\0')) {
                    excluded.push({ path: relativeSegments.join('/'), reason: 'not text' });
                    continue;
                }

                const contextPath = relativeSegments.join('/');
                const reason = classifyContextFile(contextPath, content);
                if (reason) {
                    excluded.push({ path: contextPath, reason });
                    continue;
                }

                context.push({
                    path: contextPath,
                    content: content
                });
            } catch (e) {
                console.warn(`Failed to read file ${file.fsPath}:`, e);
            }
        }

        return { files: context, excluded };
    }
}
