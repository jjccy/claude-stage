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
| `src/extension/stagePanel.ts` | VS Code WebView panel lifecycle |
| `src/extension/hookSetup.ts` | Copies notify.js and merges Claude Code hooks |
| `src/hook/notify.ts` | Hook script: `buildEvent` / `sendEvent`; compiled to `out/hooks/notify.js` |
| `src/webview/sprite.ts` | Pixel-art sprite data, `SpriteRenderer`, `ANIM` schedule |
| `src/webview/force.ts` | Force-directed layout engine for agent positioning |
| `src/webview/stage.ts` | Figure engine: sessions, events → canvas animations |

## Event Types

| Event type | Trigger | Figure behavior |
|-----------|---------|----------------|
| `user_prompt` | User submits a message | User figure speaks, Claude starts thinking |
| `thinking` | Claude is reasoning | Claude figure bobs head, thought bubble |
| `tool_use` | Any tool called (pre) | Claude animates to tool-specific pose + bubble |
| `tool_result` | Tool returns (post) | Claude returns to thinking state |
| `tool_use` (Agent) | Agent spawned | New agent figure appears; force layout re-settles all agents |
| `agent_done` | Agent tool returned | Agent flashes, goes idle, then fades; parent Claude continues |
| `permission` | Claude awaits approval | Claude raises hand, waits |
| `stop` | Response complete | Claude smiles, agents fade out |

## Tool → Animation Mapping

| Tool | Animation state | Emoji |
|------|-----------------|-------|
| Read | `idle` (no dedicated state; falls back) | 📄 |
| Write/Edit | `writing` – arms pumping | ✍️ / ✏️ |
| Bash | `running` – arms pumping fast | ⚡ |
| Grep/Glob | `searching` – arms pumping | 🔍 / 🗂️ |
| Agent | `spawning` → `thinking` | 🤖 |
| WebFetch/Search | `searching` | 🌐 / 🔎 |

## Claude Code Hook Integration

The extension auto-registers hooks on activation via `setupHooks()`. It copies `out/hooks/notify.js` to a stable path (`~/.claude/claude-stage-hook/notify.js`) and merges four entries into `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [{ "matcher": "", "hooks": [{ "type": "command", "command": "node \"~/.claude/claude-stage-hook/notify.js\" user_prompt" }] }],
    "PreToolUse":       [{ "matcher": "", "hooks": [{ "type": "command", "command": "node \"~/.claude/claude-stage-hook/notify.js\" tool_use"    }] }],
    "PostToolUse":      [{ "matcher": "", "hooks": [{ "type": "command", "command": "node \"~/.claude/claude-stage-hook/notify.js\" tool_result"  }] }],
    "Stop":             [{ "matcher": "", "hooks": [{ "type": "command", "command": "node \"~/.claude/claude-stage-hook/notify.js\" stop"         }] }]
  }
}
```

`notify.js` (compiled from `src/hook/notify.ts`) reads Claude Code's stdin JSON, calls `buildEvent()`, and POSTs to `localhost:<port>`. The port is stamped in at install time. Existing non-claude-stage hooks are preserved; re-running is idempotent.

## Future Features

- [x] **Tool success/failure** – Green flash (`.body` successFlash) / red shake (errorShake) on PostToolUse result; driven by `is_error` in `CLAUDE_TOOL_RESPONSE`
- [x] **Agent hierarchy** – SVG overlay draws dashed lines from Claude to each spawned agent; updates on spawn and clears after agents fade out on `stop`
- [x] **Token counter** – Gauge in status bar fills relative to 200k context window; accumulates across turns from `CLAUDE_USAGE_INPUT/OUTPUT_TOKENS` env vars in the `Stop` hook
- [x] **Hook helper script** – `src/hook/notify.ts` with `buildEvent` / `sendEvent` exports; compiled to `out/hooks/notify.js` and auto-deployed to `~/.claude/claude-stage-hook/notify.js` on activation
- [x] **Pixel-art sprites** – Canvas-rendered 12×20 pixel figures with per-role colour palettes (blue=user, purple=claude, green=agent); replaces CSS stick figures
- [x] **Multi-session support** – Up to 3 concurrent Claude instances, each assigned its own vertical band on the stage with independent agent zones
- [x] **Force-directed agent layout** – Agents spread out naturally using pairwise repulsion + centre attraction physics; all existing agents redistribute on each spawn
- [ ] **Camera pan** – Stage scrolls/pans as agents spread out
- [ ] **History replay** – Record session events and replay them
- [ ] **Side panel mode** – Run as VS Code sidebar view, not full panel
- [ ] **Settings UI** – Port config, theme, figure density

## Testing

Run with `npm test`. 34 tests across 3 suites.

| File | Covers |
|------|--------|
| `test/eventServer.test.ts` | HTTP server: start/stop, status codes (200/400/405/204), event emission, timestamp stamping |
| `test/notify.test.ts` | `buildEvent()`: all event types, `agent_done` emission for Agent tool, XML prompt filtering, transcript token parsing, `sessionId` |
| `test/setupHooks.test.ts` | `setupHooks()`: port stamping, all four hook types, idempotency, preservation of existing hooks and other settings keys |

Tests use a real temp directory (no mocking) — `setupHooks` accepts an optional `homeDir` parameter for isolation.

## Design Decisions

- **Canvas pixel-art sprites** – Each figure is a `<canvas>` element rendered by `SpriteRenderer` from hand-coded 12×20 pixel row data. No external assets; frame data is easy to extend.
- **2.5D via CSS perspective** – Ground layer uses rotateX + grid to suggest isometric space without full 3D.
- **HTTP server** – Chosen over file watching for low latency and simplicity. Hooks POST to localhost:7891.
- **Lazy figure creation** – Figures only appear when relevant events fire, not pre-placed.
- **Agent lifecycle** – Agent figures spawn on Agent tool use and fade out on `stop` event.

## Related Project

[`D:/oo/code-city`](../code-city) – A VS Code extension visualizing the codebase as an isometric city. The sprite and animation aesthetic from that project should inform the future visual direction of this one.
