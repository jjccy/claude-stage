// Claude Stage – pixel-art sprite animation engine
// Receives events from the VS Code extension via postMessage

(function () {

  // ── Sprite system ─────────────────────────────────────────────────────────

  const SCALE = 3;   // canvas px per sprite pixel
  const SW    = 12;  // sprite width  in sprite-pixels
  const SH    = 20;  // sprite height in sprite-pixels

  const SKIN = '#FFDBA4';
  const EYE  = '#2B2B2B';

  interface Pal { b: string; d: string }

  const PALS: Record<string, Pal> = {
    user:   { b: '#4F9EFF', d: '#1F6FEB' },
    claude: { b: '#BC8CFF', d: '#8B5CF6' },
    agent:  { b: '#3FB950', d: '#238636' },
  };

  // 12-char rows per frame.
  // . = transparent  s = skin  e = eye  b = body  d = dark body
  const RAW: Record<string, string[]> = {

    idle_0: [     // upright, eyes open
      '..ssssssss..',
      '.ssssssssss.',
      'ssssssssssss',
      'sseesssseess',
      'ssssssssssss',
      '.ssssssssss.',
      '..ssssssss..',
      '...bbbbbb...',
      '..bbbbbbbb..',
      '.bbbbbbbbbb.',
      '.bbbbbbbbbb.',
      '.bbbbbbbbbb.',
      '..bbbbbbbb..',
      '...bbbbbb...',
      '...bb..bb...',
      '...bb..bb...',
      '...bb..bb...',
      '...bb..bb...',
      '...bb..bb...',
      '..bbb..bbb..',
    ],

    idle_1: [     // blink (eyes closed)
      '..ssssssss..',
      '.ssssssssss.',
      'ssssssssssss',
      'ssssssssssss',
      'ssssssssssss',
      '.ssssssssss.',
      '..ssssssss..',
      '...bbbbbb...',
      '..bbbbbbbb..',
      '.bbbbbbbbbb.',
      '.bbbbbbbbbb.',
      '.bbbbbbbbbb.',
      '..bbbbbbbb..',
      '...bbbbbb...',
      '...bb..bb...',
      '...bb..bb...',
      '...bb..bb...',
      '...bb..bb...',
      '...bb..bb...',
      '..bbb..bbb..',
    ],

    thinking_0: [ // left arm raised, body leans right
      '..ssssssss..',
      '.ssssssssss.',
      'ssssssssssss',
      'ssessssssess',
      'ssssssssssss',
      '.ssssssssss.',
      '..ssssssss..',
      '...bbbbbb...',
      'bb.bbbbbbbb.',
      'b..bbbbbbbb.',
      'b..bbbbbbbb.',
      '...bbbbbbbb.',
      '....bbbbbb..',
      '.....bbbb...',
      '.....bb.bb..',
      '.....bb..bb.',
      '.....bb..bb.',
      '.....bb..bb.',
      '.....bb..bb.',
      '....bbb..bbb',
    ],

    thinking_1: [ // arm slightly lower (wave effect)
      '..ssssssss..',
      '.ssssssssss.',
      'ssssssssssss',
      'ssessssssess',
      'ssssssssssss',
      '.ssssssssss.',
      '..ssssssss..',
      '...bbbbbb...',
      'b..bbbbbbbb.',
      'bb.bbbbbbbb.',
      'b..bbbbbbbb.',
      '...bbbbbbbb.',
      '....bbbbbb..',
      '.....bbbb...',
      '.....bb.bb..',
      '.....bb..bb.',
      '.....bb..bb.',
      '.....bb..bb.',
      '.....bb..bb.',
      '....bbb..bbb',
    ],

    working_0: [  // arms extended wide (lean forward)
      '..ssssssss..',
      '.ssssssssss.',
      'ssssssssssss',
      'sseesssseess',
      'ssssssssssss',
      '.ssssssssss.',
      '..ssssssss..',
      '..bbbbbbbb..',
      '.bbbbbbbbbb.',
      'bbbbbbbbbbbb',
      'bbbbbbbbbbbb',
      '.bbbbbbbbbb.',
      '..bbbbbbbb..',
      '...bbbbbb...',
      '...bb..bb...',
      '...bb..bb...',
      '...bb..bb...',
      '...bb..bb...',
      '...bb..bb...',
      '..bbb..bbb..',
    ],

    working_1: [  // arms at different row (pumping motion)
      '..ssssssss..',
      '.ssssssssss.',
      'ssssssssssss',
      'sseesssseess',
      'ssssssssssss',
      '.ssssssssss.',
      '..ssssssss..',
      '..bbbbbbbb..',
      'bbbbbbbbbbbb',
      '.bbbbbbbbbb.',
      'bbbbbbbbbbbb',
      '.bbbbbbbbbb.',
      '..bbbbbbbb..',
      '...bbbbbb...',
      '...bb..bb...',
      '...bb..bb...',
      '...bb..bb...',
      '...bb..bb...',
      '...bb..bb...',
      '..bbb..bbb..',
    ],

    waiting_0: [  // arms spread (shrug / waiting)
      '..ssssssss..',
      '.ssssssssss.',
      'ssssssssssss',
      'sseesssseess',
      'ssssssssssss',
      '.ssssssssss.',
      '..ssssssss..',
      '...bbbbbb...',
      'b.bbbbbbbb.b',
      'b.bbbbbbbb.b',
      'b.bbbbbbbb.b',
      '...bbbbbbbb.',
      '....bbbbbb..',
      '.....bbbb...',
      '.....bb.bb..',
      '.....bb..bb.',
      '.....bb..bb.',
      '.....bb..bb.',
      '.....bb..bb.',
      '....bbb..bbb',
    ],

  };

  type Pixel = string | null;
  type Frame = Pixel[][];

  function parseFrame(rows: string[], pal: Pal): Frame {
    return rows.map(row => {
      const r = row.padEnd(SW, '.').slice(0, SW);
      return r.split('').map(c => {
        switch (c) {
          case 's': return SKIN;
          case 'e': return EYE;
          case 'b': return pal.b;
          case 'd': return pal.d;
          default:  return null;
        }
      });
    });
  }

  class SpriteRenderer {
    private frames: Map<string, Frame> = new Map();

    constructor(role: string) {
      const pal = PALS[role] ?? PALS['agent'];
      for (const [key, raw] of Object.entries(RAW)) {
        this.frames.set(key, parseFrame(raw, pal));
      }
    }

    draw(ctx: CanvasRenderingContext2D, frameName: string): void {
      ctx.clearRect(0, 0, SW * SCALE, SH * SCALE);
      const frame = this.frames.get(frameName) ?? this.frames.get('idle_0')!;
      for (let y = 0; y < frame.length; y++) {
        for (let x = 0; x < frame[y].length; x++) {
          const color = frame[y][x];
          if (color) {
            ctx.fillStyle = color;
            ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
          }
        }
      }
    }
  }

  // Animation schedule: state → frames to cycle + ms per frame
  const ANIM: Record<string, { frames: string[]; ms: number }> = {
    idle:      { frames: ['idle_0','idle_0','idle_0','idle_0','idle_1'], ms: 700 },
    thinking:  { frames: ['thinking_0', 'thinking_1'], ms: 500 },
    searching: { frames: ['working_0',  'working_1'],  ms: 350 },
    writing:   { frames: ['working_0',  'working_1'],  ms: 350 },
    running:   { frames: ['working_0',  'working_1'],  ms: 260 },
    spawning:  { frames: ['idle_0'],                   ms: 600 },
    waiting:   { frames: ['waiting_0'],                ms: 1000 },
  };

  // ── Stage setup ───────────────────────────────────────────────────────────

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
  }

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
  const MAX_TOKENS      = 200000;

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

  // ── Figure management ─────────────────────────────────────────────────────

  function buildFigure(id: string, role: string, label: string): HTMLElement {
    const el = document.createElement('div');
    el.className  = `figure ${role}`;
    el.dataset.id = id;

    const wrap = document.createElement('div');
    wrap.className = 'sprite-wrap';

    const canvas = document.createElement('canvas');
    canvas.className = 'sprite';
    canvas.width  = SW * SCALE;
    canvas.height = SH * SCALE;
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

  function placeFigure(el: HTMLElement, slotKey: string): void {
    const slot = SLOTS[slotKey] ?? { x: 50, y: 50 };
    el.style.left      = slot.x + '%';
    el.style.top       = slot.y + '%';
    el.style.transform = 'translate(-50%, -100%)';
  }

  function ensureFigure(id: string, role: string, label: string, slotKey: string): Figure {
    if (!figures.has(id)) {
      const el       = buildFigure(id, role, label);
      const canvas   = el.querySelector<HTMLCanvasElement>('.sprite')!;
      const ctx      = canvas.getContext('2d')!;
      const renderer = new SpriteRenderer(role);
      placeFigure(el, slotKey);
      figuresLayer.appendChild(el);
      const fig: Figure = { el, canvas, ctx, renderer, role, state: 'idle', frameIdx: 0 };
      figures.set(id, fig);
      startAnim(fig);
    }
    return figures.get(id)!;
  }

  // ── Animation loop ────────────────────────────────────────────────────────

  function startAnim(fig: Figure): void {
    if (fig.timer !== undefined) clearTimeout(fig.timer);
    const sched = ANIM[fig.state] ?? ANIM['idle'];
    fig.frameIdx = 0;

    function tick(): void {
      const name = sched.frames[fig.frameIdx % sched.frames.length];
      fig.renderer.draw(fig.ctx, name);
      fig.frameIdx++;
      fig.timer = window.setTimeout(tick, sched.ms);
    }
    tick();
  }

  // ── State transitions ─────────────────────────────────────────────────────

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

  // ── Flash on tool result ──────────────────────────────────────────────────

  function flashFigure(fig: Figure, success: boolean): void {
    const wrap = fig.el.querySelector<HTMLElement>('.sprite-wrap')!;
    wrap.style.animation = success
      ? 'successFlash 0.6s ease-out'
      : 'errorShake 0.5s ease-out';
    setTimeout(() => { wrap.style.animation = ''; }, 700);
  }

  // ── Hierarchy lines (SVG overlay) ─────────────────────────────────────────

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
    const claudeWrap = claudeFig.el.querySelector<HTMLElement>('.sprite-wrap')!;
    const cr         = claudeWrap.getBoundingClientRect();
    const cx         = cr.left - layerRect.left + cr.width  / 2;
    const cy         = cr.top  - layerRect.top  + cr.height / 2;

    figures.forEach((fig, id) => {
      if (!id.startsWith('agent')) return;
      const wrap = fig.el.querySelector<HTMLElement>('.sprite-wrap')!;
      const ar   = wrap.getBoundingClientRect();
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

  // ── Log ───────────────────────────────────────────────────────────────────

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

  // ── Status bar ────────────────────────────────────────────────────────────

  function setStatus(text: string, state = ''): void {
    statusText.textContent = text;
    statusIcon.className   = state;
  }

  // ── Event handler ─────────────────────────────────────────────────────────

  function handleEvent(event: StageEvent): void {
    switch (event.type) {

      case 'user_prompt': {
        const user   = ensureFigure('user',   'user',   'User',   'user');
        const claude = ensureFigure('claude', 'claude', 'Claude', 'claude');
        setState(user, 'idle');
        showBubble(user, truncate(event.text ?? 'Request', 30));
        setState(claude, 'thinking');
        showBubble(claude, '...', true);
        setStatus('User sent a request', 'active');
        addLog(`USER: ${truncate(event.text ?? '', 40)}`, 'user');
        setTimeout(() => clearBubble(user), 3000);
        break;
      }

      case 'thinking': {
        const claude = ensureFigure('claude', 'claude', 'Claude', 'claude');
        setState(claude, 'thinking');
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
        showBubble(claude, '⚠️ Permission needed');
        setStatus('Waiting for permission...', 'error');
        addLog(`PERMISSION: ${event.text ?? event.tool ?? ''}`, 'error');
        break;
      }

      case 'stop': {
        const claude = ensureFigure('claude', 'claude', 'Claude', 'claude');
        setState(claude, 'idle');
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
              setTimeout(() => {
                if (fig.timer !== undefined) clearTimeout(fig.timer);
                fig.el.remove();
                figures.delete(id);
              }, 500);
            }, 1000);
          }
        });
        setTimeout(() => updateHierarchyLines(), 1600);
        agentCount = 0;
        break;
      }
    }
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
    if (tool === 'Bash')  return truncate(String(params['command'] ?? ''), 25);
    if (tool === 'Grep')  return truncate(String(params['pattern'] ?? ''), 25);
    if (tool === 'Glob')  return truncate(String(params['pattern'] ?? ''), 25);
    const first = Object.values(params)[0];
    return first != null ? truncate(String(first), 25) : '';
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
