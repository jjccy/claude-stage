// Claude Stage – demo script
// Fires a scripted sequence of events to exercise all 26 hook types.
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
                  : event.text  ? ` "${String(event.text).slice(0, 40)}"`
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
  // SessionStart fires first, then InstructionsLoaded as CLAUDE.md files are
  // pulled into context.
  console.log('1. Session startup + instructions loaded');
  await post({ type: 'session_start', sessionId: SID_A, label: LABEL_A,
               text: 'startup', model: 'claude-sonnet-4-6' });
  await wait(600);
  await post({ type: 'instructions_loaded', sessionId: SID_A, label: LABEL_A,
               text: 'CLAUDE.md (Project, session_start)' });
  await wait(400);
  await post({ type: 'instructions_loaded', sessionId: SID_A, label: LABEL_A,
               text: '.claude/rules/style.md (Local, session_start)' });
  await wait(800);

  // ── Scene 2: User prompt + tool calls ────────────────────────────────────
  console.log('\n2. User prompt + tool calls');
  await post({ type: 'user_prompt', sessionId: SID_A, label: LABEL_A,
               text: 'Refactor the authentication module' });
  await wait(900);

  await post({ type: 'tool_use',    sessionId: SID_A, label: LABEL_A,
               tool: 'Read', params: { file_path: 'src/auth/index.ts' } });
  await wait(700);
  await post({ type: 'tool_result', sessionId: SID_A, label: LABEL_A,
               tool: 'Read', success: true });
  await wait(500);

  await post({ type: 'tool_use',    sessionId: SID_A, label: LABEL_A,
               tool: 'Grep', params: { pattern: 'authenticate' } });
  await wait(700);
  await post({ type: 'tool_result', sessionId: SID_A, label: LABEL_A,
               tool: 'Grep', success: true });
  await wait(500);

  await post({ type: 'tool_use',    sessionId: SID_A, label: LABEL_A,
               tool: 'Edit', params: { file_path: 'src/auth/index.ts' } });
  await wait(700);
  await post({ type: 'tool_result', sessionId: SID_A, label: LABEL_A,
               tool: 'Edit', success: true });
  await wait(800);

  // ── Scene 3: PostToolUseFailure (crash) ───────────────────────────────────
  // tool_failure = PostToolUseFailure hook: the tool process itself crashed or
  // exited non-zero.  Distinct from tool_result with success=false, which is a
  // successful response containing an error message.
  console.log('\n3. PostToolUseFailure (tool crash) → recovery');
  await post({ type: 'tool_use',     sessionId: SID_A, label: LABEL_A,
               tool: 'Bash', params: { command: 'npm run build' } });
  await wait(700);
  await post({ type: 'tool_failure', sessionId: SID_A, label: LABEL_A,
               tool: 'Bash', error: 'Command exited with code 2', isInterrupt: false });
  await wait(900);

  await post({ type: 'tool_use',    sessionId: SID_A, label: LABEL_A,
               tool: 'Bash', params: { command: 'npm install --legacy-peer-deps' } });
  await wait(700);
  await post({ type: 'tool_result', sessionId: SID_A, label: LABEL_A,
               tool: 'Bash', success: true });
  await wait(800);

  // ── Scene 4a: PermissionRequest → approved ────────────────────────────────
  // Real Claude Code ordering: PermissionRequest hook fires first (has tool
  // details), then PreToolUse fires ~200 ms later.  The permissionPending flag
  // keeps Claude in "waiting" state so PreToolUse doesn't override it.
  console.log('\n4a. PermissionRequest → approved');
  await post({
    type:      'permission',
    sessionId: SID_A,
    label:     LABEL_A,
    notifType: 'permission_request',
    tool:      'Bash',
    params:    { command: 'rm -rf dist/' },
    text:      'Allow Bash: rm -rf dist/',
  });
  await wait(200);  // PreToolUse follows almost immediately in production
  await post({ type: 'tool_use', sessionId: SID_A, label: LABEL_A,
               tool: 'Bash', params: { command: 'rm -rf dist/' } });
  await wait(2000); // user reads and approves…
  await post({ type: 'tool_result', sessionId: SID_A, label: LABEL_A,
               tool: 'Bash', success: true });
  await wait(800);

  // ── Scene 4b: PermissionDenied (auto-mode classifier) ────────────────────
  // PermissionDenied fires when auto-mode blocks a tool without user interaction.
  // Distinct from a user manually denying via the permission dialog.
  console.log('\n4b. PermissionDenied (auto-mode classifier)');
  await post({ type: 'tool_use', sessionId: SID_A, label: LABEL_A,
               tool: 'Bash', params: { command: 'curl https://internal-api/data' } });
  await wait(300);
  await post({
    type:      'permission_denied',
    sessionId: SID_A,
    label:     LABEL_A,
    tool:      'Bash',
    params:    { command: 'curl https://internal-api/data' },
    text:      'Auto mode denied: network access not permitted',
  });
  await wait(1200);

  // ── Scene 4c: MCP Elicitation → ElicitationResult ────────────────────────
  // An MCP server requests user input via a form dialog.  Claude goes to
  // "waiting" state.  After the user responds, ElicitationResult clears it.
  console.log('\n4c. MCP Elicitation → accepted');
  await post({
    type:      'permission',
    sessionId: SID_A,
    label:     LABEL_A,
    notifType: 'elicitation',
    mcpServer: 'jira-mcp',
    text:      'jira-mcp needs: Issue title, Priority',
  });
  await wait(2000); // user fills in the form…
  await post({
    type:      'elicitation_result',
    sessionId: SID_A,
    label:     LABEL_A,
    mcpServer: 'jira-mcp',
    mcpAction: 'accept',
    text:      'jira-mcp accept: title="Fix login bug", priority="High"',
  });
  await wait(900);

  // ── Scene 5: Spawn three agents ───────────────────────────────────────────
  // PreToolUse fires for each Agent call; SubagentStart fires shortly after
  // with the assigned agent_id and agent_type.
  console.log('\n5. Spawning three agents');
  const PROMPT_A = 'Explore and summarise the test directory';
  const PROMPT_B = 'Explore and summarise the docs directory';
  const PROMPT_C = 'Write the database migration script';
  const AGENT_ID_A = 'agent-aaa111';
  const AGENT_ID_B = 'agent-bbb222';
  const AGENT_ID_C = 'agent-ccc333';

  await post({ type: 'tool_use', sessionId: SID_A, label: LABEL_A,
               tool: 'Agent', params: { prompt: PROMPT_A } });
  await wait(300);
  await post({ type: 'subagent_start', sessionId: SID_A, label: LABEL_A,
               agentId: AGENT_ID_A, agentType: 'Explore' });
  await wait(600);

  await post({ type: 'tool_use', sessionId: SID_A, label: LABEL_A,
               tool: 'Agent', params: { prompt: PROMPT_B } });
  await wait(300);
  await post({ type: 'subagent_start', sessionId: SID_A, label: LABEL_A,
               agentId: AGENT_ID_B, agentType: 'Explore' });
  await wait(600);

  await post({ type: 'tool_use', sessionId: SID_A, label: LABEL_A,
               tool: 'Agent', params: { prompt: PROMPT_C } });
  await wait(300);
  await post({ type: 'subagent_start', sessionId: SID_A, label: LABEL_A,
               agentId: AGENT_ID_C, agentType: 'general-purpose' });
  await wait(1200);

  // ── Scene 6: Agents complete out of order ─────────────────────────────────
  // SubagentStop carries last_assistant_message (the agent's final output).
  // PostToolUse for the Agent tool follows as agent_done.
  console.log('\n6. Agents completing out of order');
  await post({ type: 'subagent_stop', sessionId: SID_A, label: LABEL_A,
               agentId: AGENT_ID_B, agentType: 'Explore',
               text: 'Found 8 markdown files in docs/. Key topics: API, setup, contributing.' });
  await wait(400);
  await post({ type: 'agent_done', sessionId: SID_A, label: LABEL_A,
               success: true, text: PROMPT_B });
  await wait(1000);

  await post({ type: 'subagent_stop', sessionId: SID_A, label: LABEL_A,
               agentId: AGENT_ID_C, agentType: 'general-purpose',
               text: 'Migration script written: 0043_add_sessions_table.sql' });
  await wait(400);
  await post({ type: 'agent_done', sessionId: SID_A, label: LABEL_A,
               success: false, text: PROMPT_C });
  await wait(1000);

  await post({ type: 'subagent_stop', sessionId: SID_A, label: LABEL_A,
               agentId: AGENT_ID_A, agentType: 'Explore',
               text: 'Found 23 test files. Coverage gaps in auth and billing modules.' });
  await wait(400);
  await post({ type: 'agent_done', sessionId: SID_A, label: LABEL_A,
               success: true, text: PROMPT_A });
  await wait(800);

  // ── Scene 7: Context compaction + stop ───────────────────────────────────
  // PreCompact fires before compaction; PostCompact fires after and carries
  // before→after token counts.
  console.log('\n7. Context compaction → stop');
  await post({ type: 'pre_compact', sessionId: SID_A, label: LABEL_A,
               trigger: 'auto', text: 'auto' });
  await wait(1500);
  await post({ type: 'post_compact', sessionId: SID_A, label: LABEL_A,
               trigger: 'auto', text: 'auto (180000→12000 tokens)' });
  await wait(800);
  await post({ type: 'stop', sessionId: SID_A, label: LABEL_A,
               tokens: { input: 22000, output: 5800 } });
  await wait(1200);

  // ── Scene 8: Second session (resume + cwd_changed + tasks) ───────────────
  console.log('\n8. Second session: resume, directory change, task tracking');
  await post({ type: 'session_start', sessionId: SID_B, label: LABEL_B,
               text: 'resume', model: 'claude-sonnet-4-6' });
  await wait(600);

  // CwdChanged fires when the user changes working directory mid-session.
  await post({ type: 'cwd_changed', sessionId: SID_B, label: 'backend',
               text: '/home/dev/other-project/backend' });
  await wait(700);

  await post({ type: 'user_prompt', sessionId: SID_B, label: LABEL_B,
               text: 'Fix the failing tests' });
  await wait(800);

  await post({ type: 'task_created', sessionId: SID_B, label: LABEL_B,
               taskSubject: 'Fix auth test mock', text: 'Fix auth test mock' });
  await wait(500);
  await post({ type: 'task_created', sessionId: SID_B, label: LABEL_B,
               taskSubject: 'Update jest config', text: 'Update jest config' });
  await wait(600);

  await post({ type: 'tool_use',    sessionId: SID_B, label: LABEL_B,
               tool: 'Read', params: { file_path: 'test/auth.test.ts' } });
  await wait(700);
  await post({ type: 'tool_result', sessionId: SID_B, label: LABEL_B,
               tool: 'Read', success: true });
  await wait(500);

  await post({ type: 'tool_use',    sessionId: SID_B, label: LABEL_B,
               tool: 'WebSearch', params: { query: 'jest mock async module' } });
  await wait(700);
  await post({ type: 'tool_result', sessionId: SID_B, label: LABEL_B,
               tool: 'WebSearch', success: true });
  await wait(500);

  await post({ type: 'tool_use',    sessionId: SID_B, label: LABEL_B,
               tool: 'Edit', params: { file_path: 'test/auth.test.ts' } });
  await wait(700);
  await post({ type: 'tool_result', sessionId: SID_B, label: LABEL_B,
               tool: 'Edit', success: true });
  await wait(600);

  await post({ type: 'task_completed', sessionId: SID_B, label: LABEL_B,
               taskSubject: 'Fix auth test mock', text: 'Fix auth test mock' });
  await wait(600);

  // ── Scene 9: File/config/worktree events ─────────────────────────────────
  console.log('\n9. File changes, config, worktree');
  await post({ type: 'file_changed', sessionId: SID_B, label: LABEL_B,
               text: 'test/auth.test.ts modified' });
  await wait(500);
  await post({ type: 'config_change', sessionId: SID_B, label: LABEL_B,
               text: 'local_settings [permissions, model]' });
  await wait(500);
  await post({ type: 'worktree_create', sessionId: SID_B, label: LABEL_B,
               text: '/tmp/wt-fix-tests' });
  await wait(700);
  await post({ type: 'worktree_remove', sessionId: SID_B, label: LABEL_B,
               text: '/tmp/wt-fix-tests (session_exit)' });
  await wait(800);

  // ── Scene 10: Auth notification + teammate idle + stop + session end ──────
  console.log('\n10. Auth notification, teammate idle, stop, session end');
  await post({ type: 'notification', sessionId: SID_B, label: LABEL_B,
               text: 'Authenticated', notifType: 'auth_success' });
  await wait(800);
  // TeammateIdle fires in team mode when a teammate agent goes idle.
  await post({ type: 'teammate_idle', sessionId: SID_B, label: LABEL_B,
               text: 'planner (dev-team)' });
  await wait(800);
  await post({ type: 'stop', sessionId: SID_B, label: LABEL_B,
               tokens: { input: 11000, output: 3200 } });
  await wait(800);
  // SessionEnd fires when the session terminates cleanly — figure fades out.
  await post({ type: 'session_end', sessionId: SID_B, label: LABEL_B,
               text: 'user_exit' });
  await wait(1200);

  // ── Scene 11: StopFailure ─────────────────────────────────────────────────
  // StopFailure fires when the turn is cut short by a rate limit or billing
  // error rather than a clean Claude stop.
  console.log('\n11. StopFailure (rate limit)');
  await post({ type: 'user_prompt', sessionId: SID_A, label: LABEL_A,
               text: 'One more thing…' });
  await wait(800);
  await post({ type: 'tool_use', sessionId: SID_A, label: LABEL_A,
               tool: 'WebFetch', params: { url: 'https://example.com' } });
  await wait(700);
  await post({ type: 'stop_failure', sessionId: SID_A, label: LABEL_A,
               text: 'Rate limit exceeded — try again shortly' });
  await wait(2000);

  // ── Scene 12: New session, then trim ─────────────────────────────────────
  // SID_B ended cleanly in Scene 10.  Start it again then trim — keeping only
  // the most-recently-active session and clearing all logs.
  console.log('\n12. New session, then trim to latest');
  await post({ type: 'session_start', sessionId: SID_B, label: LABEL_B,
               text: 'startup', model: 'claude-sonnet-4-6' });
  await wait(600);
  await post({ type: 'user_prompt', sessionId: SID_B, label: LABEL_B,
               text: 'Quick question' });
  await wait(600);
  await post({ type: 'stop', sessionId: SID_B, label: LABEL_B,
               tokens: { input: 800, output: 200 } });
  await wait(800);

  // ── Cleanup: end both sessions ────────────────────────────────────────────
  console.log('\n13. End both sessions');
  await post({ type: 'session_end', sessionId: SID_A, label: LABEL_A,
               text: 'user_exit' });
  await wait(600);
  await post({ type: 'session_end', sessionId: SID_B, label: LABEL_B,
               text: 'user_exit' });
  await wait(1200);

  console.log('\n─────────────────────────────────────────────────────────\n');
  console.log('Done. Run  node scripts/demo.js  again to replay.');
  console.log('Commands:');
  console.log('  "Claude Stage: Clear Stage"    — remove all figures and reset');
  console.log('  "Claude Stage: Trim Sessions"  — keep latest session, clear logs\n');
}

run().catch(console.error);
