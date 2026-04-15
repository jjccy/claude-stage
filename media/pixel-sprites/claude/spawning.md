# Claude — spawning

**Trigger:** session_start, tool_use: Agent  
**Frames:** 8  
**ms/frame:** 180  
**Loop:** no (plays once, transitions to idle)

## What it communicates
Robot booting up. Cold start. Materializing from nothing.

## Key visual changes across frames

| Frame | Body state | LED | Antenna | Effect |
|-------|------------|-----|---------|--------|
| 0 | outline only (hollow) | off | off | scan line row 0 `f` |
| 1 | outline + top 10 rows filled dark `D` | off | dim `a` | scan line row 8 |
| 2 | top 20 rows dark fill, bottom outline | dim `l` flicker | `a` | scan line row 16 |
| 3 | full dark fill `D` | `l` steady | `a` | scan line row 24 `f` |
| 4 | dark→mid: body lightens to `C` midsection | `l`+`L` | `A` | glow halo row 38–39 `F` |
| 5 | full `C` body | `L` half | `A` | glow row 37–39 |
| 6 | full `C` body + gold accents appear | `L` full | `A` bright | glow row 36–39 |
| 7 | final idle pose, full color | `L` full | `A` spike up | bright burst pixels at corners |

## Movement description
The boot sequence: frame 0 is just an outline silhouette (like a wireframe). A horizontal scan line (`f` pixel) descends one row per frame as if a printer is drawing the character from top to bottom. At frame 3 the body is fully dark (powered but not initialized). Frames 4–6 are a color-fill animation as systems come online — the LED lights up, gold accents appear. Frame 7 is the "fully online" flash with corner burst pixels.

## What makes it visually distinct
- Hollow → filled progression is unlike anything else
- Descending scan line is unique to this state
- Color progression dark→full is purely a spawning effect
