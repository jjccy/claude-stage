import * as vscode from 'vscode';
import { EventServer, ClaudeEvent } from './eventServer';
import { StagePanel } from './stagePanel';

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

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('claude-stage.openStage', () => {
      StagePanel.createOrShow(context.extensionUri);
      vscode.window.showInformationMessage(
        `Claude Stage is running. Add hooks to Claude Code settings pointing to: http://127.0.0.1:${port}`
      );
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

  // Show hook setup hint once
  const shown = context.globalState.get('hookHintShown', false);
  if (!shown) {
    context.globalState.update('hookHintShown', true);
    vscode.window.showInformationMessage(
      `Claude Stage: Add Claude Code hooks to send events to http://127.0.0.1:${port}`,
      'See context.md'
    );
  }
}

export async function deactivate(): Promise<void> {
  if (eventServer) {
    await eventServer.stop();
  }
}
