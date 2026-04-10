// Claude Stage – demo script
// Fires a scripted sequence of events to exercise all stage features.
// Run after pressing F5 to launch the Extension Development Host:
//
//   node scripts/demo.js

'use strict';

const http = require('http');
const PORT = 7891;

// ── helpers ───────────────────────────────────────────────────────────────────

function post(event) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ ...event, timestamp: Date.now() });
    const req  = http.request({
      hostname: '127.0.0.1',
      port:     PORT,
      path:     '/',
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      const extra = event.tool  ? ` / ${event.tool}`
                  : event.text  ? ` "${String(event.text).slice(0, 35)}"`
                  : '';
      console.log(`  ✓ ${event.type}${extra} → ${res.statusCode}`);
      resolve();
    });
    req.on('error', (e) => {
      console.error(`  ✗ Could not reach server on port ${PORT}: ${e.message}`);
      resolve();
    });
    req.write(body);
    req.end();
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// UUID-style session IDs (as Claude Code actually sends) + human-readable labels
// derived from cwd last segment (as notify.ts derives them in production).
const SID_A   = '30DA8347-413A-4C67-BCB0-7F09DEE81C45';
const LABEL_A = 'my-project';
const SID_B   = '03C6DE5A-3096-4927-A0A7-E496D428F673';
const LABEL_B = 'other-project';

// ── demo ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log('\n── Claude Stage demo ────────────────────────────────────\n');

  // ── Scene 1: Session startup ──────────────────────────────────────────────
  console.log('1. Session startup');
  await post({ type: 'session_start', sessionId: SID_A, label: LABEL_A, text: 'startup' });
  await wait(1000);

  // ── Scene 2: User prompt + read/search/edit ───────────────────────────────
  console.log('\n2. User prompt + tool calls');
  await post({ type: 'user_prompt', sessionId: SID_A, label: LABEL_A, text: 'Refactor the authentication module' });
  await wait(1000);

  await post({ type: 'tool_use',    sessionId: SID_A, label: LABEL_A, tool: 'Read',  phase: 'pre',  params: { file_path: 'src/auth/index.ts' } });
  await wait(700);
  await post({ type: 'tool_result', sessionId: SID_A, label: LABEL_A, tool: 'Read',  phase: 'post', success: true });
  await wait(600);

  await post({ type: 'tool_use',    sessionId: SID_A, label: LABEL_A, tool: 'Grep',  phase: 'pre',  params: { pattern: 'authenticate' } });
  await wait(700);
  await post({ type: 'tool_result', sessionId: SID_A, label: LABEL_A, tool: 'Grep',  phase: 'post', success: true });
  await wait(600);

  await post({ type: 'tool_use',    sessionId: SID_A, label: LABEL_A, tool: 'Edit',  phase: 'pre',  params: { file_path: 'src/auth/index.ts' } });
  await wait(700);
  await post({ type: 'tool_result', sessionId: SID_A, label: LABEL_A, tool: 'Edit',  phase: 'post', success: true });
  await wait(800);

  // ── Scene 3: Tool failure (red shake) ────────────────────────────────────
  console.log('\n3. Tool failure → recovery');
  await post({ type: 'tool_use',    sessionId: SID_A, label: LABEL_A, tool: 'Bash', phase: 'pre',  params: { command: 'npm run build' } });
  await wait(700);
  await post({ type: 'tool_result', sessionId: SID_A, label: LABEL_A, tool: 'Bash', phase: 'post', success: false });
  await wait(900);

  await post({ type: 'tool_use',    sessionId: SID_A, label: LABEL_A, tool: 'Bash', phase: 'pre',  params: { command: 'npm install --legacy-peer-deps' } });
  await wait(700);
  await post({ type: 'tool_result', sessionId: SID_A, label: LABEL_A, tool: 'Bash', phase: 'post', success: true });
  await wait(800);

  // ── Scene 4: Permission prompts ───────────────────────────────────────────
  // Real Claude Code ordering: PermissionRequest hook fires BEFORE PreToolUse.
  //   permission event arrives first → figure shows "waiting" (Hurt animation)
  //   tool_use arrives ~200ms later but must NOT override "waiting" state.
  // Note: the Notification(permission_prompt) hook also fires but only carries
  //   a message string — no tool details. Tool details come from PermissionRequest.
  console.log('\n4a. PermissionRequest → approved');

  // Step 1: PermissionRequest hook fires (carries tool_name + tool_input)
  await post({
    type:      'permission',
    sessionId: SID_A,
    label:     LABEL_A,
    notifType: 'permission_request',
    tool:      'Bash',
    params:    { command: 'rm -rf dist/' },
    text:      'Allow Bash: rm -rf dist/',
  });
  await wait(200);  // in production PreToolUse follows almost immediately

  // Step 2: PreToolUse fires — figure must STAY in "waiting" state (not flip to running)
  await post({ type: 'tool_use', sessionId: SID_A, label: LABEL_A, tool: 'Bash', phase: 'pre', params: { command: 'rm -rf dist/' } });
  await wait(2000); // user reads the prompt...

  // Step 3: User approves → tool runs → PostToolUse fires
  await post({ type: 'tool_result', sessionId: SID_A, label: LABEL_A, tool: 'Bash', phase: 'post', success: true });
  await wait(900);

  // ── 4b: PermissionRequest → user DENIES ──────────────────────────────────
  console.log('\n4b. PermissionRequest → denied (tool_result error)');
  await post({
    type:      'permission',
    sessionId: SID_A,
    label:     LABEL_A,
    notifType: 'permission_request',
    tool:      'Write',
    params:    { file_path: '/etc/hosts' },
    text:      'Allow Write: /etc/hosts',
  });
  await wait(200);
  await post({ type: 'tool_use', sessionId: SID_A, label: LABEL_A, tool: 'Write', phase: 'pre', params: { file_path: '/etc/hosts' } });
  await wait(1800);
  // User denies — PostToolUse fires with rejection response
  await post({ type: 'tool_result', sessionId: SID_A, label: LABEL_A, tool: 'Write', phase: 'post', success: false });
  await wait(900);

  // ── 4c: elicitation dialog ────────────────────────────────────────────────
  console.log('\n4c. Elicitation dialog (user choice)');
  await post({
    type:      'permission',
    sessionId: SID_A,
    label:     LABEL_A,
    notifType: 'elicitation_dialog',
    text:      'Which migration strategy should I use?\n1. Additive-only migration\n2. Drop and recreate table\n3. In-place ALTER TABLE',
  });
  await wait(2500);

  // ── Scene 5: Spawn three agents ───────────────────────────────────────────
  console.log('\n5. Spawning three agents');
  const PROMPT_A = 'Explore and summarise the test directory';
  const PROMPT_B = 'Explore and summarise the docs directory';
  const PROMPT_C = 'Write the database migration script';
  await post({ type: 'tool_use', sessionId: SID_A, label: LABEL_A, tool: 'Agent', phase: 'pre', params: { prompt: PROMPT_A } });
  await wait(800);
  await post({ type: 'tool_use', sessionId: SID_A, label: LABEL_A, tool: 'Agent', phase: 'pre', params: { prompt: PROMPT_B } });
  await wait(800);
  await post({ type: 'tool_use', sessionId: SID_A, label: LABEL_A, tool: 'Agent', phase: 'pre', params: { prompt: PROMPT_C } });
  await wait(1500);

  // ── Scene 6: Agents complete out of order ─────────────────────────────────
  console.log('\n6. Agents completing (out of order)');
  await post({ type: 'agent_done', sessionId: SID_A, label: LABEL_A, success: true,  text: PROMPT_B });
  await wait(1200);
  await post({ type: 'agent_done', sessionId: SID_A, label: LABEL_A, success: false, text: PROMPT_C });
  await wait(1200);
  await post({ type: 'agent_done', sessionId: SID_A, label: LABEL_A, success: true,  text: PROMPT_A });
  await wait(800);

  // ── Scene 7: First stop + token gauge ────────────────────────────────────
  console.log('\n7. Stop – token gauge fills');
  await post({ type: 'stop', sessionId: SID_A, label: LABEL_A, tokens: { input: 22000, output: 5800 } });
  await wait(1200);

  // ── Scene 8: Second session joins ────────────────────────────────────────
  console.log('\n8. Second session starts (multi-session)');
  await post({ type: 'session_start', sessionId: SID_B, label: LABEL_B, text: 'resume' });
  await wait(800);
  await post({ type: 'user_prompt',   sessionId: SID_B, label: LABEL_B, text: 'Fix the failing tests' });
  await wait(900);

  await post({ type: 'tool_use',    sessionId: SID_B, label: LABEL_B, tool: 'Read',      phase: 'pre',  params: { file_path: 'test/auth.test.ts' } });
  await wait(700);
  await post({ type: 'tool_result', sessionId: SID_B, label: LABEL_B, tool: 'Read',      phase: 'post', success: true });
  await wait(600);

  await post({ type: 'tool_use',    sessionId: SID_B, label: LABEL_B, tool: 'TodoWrite', phase: 'pre',  params: { todos: [] } });
  await wait(700);
  await post({ type: 'tool_result', sessionId: SID_B, label: LABEL_B, tool: 'TodoWrite', phase: 'post', success: true });
  await wait(600);

  await post({ type: 'tool_use',    sessionId: SID_B, label: LABEL_B, tool: 'WebSearch', phase: 'pre',  params: { query: 'jest mock async module' } });
  await wait(700);
  await post({ type: 'tool_result', sessionId: SID_B, label: LABEL_B, tool: 'WebSearch', phase: 'post', success: true });
  await wait(800);

  // ── Scene 9: Auth notification ────────────────────────────────────────────
  console.log('\n9. Notification – auth success');
  await post({ type: 'notification', sessionId: SID_B, label: LABEL_B, text: 'Authenticated', notifType: 'auth_success' });
  await wait(1200);

  // ── Scene 10: Second session stop ─────────────────────────────────────────
  console.log('\n10. Second session stop');
  await post({ type: 'stop', sessionId: SID_B, label: LABEL_B, tokens: { input: 11000, output: 3200 } });
  await wait(1200);

  // ── Scene 11: Stop failure ────────────────────────────────────────────────
  console.log('\n11. Stop failure (rate limit)');
  await post({ type: 'user_prompt',  sessionId: SID_A, label: LABEL_A, text: 'One more thing…' });
  await wait(800);
  await post({ type: 'tool_use',     sessionId: SID_A, label: LABEL_A, tool: 'WebFetch', phase: 'pre', params: { url: 'https://example.com' } });
  await wait(700);
  await post({ type: 'stop_failure', sessionId: SID_A, label: LABEL_A, text: 'Rate limit exceeded — try again shortly' });
  await wait(2000);

  // ── Scene 12: Second session — then trim to latest ────────────────────────
  console.log('\n12. Second session starts, then trim keeps only the latest');
  await post({ type: 'session_start', sessionId: SID_B, label: LABEL_B, text: 'startup' });
  await wait(800);
  await post({ type: 'user_prompt',   sessionId: SID_B, label: LABEL_B, text: 'Quick question' });
  await wait(800);
  await post({ type: 'stop',          sessionId: SID_B, label: LABEL_B, tokens: { input: 800, output: 200 } });
  await wait(1000);
  // Use the VS Code command to trim all sessions except the most-recently-active one
  // and clear all logs: run  "Claude Stage: Trim Sessions"  from the command palette.
  console.log('  → Run "Claude Stage: Trim Sessions" from the command palette');
  console.log('    (or click the ⊘ button in the stage status bar)');
  await wait(1500);

  console.log('\n─────────────────────────────────────────────────────────\n');
  console.log('Done. Run  node scripts/demo.js  again to replay.');
  console.log('Commands:');
  console.log('  "Claude Stage: Clear Stage"    — remove all figures and reset');
  console.log('  "Claude Stage: Trim Sessions"  — keep latest session, clear logs\n');
}

run().catch(console.error);
