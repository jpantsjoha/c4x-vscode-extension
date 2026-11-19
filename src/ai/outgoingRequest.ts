// The generation request as it will be sent, for every provider (#392).
//
// Built once, before the user is asked, and frozen. The confirmation is
// rendered only from it and the provider sends only its `prompt`, so what the
// user is shown is what is sent: nothing read afterwards (a setting, a file
// changed on disk) can change the request.

import { classifyContextFile, type ExcludedFile, type FileContext } from './CodeContextExtractor';
import { buildGenerationPrompt } from './PromptBuilder';

export type { ExcludedFile } from './CodeContextExtractor';

/** One workspace input that goes into the request, as the user is shown it. */
export interface OutgoingFile {
    /** Workspace-relative path, or a label for the selection. */
    readonly path: string;
    /** UTF-8 size of what is sent. */
    readonly bytes: number;
    readonly role: 'selection' | 'source' | 'guidelines';
}

export interface OutgoingRequest {
    readonly prompt: string;
    readonly files: readonly OutgoingFile[];
    readonly excluded: readonly ExcludedFile[];
    readonly guidance: 'workspace' | 'built-in';
}

/** Where the context came from: the selection, or a folder scan. */
export type ContextSource = { readonly kind: 'selection'; readonly label: string } | { readonly kind: 'folder'; readonly label: string };

export interface GenerationRequest {
    readonly files: readonly FileContext[];
    /** Files the folder scan left out, to be listed. */
    readonly excluded?: readonly ExcludedFile[];
    readonly instruction: string;
    readonly direction?: 'TB' | 'LR';
    readonly source: ContextSource;
}

function freeze<T>(value: T): T {
    if (value && typeof value === 'object') {
        Object.values(value as object).forEach(freeze);
        Object.freeze(value);
    }
    return value;
}

/**
 * Build the request once. Folder context is filtered again by the same rule
 * the scan applies (`classifyContextFile`), so a caller that skipped the scan
 * still cannot send a guideline document or a credential as source.
 * `guidance` decides whether the workspace guideline files are read into the
 * prompt; each one read is listed with its size.
 */
export async function buildOutgoingRequest(request: GenerationRequest, guidance: 'workspace' | 'built-in'): Promise<OutgoingRequest> {
    const included: FileContext[] = [];
    const excluded: ExcludedFile[] = [...(request.excluded ?? [])];
    for (const file of request.files) {
        const reason = request.source.kind === 'folder' ? classifyContextFile(file.path, file.content) : undefined;
        if (reason) {
            excluded.push({ path: file.path, reason });
        } else {
            included.push(file);
        }
    }
    const documents: OutgoingFile[] = [];
    const prompt = await buildGenerationPrompt(included, request.instruction, {
        ...(request.direction ? { direction: request.direction } : {}),
        guidance,
        onWorkspaceDocument: (path, bytes) => { documents.push({ path, bytes, role: 'guidelines' }); },
    });
    const files: OutgoingFile[] = [
        ...included.map(file => ({
            path: request.source.kind === 'selection' ? request.source.label : file.path,
            bytes: Buffer.byteLength(file.content, 'utf8'),
            role: (request.source.kind === 'selection' ? 'selection' : 'source') as OutgoingFile['role'],
        })),
        ...documents,
    ];
    return freeze({ prompt, files, excluded, guidance });
}

const EXCLUSION_REASON: Record<ExcludedFile['reason'], string> = {
    guidelines: 'guideline document; never sent as source',
    credentials: 'holds or may hold credentials; never sent',
    'too large': 'too large to send; never sent',
    'not text': 'not a text file; never sent',
};

/** The part of a confirmation that says what is sent. Rendered only from the snapshot. Pure. */
export function describeOutgoing(outgoing: OutgoingRequest, source: ContextSource, guidanceNote: string): string[] {
    const from = source.kind === 'folder' ? ` from ${source.label}` : '';
    const sent = outgoing.files.map(file => `- ${file.path} (${file.bytes.toLocaleString('en-US')} bytes)`);
    const lines = [
        `Sent${from}: ${outgoing.files.length} workspace input${outgoing.files.length === 1 ? '' : 's'}, the instruction you chose, and ${guidanceNote}` +
        (sent.length ? `\n${sent.join('\n')}` : ''),
    ];
    if (outgoing.excluded.length) {
        lines.push(`Left out:\n${outgoing.excluded.map(file => `- ${file.path} (${EXCLUSION_REASON[file.reason]})`).join('\n')}`);
    }
    lines.push(`Request size: ${Buffer.byteLength(outgoing.prompt, 'utf8').toLocaleString('en-US')} bytes.`);
    return lines;
}
