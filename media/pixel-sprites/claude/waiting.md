# Claude — waiting

**Trigger:** permission request (waiting for human approval)  
**Frames:** 6  
**ms/frame:** 700  
**Loop:** yes

## What it communicates
Robot in standby / blocked. Impatient but patient. Power-saving mode.

## Key visual changes across frames

| Frame | Body | Arms | LED | Antenna | Effect |
|-------|------|------|-----|---------|--------|
| 0 | upright | crossed over chest | `l` dim | drooped left | — |
| 1 | upright | crossed over chest | `l` very dim | drooped left | — |
| 2 | upright | crossed over chest | off (`D`) | drooped left | — |
| 3 | upright | crossed over chest | off | drooped left | — |
| 4 | upright | crossed over chest | `l` very dim | drooped | — |
| 5 | upright | crossed | `l` dim | drooped | — |

## Movement description
Arms crossed is the key pose change — both arms folded across the chest/upper torso area (extend horizontally inward). Antenna droops 2–3px left from its normal upright position. LED does a slow fade-to-black over frames 0–3, then slowly recovers. No body lean, no movement — this communicates "frozen in place, waiting." The slow LED fade is the only motion.

## Arm crossing detail
Both arms extend inward from their sockets (rows 13–16), crossing in the center of the body. The arm pixels overlap the chest `C` pixels, creating a visible X-shape in the torso area.

## What makes it visually distinct
- **Arms crossed** — completely different silhouette from all other states
- **Antenna drooped** — opposite of celebrating/idle upright
- **LED fades to black** — only state where LEDs go fully off
- Slowest timing (700ms)
