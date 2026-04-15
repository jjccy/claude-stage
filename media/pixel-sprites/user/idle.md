# User — idle

**Frames:** 6  
**ms/frame:** 550  
**Loop:** yes

## What it communicates
Alien floating at rest. Gentle hover. Relaxed and watching.

## Key visual changes across frames

| Frame | Body height | Eyes | Antenna | Hover glow |
|-------|------------|------|---------|------------|
| 0 | base row | wide open | curls left | `e` dim glow 2px |
| 1 | +1px up | wide open | curls left | `e` glow 3px wide |
| 2 | +2px up (peak) | wide open | curls left | `e` bright 4px, `E` center |
| 3 | +2px | half blink | slight right | `e`+`E` bright |
| 4 | +1px | blink (closed) | right curl | `e` glow 3px |
| 5 | base row | reopening | curls left | `e` dim 2px |

## Movement description
The body floats up 2px over frames 0–2, then descends back over frames 3–5. The hover glow (rows 37–39) expands and brightens as the body rises — the glow is what's "lifting" it. Eyes do a slow blink at frames 3–4. Antenna has a gentle curl oscillation (left at rest, shifts slightly right at peak hover). Total vertical travel: 2 grid rows — small but noticeable at the 3× scale (6 canvas pixels).

## Hover glow detail
The glow is a horizontal spread of `e`/`E` pixels centered under the body:
- Frame 0: 2px wide (`e e`)
- Frame 2: 6px wide (`e E E E E e`)
- Frame 4: 4px wide (`e E E e`)
The glow is always at the same canvas row (rows 38–39) even as the body moves up — as if the glow stays at ground level.
