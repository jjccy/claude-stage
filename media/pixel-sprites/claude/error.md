# Claude — error

**Trigger:** tool_result failure  
**Frames:** 8  
**ms/frame:** 110  
**Loop:** no (plays once → thinking, after 1.5s)

## What it communicates
Something went wrong. A shock/flinch. Physical reaction to bad news.

## Key visual changes across frames

| Frame | Body shift | Arms | LED | Head | Effect |
|-------|-----------|------|-----|------|--------|
| 0 | normal | normal idle | `L` normal | normal | — |
| 1 | 2px right jerk | arms fling right | `l` flicker | tilts right | `f` spark top-left corner |
| 2 | 3px right (max recoil) | arms splayed right | `l` flicker | tilts right | `f` sparks top-left + top-right |
| 3 | 3px right | arms splayed | off `D` | tilts hard | sparks |
| 4 | 2px right | arms mid-return | `l` dim | slight tilt | dim sparks |
| 5 | 1px right | arms returning | `l` | recovering | faint spark |
| 6 | center | arms mostly back | `l`+`L` | centering | — |
| 7 | center | arms at sides | `L` | straight | — |

## Movement description
Frame 0 is normal (one-frame setup so it reads as a reaction, not a pre-existing state). Frame 1: the entire body **jerks 2px to the right** — like a physical impact from the left. Frames 2–3 are full recoil — body at maximum right shift, arms flung to the right side, LED off. Spark pixels appear at the top-left corner (where the "impact" would come from). Frames 4–7 are the recovery: body slides back to center, LED reboots. The fast timing (110ms) makes this feel like a sharp shock.

## Spark detail
`f` white pixels appear at:
- Frame 1: top-left area (cols 0–2, rows 0–2)
- Frame 2: both top corners
- Frame 3: both top corners, slightly larger cluster
- Frames 4–5: shrinking dots

## What makes it visually distinct
- **Horizontal body shift** — no other state moves the body sideways
- Arms flung to one side — completely asymmetric
- LED goes dark (shares this with waiting, but has the shock recoil)
- Sparks at corners — unique to error
- Fastest timing of any state (110ms)
