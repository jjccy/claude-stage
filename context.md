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
| `src/extension/hookSetup.ts` | Copies notify.js and merges all 26 Claude Code hooks into settings.json |
| `src/hook/notify.ts` | Hook script: `buildEvent` / `sendEvent`; compiled to `out/hooks/notify.js` |
| `src/webview/stage.html` | HTML template for the panel (placeholders replaced at runtime) |
| `src/webview/sprite.ts` | LPC sprite sheet renderer (`SpriteRenderer`), animation defs per role |
| `src/webview/force.ts` | Force-directed layout engine for agent positioning |
| `src/webview/stage.ts` | Figure engine: sessions, events → canvas animations |

## Event Types

| Event type | Hook source | Figure behaviour |
|-----------|------------|-----------------|
| `user_prompt` | UserPromptSubmit | User figure speaks, Claude starts thinking |
| `tool_use` | PreToolUse | Claude animates to tool-specific pose + bubble; **if `agentId` is set, routed to that agent's sprite instead** |
| `tool_result` | PostToolUse | Claude flashes success/error, returns to thinking; **if `agentId` is set, routed to that agent's sprite instead** |
| `tool_failure` | PostToolUseFailure | Claude red-flashes; **if `agentId` is set, routed to agent sprite** |
| `agent_done` | PostToolUse (tool=Agent, derived) | Agent flashes ✓/✗, goes idle, then fades |
| `permission` | PermissionRequest hook (tool details) or Notification (permission_prompt / elicitation_dialog, derived) | Claude goes to `waiting` pose, ⚠️ bubble; **if `agentId` is set, routed to agent sprite** |
| `permission_denied` | PermissionDenied | Claude red-flashes, 🚫 bubble; **if `agentId` is set, routed to agent sprite** |
| `notification` | Notification (auth_success, other types) | Brief bubble on Claude (icon + message), 3 s timeout |
| `session_start` | SessionStart | Claude waves 👋/↩/📦 depending on source, 2.5 s; agent-owned sessions suppressed |
| `session_end` | SessionEnd | Session figure fades and is removed from stage; agent-owned sessions suppressed |
| `stop` | Stop | Claude shows ✓ Done, token gauge updates; agent-owned sessions suppressed |
| `stop_failure` | StopFailure | Claude goes to `waiting` pose, ⚠️ error bubble, 5 s timeout |
| `subagent_start` | SubagentStart | Links agent UUID to its figure (enables subsequent tool event routing); logs type |
| `subagent_stop` | SubagentStop | Looks up agent figure by UUID, sets to idle, shows ✓ result bubble |
| `pre_compact` | PreCompact | Claude shows 📦 Compacting bubble |
| `post_compact` | PostCompact | 📦 Compacted bubble with before→after token counts |
| `elicitation_result` | ElicitationResult | Permission watchdog cleared, action logged |
| `cwd_changed` | CwdChanged | Figure label updated to new directory name |
| `instructions_loaded` | InstructionsLoaded | File name, memory type, and load reason logged |
| `file_changed` | FileChanged | File path and change type logged |
| `config_change` | ConfigChange | Config source and changed keys logged |
| `worktree_create` | WorktreeCreate | Worktree path logged |
| `worktree_remove` | WorktreeRemove | Worktree path and removal reason logged |
| `teammate_idle` | TeammateIdle | Teammate name and team name logged |
| `task_created` | TaskCreated | Task subject logged |
| `task_completed` | TaskCompleted | Task subject logged |

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

The extension auto-registers hooks on activation via `setupHooks()`. It copies `out/hooks/notify.js` to a stable path (`~/.claude/claude-stage-hook/notify.js`) and merges 26 entries into `~/.claude/settings.json`:

| Hook | Event arg | Category |
|------|-----------|----------|
| `SessionStart` | `session_start` | Session |
| `SessionEnd` | `session_end` | Session |
| `UserPromptSubmit` | `user_prompt` | Per-turn |
| `Stop` | `stop` | Per-turn |
| `StopFailure` | `stop_failure` | Per-turn |
| `PreToolUse` | `tool_use` | Tool execution |
| `PostToolUse` | `tool_result` | Tool execution |
| `PostToolUseFailure` | `tool_failure` | Tool execution |
| `PermissionRequest` | `permission_request` | Permissions |
| `PermissionDenied` | `permission_denied` | Permissions |
| `SubagentStart` | `subagent_start` | Agents |
| `SubagentStop` | `subagent_stop` | Agents |
| `Notification` | `notification` | Notifications |
| `PreCompact` | `pre_compact` | Compaction |
| `PostCompact` | `post_compact` | Compaction |
| `Elicitation` | `elicitation` | MCP elicitation |
| `ElicitationResult` | `elicitation_result` | MCP elicitation |
| `InstructionsLoaded` | `instructions_loaded` | File & directory |
| `FileChanged` | `file_changed` | File & directory |
| `CwdChanged` | `cwd_changed` | File & directory |
| `ConfigChange` | `config_change` | Config & worktrees |
| `WorktreeCreate` | `worktree_create` | Config & worktrees |
| `WorktreeRemove` | `worktree_remove` | Config & worktrees |
| `TeammateIdle` | `teammate_idle` | Team / tasks |
| `TaskCreated` | `task_created` | Team / tasks |
| `TaskCompleted` | `task_completed` | Team / tasks |

`notify.js` (compiled from `src/hook/notify.ts`) reads Claude Code's stdin JSON, calls `buildEvent()`, and POSTs to `localhost:<port>`. It uses `session_id` from the hook stdin (when present) as the session identifier for accurate multi-session tracking. Each event carries a `label` field derived from the last path segment of `cwd` (e.g. `my-project`) — used as the display name under each Claude figure. The port is stamped in at install time. Existing non-claude-stage hooks are preserved; re-running is idempotent.

### Permission state machine

`PermissionRequest` fires after `PreToolUse` in Claude Code's hook ordering. The stage tracks a `permissionPending` boolean per session: when `permission` arrives the flag is set and Claude switches to `waiting` state; when `tool_use` arrives while the flag is set the bubble is updated but the state is not overridden. A 15-second watchdog auto-transitions to `thinking` in case the user denies — because `PostToolUse` never fires after a denial.

## ClaudeStageEvent shape

```typescript
interface ClaudeStageEvent {
  type:         string;        // event type (see table above)
  timestamp:    number;        // Date.now() at POST time
  sessionId:    string;        // session_id UUID or cwd path
  label?:       string;        // display name — last segment of cwd (e.g. "my-project")
  tool?:        string;        // tool name for tool_use / tool_result / permission_request
  params?:      Record<string, unknown>; // tool_input for tool events
  success?:     boolean;       // tool_result / agent_done: false when is_error=true
  text?:        string;        // prompt, message, session source, etc.
  tokens?:      { input: number; output: number }; // stop: token usage from transcript
  notifType?:   string;        // notification / permission: original notification_type
  model?:       string;        // session_start: Claude model ID
  permMode?:    string;        // permission_mode ("default"|"auto"|"acceptEdits"|...)
  agentId?:     string;        // subagent_start / subagent_stop; also tool_use / tool_result / tool_failure / permission / permission_denied when originating from a subagent
  agentType?:   string;        // subagent_start / subagent_stop
  error?:       string;        // tool_failure: error message
  isInterrupt?: boolean;       // tool_failure: true when interrupted by user
  trigger?:     string;        // pre_compact / post_compact: "manual" | "auto"
  mcpServer?:   string;        // elicitation / elicitation_result: MCP server name
  mcpAction?:   string;        // elicitation_result: "accept" | "decline" | "cancel"
  taskSubject?: string;        // task_created / task_completed: task subject line
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

The bottom-right log panel shows the last 20 events in a compact scrollable widget. It is invisible until hovered (background and header fade in on hover). A ⊞ button expands to a full-screen overlay showing all 500 buffered entries, which also updates live as new events arrive. Both compact and overlay views auto-scroll to the newest entry. The overlay uses `white-space: pre-wrap` so full file paths, commands, and messages are never truncated.

## Testing

Run with `npm test`. 87 tests across 3 suites.

| File | Covers |
|------|--------|
| `test/eventServer.test.ts` | HTTP server: start/stop, status codes (200/400/405/204), event emission, timestamp stamping |
| `test/notify.test.ts` | `buildEvent()`: all 26 hook types, `agent_done` derivation for Agent tool, XML filtering for system-injected prompts, transcript token parsing, `session_id` → `sessionId`, `label` derivation from `cwd`, `permMode` forwarding |
| `test/setupHooks.test.ts` | `setupHooks()`: port stamping into notify.js, all 26 hook types registered, idempotency, preservation of existing hooks and other settings keys |

Tests use a real temp directory (no mocking) — `setupHooks` accepts an optional `homeDir` parameter for isolation.

## Design Decisions

- **Canvas pixel-art sprites** – Each figure is a `<canvas>` element rendered by `SpriteRenderer`. Assets live in `media/sprites/{role}/` and are served as webview URIs. Two rendering modes: `sheet` (LPC 64×64 px sprite sheets, renders a single frame from a grid via `drawImage` crop) and `seq` (individual PNG files per frame, used for the blue alien user). Canvas is 128×128 px (2× LPC native). `imageSmoothingEnabled = false` for pixel-crisp upscaling on sheet renders.
- **2.5D via CSS perspective** – Ground layer uses rotateX + grid to suggest isometric space without full 3D.
- **HTTP server** – Chosen over file watching for low latency and simplicity. Hooks POST to localhost:7891.
- **Lazy figure creation** – Figures only appear when relevant events fire, not pre-placed.
- **Agent tool routing** – When a subagent fires PreToolUse/PostToolUse hooks, the hook data carries `agent_id`. `notify.ts` forwards this as `agentId` in `tool_use`, `tool_result`, `tool_failure`, `permission`, and `permission_denied` events. In `stage.ts`, `handleEvent` checks for `agentId` first: if a figure is mapped for that UUID (via `agentIdToFigureId`), the event is handled by `routeAgentEvent` which updates the agent sprite and returns early — Claude's sprite never sees it. The UUID→figure mapping is built when `subagent_start` fires by dequeuing from a per-session `pendingAgentFigures` queue populated when each Agent tool_use creates a figure. Agent session lifecycle events (`session_start`, `session_end`, `stop`) are suppressed to avoid phantom Claude figures.
- **Agent lifecycle** – Agent figures spawn on Agent tool use and fade out on `stop` event.
- **HTML template** – Panel HTML lives in `src/webview/stage.html` with `{{placeholder}}` substitution; `stagePanel.ts` reads it with `fs.readFileSync` and replaces `cspSource`, `styleUri`, `scriptUri`, and `config` at render time. Separates markup from TypeScript.
- **Settings injection** – Current settings (theme, figureDensity) are serialised as `window.__CLAUDE_STAGE_CONFIG__` in a `<script>` block rather than passed via postMessage, so they are available synchronously at script startup before any events arrive.
- **Session label from cwd** – Session UUIDs are not human-readable; `notify.ts` derives a `label` from the last path segment of `cwd` (the project directory) and sends it with every event. The stage stores this on first session creation and uses it for figure names and log text. `CwdChanged` events update the label live.
- **Permission watchdog** – `PermissionRequest` fires after `PreToolUse`; the stage uses a `permissionPending` flag to hold the `waiting` state. A 15-second watchdog transitions to `thinking` automatically when PostToolUse never arrives (user denied or dismissed).

## Future Features

- [x] **Tool success/failure** – Green flash / red shake on PostToolUse result; driven by `is_error` in tool response
- [x] **Agent hierarchy** – SVG overlay draws dashed lines from Claude to each spawned agent; updates on spawn and clears after agents fade out
- [x] **Token counter** – Gauge in status bar fills relative to 200k context window; reads token usage from Stop hook transcript file
- [x] **Hook helper script** – `src/hook/notify.ts` with `buildEvent` / `sendEvent` exports; compiled to `out/hooks/notify.js` and auto-deployed to `~/.claude/claude-stage-hook/notify.js` on activation
- [x] **Pixel-art sprites** – Real sprite assets: LPC Character Bases (Human Male for Claude, Orc Male for Agent, CC-BY-SA 3.0) and CraftPix blue alien for User (OGA-BY 3.0)
- [x] **Multi-session support** – Up to 3 concurrent Claude instances, each assigned its own vertical band
- [x] **Force-directed agent layout** – Agents spread out naturally using pairwise repulsion + centre attraction physics
- [x] **Settings UI** – Port config, theme, figure density; ⚙ button in status bar
- [x] **Event log** – Compact 20-entry panel + ⊞ full-screen overlay with 500-entry buffer; overlay wraps long lines
- [x] **Session labels** – Display name from `cwd` last segment; updates live on `CwdChanged`
- [x] **Trim sessions** – ⊘ button keeps only the most-recently-active session and clears logs
- [x] **All 26 hooks** – Full coverage of every Claude Code hook type: session, tool, permissions, agents, compaction, MCP elicitation, file/dir, config, worktrees, team/tasks
- [ ] **Camera pan** – Stage scrolls/pans as agents spread out
- [ ] **History replay** – Record session events and replay them
- [ ] **Side panel mode** – Run as VS Code sidebar view, not full panel

## Related Project

[`D:/oo/code-city`](../code-city) – A VS Code extension visualizing the codebase as an isometric city. The sprite and animation aesthetic from that project should inform the future visual direction of this one.
