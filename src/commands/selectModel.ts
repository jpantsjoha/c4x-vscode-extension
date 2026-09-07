import * as vscode from 'vscode';
import { parseModelId, type DiscoveredModel } from '../ai/modelDiscovery';
import { DEFAULT_MODEL, DEFAULT_IMAGE_MODEL, isRetired } from '../ai/models';

/**
 * Let the user choose a model from what their key can actually reach.
 *
 * The setting is free text, which is future-proof and also a trap: a typo
 * produces a 404 the user has to decode, and nothing tells them which models
 * their key is entitled to. Free-tier and paid keys see different lists.
 *
 * The picker is built from a live `models.list` call, so it can only offer
 * models that exist. Retired ids are marked rather than hidden: someone
 * pinned to one needs to see why it is a bad choice.
 */
export interface ModelQuickPickItem extends vscode.QuickPickItem {
    modelId: string;
}

/** Pure: build the picker contents. Exported for unit tests. */
export function buildModelPickItems(
    models: DiscoveredModel[],
    current: string,
    kind: 'text' | 'image',
): ModelQuickPickItem[] {
    const wantImage = kind === 'image';

    const relevant = models
        .map(m => ({ raw: m, parsed: parseModelId(m.id) }))
        .filter(({ parsed }) => {
            if (!parsed.tier) {
                return false;
            }
            const isImageTier = parsed.tier.endsWith('image');
            return wantImage ? isImageTier : !isImageTier;
        })
        .sort((a, b) =>
            Number(b.parsed.unstable === false) - Number(a.parsed.unstable === false)
            || b.parsed.version - a.parsed.version
            || a.parsed.id.localeCompare(b.parsed.id));

    return relevant.map(({ raw, parsed }) => {
        const tags: string[] = [];
        if (parsed.id === current) {
            tags.push('current');
        }
        if (parsed.id === (wantImage ? DEFAULT_IMAGE_MODEL : DEFAULT_MODEL)) {
            tags.push('default');
        }
        if (isRetired(parsed.id)) {
            tags.push('RETIRED');
        } else if (parsed.unstable) {
            tags.push('preview');
        }
        if (parsed.specialist) {
            tags.push('specialist (manual only)');
        }

        return {
            modelId: parsed.id,
            label: parsed.id,
            description: tags.length ? tags.join(' · ') : undefined,
            detail: raw.displayName,
        };
    });
}

/**
 * Command body. Takes a discovery function so the command is testable and so
 * the caller owns the Gemini client rather than this module constructing one.
 */
export async function selectModelCommand(
    discover: () => Promise<DiscoveredModel[]>,
    kind: 'text' | 'image' = 'text',
): Promise<string | undefined> {
    const settingKey = kind === 'image' ? 'imageModel' : 'model';
    const config = vscode.workspace.getConfiguration('c4x.ai');
    const current = config.get<string>(settingKey) ?? (kind === 'image' ? DEFAULT_IMAGE_MODEL : DEFAULT_MODEL);

    const models = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'C4X: asking Gemini which models your key can use...' },
        () => discover()
    );

    if (models.length === 0) {
        vscode.window.showWarningMessage(
            'C4X: could not list models. Check your API key with "C4X: Set Gemini API Key", or your network. ' +
            `The current setting (${current}) is unchanged.`
        );
        return undefined;
    }

    const items = buildModelPickItems(models, current, kind);
    if (items.length === 0) {
        vscode.window.showWarningMessage(`C4X: your key can reach no ${kind} models.`);
        return undefined;
    }

    const picked = await vscode.window.showQuickPick(items, {
        title: `C4X: choose a ${kind} model`,
        placeHolder: `Currently ${current}`,
        matchOnDescription: true,
        matchOnDetail: true,
    });

    if (!picked) {
        return undefined;
    }

    await config.update(settingKey, picked.modelId, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(`C4X: ${kind} model set to ${picked.modelId}.`);
    return picked.modelId;
}
