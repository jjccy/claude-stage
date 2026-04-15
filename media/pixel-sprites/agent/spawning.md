# Agent — spawning

**Trigger:** SubagentStart  
**Frames:** 8  
**ms/frame:** 220  
**Loop:** no (plays once → thinking)

## What it communicates
Miner climbing up out of a hole. Summoned from underground.

## Key visual changes across frames

| Frame | Visible body | Position |
|-------|-------------|---------|
| 0 | just the helmet top (2px) poking up from bottom | rows 37–39 |
| 1 | helmet fully visible | rows 33–39 |
| 2 | head + shoulders | rows 27–39 |
| 3 | head + torso | rows 21–39 |
| 4 | head + torso + arms extended up (climbing) | rows 15–39 |
| 5 | full body with arms still raised | rows 8–39 |
| 6 | full body, arms lowering | rows 2–39 |
| 7 | full body, standing normally | rows 0–39 |

## Movement description
The character literally rises up from the bottom of the canvas — as if climbing out of a shaft. Each frame reveals more of the body from top to bottom (the bottom of the canvas acts as the ground level). At frames 4–5, the arms are raised above the head (gripping the rim) while the torso is still partially below the frame edge. Frame 6–7 complete the climb-out and settle into standing position.

## Hole/shaft detail
At frames 0–5, the lower portion of the canvas (below the visible body) has a darker fill (`d`/`q` dark pixels) to suggest the mine shaft. A couple of `r` grey pixels at the edges of the shaft entrance.

## What makes it visually distinct
- Character literally entering from below-frame — unique
- Raising arms (for climbing) looks very different from any standing pose
- Shaft darkness in lower canvas
