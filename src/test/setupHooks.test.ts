import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { setupHooks } from '../hookSetup';

describe('setupHooks', () => {
  let tempDir:      string;
  let extensionDir: string;

  beforeEach(() => {
    // Each test gets a fully isolated temp directory
    tempDir      = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-stage-test-'));
    extensionDir = path.join(tempDir, 'extension');
    fs.mkdirSync(path.join(extensionDir, 'out', 'hooks'), { recursive: true });
    fs.writeFileSync(
      path.join(extensionDir, 'out', 'hooks', 'notify.js'),
      'const PORT = 7891;\n// placeholder\n'
    );
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // Convenience helpers
  const hookScriptPath = (home: string) =>
    path.join(home, '.claude', 'claude-stage-hook', 'notify.js');

  const readSettings = (home: string) =>
    JSON.parse(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8'));

  it('writes notify.js to ~/.claude/claude-stage-hook/ with the correct port', () => {
    setupHooks(extensionDir, 8000, tempDir);
    const content = fs.readFileSync(hookScriptPath(tempDir), 'utf8');
    expect(content).toContain('const PORT = 8000');
  });

  it('creates settings.json with all four hook types', () => {
    setupHooks(extensionDir, 7891, tempDir);
    const s = readSettings(tempDir);
    expect(s.hooks.PreToolUse).toHaveLength(1);
    expect(s.hooks.PostToolUse).toHaveLength(1);
    expect(s.hooks.Stop).toHaveLength(1);
    expect(s.hooks.UserPromptSubmit).toHaveLength(1);
  });

  it('hook commands reference the stable script path with correct event type', () => {
    setupHooks(extensionDir, 7891, tempDir);
    const s = readSettings(tempDir);
    const cmd = s.hooks.PreToolUse[0].hooks[0].command as string;
    expect(cmd).toContain('claude-stage-hook/notify.js');
    expect(cmd).toContain('tool_use');
  });

  it('preserves existing non-claude-stage hooks', () => {
    const settingsDir = path.join(tempDir, '.claude');
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(path.join(settingsDir, 'settings.json'), JSON.stringify({
      hooks: {
        PreToolUse: [{ matcher: '', hooks: [{ type: 'command', command: 'my-other-hook' }] }],
      },
    }));

    setupHooks(extensionDir, 7891, tempDir);

    const s = readSettings(tempDir);
    expect(s.hooks.PreToolUse).toHaveLength(2);
    expect(s.hooks.PreToolUse[0].hooks[0].command).toBe('my-other-hook');
  });

  it('is idempotent — running twice yields exactly one claude-stage entry per hook', () => {
    setupHooks(extensionDir, 7891, tempDir);
    setupHooks(extensionDir, 7891, tempDir);

    const s = readSettings(tempDir);
    expect(s.hooks.PreToolUse).toHaveLength(1);
    expect(s.hooks.PostToolUse).toHaveLength(1);
    expect(s.hooks.Stop).toHaveLength(1);
    expect(s.hooks.UserPromptSubmit).toHaveLength(1);
  });

  it('preserves other top-level settings keys', () => {
    const settingsDir = path.join(tempDir, '.claude');
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(path.join(settingsDir, 'settings.json'), JSON.stringify({
      effortLevel: 'high',
      env: { MY_VAR: 'hello' },
    }));

    setupHooks(extensionDir, 7891, tempDir);

    const s = readSettings(tempDir);
    expect(s.effortLevel).toBe('high');
    expect(s.env.MY_VAR).toBe('hello');
  });

  it('works when settings.json does not exist yet', () => {
    expect(() => setupHooks(extensionDir, 7891, tempDir)).not.toThrow();
    const s = readSettings(tempDir);
    expect(s.hooks).toBeDefined();
  });
});
