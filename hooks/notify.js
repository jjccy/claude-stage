'use strict';
// Claude Stage – hook notifier
// Claude Code passes hook data as JSON on stdin (not env vars).
// Called by Claude Code hooks: node notify.js <event-type>

const http = require('http');
const fs   = require('fs');
const PORT = 7891;

/**
 * Build a ClaudeStage event from the hook type and the parsed stdin JSON.
 *
 * stdin shapes (from Claude Code):
 *   PreToolUse:       { tool_name, tool_input, tool_use_id, ... }
 *   PostToolUse:      { tool_name, tool_input, tool_response, tool_use_id, ... }
 *   UserPromptSubmit: { prompt, ... }
 *   Stop:             { transcript_path, ... }
 */
function buildEvent(type, hookData) {
  const event = { type, timestamp: Date.now() };

  if (type === 'tool_use') {
    event.tool   = hookData.tool_name;
    event.phase  = 'pre';
    event.params = hookData.tool_input || {};

  } else if (type === 'tool_result') {
    event.tool  = hookData.tool_name;
    event.phase = 'post';
    const resp  = hookData.tool_response;
    // resp shape varies by tool; is_error is the reliable signal
    event.success = !resp || (resp.is_error !== true && resp.success !== false);

  } else if (type === 'user_prompt') {
    event.text = hookData.prompt || '';

  } else if (type === 'stop') {
    // Claude Code Stop hook doesn't expose token counts directly.
    // Read them from the transcript file (last assistant message with usage).
    const transcriptPath = hookData.transcript_path;
    if (transcriptPath) {
      try {
        const lines = fs.readFileSync(transcriptPath, 'utf8').trim().split('\n');
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const entry = JSON.parse(lines[i]);
            const usage = entry.message?.usage ?? entry.usage;
            if (usage?.input_tokens != null) {
              event.tokens = {
                input:  usage.input_tokens  || 0,
                output: usage.output_tokens || 0,
              };
              break;
            }
          } catch {}
        }
      } catch {}
    }
  }

  return event;
}

/**
 * POST an event to the stage server. Fails silently.
 */
function sendEvent(event, port) {
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
  req.on('error', () => {}); // never block Claude Code
  req.write(body);
  req.end();
}

if (require.main === module) {
  const type = process.argv[2];
  if (!type) process.exit(0);

  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { raw += chunk; });
  process.stdin.on('end', () => {
    let hookData = {};
    try { hookData = JSON.parse(raw); } catch {}
    sendEvent(buildEvent(type, hookData), PORT);
  });
}

module.exports = { buildEvent, sendEvent };
