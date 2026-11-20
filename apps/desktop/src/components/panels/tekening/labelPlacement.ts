/**
 * Places a text label next to each symbol so that labels do not cover each
 * other or a symbol. A label first tries the eight spots right against its
 * own symbol; when all are taken it moves further out and gets a leader line.
 *
 * All coordinates are pixels in one common plane (y down).
 */

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface LabelItem {
  key: string;
  /** Location of the symbol. */
  x: number;
  y: number;
  /** Extent of the symbol relative to (x, y). */
  symbol: Box;
  /** Size of the label text. */
  width: number;
  height: number;
}

export interface LabelPlacement {
  /** Top-left corner of the label relative to (x, y). */
  dx: number;
  dy: number;
  /** Leader line relative to (x, y); only when the label had to move away. */
  leader?: { x1: number; y1: number; x2: number; y2: number };
}

const GAP = 3;
const FAR = 16;

/** Rough width of a label in a sans-serif face, good enough to reserve room. */
export function estimateLabelSize(text: string, fontPx: number): { width: number; height: number } {
  return { width: Math.ceil(text.length * fontPx * 0.62) + 2, height: Math.ceil(fontPx * 1.2) };
}

const overlap = (a: Box, b: Box): number => {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
};

/** Candidate top-left corners around a symbol, in order of preference. */
function candidates(s: Box, w: number, h: number, gap: number): { dx: number; dy: number }[] {
  const midY = (s.top + s.bottom) / 2 - h / 2;
  const midX = (s.left + s.right) / 2 - w / 2;
  return [
    { dx: s.right + gap, dy: s.top - h * 0.25 }, // right, near the top
    { dx: s.right + gap, dy: midY },
    { dx: s.right + gap, dy: s.bottom - h * 0.5 },
    { dx: s.left - gap - w, dy: s.top - h * 0.25 },
    { dx: s.left - gap - w, dy: midY },
    { dx: s.left - gap - w, dy: s.bottom - h * 0.5 },
    { dx: midX, dy: s.top - gap - h }, // above
    { dx: midX, dy: s.bottom + gap }, // below
  ];
}

class Grid {
  private cells = new Map<string, { box: Box; owner: string }[]>();
  constructor(private size: number) {}
  private range(b: Box): [number, number, number, number] {
    const s = this.size;
    return [Math.floor(b.left / s), Math.floor(b.top / s), Math.floor(b.right / s), Math.floor(b.bottom / s)];
  }
  add(box: Box, owner: string): void {
    const [x0, y0, x1, y1] = this.range(box);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const k = `${x},${y}`;
        const list = this.cells.get(k);
        if (list) list.push({ box, owner });
        else this.cells.set(k, [{ box, owner }]);
      }
  }
  /** Total covered area of `box` by entries of other owners. */
  cost(box: Box, owner: string): number {
    const [x0, y0, x1, y1] = this.range(box);
    const seen = new Set<Box>();
    let total = 0;
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (const e of this.cells.get(`${x},${y}`) ?? []) {
          if (e.owner === owner || seen.has(e.box)) continue;
          seen.add(e.box);
          total += overlap(box, e.box);
        }
    return total;
  }
}

/** `obstacles` are other boxes on the sheet that labels must stay clear of. */
export function placeLabels(items: readonly LabelItem[], obstacles: readonly Box[] = []): Map<string, LabelPlacement> {
  const out = new Map<string, LabelPlacement>();
  if (items.length === 0) return out;
  const grid = new Grid(64);
  obstacles.forEach((box, i) => grid.add(box, `obstacle:${i}`));
  for (const it of items)
    grid.add(
      { left: it.x + it.symbol.left, top: it.y + it.symbol.top, right: it.x + it.symbol.right, bottom: it.y + it.symbol.bottom },
      it.key,
    );

  for (const it of items) {
    const abs = (c: { dx: number; dy: number }): Box => ({
      left: it.x + c.dx,
      top: it.y + c.dy,
      right: it.x + c.dx + it.width,
      bottom: it.y + c.dy + it.height,
    });
    const near = candidates(it.symbol, it.width, it.height, GAP);
    const far = candidates(it.symbol, it.width, it.height, FAR);
    let best: { c: { dx: number; dy: number }; far: boolean; cost: number } | null = null;
    for (const [list, isFar] of [[near, false], [far, true]] as const) {
      for (const c of list) {
        const cost = grid.cost(abs(c), it.key);
        if (cost === 0) {
          best = { c, far: isFar, cost };
          break;
        }
        if (!best || cost < best.cost) best = { c, far: isFar, cost };
      }
      if (best && best.cost === 0) break;
    }
    const chosen = best!;
    const placement: LabelPlacement = { dx: chosen.c.dx, dy: chosen.c.dy };
    if (chosen.far) placement.leader = leaderLine(it.symbol, chosen.c, it.width, it.height);
    out.set(it.key, placement);
    // The label's own symbol must not be counted against it, other labels must.
    grid.add(abs(chosen.c), `label:${it.key}`);
  }
  return out;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Shortest straight line from the symbol's box to the label's box. */
function leaderLine(s: Box, c: { dx: number; dy: number }, w: number, h: number) {
  const cx = (s.left + s.right) / 2;
  const cy = (s.top + s.bottom) / 2;
  const x2 = clamp(cx, c.dx, c.dx + w);
  const y2 = clamp(cy, c.dy, c.dy + h);
  const x1 = clamp(x2, s.left, s.right);
  const y1 = clamp(y2, s.top, s.bottom);
  return { x1, y1, x2, y2 };
}
