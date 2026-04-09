import * as http from 'http';
import * as fs   from 'fs';

const PORT = 7891;

export interface HookData {
  tool_name?:      string;
  tool_input?:     Record<string, unknown>;
  tool_response?:  { is_error?: boolean; success?: boolean; [key: string]: unknown };
  prompt?:         string;
  transcript_path?: string;
}

export interface ClaudeStageEvent {
  type:       string;
  timestamp:  number;
  sessionId:  string;
  tool?:      string;
  phase?:     string;
  params?:    Record<string, unknown>;
  success?:   boolean;
  text?:      string;
  tokens?:    { input: number; output: number };
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
  const event: ClaudeStageEvent = { type, timestamp: Date.now(), sessionId: process.cwd() };

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
