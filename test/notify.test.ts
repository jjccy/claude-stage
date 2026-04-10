import * as os   from 'os';
import * as fs   from 'fs';
import * as path from 'path';
import { buildEvent, HookData } from '../src/hook/notify';

describe('buildEvent', () => {

  describe('tool_use', () => {
    it('sets type, tool, phase=pre, and params from hook data', () => {
      const ev = buildEvent('tool_use', {
        tool_name:  'Bash',
        tool_input: { command: 'ls -la' },
      })!;
      expect(ev.type).toBe('tool_use');
      expect(ev.tool).toBe('Bash');
      expect(ev.params).toEqual({ command: 'ls -la' });
    });

    it('defaults params to {} when tool_input is absent', () => {
      const ev = buildEvent('tool_use', { tool_name: 'Read' })!;
      expect(ev.params).toEqual({});
    });
  });

  describe('tool_result', () => {
    it('sets success=true when is_error is false', () => {
      const ev = buildEvent('tool_result', {
        tool_name:     'Bash',
        tool_response: { output: 'ok', is_error: false },
      })!;
      expect(ev.success).toBe(true);
    });

    it('sets success=false when is_error is true', () => {
      const ev = buildEvent('tool_result', {
        tool_name:     'Bash',
        tool_response: { output: 'command not found', is_error: true },
      })!;
      expect(ev.success).toBe(false);
    });

    it('sets success=false when tool_response.success is false', () => {
      const ev = buildEvent('tool_result', {
        tool_name:     'Write',
        tool_response: { success: false },
      })!;
      expect(ev.success).toBe(false);
    });

    it('defaults success=true when tool_response is absent', () => {
      const ev = buildEvent('tool_result', { tool_name: 'Read' })!;
      expect(ev.success).toBe(true);
    });

    it('emits agent_done type for Agent tool', () => {
      const ev = buildEvent('tool_result', {
        tool_name:     'Agent',
        tool_response: { is_error: false },
      })!;
      expect(ev.type).toBe('agent_done');
      expect(ev.success).toBe(true);
    });

    it('emits agent_done with success=false when Agent tool errors', () => {
      const ev = buildEvent('tool_result', {
        tool_name:     'Agent',
        tool_response: { is_error: true },
      })!;
      expect(ev.type).toBe('agent_done');
      expect(ev.success).toBe(false);
    });
  });

  describe('user_prompt', () => {
    it('copies prompt into text', () => {
      const ev = buildEvent('user_prompt', { prompt: 'Hello world' })!;
      expect(ev.type).toBe('user_prompt');
      expect(ev.text).toBe('Hello world');
    });

    it('defaults text to empty string when prompt is absent', () => {
      const ev = buildEvent('user_prompt', {})!;
      expect(ev.text).toBe('');
    });

    it('returns null for XML-tagged system inputs (sub-agent tasks)', () => {
      expect(buildEvent('user_prompt', { prompt: '<task>do something</task>' })).toBeNull();
    });

    it('returns null for IDE context injections', () => {
      expect(buildEvent('user_prompt', { prompt: '<ide_opened_file>src/foo.ts</ide_opened_file>' })).toBeNull();
    });

    it('does not filter prompts that merely contain XML (not starting with it)', () => {
      const ev = buildEvent('user_prompt', { prompt: 'fix the <b>bug</b>' })!;
      expect(ev).not.toBeNull();
      expect(ev.text).toBe('fix the <b>bug</b>');
    });
  });

  describe('stop', () => {
    function makeTranscript(lines: unknown[]): string {
      const p = path.join(os.tmpdir(), `transcript-${Date.now()}.jsonl`);
      fs.writeFileSync(p, lines.map(l => JSON.stringify(l)).join('\n'));
      return p;
    }

    it('reads token usage from transcript_path if available', () => {
      const p = makeTranscript([
        { type: 'human',     message: { role: 'user', content: 'hi' } },
        { type: 'assistant', message: { role: 'assistant', content: 'hello',
            usage: { input_tokens: 1500, output_tokens: 300 } } },
      ]);
      const ev = buildEvent('stop', { transcript_path: p })!;
      fs.unlinkSync(p);
      expect(ev.tokens).toEqual({ input: 1500, output: 300 });
    });

    it('omits tokens when transcript_path is absent', () => {
      const ev = buildEvent('stop', {})!;
      expect(ev.tokens).toBeUndefined();
    });

    it('omits tokens when transcript has no usage data', () => {
      const p = makeTranscript([{ type: 'human', message: {} }]);
      const ev = buildEvent('stop', { transcript_path: p })!;
      fs.unlinkSync(p);
      expect(ev.tokens).toBeUndefined();
    });

    it('omits tokens when transcript file does not exist', () => {
      const ev = buildEvent('stop', { transcript_path: '/nonexistent/path.jsonl' })!;
      expect(ev.tokens).toBeUndefined();
    });
  });

  it('always includes a numeric timestamp', () => {
    const before = Date.now();
    const ev     = buildEvent('stop', {} as HookData)!;
    expect(typeof ev.timestamp).toBe('number');
    expect(ev.timestamp).toBeGreaterThanOrEqual(before);
  });

  it('uses session_id from hookData when present', () => {
    const ev = buildEvent('stop', { session_id: 'abc-123' } as HookData)!;
    expect(ev.sessionId).toBe('abc-123');
  });

  it('falls back to process.cwd() when session_id is absent', () => {
    const ev = buildEvent('stop', {} as HookData)!;
    expect(ev.sessionId).toBe(process.cwd());
  });

  describe('label', () => {
    it('derives label from the last path segment of cwd', () => {
      const ev = buildEvent('stop', { cwd: '/home/user/my-project' })!;
      expect(ev.label).toBe('my-project');
    });

    it('works with Windows-style backslash paths', () => {
      const ev = buildEvent('stop', { cwd: 'C:\\Users\\dev\\my-project' })!;
      expect(ev.label).toBe('my-project');
    });

    it('falls back to process.cwd() last segment when cwd is absent', () => {
      const ev = buildEvent('stop', {})!;
      const expected = process.cwd().replace(/.*[\\/]/, '') || undefined;
      expect(ev.label).toBe(expected);
    });
  });

  describe('notification', () => {
    it('returns null for idle_prompt (not useful to visualise)', () => {
      expect(buildEvent('notification', { notification_type: 'idle_prompt' })).toBeNull();
    });

    it('maps permission_prompt to type=permission', () => {
      const ev = buildEvent('notification', {
        notification_type: 'permission_prompt',
        message: 'Allow Bash?',
      })!;
      expect(ev.type).toBe('permission');
      expect(ev.text).toBe('Allow Bash?');
      expect(ev.notifType).toBe('permission_prompt');
    });

    it('uses title as text fallback when message is absent (permission_prompt)', () => {
      const ev = buildEvent('notification', {
        notification_type: 'permission_prompt',
        title: 'Permission needed',
      })!;
      expect(ev.text).toBe('Permission needed');
    });

    it('Notification hook for permission_prompt does NOT carry tool or params', () => {
      // The Notification hook only sends message/title — no tool details.
      // Tool details come from the PermissionRequest hook instead.
      const ev = buildEvent('notification', {
        notification_type: 'permission_prompt',
        message: 'Allow Bash?',
      })!;
      expect(ev.tool).toBeUndefined();
      expect(ev.params).toBeUndefined();
    });

    it('maps elicitation_dialog to type=permission', () => {
      const ev = buildEvent('notification', {
        notification_type: 'elicitation_dialog',
        message: 'Provide input',
      })!;
      expect(ev.type).toBe('permission');
    });

    it('emits type=notification for auth_success', () => {
      const ev = buildEvent('notification', {
        notification_type: 'auth_success',
        message: 'Authenticated',
      })!;
      expect(ev.type).toBe('notification');
      expect(ev.text).toBe('Authenticated');
      expect(ev.notifType).toBe('auth_success');
    });

    it('uses notification_type as text fallback when message is absent', () => {
      const ev = buildEvent('notification', { notification_type: 'auth_success' })!;
      expect(ev.text).toBe('auth_success');
    });

    it('uses generic fallback when both message and notification_type are absent', () => {
      const ev = buildEvent('notification', {})!;
      expect(ev.type).toBe('notification');
      expect(ev.text).toBe('Notification');
    });
  });

  describe('permission_request', () => {
    it('maps to type=permission and forwards tool_name and tool_input', () => {
      const ev = buildEvent('permission_request', {
        tool_name:  'Bash',
        tool_input: { command: 'rm -rf dist/' },
      })!;
      expect(ev.type).toBe('permission');
      expect(ev.tool).toBe('Bash');
      expect(ev.params).toEqual({ command: 'rm -rf dist/' });
      expect(ev.notifType).toBe('permission_request');
    });

    it('builds text from command param', () => {
      const ev = buildEvent('permission_request', {
        tool_name:  'Bash',
        tool_input: { command: 'npm test' },
      })!;
      expect(ev.text).toBe('Allow Bash: npm test');
    });

    it('builds text from file_path param', () => {
      const ev = buildEvent('permission_request', {
        tool_name:  'Write',
        tool_input: { file_path: '/etc/hosts' },
      })!;
      expect(ev.text).toBe('Allow Write: /etc/hosts');
    });

    it('falls back to generic text when tool_input is absent', () => {
      const ev = buildEvent('permission_request', { tool_name: 'Bash' })!;
      expect(ev.text).toBe('Allow Bash?');
    });

    it('falls back to generic text when tool_name is absent', () => {
      const ev = buildEvent('permission_request', {})!;
      expect(ev.text).toBe('Allow tool?');
    });
  });

  describe('session_start', () => {
    it('stores source in text', () => {
      const ev = buildEvent('session_start', { source: 'resume' })!;
      expect(ev.type).toBe('session_start');
      expect(ev.text).toBe('resume');
    });

    it('defaults text to "startup" when source is absent', () => {
      const ev = buildEvent('session_start', {})!;
      expect(ev.text).toBe('startup');
    });

    it('forwards model field', () => {
      const ev = buildEvent('session_start', { source: 'startup', model: 'claude-sonnet-4-6' })!;
      expect(ev.model).toBe('claude-sonnet-4-6');
    });
  });

  describe('session_end', () => {
    it('stores end reason in text', () => {
      const ev = buildEvent('session_end', { source: 'logout' })!;
      expect(ev.type).toBe('session_end');
      expect(ev.text).toBe('logout');
    });

    it('defaults text to "other" when source is absent', () => {
      const ev = buildEvent('session_end', {})!;
      expect(ev.text).toBe('other');
    });
  });

  describe('tool_failure', () => {
    it('sets success=false and forwards error message', () => {
      const ev = buildEvent('tool_failure', {
        tool_name:    'Bash',
        tool_input:   { command: 'npm test' },
        error:        'Command exited with code 1',
        is_interrupt: false,
      })!;
      expect(ev.type).toBe('tool_failure');
      expect(ev.tool).toBe('Bash');
      expect(ev.success).toBe(false);
      expect(ev.error).toBe('Command exited with code 1');
      expect(ev.isInterrupt).toBe(false);
      expect(ev.params).toEqual({ command: 'npm test' });
    });

    it('sets isInterrupt=true when tool was interrupted', () => {
      const ev = buildEvent('tool_failure', {
        tool_name:    'Bash',
        is_interrupt: true,
      })!;
      expect(ev.isInterrupt).toBe(true);
    });

    it('uses fallback error text when error field is absent', () => {
      const ev = buildEvent('tool_failure', { tool_name: 'Read' })!;
      expect(ev.error).toBe('Tool execution failed');
    });
  });

  describe('permission_denied', () => {
    it('forwards tool_name, tool_input, and reason', () => {
      const ev = buildEvent('permission_denied', {
        tool_name:  'Bash',
        tool_input: { command: 'rm -rf /' },
        reason:     'Auto mode denied: command targets root directory',
      })!;
      expect(ev.type).toBe('permission_denied');
      expect(ev.tool).toBe('Bash');
      expect(ev.params).toEqual({ command: 'rm -rf /' });
      expect(ev.text).toBe('Auto mode denied: command targets root directory');
    });

    it('falls back to generic text when reason is absent', () => {
      const ev = buildEvent('permission_denied', { tool_name: 'Bash' })!;
      expect(ev.text).toBe('Auto mode denied');
    });
  });

  describe('subagent_start', () => {
    it('forwards agent_id and agent_type', () => {
      const ev = buildEvent('subagent_start', {
        agent_id:   'agent-abc123',
        agent_type: 'Explore',
      })!;
      expect(ev.type).toBe('subagent_start');
      expect(ev.agentId).toBe('agent-abc123');
      expect(ev.agentType).toBe('Explore');
    });
  });

  describe('subagent_stop', () => {
    it('forwards agent_id, agent_type, and last_assistant_message', () => {
      const ev = buildEvent('subagent_stop', {
        agent_id:               'agent-abc123',
        agent_type:             'Explore',
        last_assistant_message: 'Found 12 TypeScript files matching the pattern.',
      })!;
      expect(ev.type).toBe('subagent_stop');
      expect(ev.agentId).toBe('agent-abc123');
      expect(ev.agentType).toBe('Explore');
      expect(ev.text).toBe('Found 12 TypeScript files matching the pattern.');
    });

    it('uses empty string when last_assistant_message is absent', () => {
      const ev = buildEvent('subagent_stop', { agent_id: 'agent-xyz' })!;
      expect(ev.text).toBe('');
    });
  });

  describe('common fields', () => {
    it('forwards permission_mode to permMode', () => {
      const ev = buildEvent('stop', { permission_mode: 'auto' } as any)!;
      expect(ev.permMode).toBe('auto');
    });

    it('omits permMode when permission_mode is absent', () => {
      const ev = buildEvent('stop', {})!;
      expect(ev.permMode).toBeUndefined();
    });
  });

  describe('stop_failure', () => {
    it('sets type=stop_failure', () => {
      const ev = buildEvent('stop_failure', {})!;
      expect(ev.type).toBe('stop_failure');
    });

    it('stores message in text when present', () => {
      const ev = buildEvent('stop_failure', { message: 'Rate limit exceeded' })!;
      expect(ev.text).toBe('Rate limit exceeded');
    });
  });

  describe('pre_compact', () => {
    it('stores trigger in text and trigger field', () => {
      const ev = buildEvent('pre_compact', { trigger: 'manual' })!;
      expect(ev.type).toBe('pre_compact');
      expect(ev.trigger).toBe('manual');
      expect(ev.text).toBe('manual');
    });

    it('defaults trigger to "auto"', () => {
      const ev = buildEvent('pre_compact', {})!;
      expect(ev.trigger).toBe('auto');
    });
  });

  describe('post_compact', () => {
    it('includes before/after token sizes when both present', () => {
      const ev = buildEvent('post_compact', {
        trigger: 'auto',
        transcript_size_before: 50000,
        transcript_size_after:  8000,
      })!;
      expect(ev.type).toBe('post_compact');
      expect(ev.trigger).toBe('auto');
      expect(ev.text).toContain('50000');
      expect(ev.text).toContain('8000');
    });

    it('falls back to just trigger when sizes are absent', () => {
      const ev = buildEvent('post_compact', { trigger: 'manual' })!;
      expect(ev.text).toBe('manual');
    });
  });

  describe('elicitation', () => {
    it('maps to type=permission and captures mcp_server_name and form fields', () => {
      const ev = buildEvent('elicitation', {
        mcp_server_name: 'my-mcp',
        tool_name:       'create_task',
        form_fields:     [{ name: 'title', type: 'string', label: 'Task title' }],
      })!;
      expect(ev.type).toBe('permission');
      expect(ev.notifType).toBe('elicitation');
      expect(ev.mcpServer).toBe('my-mcp');
      expect(ev.tool).toBe('create_task');
      expect(ev.text).toContain('Task title');
    });

    it('falls back to generic text when no form fields', () => {
      const ev = buildEvent('elicitation', { mcp_server_name: 'srv' })!;
      expect(ev.text).toBe('srv needs input');
    });
  });

  describe('elicitation_result', () => {
    it('captures mcp_server_name, action, and content', () => {
      const ev = buildEvent('elicitation_result', {
        mcp_server_name: 'my-mcp',
        action:          'accept',
        content:         { title: 'Fix the bug' },
      })!;
      expect(ev.type).toBe('elicitation_result');
      expect(ev.mcpServer).toBe('my-mcp');
      expect(ev.mcpAction).toBe('accept');
      expect(ev.text).toContain('Fix the bug');
    });

    it('handles decline with no content', () => {
      const ev = buildEvent('elicitation_result', {
        mcp_server_name: 'srv',
        action:          'decline',
      })!;
      expect(ev.mcpAction).toBe('decline');
    });
  });

  describe('cwd_changed', () => {
    it('sets label from new_cwd and text to the full new path', () => {
      const ev = buildEvent('cwd_changed', {
        new_cwd:      '/home/user/other-project',
        previous_cwd: '/home/user/my-project',
      })!;
      expect(ev.type).toBe('cwd_changed');
      expect(ev.label).toBe('other-project');
      expect(ev.text).toBe('/home/user/other-project');
    });
  });

  describe('instructions_loaded', () => {
    it('builds text from file name, memory type, and load reason', () => {
      const ev = buildEvent('instructions_loaded', {
        file_path:   '/home/user/project/CLAUDE.md',
        memory_type: 'Project',
        load_reason: 'session_start',
      })!;
      expect(ev.type).toBe('instructions_loaded');
      expect(ev.text).toContain('CLAUDE.md');
      expect(ev.text).toContain('Project');
      expect(ev.text).toContain('session_start');
    });
  });

  describe('file_changed', () => {
    it('combines file_path and change_type', () => {
      const ev = buildEvent('file_changed', {
        file_path:   '/project/.env',
        change_type: 'modified',
      })!;
      expect(ev.text).toContain('.env');
      expect(ev.text).toContain('modified');
    });
  });

  describe('config_change', () => {
    it('captures config_source and changed_keys', () => {
      const ev = buildEvent('config_change', {
        config_source: 'local_settings',
        changed_keys:  ['permissions', 'model'],
      })!;
      expect(ev.text).toContain('local_settings');
      expect(ev.text).toContain('permissions');
    });

    it('works with no changed_keys', () => {
      const ev = buildEvent('config_change', { config_source: 'user_settings' })!;
      expect(ev.text).toBe('user_settings');
    });
  });

  describe('worktree_create', () => {
    it('stores worktree_path in text', () => {
      const ev = buildEvent('worktree_create', { worktree_path: '/tmp/wt-abc' })!;
      expect(ev.text).toBe('/tmp/wt-abc');
    });
  });

  describe('worktree_remove', () => {
    it('includes removal_reason in text', () => {
      const ev = buildEvent('worktree_remove', {
        worktree_path:  '/tmp/wt-abc',
        removal_reason: 'session_exit',
      })!;
      expect(ev.text).toContain('/tmp/wt-abc');
      expect(ev.text).toContain('session_exit');
    });
  });

  describe('teammate_idle', () => {
    it('combines teammate_name and team_name', () => {
      const ev = buildEvent('teammate_idle', {
        teammate_name: 'implementer',
        team_name:     'my-team',
      })!;
      expect(ev.text).toContain('implementer');
      expect(ev.text).toContain('my-team');
    });
  });

  describe('task_created', () => {
    it('stores task_subject in text and taskSubject', () => {
      const ev = buildEvent('task_created', {
        task_id:      'task-001',
        task_subject: 'Implement auth',
      })!;
      expect(ev.type).toBe('task_created');
      expect(ev.taskSubject).toBe('Implement auth');
      expect(ev.text).toBe('Implement auth');
    });

    it('falls back to task_id when subject is absent', () => {
      const ev = buildEvent('task_created', { task_id: 'task-002' })!;
      expect(ev.text).toBe('task-002');
    });
  });

  describe('task_completed', () => {
    it('stores task_subject in text and taskSubject', () => {
      const ev = buildEvent('task_completed', {
        task_id:      'task-001',
        task_subject: 'Implement auth',
      })!;
      expect(ev.type).toBe('task_completed');
      expect(ev.taskSubject).toBe('Implement auth');
    });
  });

});
