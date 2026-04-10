import * as fs from 'fs';
import * as vscode from 'vscode';
import { ClaudeEvent } from './eventServer';

export class StagePanel {
  public static currentPanel: StagePanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel;
    this.extensionUri = extensionUri;

    this.panel.webview.html = this.getHtml();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(msg => {
      if (msg.command === 'openSettings') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'claudeStage');
      }
    }, null, this.disposables);
  }

  static createOrShow(extensionUri: vscode.Uri): StagePanel {
    const column = vscode.ViewColumn.Beside;

    if (StagePanel.currentPanel) {
      StagePanel.currentPanel.panel.reveal(column);
      return StagePanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'claudeStage',
      'Claude Stage',
      column,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'src', 'webview'),
          vscode.Uri.joinPath(extensionUri, 'out', 'media'),
          vscode.Uri.joinPath(extensionUri, 'media', 'sprites'),
        ],
        retainContextWhenHidden: true,
      }
    );

    StagePanel.currentPanel = new StagePanel(panel, extensionUri);
    return StagePanel.currentPanel;
  }

  sendEvent(event: ClaudeEvent): void {
    this.panel.webview.postMessage({ command: 'event', event });
  }

  clear(): void {
    this.panel.webview.postMessage({ command: 'clear' });
  }

  trim(): void {
    this.panel.webview.postMessage({ command: 'trim' });
  }

  reload(): void {
    this.panel.webview.html = this.getHtml();
  }

  private getHtml(): string {
    const config = vscode.workspace.getConfiguration('claudeStage');
    const cssUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'src', 'webview', 'stage.css')
    );
    const jsUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'out', 'media', 'stage.js')
    );
    const spritesUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'sprites')
    );
    const templatePath = vscode.Uri.joinPath(
      this.extensionUri, 'src', 'webview', 'stage.html'
    ).fsPath;
    const template = fs.readFileSync(templatePath, 'utf-8');
    const stageConfig = JSON.stringify({
      theme: config.get<string>('theme', 'default'),
      figureDensity: config.get<number>('figureDensity', 1),
      spritesBaseUrl: spritesUri.toString(),
    });
    return template
      .replace(/\{\{cspSource\}\}/g, this.panel.webview.cspSource)
      .replace('{{styleUri}}', cssUri.toString())
      .replace('{{scriptUri}}', jsUri.toString())
      .replace('{{config}}', stageConfig);
  }

  dispose(): void {
    StagePanel.currentPanel = undefined;
    this.panel.dispose();
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
}
