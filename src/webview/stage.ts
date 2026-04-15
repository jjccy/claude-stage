/// <reference path="./sprite.ts" />
/// <reference path="./force.ts" />

// ── Claude Stage – main orchestration ────────────────────────────────────────
// Receives postMessage events from the VS Code extension and animates
// pixel-art figures on the stage.  SpriteRenderer and ForceLayout
// are defined in sprite.ts / force.ts, concatenated before this file.

(function () {

  // ── Config (injected by extension) ────────────────────────────────────────

  const cfg = (window as any).__CLAUDE_STAGE_CONFIG__ ?? {};
  const figureDensity: number    = cfg.figureDensity ?? 1;
  const spritesBaseUrl: string   = cfg.spritesBaseUrl ?? '';
  const artStyle: string         = cfg.artStyle ?? 'pixel';
  if (cfg.theme && cfg.theme !== 'default') {
    document.body.classList.add(`theme-${cfg.theme}`);
  }
  // Acquire VS Code API once for postMessage (settings button)
  const vscodeApi = typeof (window as any).acquireVsCodeApi === 'function'
    ? (window as any).acquireVsCodeApi()
    : null;

  // ── Types ─────────────────────────────────────────────────────────────────

  interface Slot { x: number; y: number }

  interface Figure {
    el:        HTMLElement;
    canvas:    HTMLCanvasElement;
    ctx:       CanvasRenderingContext2D;
    renderer:  IRenderer;
    role:      string;
    state:     string;
    frameIdx:  number;
    timer?:    number;
    bubble?:   HTMLElement | null;
    stateEl?:  HTMLElement;   // small state indicator below the name label
    slot:      Slot;
    prompt?:   string;
    agentId?:  string;   // UUID from SubagentStart — used to route tool events to this figure
  }

  interface StageEvent {
    type:         string;
    sessionId?:   string;
    label?:       string;
    tool?:        string;
    params?:      Record<string, unknown>;
    text?:        string;
    success?:     boolean;
    tokens?:      { input: number; output: number };
    notifType?:   string;
    model?:       string;   // SessionStart: Claude model ID
    permMode?:    string;   // permission_mode from common fields
    agentId?:     string;   // SubagentStart / SubagentStop
    agentType?:   string;   // SubagentStart / SubagentStop
    error?:       string;   // PostToolUseFailure
    isInterrupt?: boolean;  // PostToolUseFailure
    trigger?:     string;   // PreCompact / PostCompact: "manual"|"auto"
    mcpServer?:   string;   // Elicitation / ElicitationResult
    mcpAction?:   string;   // ElicitationResult: "accept"|"decline"|"cancel"
    taskSubject?: string;   // TaskCreated / TaskCompleted
  }

  interface Session {
    claudeId:          string;
    label:             string;
    agentCount:        number;
    lastActive:        number;
    slotIndex:         number;
    agentLayout:       ForceLayout;
    permissionPending:    boolean;   // permission_prompt arrived; tool_use must not override "waiting"
    toolWatchdog?:        number;    // timeout id — resets stuck "running" figure if tool_result never arrives
    pendingAgentFigures:  string[];  // figure IDs waiting to be matched to a SubagentStart agent UUID
  }

  // ── Constants ─────────────────────────────────────────────────────────────

  // Vertical bands for up to 3 concurrent Claude instances.
  const CLAUDE_SLOTS: Slot[] = [
    { x: 45, y: 45 },  // Band 0 — centre (default)
    { x: 45, y: 78 },  // Band 1 — lower
    { x: 45, y: 18 },  // Band 2 — upper
  ];

  const USER_SLOT: Slot = { x: 15, y: 55 };

  // Agent zone relative to Claude: centre 24% to the right, ±15% wide, ±30% tall.
  const AGENT_ZONE_DX = 24;
  const AGENT_ZONE_HW = 15 * figureDensity;
  const AGENT_ZONE_HH = 30 * figureDensity;

  const INACTIVITY_MS = 10 * 60 * 1000; // 10 minutes

  const TOOL_EMOJI: Record<string, string> = {
    Read: '📄', Write: '✍️', Edit: '✏️', Bash: '⚡', Grep: '🔍',
    Glob: '🗂️', Agent: '🤖', WebFetch: '🌐', WebSearch: '🔎',
    TodoWrite: '📋', default: '⚙️',
  };

  const TOOL_ACTION: Record<string, string> = {
    Read: 'reading', Write: 'writing', Edit: 'writing', Bash: 'running',
    Grep: 'searching', Glob: 'searching', Agent: 'spawning',
    WebFetch: 'searching', WebSearch: 'searching',
  };

  // ── DOM references ────────────────────────────────────────────────────────

  const figuresLayer = document.getElementById('figures-layer')!;
  const logEntries   = document.getElementById('log-entries')!;
  const statusIcon   = document.getElementById('status-icon')!;
  const statusText   = document.getElementById('status-text')!;

  // ── State ─────────────────────────────────────────────────────────────────

  const figures          = new Map<string, Figure>();
  const sessions         = new Map<string, Session>();
  const agentIdToFigureId = new Map<string, string>();  // agent UUID → figure id

  let nextSlotIndex     = 0;
  const freeSlots: number[] = [];

  let totalInputTokens  = 0;
  let totalOutputTokens = 0;
  const MAX_TOKENS      = 200_000;

  // ── Figure management ─────────────────────────────────────────────────────

  function buildFigure(id: string, role: string, label: string): HTMLElement {
    const el = document.createElement('div');
    el.className  = `figure ${role}`;
    el.dataset.id = id;

    const wrap   = document.createElement('div');
    wrap.className = 'sprite-wrap';

    const canvas   = document.createElement('canvas');
    canvas.className = 'sprite';
    // Size set after renderer is created in ensureFigure
    wrap.appendChild(canvas);

    const shadow = document.createElement('div');
    shadow.className = 'shadow';

    const labelEl = document.createElement('div');
    labelEl.className   = 'label';
    labelEl.textContent = label;

    const stateEl = document.createElement('div');
    stateEl.className   = 'state-label';
    stateEl.textContent = 'idle';

    el.appendChild(wrap);
    el.appendChild(shadow);
    el.appendChild(labelEl);
    el.appendChild(stateEl);
    return el;
  }

  function placeFigure(el: HTMLElement, slot: Slot): void {
    el.style.left      = slot.x + '%';
    el.style.top       = slot.y + '%';
    el.style.transform = 'translate(-50%, -100%)';
  }

  /** Smoothly slide an existing figure to a new slot (CSS left/top transition). */
  function moveFigure(fig: Figure, slot: Slot): void {
    fig.slot          = slot;
    fig.el.style.left = slot.x + '%';
    fig.el.style.top  = slot.y + '%';
  }

  function ensureFigure(id: string, role: string, label: string, slot: Slot): Figure {
    if (!figures.has(id)) {
      const el       = buildFigure(id, role, label);
      const canvas   = el.querySelector<HTMLCanvasElement>('.sprite')!;
      const renderer = createSpriteRenderer(role, artStyle, spritesBaseUrl);
      canvas.width   = renderer.canvasW;
      canvas.height  = renderer.canvasH;
      const ctx      = canvas.getContext('2d')!;
      placeFigure(el, slot);
      figuresLayer.appendChild(el);
      const stateEl = el.querySelector<HTMLElement>('.state-label') ?? undefined;
      const fig: Figure = { el, canvas, ctx, renderer, role, state: 'idle', frameIdx: 0, slot, stateEl };
      figures.set(id, fig);
      startAnim(fig);
    }
    return figures.get(id)!;
  }

  function removeFigureAnimated(id: string, delay = 0): void {
    const fig = figures.get(id);
    if (!fig) return;
    setTimeout(() => {
      fig.el.style.animation = 'fadeOut 0.5s forwards';
      setTimeout(() => {
        if (fig.timer !== undefined) clearTimeout(fig.timer);
        fig.el.remove();
        figures.delete(id);
      }, 500);
    }, delay);
  }

  // ── Animation ─────────────────────────────────────────────────────────────

  function startAnim(fig: Figure): void {
    if (fig.timer !== undefined) clearTimeout(fig.timer);
    fig.frameIdx = 0;
    function tick(): void {
      const state = fig.state;
      fig.renderer.draw(fig.ctx, state, fig.frameIdx % fig.renderer.frameCount(state));
      fig.frameIdx++;
      fig.timer = window.setTimeout(tick, fig.renderer.ms(state));
    }
    tick();
  }

  function setState(fig: Figure, state: string): void {
    fig.state = state;
    fig.el.classList.toggle('spawning', state === 'spawning');
    if (fig.stateEl) fig.stateEl.textContent = state;
    startAnim(fig);
  }

  // ── Bubbles ───────────────────────────────────────────────────────────────

  function showBubble(fig: Figure, text: string, isThought = false): void {
    clearBubble(fig);
    const bubble = document.createElement('div');
    bubble.className   = isThought ? 'thought-bubble' : 'bubble';
    bubble.textContent = text;
    fig.el.querySelector('.sprite-wrap')!.appendChild(bubble);
    fig.bubble = bubble;
  }

  function clearBubble(fig: Figure): void {
    fig.el.querySelector('.bubble, .thought-bubble')?.remove();
    fig.bubble = null;
  }

  // ── Flash ─────────────────────────────────────────────────────────────────

  function flashFigure(fig: Figure, success: boolean): void {
    const wrap = fig.el.querySelector<HTMLElement>('.sprite-wrap')!;
    wrap.style.animation = success
      ? 'successFlash 0.6s ease-out'
      : 'errorShake 0.5s ease-out';
    setTimeout(() => { wrap.style.animation = ''; }, 700);
  }

  // ── Session lifecycle ─────────────────────────────────────────────────────

  function sessionLabel(sessionId: string): string {
    // Use stored label if the session already exists
    const stored = sessions.get(sessionId);
    if (stored) return stored.label;
    // Path-based ID: strip directory prefix
    if (sessionId.includes('/') || sessionId.includes('\\')) {
      return sessionId.replace(/.*[\\/]/, '') || 'Claude';
    }
    // UUID with no cwd label: short hex prefix
    return sessionId.split('-')[0] || 'Claude';
  }

  function getOrCreateSession(sessionId: string, eventLabel?: string): Session {
    if (!sessions.has(sessionId)) {
      const slotIndex  = freeSlots.length > 0 ? freeSlots.pop()! : nextSlotIndex++;
      const claudeSlot = CLAUDE_SLOTS[slotIndex % CLAUDE_SLOTS.length];
      const claudeId   = `claude:${sessionId}`;
      // Derive display label: prefer cwd-based label from event, then fallback
      const label = eventLabel
        || (sessionId.includes('/') || sessionId.includes('\\')
            ? sessionId.replace(/.*[\\/]/, '') || 'Claude'
            : sessionId.split('-')[0] || 'Claude');
      ensureFigure(claudeId, 'claude', label, claudeSlot);
      const agentLayout = new ForceLayout(
        claudeSlot.x + AGENT_ZONE_DX,
        claudeSlot.y,
        AGENT_ZONE_HW,
        AGENT_ZONE_HH,
      );
      sessions.set(sessionId, { claudeId, label, agentCount: 0, lastActive: Date.now(), slotIndex, agentLayout, permissionPending: false, pendingAgentFigures: [] });
    }
    return sessions.get(sessionId)!;
  }

  function touchSession(session: Session): void {
    session.lastActive = Date.now();
  }

  function removeSession(sessionId: string): void {
    const session = sessions.get(sessionId);
    if (!session) return;
    if (session.toolWatchdog !== undefined) clearTimeout(session.toolWatchdog);
    figures.forEach((_, id) => {
      if (id.startsWith(`agent:${sessionId}:`)) removeFigureAnimated(id);
    });
    removeFigureAnimated(session.claudeId);
    freeSlots.push(session.slotIndex);
    sessions.delete(sessionId);
  }

  // Inactivity cleanup: every minute, remove sessions idle >10 min.
  setInterval(() => {
    const now     = Date.now();
    const expired = [...sessions.entries()]
      .filter(([, s]) => now - s.lastActive > INACTIVITY_MS)
      .map(([id]) => id);
    expired.forEach(id => {
      addLog(`TIMEOUT: ${sessionLabel(id)} removed (10 min idle)`, 'error');
      removeSession(id);
    });
  }, 60_000);

  // ── Trim: keep only the latest session, clear all logs ───────────────────

  function trimToLatest(): void {
    if (sessions.size === 0) return;
    let latestId   = '';
    let latestTime = -Infinity;
    sessions.forEach((session, id) => {
      if (session.lastActive > latestTime) {
        latestTime = session.lastActive;
        latestId   = id;
      }
    });
    [...sessions.keys()].forEach(id => {
      if (id !== latestId) removeSession(id);
    });
    logBuffer.length = 0;
    logEntries.innerHTML = '';
    const overlayEntries = document.getElementById('log-overlay-entries');
    if (overlayEntries) overlayEntries.innerHTML = '';
    addLog('TRIM: kept latest session, logs cleared', '');
  }

  // ── Token gauge ───────────────────────────────────────────────────────────

  function updateTokenGauge(): void {
    const total   = totalInputTokens + totalOutputTokens;
    const counter = document.getElementById('token-counter');
    const bar     = document.getElementById('token-bar');
    const label   = document.getElementById('token-count');
    if (!counter || !bar || !label) return;
    counter.style.display = 'flex';
    const pct       = Math.min((total / MAX_TOKENS) * 100, 100);
    bar.style.width = pct + '%';
    label.textContent = total >= 1000 ? Math.round(total / 1000) + 'k' : String(total);
    bar.className   = pct > 80 ? 'critical' : pct > 60 ? 'warning' : '';
  }

  // ── Log & status bar ──────────────────────────────────────────────────────

  const LOG_MAX_COMPACT = 20;
  const LOG_MAX_BUFFER  = 500;
  const logBuffer: Array<{ text: string; type: string }> = [];

  function makeLogEntry(text: string, type: string): HTMLElement {
    const div = document.createElement('div');
    div.className   = `log-entry ${type}`;
    div.textContent = text;
    return div;
  }

  function addLog(text: string, type = ''): void {
    const formatted = `${ts()} ${text}`;
    logBuffer.push({ text: formatted, type });
    if (logBuffer.length > LOG_MAX_BUFFER) logBuffer.shift();

    // Compact log: append at bottom, trim oldest from top, scroll down
    logEntries.appendChild(makeLogEntry(formatted, type));
    while (logEntries.children.length > LOG_MAX_COMPACT) {
      logEntries.firstChild!.remove();
    }
    logEntries.scrollTop = logEntries.scrollHeight;

    // If overlay is open, keep it live too
    const overlay        = document.getElementById('log-overlay');
    const overlayEntries = document.getElementById('log-overlay-entries');
    if (overlay && !overlay.classList.contains('hidden') && overlayEntries) {
      overlayEntries.appendChild(makeLogEntry(formatted, type));
      overlayEntries.scrollTop = overlayEntries.scrollHeight;
    }
  }

  function openLogOverlay(): void {
    const overlay        = document.getElementById('log-overlay')!;
    const overlayEntries = document.getElementById('log-overlay-entries')!;
    overlayEntries.innerHTML = '';
    logBuffer.forEach(({ text, type }) => {
      overlayEntries.appendChild(makeLogEntry(text, type));
    });
    overlay.classList.remove('hidden');
    // Defer scroll so the DOM has painted first
    requestAnimationFrame(() => { overlayEntries.scrollTop = overlayEntries.scrollHeight; });
  }

  function closeLogOverlay(): void {
    document.getElementById('log-overlay')?.classList.add('hidden');
  }

  document.getElementById('log-expand-btn')?.addEventListener('click', openLogOverlay);
  document.getElementById('log-collapse-btn')?.addEventListener('click', closeLogOverlay);
  document.getElementById('trim-btn')?.addEventListener('click', trimToLatest);
  document.getElementById('settings-btn')?.addEventListener('click', () => {
    vscodeApi?.postMessage({ command: 'openSettings' });
  });

  function ts(): string {
    const d = new Date();
    return [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map(n => String(n).padStart(2, '0')).join(':');
  }

  function setStatus(text: string, state = ''): void {
    statusText.textContent = text;
    statusIcon.className   = state;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function truncate(str: string, n: number): string {
    return str.length > n ? str.slice(0, n - 1) + '…' : str;
  }

  function getToolParam(tool: string, params?: Record<string, unknown>): string {
    if (!params) return '';
    if (['Read', 'Write', 'Edit'].includes(tool)) {
      const p = (params['file_path'] ?? params['path'] ?? '') as string;
      return truncate(p.replace(/.*[\\/]/, ''), 25);
    }
    if (tool === 'Bash') return truncate(String(params['command'] ?? ''), 25);
    if (tool === 'Grep') return truncate(String(params['pattern'] ?? ''), 25);
    if (tool === 'Glob') return truncate(String(params['pattern'] ?? ''), 25);
    const first = Object.values(params)[0];
    return first != null ? truncate(String(first), 25) : '';
  }

  /** Full param value for log entries — no truncation. */
  function getToolParamLog(tool: string, params?: Record<string, unknown>): string {
    if (!params) return '';
    if (['Read', 'Write', 'Edit'].includes(tool)) {
      return String(params['file_path'] ?? params['path'] ?? '');
    }
    if (tool === 'Bash') return String(params['command'] ?? '');
    if (['Grep', 'Glob'].includes(tool)) return String(params['pattern'] ?? '');
    const first = Object.values(params)[0];
    return first != null ? String(first) : '';
  }

  // ── Agent event routing ───────────────────────────────────────────────────

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

  // ── Event handler ─────────────────────────────────────────────────────────

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
          session.toolWatchdog    = undefined;
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
        // Other Notification hook types (e.g. auth_success).
        const icon = event.notifType === 'auth_success' ? '🔑' : '💬';
        showBubble(claude, `${icon} ${truncate(event.text ?? 'Notification', 32)}`);
        setStatus(`[${sLabel}] ${truncate(event.text ?? 'Notification', 60)}`, 'active');
        addLog(`NOTIFY [${sLabel}]: ${event.text ?? ''}`, 'claude');
        setTimeout(() => clearBubble(claude), 3000);
        break;
      }

      case 'session_start': {
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
        // SessionEnd fires when the session terminates cleanly.  Remove it from the stage.
        const reason = event.text ?? 'other';
        addLog(`END [${sLabel}]: session ended (${reason})`, 'claude');
        removeSession(sid);
        break;
      }

      case 'tool_failure': {
        // PostToolUseFailure: the tool itself crashed / exited non-zero.
        // Distinct from PostToolUse with is_error (which is a bad but successful response).
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
        // PermissionDenied: auto-mode classifier blocked a tool (not user manual denial).
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
        // SubagentStop: agent finished. Look up the figure by UUID and show the result.
        const typeLabel = event.agentType ? ` (${event.agentType})` : '';
        const snippet   = event.text ? truncate(event.text, 80) : '—';
        addLog(`AGENT DONE [${sLabel}]${typeLabel}: ${snippet}`, 'agent');
        if (event.agentId) {
          const figId = agentIdToFigureId.get(event.agentId);
          const fig   = figId ? figures.get(figId) : null;
          if (fig) {
            setState(fig, 'idle');
            showBubble(fig, `✓ ${truncate(event.text ?? 'done', 30)}`);
          }
        }
        break;
      }

      case 'stop_failure': {
        // StopFailure hook fires when the response was cut short by an error
        // (rate limit, billing, auth failure, etc.).
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
        // An Agent tool call completed — show result briefly, then remove the figure.
        const success = event.success !== false;
        flashFigure(claude, success);
        setState(claude, 'thinking');   // parent is still processing the result
        // Match by task prompt first (accurate when agents complete out of order),
        // fall back to the first non-idle agent for this session.
        let doneId = '';
        if (event.text) {
          figures.forEach((fig, id) => {
            if (!doneId && id.startsWith(`agent:${sid}:`) && fig.prompt === event.text && fig.state !== 'idle') {
              doneId = id;
            }
          });
        }
        if (!doneId) {
          figures.forEach((fig, id) => {
            if (!doneId && id.startsWith(`agent:${sid}:`) && fig.state !== 'idle') doneId = id;
          });
        }
        if (doneId) {
          const fig = figures.get(doneId)!;
          setState(fig, 'idle');
          showBubble(fig, success ? '✓' : '✗');
          setTimeout(() => {
            removeFigureAnimated(doneId);
          }, 1200);
        }
        addLog(`AGENT DONE [${sLabel}]: ${success ? 'ok' : 'error'}`, 'agent');
        break;
      }

      case 'pre_compact': {
        // PreCompact fires before context compaction starts.
        const how = event.trigger === 'manual' ? 'manual' : 'auto';
        setState(claude, 'thinking');
        showBubble(claude, `📦 Compacting (${how})…`);
        setStatus(`[${sLabel}] Compacting context…`, 'thinking');
        addLog(`COMPACT [${sLabel}]: starting (${how})`, 'claude');
        break;
      }

      case 'post_compact': {
        // PostCompact fires after compaction completes; text has before→after token summary.
        showBubble(claude, '📦 Compacted');
        setStatus(`[${sLabel}] Context compacted`, '');
        addLog(`COMPACT [${sLabel}]: done ${event.text ?? ''}`, 'claude');
        setTimeout(() => clearBubble(claude), 2500);
        break;
      }

      case 'elicitation_result': {
        // MCP elicitation result — clear the permission watchdog, log what the user did.
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
        // CwdChanged — update the figure's label to reflect the new directory.
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
        // Agents persist until the next user_prompt — don't remove them here.
        break;
      }
    }
  }

  // ── VS Code message listener ──────────────────────────────────────────────

  window.addEventListener('message', (msg: MessageEvent) => {
    const data = msg.data as { command: string; event?: StageEvent };
    if (data.command === 'event' && data.event) {
      handleEvent(data.event);
    } else if (data.command === 'trim') {
      trimToLatest();
    } else if (data.command === 'clear') {
      figures.forEach(fig => {
        if (fig.timer !== undefined) clearTimeout(fig.timer);
        fig.el.remove();
      });
      figures.clear();
      sessions.clear();
      nextSlotIndex    = 0;
      freeSlots.length = 0;
      const svg = document.getElementById('hierarchy-svg');
      if (svg) while (svg.firstChild) svg.removeChild(svg.firstChild);
      logBuffer.length         = 0;
      logEntries.innerHTML     = '';
      totalInputTokens        = 0;
      totalOutputTokens       = 0;
      const counter = document.getElementById('token-counter');
      if (counter) counter.style.display = 'none';
      ensureFigure('user', 'user', 'User', USER_SLOT);
      setStatus('Stage cleared', '');
    }
  });

  // Always show the user figure from the start.
  ensureFigure('user', 'user', 'User', USER_SLOT);

  setStatus('Waiting for Claude Code events...', '');

})();
