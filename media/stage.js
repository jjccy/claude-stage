// Claude Stage – 2.5D figure animation engine
// Receives events from the VS Code extension via postMessage

(function () {
  'use strict';

  const figuresLayer = document.getElementById('figures-layer');
  const eventsLog    = document.getElementById('events-log');
  const statusIcon   = document.getElementById('status-icon');
  const statusText   = document.getElementById('status-text');

  // ── Figure registry ──────────────────────────────────────────
  const figures = new Map(); // id → { el, role, state }

  // Stage slots: fixed positions for known actors
  const SLOTS = {
    user:   { x: 15, y: 55 },
    claude: { x: 45, y: 45 },
    agent0: { x: 65, y: 40 },
    agent1: { x: 72, y: 55 },
    agent2: { x: 78, y: 40 },
  };

  let agentCount = 0;

  // ── Emoji map for tools ──────────────────────────────────────
  const TOOL_EMOJI = {
    Read:    '📄',
    Write:   '✍️',
    Edit:    '✏️',
    Bash:    '⚡',
    Grep:    '🔍',
    Glob:    '🗂️',
    Agent:   '🤖',
    WebFetch:'🌐',
    WebSearch:'🔎',
    TodoWrite:'📋',
    default: '⚙️',
  };

  const TOOL_ACTION = {
    Read:    'reading',
    Write:   'writing',
    Edit:    'writing',
    Bash:    'running',
    Grep:    'searching',
    Glob:    'searching',
    Agent:   'spawning',
    WebFetch:'searching',
    WebSearch:'searching',
  };

  // ── Build a figure element ────────────────────────────────────
  function buildFigure(id, role, label) {
    const el = document.createElement('div');
    el.className = `figure ${role}`;
    el.dataset.id = id;

    el.innerHTML = `
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

  function placeFigure(el, slotKey) {
    const slot = SLOTS[slotKey] || { x: 50, y: 50 };
    el.style.left = slot.x + '%';
    el.style.top  = slot.y + '%';
    el.style.transform = 'translate(-50%, -100%)';
  }

  function ensureFigure(id, role, label, slotKey) {
    if (!figures.has(id)) {
      const el = buildFigure(id, role, label);
      placeFigure(el, slotKey);
      figuresLayer.appendChild(el);
      figures.set(id, { el, role, state: 'idle' });
    }
    return figures.get(id);
  }

  // ── Bubble management ─────────────────────────────────────────
  function showBubble(fig, text, isThought = false) {
    clearBubble(fig);
    const bubble = document.createElement('div');
    bubble.className = isThought ? 'thought-bubble' : 'bubble';
    bubble.textContent = text;
    fig.el.querySelector('.body').appendChild(bubble);
    fig.bubble = bubble;
  }

  function clearBubble(fig) {
    const existing = fig.el.querySelector('.bubble, .thought-bubble');
    if (existing) existing.remove();
    fig.bubble = null;
  }

  // ── State transitions ─────────────────────────────────────────
  function setState(fig, state) {
    const actions = ['thinking', 'searching', 'writing', 'running', 'waiting', 'spawning'];
    actions.forEach(a => fig.el.classList.remove(a));
    if (state && state !== 'idle') {
      fig.el.classList.add(state);
    }
    fig.state = state;
  }

  function setFace(fig, face) {
    const faceEl = fig.el.querySelector('.face');
    if (faceEl) faceEl.textContent = face;
  }

  // ── Log entry ─────────────────────────────────────────────────
  function addLog(text, type = '') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `${timestamp()} ${text}`;
    eventsLog.prepend(entry);

    // Keep max 40 entries
    while (eventsLog.children.length > 40) {
      eventsLog.lastChild.remove();
    }
  }

  function timestamp() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
  }

  // ── Status bar ────────────────────────────────────────────────
  function setStatus(text, state = '') {
    statusText.textContent = text;
    statusIcon.className   = state;
  }

  // ── Event handlers ────────────────────────────────────────────
  function handleEvent(event) {
    switch (event.type) {

      case 'user_prompt': {
        const user = ensureFigure('user', 'user', 'User', 'user');
        const claude = ensureFigure('claude', 'claude', 'Claude', 'claude');
        setState(user, 'idle');
        setFace(user, '🗣️');
        showBubble(user, truncate(event.text || 'Request', 30));
        setState(claude, 'thinking');
        setFace(claude, '🤔');
        showBubble(claude, '...', true);
        setStatus('User sent a request', 'active');
        addLog(`USER: ${truncate(event.text || '', 40)}`, 'user');
        setTimeout(() => { clearBubble(user); setFace(user, '😐'); }, 3000);
        break;
      }

      case 'thinking': {
        const claude = ensureFigure('claude', 'claude', 'Claude', 'claude');
        setState(claude, 'thinking');
        setFace(claude, '🤔');
        showBubble(claude, event.text ? truncate(event.text, 25) : '💭', true);
        setStatus('Claude is thinking...', 'thinking');
        addLog(`THINKING: ${truncate(event.text || '', 40)}`, 'claude');
        break;
      }

      case 'tool_use': {
        const tool   = event.tool || 'Unknown';
        const emoji  = TOOL_EMOJI[tool] || TOOL_EMOJI.default;
        const action = TOOL_ACTION[tool] || 'running';
        const claude = ensureFigure('claude', 'claude', 'Claude', 'claude');

        if (tool === 'Agent') {
          // Spawn a new agent figure
          const agentId = `agent${agentCount}`;
          const slotKey = `agent${agentCount % 3}`;
          agentCount++;
          const agent = ensureFigure(agentId, 'agent', `Agent ${agentCount}`, slotKey);
          setState(agent, 'spawning');
          setFace(agent, '🤖');
          setTimeout(() => setState(agent, 'thinking'), 600);
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
        const claude = ensureFigure('claude', 'claude', 'Claude', 'claude');
        setState(claude, 'thinking');
        setFace(claude, '🤔');
        clearBubble(claude);
        setStatus('Processing result...', 'thinking');
        addLog(`DONE: ${event.tool || 'tool'}`, 'tool');
        break;
      }

      case 'permission': {
        const claude = ensureFigure('claude', 'claude', 'Claude', 'claude');
        setState(claude, 'waiting');
        setFace(claude, '🙋');
        showBubble(claude, `⚠️ Permission needed`);
        setStatus('Waiting for permission...', 'error');
        addLog(`PERMISSION: ${event.text || event.tool || ''}`, 'error');
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
        // Retire spawned agents
        figures.forEach((fig, id) => {
          if (id.startsWith('agent')) {
            setTimeout(() => {
              fig.el.style.animation = 'fadeOut 0.5s forwards';
              setTimeout(() => {
                fig.el.remove();
                figures.delete(id);
              }, 500);
            }, 1000);
          }
        });
        agentCount = 0;
        break;
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────────────
  function truncate(str, n) {
    return str.length > n ? str.slice(0, n - 1) + '…' : str;
  }

  function getToolParam(tool, params) {
    if (!params) return '';
    if (tool === 'Read' || tool === 'Write' || tool === 'Edit') {
      const p = params.file_path || params.path || '';
      return truncate(String(p).replace(/.*[\\/]/, ''), 25);
    }
    if (tool === 'Bash') {
      return truncate(String(params.command || ''), 25);
    }
    if (tool === 'Grep') {
      return truncate(String(params.pattern || ''), 25);
    }
    if (tool === 'Glob') {
      return truncate(String(params.pattern || ''), 25);
    }
    const first = Object.values(params)[0];
    return first ? truncate(String(first), 25) : '';
  }

  // ── VS Code message listener ──────────────────────────────────
  window.addEventListener('message', (msg) => {
    const data = msg.data;
    if (data.command === 'event') {
      handleEvent(data.event);
    } else if (data.command === 'clear') {
      figuresLayer.innerHTML = '';
      eventsLog.innerHTML = '';
      figures.clear();
      agentCount = 0;
      setStatus('Stage cleared', '');
    }
  });

  // ── Init: place Claude figure by default ─────────────────────
  window.addEventListener('DOMContentLoaded', () => {
    // These are created lazily on first event but we can pre-warm
  });

  setStatus('Waiting for Claude Code events...', '');

})();
