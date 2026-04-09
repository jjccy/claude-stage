import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
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

  // Auto-register Claude Code hooks in ~/.claude/settings.json
  setupHooks(context, port);

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

/**
 * Copies the hook script to ~/.claude/claude-stage-hook/notify.js (a stable path
 * independent of the extension install location or version), then wires it into
 * ~/.claude/settings.json under the PreToolUse / PostToolUse / Stop / UserPromptSubmit hooks.
 *
 * Existing non-claude-stage entries in those hook arrays are preserved.
 * Re-runs on every activation so the script stays up to date.
 */
function setupHooks(context: vscode.ExtensionContext, port: number): void {
  const hookDir    = path.join(os.homedir(), '.claude', 'claude-stage-hook');
  const hookScript = path.join(hookDir, 'notify.js');
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');

  // 1. Copy notify.js to stable location, stamping in the configured port
  try {
    fs.mkdirSync(hookDir, { recursive: true });
    const source  = path.join(context.extensionPath, 'hooks', 'notify.js');
    let   content = fs.readFileSync(source, 'utf8');
    content = content.replace(/const PORT = \d+/, `const PORT = ${port}`);
    fs.writeFileSync(hookScript, content, 'utf8');
  } catch (err) {
    console.error('Claude Stage: failed to install hook script:', err);
    return;
  }

  // 2. Merge into ~/.claude/settings.json without clobbering other hooks
  try {
    let settings: Record<string, unknown> = {};
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch { /* file may not exist yet */ }

    type HookEntry = { matcher: string; hooks: Array<{ type: string; command: string }> };
    const hooks = (settings.hooks ?? {}) as Record<string, HookEntry[]>;
    const scriptPath = hookScript.replace(/\\/g, '/');

    const HOOK_MAP: Array<[string, string]> = [
      ['UserPromptSubmit', 'user_prompt'],
      ['PreToolUse',       'tool_use'],
      ['PostToolUse',      'tool_result'],
      ['Stop',             'stop'],
    ];

    for (const [hookName, eventType] of HOOK_MAP) {
      const cmd = `node "${scriptPath}" ${eventType}`;
      // Remove any stale claude-stage-hook entries, then add the current one
      const existing = (hooks[hookName] ?? []).filter(
        e => !e.hooks?.some(h => h.command?.includes('claude-stage-hook'))
      );
      existing.push({ matcher: '', hooks: [{ type: 'command', command: cmd }] });
      hooks[hookName] = existing;
    }

    settings.hooks = hooks;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    console.log('Claude Stage: hooks registered in ~/.claude/settings.json');
  } catch (err) {
    console.error('Claude Stage: failed to update settings.json:', err);
  }
}

export async function deactivate(): Promise<void> {
  if (eventServer) {
    await eventServer.stop();
  }
}
