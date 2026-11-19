// A stub of the VS Code Language Model API (`vscode.lm`) for unit tests of the
// `vscode-lm` provider (#392). No real model is ever called: each stub model
// answers from a script and records the prompts and options it was sent.

/* eslint-disable @typescript-eslint/naming-convention -- names are VS Code's own API */
export class LanguageModelChatMessage {
    constructor(public readonly role: 'user' | 'assistant', public readonly content: string) {}

    static User(content: string): LanguageModelChatMessage {
        return new LanguageModelChatMessage('user', content);
    }
}

/** Mirrors VS Code: `code` is the name of the factory that made the error. */
export class LanguageModelError extends Error {
    private constructor(message: string, public readonly code: string, public readonly cause?: unknown) {
        super(message);
        this.name = 'LanguageModelError';
    }

    static NoPermissions(message = 'No permissions'): LanguageModelError {
        return new LanguageModelError(message, 'NoPermissions');
    }

    static Blocked(message = 'Rate limit exceeded'): LanguageModelError {
        return new LanguageModelError(message, 'Blocked');
    }

    static NotFound(message = 'Not found'): LanguageModelError {
        return new LanguageModelError(message, 'NotFound');
    }

    static Unknown(cause: Error): LanguageModelError {
        return new LanguageModelError('Unknown', 'Unknown', cause);
    }
}
/* eslint-enable @typescript-eslint/naming-convention */

export interface StubChatModel {
    readonly id: string;
    readonly name: string;
    readonly vendor: string;
    readonly family: string;
    readonly version: string;
    readonly maxInputTokens: number;
    readonly prompts: string[];
    readonly requestOptions: unknown[];
    readonly tokens: unknown[];
    sendRequest(messages: LanguageModelChatMessage[], options?: unknown, token?: unknown): Promise<{ text: AsyncIterable<string> }>;
    countTokens(text: string): Promise<number>;
}

/**
 * A chat model whose replies come from `replies` in order (the last repeats).
 * An Error reply is thrown by `sendRequest`, as VS Code rejects. Text streams
 * in two fragments, so the provider must join them; `onFragment` runs between,
 * `afterLastFragment` after the last one and before the stream completes.
 */
export function stubChatModel(
    fields: Partial<Pick<StubChatModel, 'id' | 'name' | 'vendor' | 'family' | 'maxInputTokens'>>,
    replies: ReadonlyArray<string | Error> = [''],
    onFragment?: () => void,
    afterLastFragment?: () => void,
): StubChatModel {
    let call = 0;
    const prompts: string[] = [];
    const requestOptions: unknown[] = [];
    const tokens: unknown[] = [];
    return {
        id: fields.id ?? 'stub-model',
        name: fields.name ?? fields.id ?? 'Stub model',
        vendor: fields.vendor ?? 'stub',
        family: fields.family ?? 'stub',
        version: '1',
        maxInputTokens: fields.maxInputTokens ?? 64000,
        prompts,
        requestOptions,
        tokens,
        async sendRequest(messages, options, token) {
            prompts.push(messages.map(message => message.content).join('\n'));
            requestOptions.push(options);
            tokens.push(token);
            const reply = replies[Math.min(call++, replies.length - 1)];
            if (reply instanceof Error) {
                throw reply;
            }
            const text: string = reply;
            const half = Math.floor(text.length / 2);
            async function* fragments(): AsyncIterable<string> {
                yield text.slice(0, half);
                onFragment?.();
                yield text.slice(half);
                // Runs while the consumer awaits the final next(): the moment
                // just after the last fragment, before the stream completes.
                afterLastFragment?.();
            }
            return { text: fragments() };
        },
        async countTokens(text: string) {
            return Math.ceil(text.length / 4);
        },
    };
}

type Listener = () => void;

/** A host with the API. `models` may be replaced; `fireChange` notifies listeners. */
export function stubHost(initial: StubChatModel[] = []) {
    let models = initial;
    const listeners = new Set<Listener>();
    let selectCalls = 0;
    let selectError: Error | undefined;
    return {
        host: {
            lm: {
                selectChatModels: async () => {
                    selectCalls++;
                    if (selectError) {
                        throw selectError;
                    }
                    return models;
                },
                onDidChangeChatModels: (listener: Listener) => {
                    listeners.add(listener);
                    return { dispose: () => listeners.delete(listener) };
                },
            },
            LanguageModelChatMessage,
        },
        setModels(next: StubChatModel[]) { models = next; },
        failDiscovery(error: Error | undefined) { selectError = error; },
        fireChange() { listeners.forEach(listener => listener()); },
        get selectCalls() { return selectCalls; },
        get listenerCount() { return listeners.size; },
    };
}

/** A cancellation token a test can trip. */
export function stubToken() {
    let cancelled = false;
    return {
        token: {
            get isCancellationRequested() { return cancelled; },
            onCancellationRequested: () => ({ dispose: () => undefined }),
        },
        cancel() { cancelled = true; },
    };
}
