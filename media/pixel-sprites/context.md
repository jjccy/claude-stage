# Pixel Sprites — Context & Quick Reference

## Why this folder exists

The current 16×16 grid is too small to show distinct animations — arm swings are 1px wide, head gestures are invisible. We're upgrading to a **24×40 grid** (@ SCALE=3 → **72×120 px canvas**) so each animation can use dramatic full-body movement.

Every animation lives in its own file so the diff for "fix Claude's running pose" is a single file, not hunting through 1500-line sprite.ts.

---

## Canvas spec

| Property | Value |
|----------|-------|
| Grid width | 24 px |
| Grid height | 40 px |
| Scale | 3× |
| Canvas size | 72 × 120 px |
| Rows per frame | 40 |
| Chars per row | 24 |

At 24×40:
- **Head zone**: rows 0–9 (10 rows) — room for distinct top/front face, visible eyes, antenna
- **Body zone**: rows 10–23 (14 rows) — torso + arm swing visible
- **Leg zone**: rows 24–35 (12 rows) — full stride, crouching, jumping
- **Ground/effect zone**: rows 36–39 (4 rows) — dust, sparks, shadow

---

## Shading convention (all characters)

Every surface uses 3 shades to imply 3/4 perspective depth:

| Symbol | Meaning |
|--------|---------|
| `.` | Transparent |
| `O` | Outline `#111111` |
| Top-face char | Lightest — facing camera-up |
| Front-face char | Mid tone — facing viewer |
| Shadow char | Darkest — right side/underside |

Each character has its own letter set (see per-character plan files).

---

## File structure

```
media/pixel-sprites/
  context.md          ← you are here
  claude/
    _character.md     ← palette, anatomy, design notes
    idle.md
    thinking.md
    searching.md
    writing.md
    running.md
    spawning.md
    waiting.md
    celebrating.md
    reading.md
    error.md
  agent/
    _character.md
    idle.md
    thinking.md
    working.md        ← pickaxe swing (used for searching/writing/running)
    waiting.md
    spawning.md
  user/
    _character.md
    idle.md
    thinking.md
    waiting.md
```

---

## Build pipeline

All pixel frame data lives in `src/webview/sprites/` as TypeScript constant files:

```
src/webview/sprites/
  claude/
    idle.ts           → export const claude_idle: string[][] = [...]
    thinking.ts
    ...
  agent/
    idle.ts
    ...
  user/
    idle.ts
    ...
  index.ts            → re-exports all into PIXEL_RAW object
```

`sprite.ts` references `./sprites/index.ts` via `/// <reference path>` so it gets concatenated first in the `outFile` build. No dynamic imports, no fetch — same zero-runtime-dependency approach as the rest of the webview.

---

## Animation rules

1. **Minimum 6 frames per state** (currently 4 — too few for smooth motion)
2. **Key pose contrast**: frame 0 (rest) and frame 3 (peak) must look visually different at arm's length
3. **Use the full grid**: if an arm swings, it should travel ≥ 6 grid rows; if the body leans, lean ≥ 3 columns
4. **Effect pixels**: use the ground zone (rows 36–39) for dust/sparks/glow — makes action feel impactful
5. **No copy-paste idle**: every non-idle state must change the arm position, body lean, OR head orientation from the idle pose

---

## How to add a new animation

1. Create `media/pixel-sprites/<role>/<state>.md` — plan the poses
2. Create `src/webview/sprites/<role>/<state>.ts` — implement the frames
3. Add export to `src/webview/sprites/index.ts`
4. Add timing entry to `PIXEL_MS` in `sprite.ts`
5. If it's a new state name, add fallback mapping in `PixelSpriteRenderer.frameCount()`
6. Run `npm run compile` — done
