// ── Claude Stage – Dev Tools ──────────────────────────────────────────────────
// Floating panel for manually spawning Claudes and agents without real hooks.
// Toggle with backtick (`) or the 🛠 button in the status bar.

const DEV_NAMES = ['stage', 'demo', 'test', 'local', 'work', 'sandbox', 'lab', 'play'];

let dtSessionCount = 0;
let dtVisible      = false;

// ── Panel DOM ─────────────────────────────────────────────────────────────────

const dtPanel = document.createElement('div');
dtPanel.id = 'devtools';
document.getElementById('stage')!.appendChild(dtPanel);

// Inject toggle button into the status bar (before settings).
const dtBtn = document.createElement('button');
dtBtn.id    = 'devtools-btn';
dtBtn.title = 'Dev Tools (`)';
dtBtn.textContent = '🛠';
const dtSettingsBtn = document.getElementById('settings-btn');
dtSettingsBtn?.parentNode?.insertBefore(dtBtn, dtSettingsBtn);

// ── Toggle ────────────────────────────────────────────────────────────────────

function dtToggle(): void {
  dtVisible = !dtVisible;
  dtPanel.style.display = dtVisible ? 'flex' : 'none';
  if (dtVisible) dtRender();
}

dtBtn.addEventListener('click', dtToggle);
window.addEventListener('keydown', (e) => {
  if (e.key === '`' && !e.ctrlKey && !e.metaKey) dtToggle();
});

// ── Actions ───────────────────────────────────────────────────────────────────

function dtAddClaude(): void {
  const name      = DEV_NAMES[dtSessionCount % DEV_NAMES.length];
  const label     = `${name}-${dtSessionCount + 1}`;
  dtSessionCount++;
  const sessionId = `dev-${label}-${Date.now()}`;
  handleEvent({ type: 'session_start', sessionId, label, text: 'startup' });
  dtRender();
}

function dtSendPrompt(sessionId: string): void {
  handleEvent({
    type: 'user_prompt',
    sessionId,
    text: 'Dev prompt — testing layout',
  });
  setTimeout(() => dtRender(), 50);
}

function dtAddAgent(sessionId: string): void {
  // Spawn the agent figure via the normal tool_use path.
  const s = sessions.get(sessionId);
  if (!s) return;
  const taskNum = s.agentCount + 1;
  handleEvent({
    type:    'tool_use',
    sessionId,
    tool:    'Agent',
    params:  { prompt: `Dev task ${taskNum}` },
  });
  // Give it a UUID so it can receive tool events later.
  const agentId = `dev-agent-${Date.now()}`;
  setTimeout(() => {
    handleEvent({ type: 'subagent_start', sessionId, agentId, agentType: 'dev' });
    dtRender();
  }, 50);
}

function dtStopAgents(sessionId: string): void {
  // Resolve all pending agents for this session.
  agentIdToFigureId.forEach((figId, agentId) => {
    const fig = figures.get(figId);
    if (!fig || !figId.startsWith(`agent:${sessionId}:`)) return;
    handleEvent({ type: 'subagent_stop', sessionId, agentId, text: 'Dev done' });
  });
  setTimeout(() => dtRender(), 100);
}

function dtStop(sessionId: string): void {
  handleEvent({ type: 'stop', sessionId });
  dtRender();
}

function dtRemoveSession(sessionId: string): void {
  handleEvent({ type: 'session_end', sessionId, text: 'dev-removed' });
  setTimeout(() => dtRender(), 50);
}

// ── Render ────────────────────────────────────────────────────────────────────

function dtRender(): void {
  dtPanel.innerHTML = '';

  // Header
  const header = document.createElement('div');
  header.className = 'dt-header';
  const title  = document.createElement('span');
  title.textContent = '🛠 Dev Tools';
  const close  = document.createElement('button');
  close.textContent = '×';
  close.onclick     = dtToggle;
  header.appendChild(title);
  header.appendChild(close);
  dtPanel.appendChild(header);

  // Add Claude button
  const addRow = document.createElement('div');
  addRow.className = 'dt-add-row';
  const addBtn = document.createElement('button');
  addBtn.className  = 'dt-add-claude';
  addBtn.textContent = '＋ Claude';
  addBtn.onclick     = dtAddClaude;
  addRow.appendChild(addBtn);
  dtPanel.appendChild(addRow);

  // Session list
  if (sessions.size === 0) {
    const empty = document.createElement('div');
    empty.className   = 'dt-empty';
    empty.textContent = 'No sessions — add a Claude';
    dtPanel.appendChild(empty);
  } else {
    sessions.forEach((session, sessionId) => {
      // Count active agents for this session
      let agentCount = 0;
      figures.forEach((_, id) => {
        if (id.startsWith(`agent:${sessionId}:`)) agentCount++;
      });

      const row = document.createElement('div');
      row.className = 'dt-session-row';

      const dot = document.createElement('span');
      dot.className   = 'dt-dot';
      dot.textContent = session.stopped ? '○' : '●';

      const lbl = document.createElement('span');
      lbl.className   = 'dt-label';
      lbl.textContent = session.label;
      if (agentCount > 0) lbl.textContent += ` (${agentCount}a)`;

      // Action buttons
      const promptBtn = dtMiniBtn('▶', 'Send prompt', () => dtSendPrompt(sessionId));
      const agentBtn  = dtMiniBtn('＋A', 'Add agent',  () => dtAddAgent(sessionId));
      const stopABtn  = dtMiniBtn('✓A', 'Stop agents', () => dtStopAgents(sessionId), agentCount === 0);
      const stopBtn   = dtMiniBtn('■', 'Stop',         () => dtStop(sessionId));
      const rmBtn     = dtMiniBtn('✕', 'Remove',       () => dtRemoveSession(sessionId));

      row.appendChild(dot);
      row.appendChild(lbl);
      row.appendChild(promptBtn);
      row.appendChild(agentBtn);
      row.appendChild(stopABtn);
      row.appendChild(stopBtn);
      row.appendChild(rmBtn);
      dtPanel.appendChild(row);
    });
  }
}

function dtMiniBtn(
  label: string,
  title: string,
  onClick: () => void,
  disabled = false,
): HTMLButtonElement {
  const b = document.createElement('button');
  b.className   = 'dt-mini';
  b.textContent = label;
  b.title       = title;
  b.disabled    = disabled;
  b.onclick     = onClick;
  return b;
}
