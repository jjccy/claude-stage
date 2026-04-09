import * as http from 'http';
import * as fs   from 'fs';

const PORT = 7891;

export interface HookData {
  // Common fields present on every Claude Code hook
  session_id?:        string;                  // Claude Code session UUID
  cwd?:               string;                  // working directory of the Claude process
  hook_event_name?:   string;                  // e.g. "PreToolUse"

  // PreToolUse / PostToolUse
  tool_name?:         string;
  tool_input?:        Record<string, unknown>;
  tool_response?:     { is_error?: boolean; success?: boolean; [key: string]: unknown };

  // UserPromptSubmit
  prompt?:            string;

  // Stop
  transcript_path?:   string;
  stop_hook_active?:  boolean;

  // Notification
  notification_type?: string;                  // "permission_prompt" | "idle_prompt" | "auth_success" | "elicitation_dialog"
  message?:           string;                  // human-readable notification text

  // SessionStart
  source?:            string;                  // "startup" | "resume" | "clear" | "compact"
}

export interface ClaudeStageEvent {
  type:        string;
  timestamp:   number;
  sessionId:   string;
  label?:      string;   // human-readable session name (last segment of cwd)
  tool?:       string;
  phase?:      string;
  params?:     Record<string, unknown>;
  success?:    boolean;
  text?:       string;
  tokens?:     { input: number; output: number };
  notifType?:  string;   // notification events: original notification_type value
}

/**
 * Build a ClaudeStageEvent from the hook type and the parsed stdin JSON.
 * Returns null when the event should be silently dropped (e.g. system-injected
 * prompts that Claude Code sends internally but that are not real user input).
 *
 * stdin shapes (from Claude Code):
 *   PreToolUse:       { tool_name, tool_input, ... }
 *   PostToolUse:      { tool_name, tool_input, tool_response, ... }
 *   UserPromptSubmit: { prompt, ... }
 *   Stop:             { transcript_path, ... }
 */
export function buildEvent(type: string, hookData: HookData): ClaudeStageEvent | null {
  // Prefer the session_id Claude Code provides (stable UUID per session) over
  // process.cwd() so multi-session tracking is accurate even when two instances
  // share the same working directory.
  const cwd = hookData.cwd ?? process.cwd();
  const event: ClaudeStageEvent = {
    type,
    timestamp: Date.now(),
    sessionId: hookData.session_id ?? cwd,
    label:     cwd.replace(/.*[\\/]/, '') || undefined,
  };

  if (type === 'tool_use') {
    event.tool   = hookData.tool_name;
    event.phase  = 'pre';
    event.params = hookData.tool_input ?? {};

  } else if (type === 'tool_result') {
    const toolName = hookData.tool_name;
    const resp     = hookData.tool_response;
    const success  = !resp || (resp.is_error !== true && resp.success !== false);

    if (toolName === 'Agent') {
      // Agent completion gets its own event type so the webview can animate
      // the individual agent figure to idle rather than just flashing Claude.
      event.type    = 'agent_done';
      event.success = success;
      // Include the task prompt so the webview can match the exact figure
      // even when multiple agents complete out of order.
      const prompt = hookData.tool_input?.['prompt'];
      if (prompt != null) event.text = String(prompt).slice(0, 300);
    } else {
      event.tool    = toolName;
      event.phase   = 'post';
      event.success = success;
    }

  } else if (type === 'user_prompt') {
    const text = (hookData.prompt ?? '').trim();
    // System-generated inputs (sub-agent tasks, IDE context injections) always
    // start with XML tags like <task> or <ide_opened_file>.  Drop them — they
    // are not real user messages and would appear as false USER → ... entries.
    if (/^<[a-zA-Z_]/.test(text)) return null;
    event.text = hookData.prompt ?? '';

  } else if (type === 'notification') {
    const nt = hookData.notification_type ?? '';
    // idle_prompt fires constantly while Claude waits — not useful to visualise.
    if (nt === 'idle_prompt') return null;
    // permission_prompt / elicitation_dialog → reuse the dedicated permission type
    // so the stage shows the "waiting" animation and warning bubble.
    if (nt === 'permission_prompt' || nt === 'elicitation_dialog') {
      event.type     = 'permission';
      event.text     = hookData.message ?? 'Permission needed';
      event.notifType = nt;
    } else {
      event.text      = hookData.message ?? (nt || 'Notification');
      event.notifType = nt;
    }

  } else if (type === 'session_start') {
    // source: "startup" | "resume" | "clear" | "compact"
    event.text = hookData.source ?? 'startup';

  } else if (type === 'stop_failure') {
    // StopFailure fires when the response was interrupted by an error (rate
    // limit, billing, auth, etc.).  No additional structured fields in stdin.
    event.text = hookData.message ?? '';

  } else if (type === 'stop') {
    // Claude Code Stop hook doesn't expose token counts directly.
    // Read them from the transcript file (last assistant message with usage).
    const transcriptPath = hookData.transcript_path;
    if (transcriptPath) {
      try {
        const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n');
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const entry = JSON.parse(lines[i]) as Record<string, unknown>;
            const msg   = entry['message'] as Record<string, unknown> | undefined;
            const usage = (msg?.['usage'] ?? entry['usage']) as Record<string, number> | undefined;
            if (usage?.['input_tokens'] != null) {
              event.tokens = {
                input:  usage['input_tokens']  ?? 0,
                output: usage['output_tokens'] ?? 0,
              };
              break;
            }
          } catch { /* malformed line, skip */ }
        }
      } catch { /* file unreadable, skip */ }
    }
  }

  return event;
}

/**
 * POST an event to the stage server. Fails silently — never blocks Claude Code.
 */
export function sendEvent(event: ClaudeStageEvent, port: number = PORT): void {
  const body = JSON.stringify(event);
  const req  = http.request(
    {
      hostname: '127.0.0.1',
      port,
      path: '/',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 500,
    },
    () => {}
  );
  req.on('error', () => {});
  req.write(body);
  req.end();
}

if (require.main === module) {
  const type = process.argv[2];
  if (type) {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => { raw += chunk; });
    process.stdin.on('end', () => {
      let hookData: HookData = {};
      try { hookData = JSON.parse(raw) as HookData; } catch {}
      const event = buildEvent(type, hookData);
      if (event) sendEvent(event, PORT);
    });
  }
}
