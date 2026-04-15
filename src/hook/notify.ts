import * as http from 'http';
import * as fs   from 'fs';

const PORT = 7891;

export interface HookData {
  // ── Common fields present on every Claude Code hook ──────────────────────
  session_id?:        string;
  cwd?:               string;
  hook_event_name?:   string;
  permission_mode?:   string;    // "default"|"auto"|"acceptEdits"|"bypassPermissions"|"plan"
  transcript_path?:   string;
  // Subagent context
  agent_id?:          string;
  agent_type?:        string;

  // ── PreToolUse / PostToolUse / PostToolUseFailure / PermissionRequest / PermissionDenied ──
  tool_name?:         string;
  tool_input?:        Record<string, unknown>;
  tool_response?:     { is_error?: boolean; success?: boolean; [key: string]: unknown };
  tool_use_id?:       string;

  // ── PostToolUseFailure ────────────────────────────────────────────────────
  error?:             string;
  is_interrupt?:      boolean;

  // ── PermissionDenied ─────────────────────────────────────────────────────
  reason?:            string;

  // ── UserPromptSubmit ─────────────────────────────────────────────────────
  prompt?:            string;

  // ── Stop / SubagentStop ───────────────────────────────────────────────────
  stop_hook_active?:  boolean;

  // ── SubagentStop ─────────────────────────────────────────────────────────
  agent_transcript_path?:  string;
  last_assistant_message?: string;

  // ── Notification ─────────────────────────────────────────────────────────
  notification_type?: string;
  message?:           string;
  title?:             string;

  // ── SessionStart / SessionEnd ─────────────────────────────────────────────
  source?:            string;    // start: "startup"|"resume"|"clear"|"compact" / end reason
  model?:             string;

  // ── InstructionsLoaded ────────────────────────────────────────────────────
  file_path?:         string;
  memory_type?:       string;    // "User"|"Project"|"Local"|"Managed"
  load_reason?:       string;    // "session_start"|"nested_traversal"|"path_glob_match"|"include"|"compact"

  // ── FileChanged ───────────────────────────────────────────────────────────
  change_type?:       string;    // "modified"|"created"|"deleted"

  // ── CwdChanged ────────────────────────────────────────────────────────────
  new_cwd?:           string;
  previous_cwd?:      string;

  // ── ConfigChange ─────────────────────────────────────────────────────────
  config_source?:     string;    // "user_settings"|"project_settings"|"local_settings"|"policy_settings"|"skills"
  changed_keys?:      string[];

  // ── WorktreeCreate / WorktreeRemove ───────────────────────────────────────
  worktree_path?:     string;
  branch?:            string;
  commit?:            string;
  removal_reason?:    string;    // "session_exit"|"subagent_finish"

  // ── PreCompact / PostCompact ──────────────────────────────────────────────
  trigger?:                string;    // "manual"|"auto"
  transcript_size_before?: number;
  transcript_size_after?:  number;

  // ── TeammateIdle / TaskCreated / TaskCompleted ────────────────────────────
  teammate_name?:     string;
  team_name?:         string;
  task_id?:           string;
  task_subject?:      string;
  task_description?:  string;

  // ── Elicitation / ElicitationResult ──────────────────────────────────────
  mcp_server_name?:   string;
  form_fields?:       Array<{ name: string; type: string; label: string; description?: string }>;
  action?:            string;    // "accept"|"decline"|"cancel"
  content?:           Record<string, unknown>;
}

export interface ClaudeStageEvent {
  type:         string;
  timestamp:    number;
  sessionId:    string;
  label?:       string;
  tool?:        string;
  params?:      Record<string, unknown>;
  success?:     boolean;
  text?:        string;
  tokens?:      { input: number; output: number };
  notifType?:   string;
  model?:       string;        // SessionStart
  permMode?:    string;        // permission_mode
  agentId?:     string;        // SubagentStart/Stop
  agentType?:   string;        // SubagentStart/Stop
  error?:       string;        // PostToolUseFailure
  isInterrupt?: boolean;       // PostToolUseFailure
  trigger?:     string;        // PreCompact/PostCompact: "manual"|"auto"
  mcpServer?:   string;        // Elicitation/ElicitationResult
  mcpAction?:   string;        // ElicitationResult: "accept"|"decline"|"cancel"
  taskSubject?: string;        // TaskCreated/TaskCompleted
}

export function buildEvent(type: string, hookData: HookData): ClaudeStageEvent | null {
  const cwd = hookData.cwd ?? process.cwd();
  const event: ClaudeStageEvent = {
    type,
    timestamp:  Date.now(),
    sessionId:  hookData.session_id ?? cwd,
    label:      cwd.replace(/.*[\\/]/, '') || undefined,
    permMode:   hookData.permission_mode,
  };

  if (type === 'tool_use') {
    event.tool   = hookData.tool_name;
    event.params = hookData.tool_input ?? {};
    if (hookData.agent_id) event.agentId = hookData.agent_id;

  } else if (type === 'tool_result') {
    const toolName = hookData.tool_name;
    const resp     = hookData.tool_response;
    const success  = !resp || (resp.is_error !== true && resp.success !== false);
    if (toolName === 'Agent') {
      event.type    = 'agent_done';
      event.success = success;
      const prompt = hookData.tool_input?.['prompt'];
      if (prompt != null) event.text = String(prompt).slice(0, 300);
    } else {
      event.tool    = toolName;
      event.success = success;
    }
    if (hookData.agent_id) event.agentId = hookData.agent_id;

  } else if (type === 'tool_failure') {
    event.tool        = hookData.tool_name;
    event.success     = false;
    event.error       = hookData.error ?? 'Tool execution failed';
    event.isInterrupt = hookData.is_interrupt ?? false;
    event.params      = hookData.tool_input;
    if (hookData.agent_id) event.agentId = hookData.agent_id;

  } else if (type === 'permission_denied') {
    event.tool    = hookData.tool_name;
    event.params  = hookData.tool_input;
    event.text    = hookData.reason ?? 'Auto mode denied';
    if (hookData.agent_id) event.agentId = hookData.agent_id;

  } else if (type === 'subagent_start') {
    event.agentId   = hookData.agent_id;
    event.agentType = hookData.agent_type;

  } else if (type === 'subagent_stop') {
    event.agentId   = hookData.agent_id;
    event.agentType = hookData.agent_type;
    event.text      = hookData.last_assistant_message ?? '';

  } else if (type === 'session_end') {
    event.text = hookData.source ?? 'other';

  } else if (type === 'user_prompt') {
    const text = (hookData.prompt ?? '').trim();
    if (/^<[a-zA-Z_]/.test(text)) return null;
    event.text = hookData.prompt ?? '';

  } else if (type === 'permission_request') {
    event.type      = 'permission';
    event.tool      = hookData.tool_name;
    event.params    = hookData.tool_input;
    event.notifType = 'permission_request';
    if (hookData.agent_id) event.agentId = hookData.agent_id;
    const toolParam = hookData.tool_input
      ? String(hookData.tool_input['command'] ?? hookData.tool_input['file_path'] ?? Object.values(hookData.tool_input)[0] ?? '')
      : '';
    event.text = toolParam
      ? `Allow ${hookData.tool_name ?? 'tool'}: ${toolParam}`
      : `Allow ${hookData.tool_name ?? 'tool'}?`;

  } else if (type === 'notification') {
    const nt = hookData.notification_type ?? '';
    if (nt === 'idle_prompt') return null;
    if (nt === 'permission_prompt' || nt === 'elicitation_dialog') {
      event.type      = 'permission';
      event.text      = hookData.message ?? hookData.title ?? 'Permission needed';
      event.notifType = nt;
    } else {
      event.text      = hookData.message ?? (nt || 'Notification');
      event.notifType = nt;
    }

  } else if (type === 'session_start') {
    event.text  = hookData.source ?? 'startup';
    event.model = hookData.model;

  } else if (type === 'stop_failure') {
    event.text = hookData.message ?? '';

  } else if (type === 'stop') {
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
              event.tokens = { input: usage['input_tokens'] ?? 0, output: usage['output_tokens'] ?? 0 };
              break;
            }
          } catch { /* malformed line, skip */ }
        }
      } catch { /* file unreadable, skip */ }
    }

  } else if (type === 'instructions_loaded') {
    // InstructionsLoaded: which CLAUDE.md / rules file was loaded and why
    const fileName = (hookData.file_path ?? '').replace(/.*[\\/]/, '');
    event.text = `${fileName} (${hookData.memory_type ?? '?'}, ${hookData.load_reason ?? '?'})`;

  } else if (type === 'file_changed') {
    event.text = `${hookData.file_path ?? '?'} ${hookData.change_type ?? 'changed'}`;

  } else if (type === 'cwd_changed') {
    // new_cwd goes into label so the session figure updates its display name
    const newLabel = (hookData.new_cwd ?? '').replace(/.*[\\/]/, '') || undefined;
    event.label = newLabel;
    event.text  = hookData.new_cwd ?? '';

  } else if (type === 'config_change') {
    const src  = hookData.config_source ?? 'unknown';
    const keys = hookData.changed_keys?.length ? ` [${hookData.changed_keys.join(', ')}]` : '';
    event.text = `${src}${keys}`;

  } else if (type === 'worktree_create') {
    event.text = hookData.worktree_path ?? '';

  } else if (type === 'worktree_remove') {
    event.text = `${hookData.worktree_path ?? ''} (${hookData.removal_reason ?? 'removed'})`;

  } else if (type === 'pre_compact') {
    event.trigger = hookData.trigger ?? 'auto';
    event.text    = hookData.trigger ?? 'auto';

  } else if (type === 'post_compact') {
    event.trigger = hookData.trigger ?? 'auto';
    const before  = hookData.transcript_size_before;
    const after   = hookData.transcript_size_after;
    event.text    = before != null && after != null
      ? `${hookData.trigger ?? 'auto'} (${before}→${after} tokens)`
      : hookData.trigger ?? 'auto';

  } else if (type === 'teammate_idle') {
    event.text = hookData.teammate_name
      ? `${hookData.teammate_name} (${hookData.team_name ?? 'unknown team'})`
      : hookData.team_name ?? 'teammate';

  } else if (type === 'task_created') {
    event.taskSubject = hookData.task_subject;
    event.text        = hookData.task_subject ?? hookData.task_id ?? 'task';

  } else if (type === 'task_completed') {
    event.taskSubject = hookData.task_subject;
    event.text        = hookData.task_subject ?? hookData.task_id ?? 'task';

  } else if (type === 'elicitation') {
    // MCP server requesting user input — treat like a permission prompt
    event.type      = 'permission';
    event.mcpServer = hookData.mcp_server_name;
    event.notifType = 'elicitation';
    const fields    = (hookData.form_fields ?? []).map(f => f.label || f.name).join(', ');
    event.text      = fields
      ? `${hookData.mcp_server_name ?? 'MCP'} needs: ${fields}`
      : `${hookData.mcp_server_name ?? 'MCP'} needs input`;
    event.tool      = hookData.tool_name;

  } else if (type === 'elicitation_result') {
    event.mcpServer = hookData.mcp_server_name;
    event.mcpAction = hookData.action ?? 'unknown';
    const summary   = hookData.content
      ? Object.entries(hookData.content).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')
      : '';
    event.text = summary
      ? `${hookData.mcp_server_name ?? 'MCP'} ${hookData.action}: ${summary}`
      : `${hookData.mcp_server_name ?? 'MCP'} ${hookData.action ?? 'responded'}`;
  }

  return event;
}

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
