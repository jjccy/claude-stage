# Claude — thinking

**Trigger:** user_prompt received, tool_result processed, session_start  
**Frames:** 6  
**ms/frame:** 380  
**Loop:** yes

## What it communicates
Robot is processing. Internal computation. The classic "hand to chin" thinking pose.

## Key visual changes across frames

| Frame | Body lean | Right arm | Left arm | LED | Antenna |
|-------|-----------|-----------|----------|-----|---------|
| 0 | upright | raised to chin level | at side | `l` half | left tilt |
| 1 | 1px forward lean | arm at chin | at side | `L`+`l` flicker | left tilt |
| 2 | 1px forward lean | arm touching head | at side | `L` bright | left tilt |
| 3 | 1px forward lean | arm at chin | at side | `l` dim | centered |
| 4 | upright | arm lowering | at side | `l` | right tilt |
| 5 | upright | arm at mid | at side | `L`+`l` | left tilt |

## Movement description
Right arm raised up until the "hand" end (a small nub pixel) reaches head level — touching the chin/face area. Body has a slight 1px forward lean for frames 1–3. Antenna oscillates left-right as if picking up signals. LED flickers irregularly (not the smooth pulse of idle) — conveys active internal processing.

## What makes it visually distinct
- **Right arm clearly raised** — easily 8–10 rows above idle position
- Forward body lean changes silhouette shape
- Antenna oscillates (vs. idle's slow tilt)
- LED flickers vs. idle's smooth pulse
