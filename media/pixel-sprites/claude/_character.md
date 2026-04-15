# Claude — Character Design

## Concept

A small boxy robot — think retro R2-D2 crossed with a cassette player. Metallic blue chassis, distinct cubic head with a visor strip of cyan LED eyes, stubby arms that extend/retract, thick legs. Feels "computational": every action is sharp and mechanical.

## Anatomy at 24×40

```
Rows  0– 1  antenna (single pixel column, gold)
Rows  2– 9  head (8 rows tall — room for visor, top face, front face, cheek detail)
Rows 10–11  neck joint / shoulder collar
Rows 12–22  torso (11 rows — chest panel, arm sockets, side panels)
Rows 23–24  hip joint
Rows 25–34  legs (10 rows — upper leg, knee, lower leg)
Rows 35–37  feet
Rows 38–39  ground / effect zone
```

## Palette

| Symbol | Color | Role |
|--------|-------|------|
| `C` | `#5588CC` | Metal body — front face |
| `c` | `#88AAFF` | Metal body — top face (lighter) |
| `D` | `#2244AA` | Metal body — shadow (right/under) |
| `L` | `#00FFFF` | LED eye — full glow |
| `l` | `#44AAAA` | LED eye — dim |
| `A` | `#FFCC00` | Gold antenna / accent — front |
| `a` | `#FFEE88` | Gold — top highlight |
| `X` | `#888888` | Grey joint — front |
| `x` | `#AAAAAA` | Grey joint — top |
| `f` | `#FFFFFF` | Flash / spark |
| `F` | `#FFFF88` | Flash — warm glow |
| `O` | `#111111` | Outline |
| `.` | transparent | |

## Key design notes

- **Visor strip** (rows 4–5) is the single most important readable feature — LED state communicates mood at a glance. Full `L` = active; half `l` = thinking; off/`D` = waiting/error.
- **Arms** (rows 12–18 on each side) are stubby but should visibly change angle each animation. At rest they hang slightly forward. Extended = rows 10–20 range depending on pose.
- **Legs** are wide and blocky — "tank legs". Stride should be exaggerated to read clearly.
- **Antenna** (col 10–11 ish, rows 0–1) is a single pixel accent. It can droop (waiting), spike up (celebrating), or vibrate (thinking).
- Body leans forward for working states (cols shift left 2–3 px), upright for idle/reading.
