# Agent — thinking

**Frames:** 6  
**ms/frame:** 440  
**Loop:** yes

## What it communicates
Miner pausing to think. Classic "scratch under the helmet" gesture.

## Key visual changes across frames

| Frame | Left arm | Right arm | Pickaxe | Head tilt |
|-------|----------|-----------|---------|-----------|
| 0 | at side | at side holding pickaxe | held vertical | neutral |
| 1 | rising | holds pickaxe | vertical | slight left |
| 2 | raised — hand near helmet brim | holds pickaxe | vertical | left |
| 3 | hand under helmet, scratching | holds pickaxe | vertical | left |
| 4 | hand under helmet | holds | vertical | left |
| 5 | arm lowering | holds | vertical | recovering |

## Movement description
Right hand holds the pickaxe handle resting vertically beside the body (handle straight down, head up). Left arm raises across frames 1–3 until the "hand" pixel (end of arm, rows 10–11 col-wise) reaches the helmet brim area. At frames 3–4 the hand is clearly under the brim — the scratch pose. Head has a 1px left tilt matching the arm's motion (looking at what you're scratching). Arm returns frames 5–6.

## What makes it visually distinct from idle
- Left arm clearly raised to head level — changes body outline on the left side significantly
- Head tilt
- Pickaxe is vertical (vs. resting on shoulder in idle)
