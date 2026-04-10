// ── Sprite rendering ──────────────────────────────────────────────────────────
// Supports two animation formats:
//   "sheet" – LPC 64×64 sprite sheets (Claude, Agent) rendered at 2×
//   "seq"   – individual PNG sequences (User / blue alien)
//
// LPC Attribution: LPC Character Bases v2 — CC-BY-SA 3.0
//   Human Male (Claude), Lizardman Male (Agent)
//   Authors: Benjamin K. Smith, Stephen Challener, and LPC contributors.
// Alien Blue: CraftPix.net — OGA-BY 3.0

const LPC_FRAME_SIZE = 64;
const SCALE          = 2;           // LPC sprites rendered at 2× (128 px canvas)
const SW             = LPC_FRAME_SIZE;  // exposed for stage.ts
const SH             = LPC_FRAME_SIZE;

// LPC direction rows (North=0, West=1, South=2, East=3)
const DIR_WEST  = 1;   // left-facing
const DIR_EAST  = 3;   // right-facing — Claude uses this when actively working
const DIR_NORTH = 0;   // used for Hurt animation

// ── Animation definition types ────────────────────────────────────────────────

interface SheetAnim {
  kind:   'sheet';
  file:   string;   // PNG filename in role's sprite folder
  row:    number;   // LPC direction row (0–3)
  frames: number;   // number of horizontal frame columns
  ms:     number;   // ms per frame
}

interface SeqAnim {
  kind:  'seq';
  files: string[];  // individual PNG filenames in order
  ms:    number;    // ms per frame
  dx:    number;    // dest x inside canvas
  dy:    number;    // dest y inside canvas
  dw:    number;    // dest width inside canvas
  dh:    number;    // dest height inside canvas
}

type AnimDef = SheetAnim | SeqAnim;

// ── Per-role animation sets ───────────────────────────────────────────────────

const ROLE_ANIMS: Record<string, Record<string, AnimDef>> = {

  // Claude — LPC Human Male
  //   idle/waiting → face LEFT (at rest, waiting)
  //   working states → face RIGHT (engaged, active)
  claude: {
    idle:      { kind: 'sheet', file: 'Idle.png',   row: DIR_WEST,  frames: 1,  ms: 1000 },
    thinking:  { kind: 'sheet', file: 'Walk.png',   row: DIR_EAST,  frames: 8,  ms: 130  },
    searching: { kind: 'sheet', file: 'Shoot.png',  row: DIR_EAST,  frames: 13, ms: 70   },
    writing:   { kind: 'sheet', file: 'Slash.png',  row: DIR_EAST,  frames: 6,  ms: 90   },
    running:   { kind: 'sheet', file: 'Thrust.png', row: DIR_EAST,  frames: 8,  ms: 55   },
    spawning:  { kind: 'sheet', file: 'Cast.png',   row: DIR_EAST,  frames: 7,  ms: 90   },
    waiting:   { kind: 'sheet', file: 'Hurt.png',   row: DIR_NORTH, frames: 6,  ms: 220  },
  },

  // User — blue alien individual PNG sequence, centered in canvas
  user: {
    idle: {
      kind: 'seq',
      files: [
        'blue__0000_idle_1.png',
        'blue__0001_idle_2.png',
        'blue__0002_idle_3.png',
      ],
      ms: 450,
      dx: 32, dy: 0, dw: 64, dh: 128,
    },
    thinking: {
      kind: 'seq',
      files: [
        'blue__0006_walk_1.png',
        'blue__0007_walk_2.png',
        'blue__0008_walk_3.png',
        'blue__0009_walk_4.png',
        'blue__0010_walk_5.png',
        'blue__0011_walk_6.png',
      ],
      ms: 160,
      dx: 32, dy: 0, dw: 64, dh: 128,
    },
  },

  // Agent — LPC Lizardman Male, left-facing, simple set
  agent: {
    idle:      { kind: 'sheet', file: 'Idle.png', row: DIR_WEST,  frames: 1, ms: 1000 },
    thinking:  { kind: 'sheet', file: 'Walk.png', row: DIR_WEST,  frames: 8, ms: 140  },
    waiting:   { kind: 'sheet', file: 'Hurt.png', row: DIR_NORTH, frames: 6, ms: 260  },
    spawning:  { kind: 'sheet', file: 'Cast.png', row: DIR_WEST,  frames: 7, ms: 100  },
  },

};

// ── SpriteRenderer ────────────────────────────────────────────────────────────

class SpriteRenderer {
  private sheets:    Map<string, HTMLImageElement> = new Map(); // sheet key → img
  private seqImages: Map<string, HTMLImageElement> = new Map(); // filename → img
  private anims:     Record<string, AnimDef>;

  constructor(role: string, spritesBaseUrl: string) {
    const defs = ROLE_ANIMS[role] ?? ROLE_ANIMS['agent'];
    this.anims = defs;

    for (const def of Object.values(defs)) {
      if (def.kind === 'sheet') {
        if (!this.sheets.has(def.file)) {
          const img = new Image();
          img.src   = `${spritesBaseUrl}/${role}/${def.file}`;
          this.sheets.set(def.file, img);
        }
      } else {
        for (const file of def.files) {
          if (!this.seqImages.has(file)) {
            const img = new Image();
            img.src   = `${spritesBaseUrl}/${role}/${file}`;
            this.seqImages.set(file, img);
          }
        }
      }
    }
  }

  ms(state: string): number {
    return (this.anims[state] ?? this.anims['idle']).ms;
  }

  frameCount(state: string): number {
    const def = this.anims[state] ?? this.anims['idle'];
    return def.kind === 'sheet' ? def.frames : def.files.length;
  }

  draw(ctx: CanvasRenderingContext2D, state: string, frameIdx: number): void {
    const def = this.anims[state] ?? this.anims['idle'];
    const cw  = ctx.canvas.width;
    const ch  = ctx.canvas.height;
    ctx.clearRect(0, 0, cw, ch);

    if (def.kind === 'sheet') {
      const sheet = this.sheets.get(def.file);
      if (!sheet?.complete || !sheet.naturalWidth) return;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        sheet,
        (frameIdx % def.frames) * LPC_FRAME_SIZE, def.row * LPC_FRAME_SIZE,
        LPC_FRAME_SIZE, LPC_FRAME_SIZE,
        0, 0, cw, ch
      );
    } else {
      const file = def.files[frameIdx % def.files.length];
      const img  = this.seqImages.get(file);
      if (!img?.complete || !img.naturalWidth) return;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight,
                    def.dx, def.dy, def.dw, def.dh);
    }
  }
}
