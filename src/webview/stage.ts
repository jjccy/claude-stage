/// <reference path="./sprite.ts" />
/// <reference path="./force.ts" />

// ── Claude Stage – main orchestration ────────────────────────────────────────
// Receives postMessage events from the VS Code extension and animates
// pixel-art figures on the stage.  SpriteRenderer, ANIM, and ForceLayout
// are defined in sprite.ts / force.ts, concatenated before this file.

(function () {

  // ── Types ─────────────────────────────────────────────────────────────────

  interface Slot { x: number; y: number }

  interface Figure {
    el:       HTMLElement;
    canvas:   HTMLCanvasElement;
    ctx:      CanvasRenderingContext2D;
    renderer: SpriteRenderer;
    role:     string;
    state:    string;
    frameIdx: number;
    timer?:   number;
    bubble?:  HTMLElement | null;
    slot:     Slot;   // stored at creation; used for SVG line drawing
    prompt?:  string; // agent task prompt — used to match agent_done events
  }

  interface StageEvent {
    type:        string;
    sessionId?:  string;
    tool?:       string;
    phase?:      string;
    params?:     Record<string, unknown>;
    text?:       string;
    success?:    boolean;
    tokens?:     { input: number; output: number };
    notifType?:  string;
  }

  interface Session {
    claudeId:    string;
    agentCount:  number;
    lastActive:  number;
    slotIndex:   number;
    agentLayout: ForceLayout;
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
  const AGENT_ZONE_HW = 15;
  const AGENT_ZONE_HH = 30;

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
  const eventsLog    = document.getElementById('events-log')!;
  const statusIcon   = document.getElementById('status-icon')!;
  const statusText   = document.getElementById('status-text')!;

  // ── State ─────────────────────────────────────────────────────────────────

  const figures  = new Map<string, Figure>();
  const sessions = new Map<string, Session>();

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
    canvas.width   = SW * SCALE;
    canvas.height  = SH * SCALE;
    wrap.appendChild(canvas);

    const shadow = document.createElement('div');
    shadow.className = 'shadow';

    const labelEl = document.createElement('div');
    labelEl.className   = 'label';
    labelEl.textContent = label;

    el.appendChild(wrap);
    el.appendChild(shadow);
    el.appendChild(labelEl);
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
      const ctx      = canvas.getContext('2d')!;
      const renderer = new SpriteRenderer(role);
      placeFigure(el, slot);
      figuresLayer.appendChild(el);
      const fig: Figure = { el, canvas, ctx, renderer, role, state: 'idle', frameIdx: 0, slot };
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
    const sched  = ANIM[fig.state] ?? ANIM['idle'];
    fig.frameIdx = 0;
    function tick(): void {
      fig.renderer.draw(fig.ctx, sched.frames[fig.frameIdx % sched.frames.length]);
      fig.frameIdx++;
      fig.timer = window.setTimeout(tick, sched.ms);
    }
    tick();
  }

  function setState(fig: Figure, state: string): void {
    fig.state = state;
    fig.el.classList.toggle('spawning', state === 'spawning');
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
    return sessionId.replace(/.*[\\/]/, '') || 'Claude';
  }

  function getOrCreateSession(sessionId: string): Session {
    if (!sessions.has(sessionId)) {
      const slotIndex  = freeSlots.length > 0 ? freeSlots.pop()! : nextSlotIndex++;
      const claudeSlot = CLAUDE_SLOTS[slotIndex % CLAUDE_SLOTS.length];
      const claudeId   = `claude:${sessionId}`;
      ensureFigure(claudeId, 'claude', sessionLabel(sessionId), claudeSlot);
      const agentLayout = new ForceLayout(
        claudeSlot.x + AGENT_ZONE_DX,
        claudeSlot.y,
        AGENT_ZONE_HW,
        AGENT_ZONE_HH,
      );
      sessions.set(sessionId, { claudeId, agentCount: 0, lastActive: Date.now(), slotIndex, agentLayout });
    }
    return sessions.get(sessionId)!;
  }

  function touchSession(session: Session): void {
    session.lastActive = Date.now();
  }

  function removeSession(sessionId: string): void {
    const session = sessions.get(sessionId);
    if (!session) return;
    figures.forEach((_, id) => {
      if (id.startsWith(`agent:${sessionId}:`)) removeFigureAnimated(id);
    });
    removeFigureAnimated(session.claudeId);
    freeSlots.push(session.slotIndex);
    sessions.delete(sessionId);
    setTimeout(() => updateHierarchyLines(), 600);
  }

  // Inactivity cleanup: every minute, remove sessions idle >10 min, keep ≥1.
  setInterval(() => {
    if (sessions.size <= 1) return;
    const now     = Date.now();
    const expired = [...sessions.entries()]
      .filter(([, s]) => now - s.lastActive > INACTIVITY_MS)
      .map(([id]) => id)
      .slice(0, sessions.size - 1);
    expired.forEach(id => {
      addLog(`TIMEOUT: ${sessionLabel(id)} removed (10 min idle)`, 'error');
      removeSession(id);
    });
  }, 60_000);

  // ── Hierarchy lines ───────────────────────────────────────────────────────

  // Figures are anchored bottom-centre (translate(-50%,-100%)).
  // Sprite centre is above the anchor by: label + shadow + gap (≈22px) + half-sprite.
  const SPRITE_BELOW = 22; // px below sprite canvas (shadow + label + gaps)

  function slotCenter(slot: Slot): { x: number; y: number } {
    const W = figuresLayer.offsetWidth;
    const H = figuresLayer.offsetHeight;
    return {
      x: (slot.x / 100) * W,
      y: (slot.y / 100) * H - SPRITE_BELOW - (SH * SCALE) / 2,
    };
  }

  function updateHierarchyLines(): void {
    const svg = document.getElementById('hierarchy-svg');
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    sessions.forEach((session, sessionId) => {
      const claudeFig = figures.get(session.claudeId);
      if (!claudeFig) return;

      let hasAgents = false;
      figures.forEach((_, id) => { if (id.startsWith(`agent:${sessionId}:`)) hasAgents = true; });
      if (!hasAgents) return;

      const cc = slotCenter(claudeFig.slot);

      figures.forEach((fig, id) => {
        if (!id.startsWith(`agent:${sessionId}:`)) return;
        const ac   = slotCenter(fig.slot);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(cc.x));
        line.setAttribute('y1', String(cc.y));
        line.setAttribute('x2', String(ac.x));
        line.setAttribute('y2', String(ac.y));
        line.setAttribute('stroke', 'rgba(63, 185, 80, 0.45)');
        line.setAttribute('stroke-width', '1.5');
        line.setAttribute('stroke-dasharray', '5 3');
        svg.appendChild(line);
      });
    });
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

  function addLog(text: string, type = ''): void {
    const entry = document.createElement('div');
    entry.className   = `log-entry ${type}`;
    entry.textContent = `${ts()} ${text}`;
    eventsLog.prepend(entry);
    while (eventsLog.children.length > 8) eventsLog.lastChild!.remove();
  }

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

  // ── Event handler ─────────────────────────────────────────────────────────

  function handleEvent(event: StageEvent): void {
    const sid     = event.sessionId ?? 'default';
    const session = getOrCreateSession(sid);
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
        setTimeout(() => updateHierarchyLines(), 600);

        const user = ensureFigure('user', 'user', 'User', USER_SLOT);
        setState(user, 'idle');
        showBubble(user, truncate(event.text ?? 'Request', 30));
        setState(claude, 'thinking');
        showBubble(claude, '...', true);
        setStatus(`[${sLabel}] User sent a request`, 'active');
        addLog(`USER → ${sLabel}: ${truncate(event.text ?? '', 40)}`, 'user');
        setTimeout(() => clearBubble(user), 3000);
        break;
      }

      case 'thinking': {
        setState(claude, 'thinking');
        showBubble(claude, event.text ? truncate(event.text, 25) : '💭', true);
        setStatus(`[${sLabel}] Thinking...`, 'thinking');
        addLog(`THINKING [${sLabel}]: ${truncate(event.text ?? '', 40)}`, 'claude');
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
          setState(agent, 'spawning');
          setTimeout(() => { setState(agent, 'thinking'); updateHierarchyLines(); }, 600);

          showBubble(claude, `${emoji} Spawning agent`);
          setStatus(`[${sLabel}] Spawning agent #${session.agentCount}`, 'active');
          addLog(`AGENT [${sLabel}]: spawning #${session.agentCount}`, 'agent');

        } else {
          setState(claude, action);
          const param = getToolParam(tool, event.params);
          showBubble(claude, `${emoji} ${param}`);
          setStatus(`[${sLabel}] ${tool}: ${param}`, 'active');
          addLog(`TOOL [${sLabel}]: ${tool} ${param}`, 'tool');
        }
        break;
      }

      case 'tool_result': {
        const success = event.success !== false;
        flashFigure(claude, success);
        setState(claude, 'thinking');
        clearBubble(claude);
        setStatus(
          success ? `[${sLabel}] Processing result...` : `[${sLabel}] Error in ${event.tool ?? 'tool'}`,
          success ? 'thinking' : 'error'
        );
        addLog(`${success ? 'DONE' : 'ERR'} [${sLabel}]: ${event.tool ?? 'tool'}`, success ? 'tool' : 'error');
        break;
      }

      case 'permission': {
        // Fires via Notification hook (notification_type: permission_prompt |
        // elicitation_dialog) — Claude is waiting for user approval.
        setState(claude, 'waiting');
        showBubble(claude, `⚠️ ${event.text ?? 'Permission needed'}`);
        setStatus(`[${sLabel}] Waiting for permission…`, 'error');
        addLog(`PERM [${sLabel}]: ${event.text ?? ''}`, 'error');
        break;
      }

      case 'notification': {
        // Other Notification hook types (e.g. auth_success).
        const icon = event.notifType === 'auth_success' ? '🔑' : '💬';
        showBubble(claude, `${icon} ${truncate(event.text ?? 'Notification', 32)}`);
        setStatus(`[${sLabel}] ${truncate(event.text ?? 'Notification', 45)}`, 'active');
        addLog(`NOTIFY [${sLabel}]: ${truncate(event.text ?? '', 50)}`, 'claude');
        setTimeout(() => clearBubble(claude), 3000);
        break;
      }

      case 'session_start': {
        // SessionStart hook fires when a Claude session begins (startup, resume,
        // context compact, or /clear).  Ensure the figure exists and wave hello.
        const src      = event.text ?? 'startup';
        const greeting = src === 'resume'  ? '↩ Resumed'
                       : src === 'compact' ? '📦 Compacted'
                       : src === 'clear'   ? '🗑 Cleared'
                       :                    '👋 Ready';
        setState(claude, 'thinking');
        showBubble(claude, greeting);
        setStatus(`[${sLabel}] Session ${src}`, '');
        addLog(`SESSION [${sLabel}]: ${src}`, 'claude');
        setTimeout(() => { setState(claude, 'idle'); clearBubble(claude); }, 2500);
        break;
      }

      case 'stop_failure': {
        // StopFailure hook fires when the response was cut short by an error
        // (rate limit, billing, auth failure, etc.).
        setState(claude, 'waiting');
        showBubble(claude, `⚠️ ${event.text ? truncate(event.text, 30) : 'Stopped with error'}`);
        setStatus(`[${sLabel}] Stop error`, 'error');
        addLog(`STOP ERR [${sLabel}]: ${truncate(event.text ?? 'failed', 50)}`, 'error');
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
            setTimeout(() => updateHierarchyLines(), 600); // after fade completes
          }, 1200);
        }
        addLog(`AGENT DONE [${sLabel}]: ${success ? 'ok' : 'error'}`, 'agent');
        break;
      }

      case 'stop': {
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
      eventsLog.innerHTML     = '';
      totalInputTokens        = 0;
      totalOutputTokens       = 0;
      const counter = document.getElementById('token-counter');
      if (counter) counter.style.display = 'none';
      setStatus('Stage cleared', '');
    }
  });

  setStatus('Waiting for Claude Code events...', '');

})();
