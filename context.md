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
                          StagePanel (WebView: stage.js)
                                    │
                          2.5D figures + animations
```

### Key Files

| File | Purpose |
|------|---------|
| `src/extension.ts` | Activation, command registration, wiring |
| `src/eventServer.ts` | Local HTTP server that receives hook POSTs |
| `src/stagePanel.ts` | VS Code WebView panel lifecycle |
| `media/stage.css` | 2.5D isometric visual design, keyframe animations |
| `media/stage.js` | Figure engine: creates/animates figures per event |

## Event Types

| Event type | Trigger | Figure behavior |
|-----------|---------|----------------|
| `user_prompt` | User submits a message | User figure speaks, Claude starts thinking |
| `thinking` | Claude is reasoning | Claude figure bobs head, thought bubble |
| `tool_use` | Any tool called (pre) | Claude animates to tool-specific pose + bubble |
| `tool_result` | Tool returns (post) | Claude returns to thinking state |
| `tool_use` (Agent) | Agent spawned | New agent figure appears with spawn animation |
| `permission` | Claude awaits approval | Claude raises hand, waits |
| `stop` | Response complete | Claude smiles, agents fade out |

## Tool → Animation Mapping

| Tool | Animation | Emoji |
|------|-----------|-------|
| Read | `reading` – head tilt | 📄 |
| Write/Edit | `writing` – torso sway | ✍️ / ✏️ |
| Bash | `running` – leg walk | ⚡ |
| Grep/Glob | `searching` – head pan | 🔍 / 🗂️ |
| Agent | `spawning` – new figure | 🤖 |
| WebFetch/Search | `searching` | 🌐 |

## Claude Code Hook Integration

To wire up Claude Code, add hooks to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "node -e \"const h=require('http');const d=JSON.stringify({type:'tool_use',tool:process.env.CLAUDE_TOOL_NAME,phase:'pre',params:JSON.parse(process.env.CLAUDE_TOOL_INPUT||'{}')});const r=h.request({hostname:'127.0.0.1',port:7891,path:'/',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(d)}});r.write(d);r.end();\""
      }]
    }],
    "PostToolUse": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "node -e \"const h=require('http');const d=JSON.stringify({type:'tool_result',tool:process.env.CLAUDE_TOOL_NAME,phase:'post'});const r=h.request({hostname:'127.0.0.1',port:7891,path:'/',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(d)}});r.write(d);r.end();\""
      }]
    }],
    "Stop": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "node -e \"const h=require('http');const d=JSON.stringify({type:'stop'});const r=h.request({hostname:'127.0.0.1',port:7891,path:'/',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(d)}});r.write(d);r.end();\""
      }]
    }]
  }
}
```

Alternatively, write a small helper script (`hook.js`) and call it from the hooks — cleaner for maintainability.

## Future Features

- [ ] **Sprite sheets** – Replace CSS stick figures with pixel art sprites (isometric style like code-city)
- [ ] **Camera pan** – Stage scrolls/pans as agents spread out
- [ ] **Tool success/failure** – Green flash vs red shake on PostToolUse result
- [ ] **Agent hierarchy** – Lines connecting Claude to spawned agents
- [ ] **History replay** – Record session events and replay them
- [ ] **Token counter** – Visual gauge for context usage
- [ ] **Side panel mode** – Run as VS Code sidebar view, not full panel
- [ ] **Hook helper script** – A proper `hooks/notify.js` script instead of inline node one-liners
- [ ] **Settings UI** – Port config, theme, figure density

## Design Decisions

- **CSS-only animation** – No canvas or WebGL for v0. Pure CSS transforms keep it lightweight and readable.
- **2.5D via CSS perspective** – Ground layer uses rotateX + grid to suggest isometric space without full 3D.
- **HTTP server** – Chosen over file watching for low latency and simplicity. Hooks POST to localhost:7891.
- **Lazy figure creation** – Figures only appear when relevant events fire, not pre-placed.
- **Agent lifecycle** – Agent figures spawn on Agent tool use and fade out on `stop` event.

## Related Project

[`D:/oo/code-city`](../code-city) – A VS Code extension visualizing the codebase as an isometric city. The sprite and animation aesthetic from that project should inform the future visual direction of this one.
