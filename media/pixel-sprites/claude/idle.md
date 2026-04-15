# Claude — idle

**Trigger:** default state, after celebrating (2s), after spawning completes  
**Frames:** 6  
**ms/frame:** 500  
**Loop:** yes

## What it communicates
Robot is online but not busy. Calm, present, slightly breathing.

## Key visual changes across frames

| Frame | Body | Arms | LED | Antenna |
|-------|------|------|-----|---------|
| 0 | upright | hang at sides | dim `l` | centered up |
| 1 | upright | hang at sides | mid `l`+`L` | centered up |
| 2 | upright +1px up (float) | hang at sides | full `L` | centered up |
| 3 | upright +1px up | hang at sides | full `L` | 1px right tilt |
| 4 | upright | hang at sides | mid `l`+`L` | centered up |
| 5 | upright | hang at sides | dim `l` | centered up |

## Movement description
Slow vertical float: body shifts up 1px at frames 2–3, back down at 4–5. LED pulses bright-dim in sync. Antenna has a tiny 1px tilt at the peak. This is the "breathing" effect — subtle but enough to feel alive vs. a static image.

## What makes it visually distinct from other states
- Body is perfectly upright (no lean)
- Arms strictly hanging (no extension)
- Only vertical movement, no horizontal shift
- Slowest timing (500ms per frame)
