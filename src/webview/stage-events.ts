// ── Claude Stage – event routing & handling ───────────────────────────────────

// ── Agent event routing ───────────────────────────────────────────────────────

/** Handle tool events that originated inside a subagent, routing to its figure.
 *  Returns true if the event was handled, false if no figure is mapped yet. */
function routeAgentEvent(event: StageEvent): boolean {
  const figId = event.agentId ? agentIdToFigureId.get(event.agentId) : undefined;
  if (!figId) return false;
  const fig = figures.get(figId);
  if (!fig) return false;

  switch (event.type) {
    case 'tool_use': {
      const tool     = event.tool ?? 'Unknown';
      const emoji    = TOOL_EMOJI[tool]  ?? TOOL_EMOJI['default'];
      const action   = TOOL_ACTION[tool] ?? 'running';
      const param    = getToolParam(tool, event.params);
      const paramLog = getToolParamLog(tool, event.params);
      setState(fig, action);
      showBubble(fig, `${emoji} ${param}`);
      addLog(`AGENT TOOL: ${tool} ${paramLog}`, 'agent');
      break;
    }
    case 'tool_result': {
      const success = event.success !== false;
      flashFigure(fig, success);
      clearBubble(fig);
      if (success) {
        setState(fig, 'thinking');
      } else {
        setState(fig, 'error');
        setTimeout(() => { if (fig.state === 'error') setState(fig, 'thinking'); }, 1500);
      }
      addLog(`${success ? 'DONE' : 'ERR'} AGENT: ${event.tool ?? 'tool'}`, success ? 'agent' : 'error');
      break;
    }
    case 'tool_failure': {
      flashFigure(fig, false);
      setState(fig, 'error');
      setTimeout(() => { if (fig.state === 'error') setState(fig, 'thinking'); }, 1500);
      addLog(`FAIL AGENT: ${event.tool ?? 'tool'} — ${event.error ?? ''}`, 'error');
      break;
    }
    case 'permission': {
      setState(fig, 'waiting');
      showBubble(fig, `⚠️ ${truncate(event.text ?? 'Permission needed', 40)}`);
      addLog(`PERM AGENT [${event.tool ?? 'tool'}]: ${event.text ?? ''}`, 'error');
      break;
    }
    case 'permission_denied': {
      flashFigure(fig, false);
      setState(fig, 'thinking');
      showBubble(fig, `🚫 ${truncate(event.tool ?? 'tool', 20)}`);
      setTimeout(() => clearBubble(fig), 3000);
      addLog(`DENIED AGENT [${event.tool ?? 'tool'}]: ${event.text ?? ''}`, 'error');
      break;
    }
    default:
      return false;
  }
  return true;
}

// ── Event handler ─────────────────────────────────────────────────────────────

function handleEvent(event: StageEvent): void {
  // Events from subagent sessions carry agent_id. Route tool/permission events
  // to the agent's figure; suppress session lifecycle to avoid ghost Claude figures.
  if (event.agentId) {
    if (routeAgentEvent(event)) return;
    if (event.type === 'session_start' || event.type === 'session_end' ||
        event.type === 'stop' || event.type === 'stop_failure') return;
  }

  const sid     = event.sessionId ?? 'default';
  const session = getOrCreateSession(sid, event.label);
  touchSession(session);
  const claude  = figures.get(session.claudeId)!;
  const sLabel  = sessionLabel(sid);

  switch (event.type) {

    case 'user_prompt': {
      // Clear agents from the previous turn before starting the new one.
      figures.forEach((_, id) => {
        if (id.startsWith(`agent:${sid}:`)) removeFigureAnimated(id);
      });
      session.agentLayout.clear();
      session.agentCount = 0;

      const user = ensureFigure('user', 'user', 'User', USER_SLOT);
      setState(user, 'idle');
      showBubble(user, truncate(event.text ?? 'Request', 30));
      setState(claude, 'thinking');
      showBubble(claude, '...', true);
      setStatus(`[${sLabel}] User sent a request`, 'active');
      addLog(`USER → ${sLabel}: ${event.text ?? ''}`, 'user');
      setTimeout(() => clearBubble(user), 3000);
      break;
    }

    case 'tool_use': {
      const tool   = event.tool ?? 'Unknown';
      const emoji  = TOOL_EMOJI[tool]  ?? TOOL_EMOJI['default'];
      const action = TOOL_ACTION[tool] ?? 'running';

      if (tool === 'Agent') {
        const agentIdx = session.agentCount;
        session.agentCount++;

        // Force layout: add item, re-settle, redistribute all existing agents.
        session.agentLayout.add();
        const positions = session.agentLayout.positions();

        for (let i = 0; i < agentIdx; i++) {
          const existing = figures.get(`agent:${sid}:${i}`);
          if (existing) moveFigure(existing, positions[i]);
        }

        // Spawn new agent at its settled position; tag it with its task prompt
        // so agent_done can match the right figure when agents complete out of order.
        const agentId = `agent:${sid}:${agentIdx}`;
        const agent   = ensureFigure(agentId, 'agent', `Agent ${session.agentCount}`, positions[agentIdx]);
        if (event.params?.['prompt']) agent.prompt = String(event.params['prompt']).slice(0, 300);
        session.pendingAgentFigures.push(agentId);
        setState(agent, 'spawning');
        setTimeout(() => { setState(agent, 'thinking'); }, 600);

        showBubble(claude, `${emoji} Spawning agent`);
        setStatus(`[${sLabel}] Spawning agent #${session.agentCount}`, 'active');
        addLog(`AGENT [${sLabel}]: spawning #${session.agentCount}`, 'agent');

      } else {
        const param    = getToolParam(tool, event.params);
        const paramLog = getToolParamLog(tool, event.params);

        if (session.permissionPending) {
          // permission_prompt fires before PreToolUse — keep "waiting" state and
          // update the bubble to show which tool is awaiting approval.
          showBubble(claude, `⚠️ ${emoji} ${param || tool}`);
          setStatus(`[${sLabel}] Awaiting approval: ${tool} ${param}`, 'error');
        } else {
          setState(claude, action);
          showBubble(claude, `${emoji} ${param}`);
          setStatus(`[${sLabel}] ${tool}: ${param}`, 'active');
        }
        addLog(`TOOL [${sLabel}]: ${tool} ${paramLog}`, 'tool');

        // Watchdog: if tool_result never arrives (e.g. hook POST failed silently),
        // reset the figure after 5 minutes so it doesn't stay stuck in "running".
        if (session.toolWatchdog !== undefined) clearTimeout(session.toolWatchdog);
        session.toolWatchdog = window.setTimeout(() => {
          session.toolWatchdog = undefined;
          session.permissionPending = false;
          setState(claude, 'idle');
          clearBubble(claude);
          addLog(`WATCHDOG [${sLabel}]: no result for ${tool}, resetting`, 'error');
        }, 5 * 60 * 1000);
      }
      break;
    }

    case 'tool_result': {
      session.permissionPending = false;
      if (session.toolWatchdog !== undefined) { clearTimeout(session.toolWatchdog); session.toolWatchdog = undefined; }
      const success = event.success !== false;
      flashFigure(claude, success);
      clearBubble(claude);
      if (success) {
        setState(claude, 'celebrating');
        setTimeout(() => { if (claude.state === 'celebrating') setState(claude, 'idle'); }, 2000);
      } else {
        setState(claude, 'error');
        setTimeout(() => { if (claude.state === 'error') setState(claude, 'thinking'); }, 1500);
      }
      setStatus(
        success ? `[${sLabel}] Processing result...` : `[${sLabel}] Error in ${event.tool ?? 'tool'}`,
        success ? 'thinking' : 'error'
      );
      addLog(`${success ? 'DONE' : 'ERR'} [${sLabel}]: ${event.tool ?? 'tool'}`, success ? 'tool' : 'error');
      break;
    }

    case 'permission': {
      // Fires via PermissionRequest hook (has tool details) or Notification hook
      // (permission_prompt / elicitation_dialog, message only).
      // Claude Code does NOT fire PostToolUse when the user denies via the
      // permission dialog — the tool is blocked before execution.  So tool_result
      // will never arrive after a denial.  Use a short watchdog: if tool_result
      // hasn't come in within 15 s the user has already responded and Claude is
      // now thinking, so flip to "thinking" so the figure doesn't stay frozen.
      session.permissionPending = true;
      if (session.toolWatchdog !== undefined) clearTimeout(session.toolWatchdog);
      session.toolWatchdog = window.setTimeout(() => {
        session.toolWatchdog      = undefined;
        session.permissionPending = false;
        setState(claude, 'thinking');
        clearBubble(claude);
        addLog(`PERM [${sLabel}]: user responded, Claude processing…`, 'claude');
      }, 15_000);

      const permTool = event.tool ? ` [${event.tool}]` : '';
      setState(claude, 'waiting');
      showBubble(claude, `⚠️ ${truncate(event.text ?? 'Permission needed', 40)}`);
      setStatus(`[${sLabel}] Waiting for permission${permTool}…`, 'error');
      addLog(`PERM [${sLabel}]${permTool}: ${event.text ?? ''}`, 'error');
      if (event.params) {
        const detail = Object.entries(event.params)
          .map(([k, v]) => `  ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
          .join('\n');
        if (detail) addLog(detail, 'error');
      }
      break;
    }

    case 'notification': {
      const icon = event.notifType === 'auth_success' ? '🔑' : '💬';
      showBubble(claude, `${icon} ${truncate(event.text ?? 'Notification', 32)}`);
      setStatus(`[${sLabel}] ${truncate(event.text ?? 'Notification', 60)}`, 'active');
      addLog(`NOTIFY [${sLabel}]: ${event.text ?? ''}`, 'claude');
      setTimeout(() => clearBubble(claude), 3000);
      break;
    }

    case 'session_start': {
      // A new session_id arrives on every CLI invocation (including resume).
      // Sweep same-label sessions that are clearly dead:
      //   - stopped=true: cleanly finished last turn, safe to replace unconditionally
      //   - idle >5 min: probably a killed process
      const STALE_MS = 5 * 60 * 1000;
      const nowMs = Date.now();
      sessions.forEach((s, id) => {
        if (id !== sid && s.label === session.label) {
          if (s.stopped || nowMs - s.lastActive > STALE_MS) {
            addLog(`STALE: removed old ${s.label} session`, 'error');
            removeSession(id);
          }
        }
      });

      const src      = event.text ?? 'startup';
      const greeting = src === 'resume'  ? '↩ Resumed'
                     : src === 'compact' ? '📦 Compacted'
                     : src === 'clear'   ? '🗑 Cleared'
                     :                    '👋 Ready';
      setState(claude, 'thinking');
      showBubble(claude, greeting);
      const modelTag = event.model ? ` (${event.model.replace('claude-', '')})` : '';
      setStatus(`[${sLabel}] Session ${src}${modelTag}`, '');
      addLog(`SESSION [${sLabel}]: ${src}${modelTag}`, 'claude');
      setTimeout(() => { setState(claude, 'idle'); clearBubble(claude); }, 2500);
      break;
    }

    case 'session_end': {
      const reason = event.text ?? 'other';
      addLog(`END [${sLabel}]: session ended (${reason})`, 'claude');
      removeSession(sid);
      break;
    }

    case 'tool_failure': {
      session.permissionPending = false;
      if (session.toolWatchdog !== undefined) { clearTimeout(session.toolWatchdog); session.toolWatchdog = undefined; }
      flashFigure(claude, false);
      setState(claude, 'thinking');
      clearBubble(claude);
      const failLabel = event.isInterrupt ? 'interrupted' : 'failed';
      setStatus(`[${sLabel}] ${event.tool ?? 'tool'} ${failLabel}`, 'error');
      addLog(`FAIL [${sLabel}]: ${event.tool ?? 'tool'} ${failLabel} — ${event.error ?? ''}`, 'error');
      break;
    }

    case 'permission_denied': {
      flashFigure(claude, false);
      setState(claude, 'thinking');
      showBubble(claude, `🚫 ${truncate(event.tool ?? 'tool', 20)}`);
      setStatus(`[${sLabel}] Auto-denied: ${event.tool ?? 'tool'}`, 'error');
      addLog(`DENIED [${sLabel}] [${event.tool ?? 'tool'}]: ${event.text ?? ''}`, 'error');
      if (event.params) {
        const detail = Object.entries(event.params)
          .map(([k, v]) => `  ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
          .join('\n');
        if (detail) addLog(detail, 'error');
      }
      setTimeout(() => clearBubble(claude), 3000);
      break;
    }

    case 'subagent_start': {
      // SubagentStart gives us the agent UUID. Match it to the earliest unmatched
      // agent figure in this session so tool events can be routed to the right sprite.
      const typeLabel = event.agentType ? ` (${event.agentType})` : '';
      if (event.agentId && session.pendingAgentFigures.length > 0) {
        const figId = session.pendingAgentFigures.shift()!;
        const fig   = figures.get(figId);
        if (fig) {
          fig.agentId = event.agentId;
          agentIdToFigureId.set(event.agentId, figId);
        }
      }
      addLog(`AGENT [${sLabel}]: spawned${typeLabel} id=${event.agentId?.slice(0, 8) ?? '?'}`, 'agent');
      break;
    }

    case 'subagent_stop': {
      const typeLabel = event.agentType ? ` (${event.agentType})` : '';
      const snippet   = event.text ? truncate(event.text, 80) : '—';
      addLog(`AGENT DONE [${sLabel}]${typeLabel}: ${snippet}`, 'agent');
      if (event.agentId) {
        const figId = agentIdToFigureId.get(event.agentId);
        const fig   = figId ? figures.get(figId) : null;
        if (fig && figId) {
          setState(fig, 'idle');
          showBubble(fig, `✓ ${truncate(event.text ?? 'done', 30)}`);
          agentIdToFigureId.delete(event.agentId);
          setTimeout(() => removeFigureAnimated(figId), 1800);
        }
      }
      break;
    }

    case 'stop_failure': {
      session.permissionPending = false;
      if (session.toolWatchdog !== undefined) { clearTimeout(session.toolWatchdog); session.toolWatchdog = undefined; }
      setState(claude, 'waiting');
      showBubble(claude, `⚠️ ${truncate(event.text ?? 'Stopped with error', 40)}`);
      setStatus(`[${sLabel}] Stop error`, 'error');
      addLog(`STOP ERR [${sLabel}]: ${event.text ?? 'failed'}`, 'error');
      setTimeout(() => { setState(claude, 'idle'); clearBubble(claude); }, 5000);
      break;
    }

    case 'agent_done': {
      const success = event.success !== false;
      flashFigure(claude, success);
      setState(claude, 'thinking');
      addLog(`AGENT DONE [${sLabel}]: ${success ? 'ok' : 'error'}`, 'agent');
      break;
    }

    case 'pre_compact': {
      const how = event.trigger === 'manual' ? 'manual' : 'auto';
      setState(claude, 'thinking');
      showBubble(claude, `📦 Compacting (${how})…`);
      setStatus(`[${sLabel}] Compacting context…`, 'thinking');
      addLog(`COMPACT [${sLabel}]: starting (${how})`, 'claude');
      break;
    }

    case 'post_compact': {
      showBubble(claude, '📦 Compacted');
      setStatus(`[${sLabel}] Context compacted`, '');
      addLog(`COMPACT [${sLabel}]: done ${event.text ?? ''}`, 'claude');
      setTimeout(() => clearBubble(claude), 2500);
      break;
    }

    case 'elicitation_result': {
      session.permissionPending = false;
      if (session.toolWatchdog !== undefined) { clearTimeout(session.toolWatchdog); session.toolWatchdog = undefined; }
      setState(claude, 'thinking');
      clearBubble(claude);
      const icon = event.mcpAction === 'accept' ? '✓' : '✗';
      setStatus(`[${sLabel}] MCP ${event.mcpServer ?? ''}: ${event.mcpAction ?? 'responded'}`, 'thinking');
      addLog(`ELICIT RESULT [${sLabel}]: ${icon} ${event.text ?? ''}`, 'tool');
      break;
    }

    case 'cwd_changed': {
      session.label = (event.label ?? event.text ?? '').replace(/.*[\\/]/, '') || session.label;
      const claudeFig = figures.get(session.claudeId);
      if (claudeFig) {
        const labelEl = claudeFig.el.querySelector<HTMLElement>('.label');
        if (labelEl) labelEl.textContent = session.label.toUpperCase();
      }
      addLog(`CWD [${sLabel}]: ${event.text ?? ''}`, 'claude');
      break;
    }

    case 'instructions_loaded': {
      addLog(`RULES [${sLabel}]: ${event.text ?? ''}`, 'claude');
      break;
    }

    case 'file_changed': {
      addLog(`FILE [${sLabel}]: ${event.text ?? ''}`, 'tool');
      break;
    }

    case 'config_change': {
      addLog(`CONFIG [${sLabel}]: ${event.text ?? ''}`, 'claude');
      break;
    }

    case 'worktree_create': {
      addLog(`WORKTREE [${sLabel}]: created ${event.text ?? ''}`, 'agent');
      break;
    }

    case 'worktree_remove': {
      addLog(`WORKTREE [${sLabel}]: removed ${event.text ?? ''}`, 'agent');
      break;
    }

    case 'teammate_idle': {
      addLog(`TEAMMATE [${sLabel}]: ${event.text ?? 'teammate'} going idle`, 'agent');
      break;
    }

    case 'task_created': {
      addLog(`TASK [${sLabel}]: created "${event.taskSubject ?? event.text ?? ''}"`, 'agent');
      break;
    }

    case 'task_completed': {
      addLog(`TASK DONE [${sLabel}]: "${event.taskSubject ?? event.text ?? ''}"`, 'agent');
      break;
    }

    case 'stop': {
      session.permissionPending = false;
      session.stopped = true;
      if (session.toolWatchdog !== undefined) { clearTimeout(session.toolWatchdog); session.toolWatchdog = undefined; }
      setState(claude, 'idle');

      // Sub-agents fire their own Stop events while the parent is still running.
      // Only announce completion when no agents are still in an active state.
      let hasActiveAgents = false;
      figures.forEach((fig, id) => {
        if (id.startsWith(`agent:${sid}:`) && fig.state !== 'idle') hasActiveAgents = true;
      });

      if (!hasActiveAgents) {
        showBubble(claude, '✓ Done');
        setStatus(`[${sLabel}] Done`, '');
        addLog(`STOP [${sLabel}]: response complete`, 'claude');
        setTimeout(() => clearBubble(claude), 2500);

        if (event.tokens) {
          totalInputTokens  += event.tokens.input;
          totalOutputTokens += event.tokens.output;
          updateTokenGauge();
        }
      }
      break;
    }
  }
}
