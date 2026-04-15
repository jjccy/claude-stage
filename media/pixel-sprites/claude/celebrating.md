# Claude — celebrating

**Trigger:** tool_result success  
**Frames:** 8  
**ms/frame:** 150  
**Loop:** no (plays once → idle, after 2s)

## What it communicates
Mission accomplished. Pure joy. Tool worked perfectly.

## Key visual changes across frames

| Frame | Body | Left arm | Right arm | LED | Antenna | Effect |
|-------|------|----------|-----------|-----|---------|--------|
| 0 | upright | rising | rising | `L` bright | spiked up | — |
| 1 | +2px up (jump start) | raised 45° | raised 45° | `L` burst | up | glow halo `F` row 37–38 |
| 2 | +4px up (peak jump) | fully raised above head | fully raised above head | `L`+`f` flash | spiked highest | glow `F` rows 36–39 |
| 3 | +4px (hang) | both arms V-shape up | both arms V-shape up | `f` white burst | spike | burst pixels all corners |
| 4 | +2px (descend) | arms lowering | arms lowering | `L` full | up | glow rows 37–38 |
| 5 | upright (land) | mid-lowering | mid-lowering | `L` | up | dust `F` rows 38–39 |
| 6 | slight squat -1px | arms returning | arms returning | `L` | settling | dust row 39 |
| 7 | upright | at sides | at sides | `L` bright | centered | — |

## Movement description
This is the biggest movement in the entire sprite set. The body actually **jumps up** — shifts upward by 4 grid rows at peak. Both arms go from hanging position all the way up above the head, forming a wide V-shape. At frame 3 (peak), tiny burst pixels appear at the four corners of the canvas. The LED goes pure white (`f`) for one frame — the brightest it ever gets. Landing (frames 5–6) includes a dust puff and a slight squat. Antenna spikes to its highest position.

## What makes it visually distinct
- **Only state where body leaves its base row** — the jump is unmissable
- Both arms fully raised above head — widest + tallest silhouette in the entire sprite set
- White LED flash (only state with `f` white eyes)
- Corner burst pixels are unique
- The squat landing gives it physical weight
