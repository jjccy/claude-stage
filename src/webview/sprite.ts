// ── Sprite rendering ──────────────────────────────────────────────────────────
// Pixel-art sprite constants, frame data, palette, renderer, and animation
// schedule.  Compiled into the concatenated out/media/stage.js via outFile.

const SCALE = 3;   // canvas px per sprite pixel
const SW    = 12;  // sprite width  (sprite-px)
const SH    = 20;  // sprite height (sprite-px)

const SKIN = '#FFDBA4';
const EYE  = '#2B2B2B';

interface Pal { b: string; d: string }

// Role → bright / dark body colours
const PALS: Record<string, Pal> = {
  user:   { b: '#4F9EFF', d: '#1F6FEB' },
  claude: { b: '#BC8CFF', d: '#8B5CF6' },
  agent:  { b: '#3FB950', d: '#238636' },
};

// 12-char rows per frame.
// . = transparent  s = skin  e = eye  b = body  d = dark body
const RAW: Record<string, string[]> = {

  idle_0: [     // upright, eyes open
    '..ssssssss..',
    '.ssssssssss.',
    'ssssssssssss',
    'sseesssseess',
    'ssssssssssss',
    '.ssssssssss.',
    '..ssssssss..',
    '...bbbbbb...',
    '..bbbbbbbb..',
    '.bbbbbbbbbb.',
    '.bbbbbbbbbb.',
    '.bbbbbbbbbb.',
    '..bbbbbbbb..',
    '...bbbbbb...',
    '...bb..bb...',
    '...bb..bb...',
    '...bb..bb...',
    '...bb..bb...',
    '...bb..bb...',
    '..bbb..bbb..',
  ],

  idle_1: [     // blink (eyes closed)
    '..ssssssss..',
    '.ssssssssss.',
    'ssssssssssss',
    'ssssssssssss',
    'ssssssssssss',
    '.ssssssssss.',
    '..ssssssss..',
    '...bbbbbb...',
    '..bbbbbbbb..',
    '.bbbbbbbbbb.',
    '.bbbbbbbbbb.',
    '.bbbbbbbbbb.',
    '..bbbbbbbb..',
    '...bbbbbb...',
    '...bb..bb...',
    '...bb..bb...',
    '...bb..bb...',
    '...bb..bb...',
    '...bb..bb...',
    '..bbb..bbb..',
  ],

  thinking_0: [ // left arm raised
    '..ssssssss..',
    '.ssssssssss.',
    'ssssssssssss',
    'ssessssssess',
    'ssssssssssss',
    '.ssssssssss.',
    '..ssssssss..',
    '...bbbbbb...',
    'bb.bbbbbbbb.',
    'b..bbbbbbbb.',
    'b..bbbbbbbb.',
    '...bbbbbbbb.',
    '....bbbbbb..',
    '.....bbbb...',
    '.....bb.bb..',
    '.....bb..bb.',
    '.....bb..bb.',
    '.....bb..bb.',
    '.....bb..bb.',
    '....bbb..bbb',
  ],

  thinking_1: [ // arm slightly lower (wave)
    '..ssssssss..',
    '.ssssssssss.',
    'ssssssssssss',
    'ssessssssess',
    'ssssssssssss',
    '.ssssssssss.',
    '..ssssssss..',
    '...bbbbbb...',
    'b..bbbbbbbb.',
    'bb.bbbbbbbb.',
    'b..bbbbbbbb.',
    '...bbbbbbbb.',
    '....bbbbbb..',
    '.....bbbb...',
    '.....bb.bb..',
    '.....bb..bb.',
    '.....bb..bb.',
    '.....bb..bb.',
    '.....bb..bb.',
    '....bbb..bbb',
  ],

  working_0: [  // arms wide (lean forward)
    '..ssssssss..',
    '.ssssssssss.',
    'ssssssssssss',
    'sseesssseess',
    'ssssssssssss',
    '.ssssssssss.',
    '..ssssssss..',
    '..bbbbbbbb..',
    '.bbbbbbbbbb.',
    'bbbbbbbbbbbb',
    'bbbbbbbbbbbb',
    '.bbbbbbbbbb.',
    '..bbbbbbbb..',
    '...bbbbbb...',
    '...bb..bb...',
    '...bb..bb...',
    '...bb..bb...',
    '...bb..bb...',
    '...bb..bb...',
    '..bbb..bbb..',
  ],

  working_1: [  // arms pumping
    '..ssssssss..',
    '.ssssssssss.',
    'ssssssssssss',
    'sseesssseess',
    'ssssssssssss',
    '.ssssssssss.',
    '..ssssssss..',
    '..bbbbbbbb..',
    'bbbbbbbbbbbb',
    '.bbbbbbbbbb.',
    'bbbbbbbbbbbb',
    '.bbbbbbbbbb.',
    '..bbbbbbbb..',
    '...bbbbbb...',
    '...bb..bb...',
    '...bb..bb...',
    '...bb..bb...',
    '...bb..bb...',
    '...bb..bb...',
    '..bbb..bbb..',
  ],

  waiting_0: [  // arms spread (shrug)
    '..ssssssss..',
    '.ssssssssss.',
    'ssssssssssss',
    'sseesssseess',
    'ssssssssssss',
    '.ssssssssss.',
    '..ssssssss..',
    '...bbbbbb...',
    'b.bbbbbbbb.b',
    'b.bbbbbbbb.b',
    'b.bbbbbbbb.b',
    '...bbbbbbbb.',
    '....bbbbbb..',
    '.....bbbb...',
    '.....bb.bb..',
    '.....bb..bb.',
    '.....bb..bb.',
    '.....bb..bb.',
    '.....bb..bb.',
    '....bbb..bbb',
  ],

};

type Pixel = string | null;
type Frame = Pixel[][];

function parseFrame(rows: string[], pal: Pal): Frame {
  return rows.map(row => {
    const r = row.padEnd(SW, '.').slice(0, SW);
    return r.split('').map(c => {
      switch (c) {
        case 's': return SKIN;
        case 'e': return EYE;
        case 'b': return pal.b;
        case 'd': return pal.d;
        default:  return null;
      }
    });
  });
}

class SpriteRenderer {
  private frames: Map<string, Frame> = new Map();

  constructor(role: string) {
    const pal = PALS[role] ?? PALS['agent'];
    for (const [key, raw] of Object.entries(RAW)) {
      this.frames.set(key, parseFrame(raw, pal));
    }
  }

  draw(ctx: CanvasRenderingContext2D, frameName: string): void {
    ctx.clearRect(0, 0, SW * SCALE, SH * SCALE);
    const frame = this.frames.get(frameName) ?? this.frames.get('idle_0')!;
    for (let y = 0; y < frame.length; y++) {
      for (let x = 0; x < frame[y].length; x++) {
        const color = frame[y][x];
        if (color) {
          ctx.fillStyle = color;
          ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
        }
      }
    }
  }
}

// Animation schedule: state → frame list + ms per frame
const ANIM: Record<string, { frames: string[]; ms: number }> = {
  idle:      { frames: ['idle_0', 'idle_0', 'idle_0', 'idle_0', 'idle_1'], ms: 700 },
  thinking:  { frames: ['thinking_0', 'thinking_1'], ms: 500 },
  searching: { frames: ['working_0',  'working_1'],  ms: 350 },
  writing:   { frames: ['working_0',  'working_1'],  ms: 350 },
  running:   { frames: ['working_0',  'working_1'],  ms: 260 },
  spawning:  { frames: ['idle_0'],                   ms: 600 },
  waiting:   { frames: ['waiting_0'],                ms: 1000 },
};
