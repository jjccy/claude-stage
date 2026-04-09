// ── Force-Directed Layout ─────────────────────────────────────────────────────
// Items repel each other and are attracted back toward the area center.
// All coordinates are in the same unit space as the caller (here: % of viewport).
//
// Usage:
//   const layout = new ForceLayout(cx, cy, halfWidth, halfHeight);
//   layout.add();                     // spawn item, re-settle everyone
//   layout.removeAt(i);              // remove item by index, re-settle
//   layout.positions()               // → [{x, y}, ...]
//   layout.clear()                   // remove all items

class ForceLayout {
  private static readonly REPULSION  = 15;   // push strength (%-units²)
  private static readonly ATTRACTION = 0.05; // pull-to-center factor
  private static readonly DAMPING    = 0.80; // velocity decay per step
  private static readonly ITERATIONS = 200;  // simulation steps per change
  private static readonly MIN_DIST   = 0.5;  // avoid divide-by-zero (%-units)

  private items: Array<{
    x: number; y: number;
    vx: number; vy: number;
    fx: number; fy: number;
  }> = [];

  /**
   * @param cx  Area centre x (%)
   * @param cy  Area centre y (%)
   * @param hw  Half-width of the bounding box (%)
   * @param hh  Half-height of the bounding box (%)
   */
  constructor(
    private readonly cx: number,
    private readonly cy: number,
    private readonly hw: number,
    private readonly hh: number,
  ) {}

  /** Add a new item at the area centre (with tiny random jitter) and re-settle. */
  add(): void {
    this.items.push({
      x:  this.cx + (Math.random() - 0.5) * 2,
      y:  this.cy + (Math.random() - 0.5) * 2,
      vx: 0, vy: 0, fx: 0, fy: 0,
    });
    this.simulate();
  }

  /** Remove item at index and re-settle remaining items. */
  removeAt(index: number): void {
    this.items.splice(index, 1);
    if (this.items.length > 0) this.simulate();
  }

  /** Remove all items without simulation. */
  clear(): void {
    this.items = [];
  }

  /** Settled positions in insertion order. */
  positions(): Array<{ x: number; y: number }> {
    return this.items.map(({ x, y }) => ({ x, y }));
  }

  private simulate(): void {
    const { REPULSION, ATTRACTION, DAMPING, ITERATIONS, MIN_DIST } = ForceLayout;

    for (let iter = 0; iter < ITERATIONS; iter++) {
      // Reset forces
      for (const a of this.items) { a.fx = 0; a.fy = 0; }

      // Pairwise repulsion
      for (let i = 0; i < this.items.length; i++) {
        for (let j = i + 1; j < this.items.length; j++) {
          const a = this.items[i];
          const b = this.items[j];
          const dx   = a.x - b.x;
          const dy   = a.y - b.y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), MIN_DIST);
          const f    = REPULSION / (dist * dist);
          const fx   = (dx / dist) * f;
          const fy   = (dy / dist) * f;
          a.fx += fx;  a.fy += fy;
          b.fx -= fx;  b.fy -= fy;
        }
      }

      // Attraction toward area centre
      for (const a of this.items) {
        a.fx += (this.cx - a.x) * ATTRACTION;
        a.fy += (this.cy - a.y) * ATTRACTION;
      }

      // Integrate, clamp to bounding box
      for (const a of this.items) {
        a.vx = (a.vx + a.fx) * DAMPING;
        a.vy = (a.vy + a.fy) * DAMPING;
        a.x  = Math.max(this.cx - this.hw, Math.min(this.cx + this.hw, a.x + a.vx));
        a.y  = Math.max(this.cy - this.hh, Math.min(this.cy + this.hh, a.y + a.vy));
      }
    }
  }
}
