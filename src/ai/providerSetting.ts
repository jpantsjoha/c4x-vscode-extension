// Which generation provider runs: the `c4x.ai.provider` setting (#392).
//
// `gemini` is the default and today's behaviour: Gemini with the user's API
// key, asked for when none is stored. `vscode-lm` uses a chat model the user
// already has in VS Code, through the Language Model API, with no key. The
// default order between them is a maintainer decision still open, so this
// setting chooses one provider and never falls back to the other.

import * as vscode from 'vscode';

export type GenerationProviderId = 'gemini' | 'vscode-lm';

export const PROVIDER_SETTING = 'provider';

/** The provider to use. Anything but `vscode-lm` means Gemini, as before. */
export function readGenerationProvider(): GenerationProviderId {
    const value = vscode.workspace.getConfiguration('c4x.ai').get<string>(PROVIDER_SETTING, 'gemini');
    return value === 'vscode-lm' ? 'vscode-lm' : 'gemini';
}
