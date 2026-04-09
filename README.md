# Claude Stage

A VS Code extension that visualizes Claude Code's activity as animated pixel-art figures on a stage.

Every action Claude takes — thinking, reading files, running commands, spawning agents, requesting permissions — becomes a little character doing something expressive. Multiple Claude sessions appear as separate figures in their own zones.

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
3. The extension auto-registers the required Claude Code hooks in `~/.claude/settings.json` on first activation

No manual setup needed.

## Figures & animations

| Event | Who | What you see |
|-------|-----|--------------|
| User sends a message | User figure | Speech bubble with prompt text |
| Claude is thinking | Claude figure | Head bob + thought cloud |
| Read / Write / Edit | Claude figure | Tool emoji + filename in bubble |
| Bash command | Claude figure | Walking legs animation |
| Grep / Glob | Claude figure | Head pan (searching) |
| Agent spawned | New agent figure | Spawn animation; force layout spreads all agents |
| Agent completes | Agent figure | Flash, idle briefly, then fades |
| Permission needed | Claude figure | Raised hand, waiting state |
| Response complete | Claude figure | Smile + ✓ Done |

## Event log

A compact scrollable log sits in the bottom-right corner. It's invisible until you hover over it, then the background and header fade in. The log shows the last 20 events colour-coded by type. Click **⊞** to expand to a full-screen view showing up to 500 buffered entries — it stays live as new events arrive.

## Development

```bash
npm install
```

Press **F5** to launch the Extension Development Host. `tsc -watch` runs automatically as the pre-launch build task.

Changes to `src/webview/**` hot-reload the webview without restarting.

To exercise all stage features without a live Claude session, run the demo script after launching the host:

```bash
node scripts/demo.js
```

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
- **Claude Stage: Settings** — open VS Code settings filtered to Claude Stage
