# Agent — working

**Trigger:** tool_use of any kind (used for searching, writing, running)  
**Frames:** 8  
**ms/frame:** 155  
**Loop:** yes

## What it communicates
Full pickaxe swing. This is the signature agent animation — hard physical work.

## Key visual changes across frames

| Frame | Body lean | Both arms | Pickaxe position | Effect |
|-------|-----------|-----------|-----------------|--------|
| 0 | upright | raised back-high | pickaxe head at rows 2–4 (back-high position) | — |
| 1 | 1px forward | arms mid-back | pickaxe head rows 5–7 | — |
| 2 | 2px forward | arms overhead | pickaxe head rows 8–10 (peak arc, above head) | — |
| 3 | 2px forward | arms forward-high | pickaxe head rows 10–14 (swinging down) | — |
| 4 | 3px forward (max lean) | arms forward-down | pickaxe head rows 20–24 (accelerating down) | — |
| 5 | 3px forward | arms at lowest point | pickaxe head rows 34–36 (impact!) | `P`/`f` impact flash rows 37–39, 3-pixel dust cloud |
| 6 | 2px forward | arms begin back-swing | pickaxe head rows 28–30 | dust settling `F` rows 38–39 |
| 7 | 1px forward | arms back-mid | pickaxe head rows 14–18 (back-swing) | dust fading |

## Movement description
This is a full 270-degree arc swing. The pickaxe head travels from behind-and-above the character, over the top of the head, down in a wide forward arc, and impacts the ground at rows 37–39. At impact (frame 5), a 3-pixel cluster of `f` white pixels and `P` highlight pixels appears at the ground line — the impact flash. Two dust pixels (`F` warm glow) spread outward.

The body lean accompanies the swing: max lean (3px) at frame 4–5 as the arms are at their lowest. This makes the whole body feel committed to the strike.

## Pickaxe arc detail
The pickaxe should be drawn as:
- Handle: 6–8 `n`/`N` pixels along the swing line
- Head: 3-pixel cluster (`p`/`P`/`r`) at the end of handle
- The arc passes ABOVE the helmet (rows 2–4 at the back, row 1–2 at the peak)

## What makes it visually distinct
- **Full over-the-head arc** — pickaxe pixels appear above the head zone (impossible in idle)
- Maximum body lean of any agent state
- Impact flash and dust cloud
- 8 frames = smooth arc
