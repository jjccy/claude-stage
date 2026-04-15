# Agent — Character Design

## Concept

A stocky miner with a hard hat, overalls, and a pickaxe. Built and practical — not elegant. Conveys hard work, digging, execution. When working, the pickaxe swing should dominate the frame.

## Anatomy at 24×40

```
Rows  0– 1  hard hat top (rounded, wide brim visible)
Rows  2– 7  head (face — tan skin, eyes, hat brim)
Rows  8– 9  neck / collar
Rows 10–21  torso + arms (11 rows — overalls, arm swing zone)
Rows 22–23  belt / hip
Rows 24–33  legs (10 rows)
Rows 34–37  boots (thick)
Rows 38–39  ground / effect / pickaxe impact zone
```

## Palette

| Symbol | Color | Role |
|--------|-------|------|
| `k` | `#C89060` | tan skin — front face |
| `K` | `#E8B888` | tan skin — top/highlight |
| `w` | `#8B6040` | tan skin — shadow |
| `e` | `#2B2B2B` | eyes |
| `h` | `#8B4513` | helmet — front |
| `H` | `#BB7733` | helmet — top |
| `q` | `#552200` | helmet — shadow |
| `b` | `#FF8800` | overalls — front |
| `B` | `#FFCC44` | overalls — top highlight |
| `d` | `#993300` | overalls — shadow |
| `p` | `#CCCCCC` | pickaxe head — silver |
| `P` | `#FFFFFF` | pickaxe — highlight |
| `r` | `#888888` | pickaxe — shadow |
| `n` | `#AA7744` | wood handle — front |
| `N` | `#CC9966` | wood handle — highlight |
| `O` | `#111111` | outline |
| `.` | transparent | |

## Key design notes

- **Pickaxe** is the dominant visual element in the working state. The handle should span at least 14 rows and the head should swing through a visible arc.
- **Helmet** has a distinctive wide brim that extends 2px beyond the head on each side — recognizable silhouette.
- The **working** animation is used for all "active" states (searching, writing, running) so it should feel generically "doing work" rather than specifically digging.
- Agents are secondary characters — their animation set is smaller but the working animation should be the most detailed/satisfying.
