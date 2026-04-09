import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

type HookEntry = { matcher: string; hooks: Array<{ type: string; command: string }> };

/**
 * Copies out/hooks/notify.js to ~/.claude/claude-stage-hook/notify.js (a stable
 * path independent of extension version or install location) and merges the
 * four Claude Code hook entries into ~/.claude/settings.json.
 *
 * Idempotent: stale claude-stage-hook entries are replaced; other hooks preserved.
 *
 * @param extensionPath  Absolute path to the extension root (context.extensionPath)
 * @param port           Event server port to stamp into the script
 * @param homeDir        Override for os.homedir() — used in tests
 */
export function setupHooks(
  extensionPath: string,
  port: number,
  homeDir: string = os.homedir()
): void {
  const hookDir      = path.join(homeDir, '.claude', 'claude-stage-hook');
  const hookScript   = path.join(hookDir, 'notify.js');
  const settingsPath = path.join(homeDir, '.claude', 'settings.json');

  // 1. Copy notify.js to stable location, stamping in the configured port
  try {
    fs.mkdirSync(hookDir, { recursive: true });
    const source  = path.join(extensionPath, 'out', 'hooks', 'notify.js');
    let   content = fs.readFileSync(source, 'utf8');
    content = content.replace(/const PORT = \d+/, `const PORT = ${port}`);
    fs.writeFileSync(hookScript, content, 'utf8');
  } catch (err) {
    console.error('Claude Stage: failed to install hook script:', err);
    return;
  }

  // 2. Merge into settings.json without clobbering other hooks
  try {
    let settings: Record<string, unknown> = {};
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch { /* file may not exist yet */ }

    const hooks      = (settings.hooks ?? {}) as Record<string, HookEntry[]>;
    const scriptPath = hookScript.replace(/\\/g, '/');

    const HOOK_MAP: Array<[string, string]> = [
      ['UserPromptSubmit', 'user_prompt'],
      ['PreToolUse',       'tool_use'],
      ['PostToolUse',      'tool_result'],
      ['Stop',             'stop'],
    ];

    for (const [hookName, eventType] of HOOK_MAP) {
      const cmd      = `node "${scriptPath}" ${eventType}`;
      // Remove stale claude-stage-hook entries, then append fresh one
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
