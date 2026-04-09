# Claude Stage

A VS Code extension that visualizes Claude Code's activity as animated 2.5D figures on a stage.

Every action Claude takes — thinking, reading files, running commands, spawning agents, requesting permissions — becomes a little character doing something expressive.

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
| Agent spawned | New agent figure | Spawn animation, fades on stop |
| Permission needed | Claude figure | Raised hand, waiting state |
| Response complete | Claude figure | Smile + ✓ Done |

## Development

```bash
npm install
```

Press **F5** to launch the Extension Development Host. `tsc -watch` runs automatically as the pre-launch build task.

Changes to `media/stage.js` or `media/stage.css` hot-reload the webview without restarting.

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `claudeStage.port` | `7891` | Port for the local event server |
| `claudeStage.autoOpen` | `true` | Open the stage panel on startup |

## Commands

- **Claude Stage: Open Stage** — open or focus the stage panel
- **Claude Stage: Clear Stage** — remove all figures and reset
