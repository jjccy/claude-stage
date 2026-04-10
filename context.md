# Claude Stage – Context

## Concept

A VS Code extension that visualizes Claude Code's internal activity as animated 2.5D figures on a stage, instead of raw text. Every action Claude takes — thinking, reading files, running commands, spawning agents, requesting permissions — becomes a little animated character doing something expressive.

The goal: make AI-assisted coding feel alive and legible at a glance.

## Architecture

```
Claude Code (hooks) ──POST──▶ EventServer (localhost:7891)
                                    │
                                    ▼
                          VS Code Extension (extension.ts)
                                    │
                          postMessage (WebView API)
                                    │
                                    ▼
                          StagePanel (WebView: out/media/stage.js)
                                    │
                          canvas pixel-art sprites + ForceLayout
```

### Key Files

| File | Purpose |
|------|---------|
| `src/extension/extension.ts` | Activation, command registration, wiring |
| `src/extension/eventServer.ts` | Local HTTP server that receives hook POSTs |
| `src/extension/stagePanel.ts` | WebView panel: reads HTML template, injects config, handles messages |
| `src/extension/hookSetup.ts` | Copies notify.js and merges Claude Code hooks |
| `src/hook/notify.ts` | Hook script: `buildEvent` / `sendEvent`; compiled to `out/hooks/notify.js` |
| `src/webview/stage.html` | HTML template for the panel (placeholders replaced at runtime) |
| `src/webview/sprite.ts` | LPC sprite sheet renderer (`SpriteRenderer`), animation defs per role |
| `src/webview/force.ts` | Force-directed layout engine for agent positioning |
| `src/webview/stage.ts` | Figure engine: sessions, events → canvas animations |

## Event Types

| Event type | Hook source | Figure behaviour |
|-----------|------------|-----------------|
| `user_prompt` | UserPromptSubmit | User figure speaks, Claude starts thinking |
| `tool_use` | PreToolUse | Claude animates to tool-specific pose + bubble |
| `tool_result` | PostToolUse | Claude flashes success/error, returns to thinking |
| `agent_done` | PostToolUse (tool=Agent, derived) | Agent flashes, goes idle, then fades |
| `permission` | Notification (permission_prompt / elicitation_dialog, derived) | Claude goes to `waiting` pose, ⚠️ bubble |
| `notification` | Notification (auth_success, other types) | Brief bubble on Claude (icon + message), 3 s timeout |
| `session_start` | SessionStart | Claude waves 👋/↩/📦 depending on source, 2.5 s |
| `stop` | Stop | Claude shows ✓ Done, token gauge updates |
| `stop_failure` | StopFailure | Claude goes to `waiting` pose, ⚠️ error bubble, 5 s timeout |
| `thinking` | *(no hook — reserved)* | Claude bobs head, thought bubble |

## Tool → Animation Mapping

| Tool | Animation state | Emoji |
|------|-----------------|-------|
| Read | `thinking` – walking (face right) | 📄 |
| Write/Edit | `writing` – slash animation (face right) | ✍️ / ✏️ |
| Bash | `running` – thrust animation (face right) | ⚡ |
| Grep/Glob | `searching` – shoot animation (face right) | 🔍 / 🗂️ |
| Agent | `spawning` – cast animation (face right) → `thinking` | 🤖 |
| WebFetch/Search | `searching` – shoot animation (face right) | 🌐 / 🔎 |

## Claude Code Hook Integration

The extension auto-registers hooks on activation via `setupHooks()`. It copies `out/hooks/notify.js` to a stable path (`~/.claude/claude-stage-hook/notify.js`) and merges seven entries into `~/.claude/settings.json`:

| Hook | Event arg | What fires it |
|------|-----------|---------------|
| `UserPromptSubmit` | `user_prompt` | User sends a message |
| `PreToolUse` | `tool_use` | Any tool call starts |
| `PostToolUse` | `tool_result` | Any tool call finishes |
| `Stop` | `stop` | Response complete |
| `Notification` | `notification` | Claude sends a notification (permission prompts, auth, etc.) |
| `SessionStart` | `session_start` | Session begins (startup / resume / compact / clear) |
| `StopFailure` | `stop_failure` | Response aborted by error (rate limit, billing, auth) |

`notify.js` (compiled from `src/hook/notify.ts`) reads Claude Code's stdin JSON, calls `buildEvent()`, and POSTs to `localhost:<port>`. It uses `session_id` from the hook stdin (when present) as the session identifier for accurate multi-session tracking. Each event also carries a `label` field derived from the last path segment of `cwd` (e.g. `my-project`) — this is used as the display name under each Claude figure. The port is stamped in at install time. Existing non-claude-stage hooks are preserved; re-running is idempotent.

## ClaudeStageEvent shape

```typescript
interface ClaudeStageEvent {
  type:        string;       // event type (see table above)
  timestamp:   number;       // Date.now() at POST time
  sessionId:   string;       // session_id UUID or cwd path
  label?:      string;       // display name — last segment of cwd (e.g. "my-project")
  tool?:       string;       // tool name for tool_use / tool_result
  phase?:      string;       // "pre" | "post"
  params?:     Record<string, unknown>;
  success?:    boolean;
  text?:       string;       // prompt text, notification message, session source, etc.
  tokens?:     { input: number; output: number };
  notifType?:  string;       // original notification_type value
}
```

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `claudeStage.port` | `7891` | Port for the local event server |
| `claudeStage.autoOpen` | `true` | Open the stage panel on startup |
| `claudeStage.theme` | `"default"` | Color theme: `"default"` / `"light"` / `"high-contrast"` |
| `claudeStage.figureDensity` | `1` | Agent zone size multiplier (0.5–3); larger = agents spread further apart |

Settings are injected into the webview as `window.__CLAUDE_STAGE_CONFIG__` when the panel loads. Changing any `claudeStage.*` setting auto-reloads the panel via `onDidChangeConfiguration`.

The ⚙ button in the status bar (bottom of the stage) opens VS Code settings filtered to `claudeStage`.

## Event Log

The bottom-right log panel shows the last 20 events in a compact scrollable widget. It is invisible until hovered (background and header fade in on hover). A ⊞ button expands to a full-screen overlay showing all 500 buffered entries, which also updates live as new events arrive. Both compact and overlay views auto-scroll to the newest entry.

## Future Features

- [x] **Tool success/failure** – Green flash (`.body` successFlash) / red shake (errorShake) on PostToolUse result; driven by `is_error` in `CLAUDE_TOOL_RESPONSE`
- [x] **Agent hierarchy** – SVG overlay draws dashed lines from Claude to each spawned agent; updates on spawn and clears after agents fade out on `stop`
- [x] **Token counter** – Gauge in status bar fills relative to 200k context window; accumulates across turns from `CLAUDE_USAGE_INPUT/OUTPUT_TOKENS` env vars in the `Stop` hook
- [x] **Hook helper script** – `src/hook/notify.ts` with `buildEvent` / `sendEvent` exports; compiled to `out/hooks/notify.js` and auto-deployed to `~/.claude/claude-stage-hook/notify.js` on activation
- [x] **Pixel-art sprites** – Real sprite assets: LPC Character Bases (Human Male for Claude, Orc Male for Agent, CC-BY-SA 3.0) and CraftPix blue alien for User (OGA-BY 3.0). Rendered on `<canvas>` via `SpriteRenderer` supporting two formats: LPC 64×64 sprite sheets (directional rows, horizontal frame strips) and individual PNG sequences for the alien. Claude faces left at idle, right when working; state name shown as italic label below figure name. Background: deep-space gradient sky + scattered stars + isometric floor grid with perspective fade.
- [x] **Multi-session support** – Up to 3 concurrent Claude instances, each assigned its own vertical band on the stage with independent agent zones
- [x] **Force-directed agent layout** – Agents spread out naturally using pairwise repulsion + centre attraction physics; all existing agents redistribute on each spawn
- [x] **Settings UI** – Port config, theme (default/light/high-contrast), figure density; ⚙ button in status bar opens VS Code settings
- [x] **Event log** – Compact scrollable panel (20 entries, hover-reveal); ⊞ expands to full-screen overlay with 500-entry buffer, live updates
- [x] **Session labels** – Display name derived from `cwd` last segment (project folder name) rather than raw UUID
- [x] **Trim sessions** – ⊘ button in status bar (and `Claude Stage: Trim Sessions` command) keeps only the most-recently-active Claude session and clears all log entries. Inactivity cleanup no longer enforces a minimum of one live session.
- [ ] **Camera pan** – Stage scrolls/pans as agents spread out
- [ ] **History replay** – Record session events and replay them
- [ ] **Side panel mode** – Run as VS Code sidebar view, not full panel

## Testing

Run with `npm test`. Tests across 3 suites.

| File | Covers |
|------|--------|
| `test/eventServer.test.ts` | HTTP server: start/stop, status codes (200/400/405/204), event emission, timestamp stamping |
| `test/notify.test.ts` | `buildEvent()`: all event types incl. notification/session_start/stop_failure, `agent_done` for Agent, XML filtering, transcript token parsing, `session_id` → `sessionId`, `label` derivation from `cwd` |
| `test/setupHooks.test.ts` | `setupHooks()`: port stamping, all seven hook types, idempotency, preservation of existing hooks and other settings keys |

Tests use a real temp directory (no mocking) — `setupHooks` accepts an optional `homeDir` parameter for isolation.

## Design Decisions

- **Canvas pixel-art sprites** – Each figure is a `<canvas>` element rendered by `SpriteRenderer`. Assets live in `media/sprites/{role}/` and are served as webview URIs. Two rendering modes: `sheet` (LPC 64×64 px sprite sheets, renders a single frame from a grid via `drawImage` crop) and `seq` (individual PNG files per frame, used for the blue alien user). Canvas is 128×128 px (2× LPC native). `imageSmoothingEnabled = false` for pixel-crisp upscaling on sheet renders.
- **2.5D via CSS perspective** – Ground layer uses rotateX + grid to suggest isometric space without full 3D.
- **HTTP server** – Chosen over file watching for low latency and simplicity. Hooks POST to localhost:7891.
- **Lazy figure creation** – Figures only appear when relevant events fire, not pre-placed.
- **Agent lifecycle** – Agent figures spawn on Agent tool use and fade out on `stop` event.
- **HTML template** – Panel HTML lives in `src/webview/stage.html` with `{{placeholder}}` substitution; `stagePanel.ts` reads it with `fs.readFileSync` and replaces `cspSource`, `styleUri`, `scriptUri`, and `config` at render time. Separates markup from TypeScript.
- **Settings injection** – Current settings (theme, figureDensity) are serialised as `window.__CLAUDE_STAGE_CONFIG__` in a `<script>` block rather than passed via postMessage, so they are available synchronously at script startup before any events arrive.
- **Session label from cwd** – Session UUIDs are not human-readable; `notify.ts` derives a `label` from the last path segment of `cwd` (the project directory) and sends it with every event. The stage stores this on first session creation and uses it for figure names and log text.

## Related Project

[`D:/oo/code-city`](../code-city) – A VS Code extension visualizing the codebase as an isometric city. The sprite and animation aesthetic from that project should inform the future visual direction of this one.
