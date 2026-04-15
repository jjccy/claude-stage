/// <reference path="./sprite.ts" />
/// <reference path="./force.ts" />
/// <reference path="./stage-state.ts" />
/// <reference path="./stage-figures.ts" />
/// <reference path="./stage-log.ts" />
/// <reference path="./stage-sessions.ts" />
/// <reference path="./stage-events.ts" />
/// <reference path="./stage-devtools.ts" />

// ── Claude Stage – entry point ────────────────────────────────────────────────
// Config, types, state, and helpers live in stage-state.ts / stage-figures.ts /
// stage-log.ts / stage-sessions.ts / stage-events.ts.  All files are compiled
// by TypeScript (module:none → outFile) and concatenated into stage.js.

// ── Button listeners ──────────────────────────────────────────────────────────

document.getElementById('log-expand-btn')?.addEventListener('click', openLogOverlay);
document.getElementById('log-collapse-btn')?.addEventListener('click', closeLogOverlay);
document.getElementById('trim-btn')?.addEventListener('click', trimToLatest);
document.getElementById('settings-btn')?.addEventListener('click', () => {
  vscodeApi?.postMessage({ command: 'openSettings' });
});

// ── VS Code message listener ──────────────────────────────────────────────────

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
    agentIdToFigureId.clear();
    claudeLayout.clear();
    logBuffer.length         = 0;
    logEntries.innerHTML     = '';
    totalInputTokens         = 0;
    totalOutputTokens        = 0;
    const counter = document.getElementById('token-counter');
    if (counter) counter.style.display = 'none';
    ensureFigure('user', 'user', 'User', USER_SLOT);
    setStatus('Stage cleared', '');
  }
});

// ── Initialise ────────────────────────────────────────────────────────────────

ensureFigure('user', 'user', 'User', USER_SLOT);
setStatus('Waiting for Claude Code events...', '');
