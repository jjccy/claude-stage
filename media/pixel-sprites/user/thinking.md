# User — thinking

**Trigger:** user_prompt sent  
**Frames:** 6  
**ms/frame:** 380  
**Loop:** yes

## What it communicates
Alien just sent a message and is waiting/thinking about it. Curious, attentive.

## Key visual changes across frames

| Frame | Body tilt | Eyes | Antenna | Hover glow |
|-------|----------|------|---------|------------|
| 0 | neutral | looking up-left | extends upward | `e` steady |
| 1 | 1px tilt left | looking up | antenna straight up | `e` steady |
| 2 | 1px tilt left | looking up | antenna extends +1px | `E` bright tip |
| 3 | 2px tilt left (max) | wide up-gaze | antenna extends +2px (fully extended, straight up) | `e`+`E` |
| 4 | 1px tilt left | eyes center | antenna at peak | `e` |
| 5 | neutral | eyes forward | antenna curls back | `e` |

## Movement description
The body tilts to the left — as if leaning into a question. Tilt is achieved by shifting the upper body pixels left while keeping the lower body/hover zone centered. The antenna extends and straightens upward over frames 0–3 (grows from a curl to a straight line sticking up), like it's trying to "receive a signal." Eyes look upward-left at frames 0–2, which combined with the body tilt gives a clear "thoughtful look up" pose. At frame 3 the antenna is at its tallest point.

## What makes it visually distinct from idle
- **Body tilts left** — idle has no lean, thinking has a clear 2px lean
- **Eyes look up** — vs. idle's forward gaze with blink
- **Antenna extends upward** — vs. idle's slow curl oscillation
- Hover glow is steady (not pulsing) — less "relaxed", more "attentive"
