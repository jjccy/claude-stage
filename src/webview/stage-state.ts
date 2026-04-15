/// <reference path="./sprite.ts" />
/// <reference path="./force.ts" />

// ── Claude Stage – shared state, types & constants ────────────────────────────

// ── Config (injected by extension) ───────────────────────────────────────────

const cfg = (window as any).__CLAUDE_STAGE_CONFIG__ ?? {};
const figureDensity: number  = cfg.figureDensity ?? 1;
const spritesBaseUrl: string = cfg.spritesBaseUrl ?? '';
const artStyle: string       = cfg.artStyle ?? 'pixel';
if (cfg.theme && cfg.theme !== 'default') {
  document.body.classList.add(`theme-${cfg.theme}`);
}
const vscodeApi = typeof (window as any).acquireVsCodeApi === 'function'
  ? (window as any).acquireVsCodeApi()
  : null;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Slot { x: number; y: number }

interface Figure {
  el:       HTMLElement;
  canvas:   HTMLCanvasElement;
  ctx:      CanvasRenderingContext2D;
  renderer: IRenderer;
  role:     string;
  state:    string;
  frameIdx: number;
  timer?:   number;
  bubble?:  HTMLElement | null;
  stateEl?: HTMLElement;   // small state indicator below the name label
  slot:     Slot;
  prompt?:  string;
  agentId?: string;        // UUID from SubagentStart — used to route tool events to this figure
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
  claudeId:            string;
  label:               string;
  claudeLayoutIdx:     number;    // index in the global claudeLayout
  agentCount:          number;
  lastActive:          number;
  agentLayout:         ForceLayout;
  permissionPending:   boolean;
  toolWatchdog?:       number;    // timeout id — resets stuck figure if tool_result never arrives
  pendingAgentFigures: string[];  // figure IDs waiting to be matched to a SubagentStart agent UUID
  stopped:             boolean;   // received a Stop event — session finished its last turn cleanly
}

// ── Constants ─────────────────────────────────────────────────────────────────

const USER_SLOT: Slot = { x: 15, y: 55 };

// Claude layout zone: narrow horizontal band, wide vertical spread.
const CLAUDE_LAYOUT_CX = 45;
const CLAUDE_LAYOUT_CY = 50;
const CLAUDE_LAYOUT_HW = 5;   // ±5% wide  — keeps Claudes near x=45
const CLAUDE_LAYOUT_HH = 28;  // ±28% tall — spreads Claudes vertically

// Agent zone relative to each Claude: 24% to the right, ±15% wide, ±30% tall.
const AGENT_ZONE_DX = 24;
const AGENT_ZONE_HW = 15 * figureDensity;
const AGENT_ZONE_HH = 30 * figureDensity;

const INACTIVITY_MS = 2 * 60 * 1000; // 2 minutes

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

// ── DOM references ────────────────────────────────────────────────────────────

const figuresLayer = document.getElementById('figures-layer')!;
const logEntries   = document.getElementById('log-entries')!;
const statusIcon   = document.getElementById('status-icon')!;
const statusText   = document.getElementById('status-text')!;

// ── State ─────────────────────────────────────────────────────────────────────

const figures           = new Map<string, Figure>();
const sessions          = new Map<string, Session>();
const agentIdToFigureId = new Map<string, string>();  // agent UUID → figure id

// Single ForceLayout for all Claude instances — narrow horizontal, wide vertical.
// Repulsion=400 → equilibrium gap ≈ (2·400/0.05)^(1/3) ≈ 25 viewport-% between Claudes.
const claudeLayout = new ForceLayout(
  CLAUDE_LAYOUT_CX, CLAUDE_LAYOUT_CY,
  CLAUDE_LAYOUT_HW, CLAUDE_LAYOUT_HH,
  400, 0.05,
);

let totalInputTokens  = 0;
let totalOutputTokens = 0;
const MAX_TOKENS      = 200_000;

const LOG_MAX_COMPACT = 20;
const LOG_MAX_BUFFER  = 500;
const logBuffer: Array<{ text: string; type: string }> = [];
