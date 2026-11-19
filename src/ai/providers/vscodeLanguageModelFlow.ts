// The user-facing flow of the `vscode-lm` provider (#392): which model, the
// user's confirmation, what is sent, progress, cancellation and messages.
//
// Rules this flow enforces:
// - Model discovery runs inside the command's error handling, so a host
//   without the API, no model, or a discovery failure each gets a message.
// - Nothing is sent before the user confirms the actual model and sees what
//   will be sent. C4X proposes a mid-tier model when none is chosen; it never
//   assumes that model is cheap, and a chosen model that disappears is an
//   error, not a silent switch to another.
// - The prompt uses C4X's built-in guidance. Workspace guideline files are sent
//   only when `c4x.ai.vscodeLm.sendWorkspaceGuidelines` is on, and the
//   confirmation then says so.
// - Consent is VS Code's: the first request shows its dialog; C4X passes only
//   a justification and never works around a refusal.
//
// Loaded lazily, only when `c4x.ai.provider` is `vscode-lm`.

import * as vscode from 'vscode';
import {
    type ContextSource,
    type GenerationRequest,
    type OutgoingRequest,
    buildOutgoingRequest as buildSharedOutgoingRequest,
    describeOutgoing,
} from '../outgoingRequest';
import {
    type LanguageModelChoice,
    type LanguageModelHost,
    LanguageModelUnavailableError,
    classifyLanguageModelFailure,
    describeLanguageModelFailure,
    generateWithLanguageModel,
    listLanguageModels,
    proposeDefaultModel,
    toChoice,
} from './vscodeLanguageModel';

/** Settings read by this provider (section `c4x.ai`). */
export const LM_MODEL_SETTING = 'vscodeLm.model';
export const LM_WORKSPACE_GUIDELINES_SETTING = 'vscodeLm.sendWorkspaceGuidelines';

/** The UI this flow needs, injected so unit tests drive it without VS Code. */
export interface LanguageModelUi {
    /** Modal question. Resolves to the label chosen, or undefined when dismissed. */
    confirm(message: string, detail: string, buttons: readonly string[]): Promise<string | undefined>;
    /** Let the user pick a model; `reload` re-queries VS Code when its models change. */
    pickModel(initial: readonly LanguageModelChoice[], currentId: string | undefined, reload: () => Promise<readonly LanguageModelChoice[]>): Promise<LanguageModelChoice | undefined>;
    readSetting<T>(key: string, fallback: T): T;
    writeSetting(key: string, value: unknown): Promise<void>;
    info(message: string): void;
    warn(message: string): void;
    withCancellableProgress<T>(title: string, task: (progress: vscode.Progress<{ message?: string }>, token: vscode.CancellationToken) => Promise<T>): Promise<T>;
}

const TIER_LABEL: Record<LanguageModelChoice['tier'], string> = {
    small: 'small tier (guessed from its name)',
    mid: 'mid tier (guessed from its name)',
    large: 'large tier (guessed from its name)',
};

export function modelLabel(model: Pick<LanguageModelChoice, 'name' | 'id'>): string {
    return model.name || model.id;
}

export const CONFIRM_BUTTON = 'Generate';
export const CHOOSE_ANOTHER_BUTTON = 'Choose Another Model';

export type { ContextSource, OutgoingFile, OutgoingRequest, ExcludedFile } from '../outgoingRequest';
export type LanguageModelGenerationRequest = GenerationRequest;

/** Build the request once (see `outgoingRequest.ts`); `workspaceGuidelines` is read by the caller once. */
export function buildOutgoingRequest(request: GenerationRequest, workspaceGuidelines: boolean): Promise<OutgoingRequest> {
    return buildSharedOutgoingRequest(request, workspaceGuidelines ? 'workspace' : 'built-in');
}

/** What the confirmation shows: rendered only from the snapshot. Pure, for tests. */
export function disclosureDetail(model: LanguageModelChoice, outgoing: OutgoingRequest, source: ContextSource): string {
    const guidanceNote = outgoing.guidance === 'workspace'
        ? 'C4X\'s syntax rules. Your workspace guideline files listed below replace the built-in guidance.'
        : 'C4X\'s built-in guidance and syntax rules. No workspace file other than those listed is sent.';
    return [
        `Model: ${modelLabel(model)} from ${model.vendor}, ${TIER_LABEL[model.tier]}. The tier is a guess, not a price.`,
        ...describeOutgoing(outgoing, source, guidanceNote),
        'Requests go through VS Code to that model\'s provider and count against your plan there. ' +
        'VS Code may ask you to allow C4X to use the model.',
    ].join('\n\n');
}

/**
 * The model to generate with, confirmed by the user against `outgoing`, or
 * undefined when the user declined (nothing is sent). Throws `no-api`,
 * `no-model`, `model-missing` or VS Code's discovery error.
 */
export async function confirmLanguageModel(
    host: LanguageModelHost,
    ui: LanguageModelUi,
    outgoing: OutgoingRequest,
    source: ContextSource,
): Promise<vscode.LanguageModelChat | undefined> {
    const models = await listLanguageModels(host);
    if (models.length === 0) {
        throw new LanguageModelUnavailableError('no-model');
    }

    const configuredId = ui.readSetting<string>(LM_MODEL_SETTING, '').trim();
    let model: vscode.LanguageModelChat | undefined;
    if (configuredId) {
        model = models.find(candidate => candidate.id === configuredId);
        if (!model) {
            throw new LanguageModelUnavailableError('model-missing', configuredId);
        }
    } else {
        model = proposeDefaultModel(models)!;
    }

    const choice = toChoice(model);
    const answer = await ui.confirm(
        `Generate with ${modelLabel(choice)}${configuredId ? '' : ' (proposed by C4X)'}?`,
        disclosureDetail(choice, outgoing, source),
        [CONFIRM_BUTTON, CHOOSE_ANOTHER_BUTTON],
    );
    if (answer === CONFIRM_BUTTON) {
        return model;
    }
    if (answer !== CHOOSE_ANOTHER_BUTTON) {
        return undefined;
    }

    // An explicit pick, made with the disclosure above on screen, is the
    // confirmation. It is saved so the next run asks about the same model.
    const picked = await pickAndSaveModel(host, ui, models.map(toChoice), configuredId || undefined);
    if (!picked) {
        return undefined;
    }
    const current = await listLanguageModels(host);
    const chosen = current.find(candidate => candidate.id === picked);
    if (!chosen) {
        throw new LanguageModelUnavailableError('model-missing', picked);
    }
    return chosen;
}

async function pickAndSaveModel(
    host: LanguageModelHost,
    ui: LanguageModelUi,
    initial: readonly LanguageModelChoice[],
    currentId: string | undefined,
): Promise<string | undefined> {
    const picked = await ui.pickModel(initial, currentId, async () => (await listLanguageModels(host)).map(toChoice));
    if (!picked) {
        return undefined;
    }
    await ui.writeSetting(LM_MODEL_SETTING, picked.id);
    return picked.id;
}

/**
 * Generate a diagram through the Language Model API: build the request once,
 * confirm the model against it, send exactly that request, with a cancellable
 * progress notification. Resolves to the C4X source, or undefined when the user
 * declined or cancelled (nothing is inserted). Throws an Error whose message
 * names the cause and the fix.
 */
export async function runLanguageModelGeneration(
    host: LanguageModelHost,
    ui: LanguageModelUi,
    request: GenerationRequest,
): Promise<string | undefined> {
    let model: vscode.LanguageModelChat | undefined;
    try {
        // Read once. The snapshot fixes what is sent; a setting changed while
        // the dialog is open does not reach this request.
        const workspaceGuidelines = ui.readSetting<boolean>(LM_WORKSPACE_GUIDELINES_SETTING, false) === true;
        const outgoing = await buildOutgoingRequest(request, workspaceGuidelines);
        model = await confirmLanguageModel(host, ui, outgoing, request.source);
        if (!model) {
            return undefined;
        }
        const chosen = model;
        return await ui.withCancellableProgress(
            `C4X: generating with ${modelLabel(chosen)}`,
            (progress, token) => generateWithLanguageModel(host, chosen, outgoing.prompt, { progress, token }),
        );
    } catch (error) {
        if (classifyLanguageModelFailure(error) === 'cancelled') {
            ui.info(`C4X: ${describeLanguageModelFailure(error)}`);
            return undefined;
        }
        const label = model ? modelLabel(model) : undefined;
        throw new Error(describeLanguageModelFailure(error, label));
    }
}

/** Pure: picker rows for the language models VS Code offers. */
export function buildLanguageModelPickItems(
    models: readonly LanguageModelChoice[],
    currentId: string | undefined,
): Array<vscode.QuickPickItem & { model: LanguageModelChoice }> {
    const proposed = proposeDefaultModel(models.map(model => ({ ...model, family: model.family, name: model.name })));
    return models.map(model => {
        const tags = [model.vendor, TIER_LABEL[model.tier]];
        if (model.id === currentId) {
            tags.unshift('current');
        } else if (!currentId && proposed && model.id === proposed.id) {
            tags.unshift('proposed');
        }
        return { model, label: modelLabel(model), description: tags.join(' · '), detail: model.id };
    });
}

/**
 * "C4X: Select AI Model" when the provider is `vscode-lm`: list what VS Code
 * offers now, re-listing while the picker is open if that changes, and save
 * the choice. Resolves to the chosen id, or undefined.
 */
export async function selectLanguageModel(host: LanguageModelHost, ui: LanguageModelUi): Promise<string | undefined> {
    let models: readonly vscode.LanguageModelChat[];
    try {
        models = await listLanguageModels(host);
    } catch (error) {
        ui.warn(`C4X: ${describeLanguageModelFailure(error)}`);
        return undefined;
    }
    if (models.length === 0) {
        ui.warn(`C4X: ${describeLanguageModelFailure(new LanguageModelUnavailableError('no-model'))}`);
        return undefined;
    }
    const currentId = ui.readSetting<string>(LM_MODEL_SETTING, '').trim() || undefined;
    const picked = await pickAndSaveModel(host, ui, models.map(toChoice), currentId);
    if (picked) {
        ui.info(`C4X: language model set to ${picked}.`);
    }
    return picked;
}

/** The real UI, on `vscode.window` and the `c4x.ai` settings. */
export function vscodeLanguageModelUi(host: LanguageModelHost): LanguageModelUi {
    return {
        confirm: async (message, detail, buttons) =>
            vscode.window.showInformationMessage(message, { modal: true, detail }, ...buttons),
        pickModel: (initial, currentId, reload) => new Promise(resolve => {
            const quickPick = vscode.window.createQuickPick<vscode.QuickPickItem & { model: LanguageModelChoice }>();
            quickPick.title = 'C4X: choose a VS Code language model';
            quickPick.placeholder = currentId ? `Currently ${currentId}` : 'No model chosen yet';
            quickPick.matchOnDescription = true;
            quickPick.matchOnDetail = true;
            quickPick.items = buildLanguageModelPickItems(initial, currentId);
            const subscriptions: vscode.Disposable[] = [];
            // VS Code's models can change while the picker is open (a provider
            // signs in or out): re-query, as the API asks extensions to.
            const changed = host.lm?.onDidChangeChatModels?.(async () => {
                try {
                    quickPick.items = buildLanguageModelPickItems(await reload(), currentId);
                } catch {
                    quickPick.items = [];
                }
            });
            if (changed) {
                subscriptions.push(changed);
            }
            let result: LanguageModelChoice | undefined;
            subscriptions.push(quickPick.onDidAccept(() => {
                result = quickPick.selectedItems[0]?.model;
                quickPick.hide();
            }));
            subscriptions.push(quickPick.onDidHide(() => {
                subscriptions.forEach(subscription => subscription.dispose());
                quickPick.dispose();
                resolve(result);
            }));
            quickPick.show();
        }),
        readSetting: (key, fallback) => vscode.workspace.getConfiguration('c4x.ai').get(key, fallback),
        writeSetting: async (key, value) => {
            await vscode.workspace.getConfiguration('c4x.ai').update(key, value, vscode.ConfigurationTarget.Global);
        },
        info: message => { vscode.window.showInformationMessage(message); },
        warn: message => { vscode.window.showWarningMessage(message); },
        withCancellableProgress: async (title, task) => vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title, cancellable: true },
            (progress, token) => task(progress, token),
        ),
    };
}
