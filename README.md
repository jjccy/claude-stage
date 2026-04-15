# Claude Stage

A VS Code extension that visualizes Claude Code's activity as animated pixel-art figures on a stage.

Every action Claude takes — thinking, reading files, running commands, spawning agents, requesting permissions — becomes a little character doing something expressive. Multiple Claude sessions appear as separate figures that arrange themselves dynamically on the stage.

![Claude Stage preview](media/preview.png)

## How it works

Claude Code fires hooks on every tool call. The extension runs a local HTTP server that receives those hook events and animates corresponding figures in a VS Code panel.

```
Claude Code (hooks) ──POST──▶ localhost:7891
                                    │
                              VS Code Extension
                                    │
                            Webview (stage.js)
                                    │
                          2.5D figures + animations
```

## Installation

1. Install the extension in VS Code
2. Open any project — the stage panel opens automatically
3. The extension auto-registers all 26 Claude Code hooks in `~/.claude/settings.json` on first activation

No manual setup needed.

## Figures & animations

Three distinct pixel-art characters: a **blue alien** for the User, a **human warrior** (LPC) for Claude, and an **orc** (LPC) for each spawned Agent. Claude faces left at rest and turns right when actively working; the current animation state appears as a small italic label below the name.

| Event | Who | What you see |
|-------|-----|--------------|
| User sends a message | Blue alien | Speech bubble with prompt text |
| Claude is thinking | Claude (faces right) | Walking animation + thought cloud |
| Read / Grep / Glob / WebSearch | Claude (faces right) | Tool emoji + param in bubble |
| Write / Edit | Claude (faces right) | Slash animation |
| Bash command | Claude (faces right) | Thrust animation |
| Agent spawned | New orc figure | Cast animation → walking; force layout spreads all agents |
| Agent completes | Orc figure | Flash ✓/✗, then fades |
| Permission request | Claude (faces left) | Hurt animation, ⚠️ bubble with tool details |
| Auto-mode denied | Claude | 🚫 bubble, red flash |
| Tool crash (PostToolUseFailure) | Claude | Red flash, error logged |
| Context compaction | Claude | 📦 bubble, before→after token count |
| Session ends cleanly | Claude figure | Fades out |
| Stop error / rate limit | Claude (faces left) | ⚠️ bubble, 5 s timeout |
| Response complete | Claude (faces left) | ✓ Done bubble |

## Multiple Claude sessions

When more than one `claude` process is running, each gets its own figure. Claudes arrange themselves using the same force-directed physics as agents — they repel each other and are attracted back toward the centre of the stage, settling into a natural vertical spread. When a session ends, the remaining Claudes smoothly re-settle, and their agent clusters follow.

## Event log

A compact scrollable log sits in the bottom-right corner. It's invisible until you hover over it, then the background and header fade in. The log shows the last 20 events colour-coded by type. Click **⊞** to expand to a full-screen view showing up to 500 buffered entries — it stays live as new events arrive. The overlay wraps long lines so full file paths, commands, and messages are always readable.

## Development

```bash
npm install
```

Press **F5** to launch the Extension Development Host. `tsc -watch` runs automatically as the pre-launch build task.

Changes to `src/webview/**` hot-reload the webview without restarting.

To exercise all 26 hook types without a live Claude session, run the demo script after launching the host:

```bash
node scripts/demo.js
```

**Dev tools panel** — press `` ` `` (backtick) or click the 🛠 button in the stage status bar to open a panel that lets you freely spawn Claude instances and agents, send prompts, and remove sessions, all without needing real hooks. Useful for testing layout and animations.

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `claudeStage.port` | `7891` | Port for the local event server |
| `claudeStage.autoOpen` | `true` | Open the stage panel on startup |
| `claudeStage.theme` | `"default"` | Color theme: `default` · `light` · `high-contrast` |
| `claudeStage.figureDensity` | `1` | Agent zone size multiplier (0.5 – 3); larger = agents spread further apart |

Changing any setting reloads the panel automatically. Click **⚙** in the stage status bar to open settings directly.

## Commands

- **Claude Stage: Open Stage** — open or focus the stage panel
- **Claude Stage: Clear Stage** — remove all figures and reset
- **Claude Stage: Trim Sessions** — keep only the most-recently-active Claude session and clear all logs (same as the ⊘ button in the status bar)
- **Claude Stage: Settings** — open VS Code settings filtered to Claude Stage
