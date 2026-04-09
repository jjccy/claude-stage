#!/usr/bin/env node
// Claude Stage – hook notifier
// Called by Claude Code hooks: node notify.js <event-type>
// Silently exits if the stage server isn't running (never blocks Claude Code)

const http = require('http');
const PORT = 7891;

const type = process.argv[2];
if (!type) process.exit(0);

const event = { type, timestamp: Date.now() };

if (type === 'tool_use') {
  event.tool  = process.env.CLAUDE_TOOL_NAME;
  event.phase = 'pre';
  try { event.params = JSON.parse(process.env.CLAUDE_TOOL_INPUT || '{}'); } catch {}
} else if (type === 'tool_result') {
  event.tool  = process.env.CLAUDE_TOOL_NAME;
  event.phase = 'post';
} else if (type === 'user_prompt') {
  event.text = process.env.CLAUDE_USER_PROMPT || '';
}

const body = JSON.stringify(event);
const req = http.request(
  {
    hostname: '127.0.0.1',
    port: PORT,
    path: '/',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    timeout: 500,
  },
  () => {}
);
req.on('error', () => {}); // don't block Claude Code if the server is down
req.write(body);
req.end();
