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

  reload(): void {
    this.panel.webview.html = this.getHtml();
  }

  private getHtml(): string {
    const mediaPath = vscode.Uri.joinPath(this.extensionUri, 'src', 'webview');
    const cssUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(mediaPath, 'stage.css'));
    const jsUri  = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'out', 'media', 'stage.js')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource} 'unsafe-inline'; script-src ${this.panel.webview.cspSource} 'unsafe-inline';">
  <link rel="stylesheet" href="${cssUri}">
  <title>Claude Stage</title>
</head>
<body>
  <div id="stage">
    <div id="ground"></div>
    <div id="figures-layer">
      <svg id="hierarchy-svg"></svg>
    </div>
    <div id="events-log"></div>
    <div id="status-bar">
      <span id="status-icon">●</span>
      <span id="status-text">Waiting for Claude...</span>
      <div id="token-counter">
        <div id="token-bar-wrap"><div id="token-bar"></div></div>
        <span id="token-count">—</span>
      </div>
    </div>
  </div>
  <script src="${jsUri}"></script>
</body>
</html>`;
  }

  dispose(): void {
    StagePanel.currentPanel = undefined;
    this.panel.dispose();
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
}
