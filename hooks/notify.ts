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
  tool?:      string;
  phase?:     string;
  params?:    Record<string, unknown>;
  success?:   boolean;
  text?:      string;
  tokens?:    { input: number; output: number };
}

/**
 * Build a ClaudeStage event from the hook type and the parsed stdin JSON.
 *
 * stdin shapes (from Claude Code):
 *   PreToolUse:       { tool_name, tool_input, ... }
 *   PostToolUse:      { tool_name, tool_input, tool_response, ... }
 *   UserPromptSubmit: { prompt, ... }
 *   Stop:             { transcript_path, ... }
 */
export function buildEvent(type: string, hookData: HookData): ClaudeStageEvent {
  const event: ClaudeStageEvent = { type, timestamp: Date.now() };

  if (type === 'tool_use') {
    event.tool   = hookData.tool_name;
    event.phase  = 'pre';
    event.params = hookData.tool_input ?? {};

  } else if (type === 'tool_result') {
    event.tool  = hookData.tool_name;
    event.phase = 'post';
    const resp  = hookData.tool_response;
    event.success = !resp || (resp.is_error !== true && resp.success !== false);

  } else if (type === 'user_prompt') {
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
      sendEvent(buildEvent(type, hookData), PORT);
    });
  }
}
