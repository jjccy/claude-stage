// Claude Stage – 2.5D figure animation engine
// Receives events from the VS Code extension via postMessage

(function () {

  interface Slot { x: number; y: number }
  interface Figure { el: HTMLElement; role: string; state: string; bubble?: HTMLElement | null }
  interface StageEvent {
    type:     string;
    tool?:    string;
    phase?:   string;
    params?:  Record<string, unknown>;
    text?:    string;
    success?: boolean;
    tokens?:  { input: number; output: number };
  }

  const figuresLayer = document.getElementById('figures-layer')!;
  const eventsLog    = document.getElementById('events-log')!;
  const statusIcon   = document.getElementById('status-icon')!;
  const statusText   = document.getElementById('status-text')!;

  // ── Figure registry ──────────────────────────────────────────
  const figures = new Map<string, Figure>();

  const SLOTS: Record<string, Slot> = {
    user:   { x: 15, y: 55 },
    claude: { x: 45, y: 45 },
    agent0: { x: 65, y: 40 },
    agent1: { x: 72, y: 55 },
    agent2: { x: 78, y: 40 },
  };

  let agentCount        = 0;
  let totalInputTokens  = 0;
  let totalOutputTokens = 0;

  const MAX_TOKENS = 200000;

  // ── Emoji / action maps ──────────────────────────────────────
  const TOOL_EMOJI: Record<string, string> = {
    Read:     '📄',
    Write:    '✍️',
    Edit:     '✏️',
    Bash:     '⚡',
    Grep:     '🔍',
    Glob:     '🗂️',
    Agent:    '🤖',
    WebFetch: '🌐',
    WebSearch:'🔎',
    TodoWrite:'📋',
    default:  '⚙️',
  };

  const TOOL_ACTION: Record<string, string> = {
    Read:     'reading',
    Write:    'writing',
    Edit:     'writing',
    Bash:     'running',
    Grep:     'searching',
    Glob:     'searching',
    Agent:    'spawning',
    WebFetch: 'searching',
    WebSearch:'searching',
  };

  // ── Build a figure element ────────────────────────────────────
  function buildFigure(id: string, role: string, label: string): HTMLElement {
    const el = document.createElement('div');
    el.className  = `figure ${role}`;
    el.dataset.id = id;
    el.innerHTML  = `
      <div class="body">
        <div class="head"><span class="face">😐</span></div>
        <div class="torso"></div>
        <div class="legs">
          <div class="leg"></div>
          <div class="leg"></div>
        </div>
      </div>
      <div class="shadow"></div>
      <div class="label">${label}</div>
    `;
    return el;
  }

  function placeFigure(el: HTMLElement, slotKey: string): void {
    const slot = SLOTS[slotKey] ?? { x: 50, y: 50 };
    el.style.left      = slot.x + '%';
    el.style.top       = slot.y + '%';
    el.style.transform = 'translate(-50%, -100%)';
  }

  function ensureFigure(id: string, role: string, label: string, slotKey: string): Figure {
    if (!figures.has(id)) {
      const el = buildFigure(id, role, label);
      placeFigure(el, slotKey);
      figuresLayer.appendChild(el);
      figures.set(id, { el, role, state: 'idle' });
    }
    return figures.get(id)!;
  }

  // ── Bubble management ─────────────────────────────────────────
  function showBubble(fig: Figure, text: string, isThought = false): void {
    clearBubble(fig);
    const bubble = document.createElement('div');
    bubble.className   = isThought ? 'thought-bubble' : 'bubble';
    bubble.textContent = text;
    fig.el.querySelector('.body')!.appendChild(bubble);
    fig.bubble = bubble;
  }

  function clearBubble(fig: Figure): void {
    fig.el.querySelector('.bubble, .thought-bubble')?.remove();
    fig.bubble = null;
  }

  // ── State transitions ─────────────────────────────────────────
  function setState(fig: Figure, state: string): void {
    ['thinking', 'searching', 'writing', 'running', 'waiting', 'spawning']
      .forEach(a => fig.el.classList.remove(a));
    if (state && state !== 'idle') fig.el.classList.add(state);
    fig.state = state;
  }

  function setFace(fig: Figure, face: string): void {
    const el = fig.el.querySelector<HTMLElement>('.face');
    if (el) el.textContent = face;
  }

  // ── Flash body on tool success / failure ──────────────────────
  function flashFigure(fig: Figure, success: boolean): void {
    const body = fig.el.querySelector<HTMLElement>('.body')!;
    body.style.animation = success
      ? 'successFlash 0.6s ease-out'
      : 'errorShake 0.5s ease-out';
    if (!success) setFace(fig, '😬');
    setTimeout(() => {
      body.style.animation = '';
      if (!success) setTimeout(() => setFace(fig, '🤔'), 800);
    }, 700);
  }

  // ── Agent hierarchy lines (SVG overlay) ───────────────────────
  function updateHierarchyLines(): void {
    const svg = document.getElementById('hierarchy-svg');
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const claudeFig = figures.get('claude');
    if (!claudeFig) return;

    let hasAgents = false;
    figures.forEach((_, id) => { if (id.startsWith('agent')) hasAgents = true; });
    if (!hasAgents) return;

    const layerRect  = figuresLayer.getBoundingClientRect();
    const claudeBody = claudeFig.el.querySelector<HTMLElement>('.body')!;
    const cr         = claudeBody.getBoundingClientRect();
    const cx         = cr.left - layerRect.left + cr.width  / 2;
    const cy         = cr.top  - layerRect.top  + cr.height / 2;

    figures.forEach((fig, id) => {
      if (!id.startsWith('agent')) return;
      const body = fig.el.querySelector<HTMLElement>('.body')!;
      const ar   = body.getBoundingClientRect();
      const ax   = ar.left - layerRect.left + ar.width  / 2;
      const ay   = ar.top  - layerRect.top  + ar.height / 2;

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(cx));
      line.setAttribute('y1', String(cy));
      line.setAttribute('x2', String(ax));
      line.setAttribute('y2', String(ay));
      line.setAttribute('stroke', 'rgba(63, 185, 80, 0.45)');
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('stroke-dasharray', '5 3');
      svg.appendChild(line);
    });
  }

  // ── Token gauge ───────────────────────────────────────────────
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

  // ── Log ───────────────────────────────────────────────────────
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
      .map(n => String(n).padStart(2, '0'))
      .join(':');
  }

  // ── Status bar ────────────────────────────────────────────────
  function setStatus(text: string, state = ''): void {
    statusText.textContent = text;
    statusIcon.className   = state;
  }

  // ── Event handler ─────────────────────────────────────────────
  function handleEvent(event: StageEvent): void {
    switch (event.type) {

      case 'user_prompt': {
        const user   = ensureFigure('user',   'user',   'User',   'user');
        const claude = ensureFigure('claude', 'claude', 'Claude', 'claude');
        setState(user, 'idle');
        setFace(user, '🗣️');
        showBubble(user, truncate(event.text ?? 'Request', 30));
        setState(claude, 'thinking');
        setFace(claude, '🤔');
        showBubble(claude, '...', true);
        setStatus('User sent a request', 'active');
        addLog(`USER: ${truncate(event.text ?? '', 40)}`, 'user');
        setTimeout(() => { clearBubble(user); setFace(user, '😐'); }, 3000);
        break;
      }

      case 'thinking': {
        const claude = ensureFigure('claude', 'claude', 'Claude', 'claude');
        setState(claude, 'thinking');
        setFace(claude, '🤔');
        showBubble(claude, event.text ? truncate(event.text, 25) : '💭', true);
        setStatus('Claude is thinking...', 'thinking');
        addLog(`THINKING: ${truncate(event.text ?? '', 40)}`, 'claude');
        break;
      }

      case 'tool_use': {
        const tool   = event.tool ?? 'Unknown';
        const emoji  = TOOL_EMOJI[tool]  ?? TOOL_EMOJI['default'];
        const action = TOOL_ACTION[tool] ?? 'running';
        const claude = ensureFigure('claude', 'claude', 'Claude', 'claude');

        if (tool === 'Agent') {
          const agentId = `agent${agentCount}`;
          const slotKey = `agent${agentCount % 3}`;
          agentCount++;
          const agent = ensureFigure(agentId, 'agent', `Agent ${agentCount}`, slotKey);
          setState(agent, 'spawning');
          setFace(agent, '🤖');
          setTimeout(() => { setState(agent, 'thinking'); updateHierarchyLines(); }, 600);
          showBubble(claude, `${emoji} Spawning agent`);
          setStatus(`Spawning agent #${agentCount}`, 'active');
          addLog(`AGENT: spawning #${agentCount}`, 'agent');
        } else {
          setState(claude, action);
          const param = getToolParam(tool, event.params);
          showBubble(claude, `${emoji} ${param}`);
          setStatus(`${tool}: ${param}`, 'active');
          addLog(`TOOL: ${tool} ${param}`, 'tool');
        }
        break;
      }

      case 'tool_result': {
        const claude  = ensureFigure('claude', 'claude', 'Claude', 'claude');
        const success = event.success !== false;
        flashFigure(claude, success);
        setState(claude, 'thinking');
        if (success) setFace(claude, '🤔');
        clearBubble(claude);
        setStatus(
          success ? 'Processing result...' : `Error in ${event.tool ?? 'tool'}`,
          success ? 'thinking' : 'error'
        );
        addLog(`${success ? 'DONE' : 'ERR'}: ${event.tool ?? 'tool'}`, success ? 'tool' : 'error');
        break;
      }

      case 'permission': {
        const claude = ensureFigure('claude', 'claude', 'Claude', 'claude');
        setState(claude, 'waiting');
        setFace(claude, '🙋');
        showBubble(claude, '⚠️ Permission needed');
        setStatus('Waiting for permission...', 'error');
        addLog(`PERMISSION: ${event.text ?? event.tool ?? ''}`, 'error');
        break;
      }

      case 'stop': {
        const claude = ensureFigure('claude', 'claude', 'Claude', 'claude');
        setState(claude, 'idle');
        setFace(claude, '😊');
        showBubble(claude, '✓ Done');
        setStatus('Done', '');
        addLog('STOP: response complete', 'claude');
        setTimeout(() => clearBubble(claude), 2500);

        if (event.tokens) {
          totalInputTokens  += event.tokens.input;
          totalOutputTokens += event.tokens.output;
          updateTokenGauge();
        }

        figures.forEach((fig, id) => {
          if (id.startsWith('agent')) {
            setTimeout(() => {
              fig.el.style.animation = 'fadeOut 0.5s forwards';
              setTimeout(() => { fig.el.remove(); figures.delete(id); }, 500);
            }, 1000);
          }
        });
        setTimeout(() => updateHierarchyLines(), 1600);
        agentCount = 0;
        break;
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────────────
  function truncate(str: string, n: number): string {
    return str.length > n ? str.slice(0, n - 1) + '…' : str;
  }

  function getToolParam(tool: string, params?: Record<string, unknown>): string {
    if (!params) return '';
    if (['Read', 'Write', 'Edit'].includes(tool)) {
      const p = (params['file_path'] ?? params['path'] ?? '') as string;
      return truncate(p.replace(/.*[\\/]/, ''), 25);
    }
    if (tool === 'Bash')  return truncate(String(params['command'] ?? ''), 25);
    if (tool === 'Grep')  return truncate(String(params['pattern'] ?? ''), 25);
    if (tool === 'Glob')  return truncate(String(params['pattern'] ?? ''), 25);
    const first = Object.values(params)[0];
    return first != null ? truncate(String(first), 25) : '';
  }

  // ── VS Code message listener ──────────────────────────────────
  window.addEventListener('message', (msg: MessageEvent) => {
    const data = msg.data as { command: string; event?: StageEvent };
    if (data.command === 'event' && data.event) {
      handleEvent(data.event);
    } else if (data.command === 'clear') {
      figures.forEach(fig => fig.el.remove());
      figures.clear();
      const svg = document.getElementById('hierarchy-svg');
      if (svg) while (svg.firstChild) svg.removeChild(svg.firstChild);
      eventsLog.innerHTML     = '';
      agentCount              = 0;
      totalInputTokens        = 0;
      totalOutputTokens       = 0;
      const counter = document.getElementById('token-counter');
      if (counter) counter.style.display = 'none';
      setStatus('Stage cleared', '');
    }
  });

  setStatus('Waiting for Claude Code events...', '');

})();
