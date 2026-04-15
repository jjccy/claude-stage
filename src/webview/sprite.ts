/// <reference path="./sprites/index.ts" />

// ── Shared renderer interface ─────────────────────────────────────────────────

interface IRenderer {
  readonly canvasW: number;
  readonly canvasH: number;
  draw(ctx: CanvasRenderingContext2D, state: string, frameIdx: number): void;
  ms(state: string): number;
  frameCount(state: string): number;
}

// ── PNG sprite rendering ──────────────────────────────────────────────────────
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
    waiting:     { kind: 'sheet', file: 'Hurt.png',   row: DIR_NORTH, frames: 6,  ms: 220  },
    celebrating: { kind: 'sheet', file: 'Cast.png',   row: DIR_EAST,  frames: 7,  ms: 90   },
    reading:     { kind: 'sheet', file: 'Walk.png',   row: DIR_WEST,  frames: 8,  ms: 130  },
    error:       { kind: 'sheet', file: 'Hurt.png',   row: DIR_NORTH, frames: 6,  ms: 150  },
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

class SpriteRenderer implements IRenderer {
  readonly canvasW = LPC_FRAME_SIZE * SCALE;   // 128
  readonly canvasH = LPC_FRAME_SIZE * SCALE;   // 128
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

// ── Pixel-art renderer — 3/4-perspective hand-coded sprites ──────────────────
// Grid: 24 × 40 pixels @ SCALE 3 → 72 × 120 px canvas
// Frame data lives in src/webview/sprites/ — assembled into PIXEL_RAW by
// sprites/index.ts which is referenced below.
//
// Shading convention (shared across all characters):
//   .  transparent
//   O  outline (#111111)
//
// Each character uses its own letter set — see media/pixel-sprites/<role>/_character.md

const PIXEL_SCALE = 3;
const PIXEL_SW    = 24;
const PIXEL_SH    = 40;

// ─── Alien (user) palette ────────────────────────────────────────────────────
//  g  green skin front   G  green skin top    s  green skin shadow
//  m  magenta eye        M  magenta highlight
//  b  teal body front    B  teal body top      d  teal body shadow
//  a  antenna light      A  antenna tip bright
const ALIEN_PAL: Record<string, string> = {
  '.': '', O: '#111111',
  g: '#80E080', G: '#AAFFAA', s: '#447744',
  m: '#FF44FF', M: '#FF99FF',
  b: '#44CCCC', B: '#99FFFF', d: '#228888',
  a: '#BBFFBB', A: '#CCFFCC',
  e: '#FFFF44', E: '#FFFFFF',   // hover glow
};

// ─── Miner (agent) palette ───────────────────────────────────────────────────
//  k  tan skin front     K  tan skin top       w  tan skin shadow
//  e  dark eye
//  h  helmet front       H  helmet top         q  helmet shadow
//  b  orange gear front  B  gear top highlight  d  gear shadow
//  p  pickaxe silver     P  silver highlight    r  pickaxe shadow
//  n  wooden handle      N  handle highlight
const MINER_PAL: Record<string, string> = {
  '.': '', O: '#111111',
  k: '#C89060', K: '#E8B888', w: '#8B6040',
  e: '#2B2B2B',
  h: '#8B4513', H: '#CC7733', q: '#552200',
  b: '#FF8800', B: '#FFCC44', d: '#993300',
  p: '#CCCCCC', P: '#FFFFFF', r: '#888888',
  n: '#AA7744', N: '#CC9966',
};

// ─── Robot (claude) palette ──────────────────────────────────────────────────
//  c  metal body front   C  metal top          D  metal shadow
//  l  LED eye cyan       L  LED highlight
//  a  gold antenna       A  gold top
//  x  grey joint         X  joint top
//  f  flash/spark white
const ROBOT_PAL: Record<string, string> = {
  '.': '', O: '#111111',
  c: '#5588CC', C: '#88AAFF', D: '#2244AA',
  l: '#00FFFF', L: '#CCFFFF',
  a: '#FFCC00', A: '#FFEE88',
  x: '#888888', X: '#AAAAAA',
  f: '#FFFFFF',
};

// ─── Timing (ms per frame per role/state) ────────────────────────────────────

const PIXEL_MS: Record<string, Record<string, number>> = {
  user:  { idle: 600, thinking: 450, waiting: 800 },
  agent: { idle: 650, thinking: 500, working: 175, waiting: 900, spawning: 280 },
  claude: {
    idle: 480, thinking: 380, searching: 230, writing: 190, running: 150,
    spawning: 220, waiting: 650, celebrating: 180, reading: 320, error: 140,
  },
};

// ─── PixelSpriteRenderer ─────────────────────────────────────────────────────

type Pixel = string | null;

function parsePixelFrame(rows: string[], pal: Record<string, string>): Pixel[][] {
  return rows.map(row => {
    const r = row.padEnd(PIXEL_SW, '.').slice(0, PIXEL_SW);
    return r.split('').map(ch => {
      const color = pal[ch];
      return (color === undefined || color === '') ? null : color;
    });
  });
}

class PixelSpriteRenderer implements IRenderer {
  readonly canvasW = PIXEL_SW * PIXEL_SCALE;  // 72
  readonly canvasH = PIXEL_SH * PIXEL_SCALE;  // 120

  private frames: Map<string, Pixel[][]> = new Map();
  private role: string;

  constructor(role: string) {
    this.role = role;
    const pal = role === 'user' ? ALIEN_PAL : role === 'agent' ? MINER_PAL : ROBOT_PAL;
    const prefix = role + '_';
    for (const key of Object.keys(PIXEL_RAW)) {
      if (key.startsWith(prefix)) {
        const stateKey = key.slice(prefix.length); // e.g. "idle_0"
        this.frames.set(stateKey, parsePixelFrame(PIXEL_RAW[key], pal));
      }
    }
  }

  frameCount(state: string): number {
    // Count how many frames exist for this state
    let n = 0;
    while (this.frames.has(`${state}_${n}`)) n++;
    if (n > 0) return n;
    // Agent fallback: searching/writing/running → working
    if (this.role === 'agent') {
      n = 0;
      while (this.frames.has(`working_${n}`)) n++;
      if (n > 0) return n;
    }
    // Universal fallback: idle
    n = 0;
    while (this.frames.has(`idle_${n}`)) n++;
    return Math.max(n, 1);
  }

  ms(state: string): number {
    const roleMs = PIXEL_MS[this.role];
    if (roleMs) {
      if (roleMs[state] !== undefined) return roleMs[state];
      // Agent working fallback
      if (this.role === 'agent' && roleMs['working'] !== undefined) return roleMs['working'];
    }
    return 500;
  }

  draw(ctx: CanvasRenderingContext2D, state: string, frameIdx: number): void {
    ctx.clearRect(0, 0, this.canvasW, this.canvasH);

    // Resolve actual state key
    let resolvedState = state;
    let count = this.frameCount(state);
    if (count === 0 || !this.frames.has(`${state}_0`)) {
      resolvedState = (this.role === 'agent') ? 'working' : 'idle';
      count = this.frameCount(resolvedState);
    }

    const key = `${resolvedState}_${frameIdx % Math.max(count, 1)}`;
    const frame = this.frames.get(key) ?? this.frames.get('idle_0');
    if (!frame) return;

    for (let y = 0; y < frame.length; y++) {
      const row = frame[y];
      for (let x = 0; x < row.length; x++) {
        const color = row[x];
        if (color) {
          ctx.fillStyle = color;
          ctx.fillRect(x * PIXEL_SCALE, y * PIXEL_SCALE, PIXEL_SCALE, PIXEL_SCALE);
        }
      }
    }
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

function createSpriteRenderer(
  role: string, artStyle: string, spritesBaseUrl: string
): IRenderer {
  if (artStyle === 'pixel') return new PixelSpriteRenderer(role);
  return new SpriteRenderer(role, spritesBaseUrl);
}
