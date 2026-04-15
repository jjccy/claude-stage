// ── Claude Stage – log, status bar & helper utilities ────────────────────────

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function ts(): string {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map(n => String(n).padStart(2, '0')).join(':');
}

// ── Status bar ────────────────────────────────────────────────────────────────

function setStatus(text: string, state = ''): void {
  statusText.textContent = text;
  statusIcon.className   = state;
}

// ── Token gauge ───────────────────────────────────────────────────────────────

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

// ── Log ───────────────────────────────────────────────────────────────────────

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
