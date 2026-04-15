// ── Claude Stage – session lifecycle ─────────────────────────────────────────

function sessionLabel(sessionId: string): string {
  const stored = sessions.get(sessionId);
  if (stored) return stored.label;
  if (sessionId.includes('/') || sessionId.includes('\\')) {
    return sessionId.replace(/.*[\\/]/, '') || 'Claude';
  }
  return sessionId.split('-')[0] || 'Claude';
}

/** Move all Claude figures (and their agents) to their current force-settled positions. */
function redistributeClaudePositions(): void {
  const positions = claudeLayout.positions();
  sessions.forEach((session, sessionId) => {
    const pos = positions[session.claudeLayoutIdx];
    if (!pos) return;
    const claudeFig = figures.get(session.claudeId);
    if (!claudeFig) return;

    moveFigure(claudeFig, pos);

    // Translate the agent zone to follow Claude, carrying all active agents with it.
    const newAgentCx = pos.x + AGENT_ZONE_DX;
    const newAgentCy = pos.y;
    session.agentLayout.translateTo(newAgentCx, newAgentCy);

    // Move every agent figure to its translated position.
    session.agentLayout.positions().forEach((agentPos, idx) => {
      const agentFig = figures.get(`agent:${sessionId}:${idx}`);
      if (agentFig) moveFigure(agentFig, agentPos);
    });
  });
}

function getOrCreateSession(sessionId: string, eventLabel?: string): Session {
  if (!sessions.has(sessionId)) {
    const claudeId = `claude:${sessionId}`;
    const label = eventLabel
      || (sessionId.includes('/') || sessionId.includes('\\')
          ? sessionId.replace(/.*[\\/]/, '') || 'Claude'
          : sessionId.split('-')[0] || 'Claude');

    // Add to force layout — re-settles all Claude positions.
    // redistributeClaudePositions repositions existing Claudes+agents before
    // the new session is registered, so it only touches existing sessions.
    claudeLayout.add();
    redistributeClaudePositions();

    // The new Claude occupies the last settled position.
    const positions      = claudeLayout.positions();
    const claudeLayoutIdx = positions.length - 1;
    const claudeSlot      = positions[claudeLayoutIdx];
    ensureFigure(claudeId, 'claude', label, claudeSlot);

    const agentLayout = new ForceLayout(
      claudeSlot.x + AGENT_ZONE_DX,
      claudeSlot.y,
      AGENT_ZONE_HW,
      AGENT_ZONE_HH,
    );
    sessions.set(sessionId, {
      claudeId, label, claudeLayoutIdx, agentCount: 0,
      lastActive: Date.now(), agentLayout, permissionPending: false,
      pendingAgentFigures: [], stopped: false,
    });
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

  // Remove from force layout, then patch up indices.
  const removedIdx = session.claudeLayoutIdx;
  claudeLayout.removeAt(removedIdx);
  sessions.delete(sessionId);

  // Sessions that came after the removed one shift one index down.
  sessions.forEach((s) => {
    if (s.claudeLayoutIdx > removedIdx) s.claudeLayoutIdx--;
  });

  redistributeClaudePositions();
}

// Inactivity cleanup: every minute, remove sessions idle >2 min.
setInterval(() => {
  const now     = Date.now();
  const expired = [...sessions.entries()]
    .filter(([, s]) => now - s.lastActive > INACTIVITY_MS)
    .map(([id]) => id);
  expired.forEach(id => {
    addLog(`TIMEOUT: ${sessionLabel(id)} removed (2 min idle)`, 'error');
    removeSession(id);
  });
}, 60_000);

// ── Trim: keep only the latest session, clear all logs ───────────────────────

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
