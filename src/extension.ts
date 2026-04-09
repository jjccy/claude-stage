import * as vscode from 'vscode';
import { EventServer, ClaudeEvent } from './eventServer';
import { StagePanel } from './stagePanel';
import { setupHooks } from './hookSetup';

let eventServer: EventServer | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration('claudeStage');
  const port: number = config.get('port', 7891);
  const autoOpen: boolean = config.get('autoOpen', true);

  // Start event server
  eventServer = new EventServer(port);
  try {
    await eventServer.start();
    console.log(`Claude Stage: event server listening on port ${port}`);
  } catch (err) {
    vscode.window.showErrorMessage(`Claude Stage: failed to start event server on port ${port}. Check settings.`);
    return;
  }

  // Forward events to the stage panel
  eventServer.on('event', (event: ClaudeEvent) => {
    if (StagePanel.currentPanel) {
      StagePanel.currentPanel.sendEvent(event);
    }
  });

  // Auto-register Claude Code hooks in ~/.claude/settings.json
  setupHooks(context.extensionPath, port);

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('claude-stage.openStage', () => {
      StagePanel.createOrShow(context.extensionUri);
    }),
    vscode.commands.registerCommand('claude-stage.clearStage', () => {
      if (StagePanel.currentPanel) {
        StagePanel.currentPanel.clear();
      }
    })
  );

  // Auto-open on startup
  if (autoOpen) {
    StagePanel.createOrShow(context.extensionUri);
  }

  // Hot reload: watch media files and refresh the webview on change
  const mediaWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(context.extensionUri.fsPath, 'media/**')
  );
  const reloadPanel = () => {
    if (StagePanel.currentPanel) {
      StagePanel.currentPanel.reload();
    }
  };
  mediaWatcher.onDidChange(reloadPanel, null, context.subscriptions);
  mediaWatcher.onDidCreate(reloadPanel, null, context.subscriptions);
  context.subscriptions.push(mediaWatcher);
}

export async function deactivate(): Promise<void> {
  if (eventServer) {
    await eventServer.stop();
  }
}
