# Claude — searching

**Trigger:** tool_use: Grep, Glob, WebFetch, WebSearch  
**Frames:** 6  
**ms/frame:** 200  
**Loop:** yes

## What it communicates
Rapid active scanning. Eyes sweeping across something. Urgent, quick.

## Key visual changes across frames

| Frame | Body | Head turn | Both arms | LED position | Effect |
|-------|------|-----------|-----------|-------------|--------|
| 0 | forward lean 2px | neutral | stretched forward+left | `L` far-left col | — |
| 1 | forward lean 2px | slight left | stretched forward | `L` center-left | — |
| 2 | forward lean 2px | neutral | stretched forward | `L` center | small scan dot row 38 |
| 3 | forward lean 2px | slight right | stretched forward | `L` center-right | — |
| 4 | forward lean 2px | neutral | stretched forward+right | `L` far-right col | — |
| 5 | forward lean 2px | neutral | stretched forward | `L` center | scan dot row 38 |

## Movement description
Body leans hard forward (2px column shift left). Both arms extend forward like a robot reaching for something. The LED "eye" pixel shifts left-to-right across the visor width over 6 frames — this is the scan motion. A tiny `f` pixel appears in the ground zone (row 38) at frames 2 and 5 to suggest a scanning beam hitting the floor.

## What makes it visually distinct
- **Both arms extended forward** — huge silhouette change from idle
- Body lean is 2px (doubled vs thinking's 1px)
- LED scans visibly across visor — readable even at small size
- Fastest non-running timing (200ms)
- Ground effect pixel
