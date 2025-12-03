import * as vscode from 'vscode';
import { PreviewPanel } from './PreviewPanel';

export class WebviewProvider {
    public static createOrShow(context: vscode.ExtensionContext): void {
        PreviewPanel.createOrShow(context);
    }

    public static dispose(): void {
        PreviewPanel.dispose();
    }
}
