/**
 * shapes.ts — the outlines snakes are grown inside.
 *
 * Purpose:      Decide which cells of a grid a level may use, so a board reads as
 *               a heart or a diamond rather than a rectangle of noise.
 * Responsibilities:
 *               - One mask function per shape family (GDD §5).
 *               - `maskFor` to look one up by name.
 * Notes:        Shapes are not purely cosmetic. Growing bodies inside a
 *               constrained outline forces them to bend and double back, and
 *               bends are the main thing that makes a snake hard to trace. Shape
 *               and difficulty reinforce each other.
 *
 *               Masks are defined as normalised functions of (u, v) in 0..1 so a
 *               shape works at any board size without a hand-drawn bitmap per size.
 */

export type ShapeName =
  | 'free'
  | 'diamond'
  | 'circle'
  | 'cross'
  | 'heart'
  | 'spiral'
  | 'ring'
  | 'butterfly';

/** A grid of booleans: true where a snake may be placed. */
export type ShapeMask = boolean[];

type Field = (u: number, v: number) => boolean;

/** Whole board. */
const free: Field = () => true;

/** |x| + |y| <= 1 — a rotated square. */
const diamond: Field = (u, v) => Math.abs(u) + Math.abs(v) <= 1.02;

const circle: Field = (u, v) => u * u + v * v <= 1.04;

/** A thick plus sign. */
const cross: Field = (u, v) => Math.abs(u) <= 0.42 || Math.abs(v) <= 0.42;

/** A filled circle with the middle taken out. */
const ring: Field = (u, v) => {
  const d = u * u + v * v;
  return d <= 1.04 && d >= 0.2;
};

/**
 * The classic implicit heart, squashed to sit nicely in a square grid.
 *
 * `v` is flipped because grid rows run downward while the curve is written for a
 * y-up axis.
 */
const heart: Field = (u, v) => {
  const x = u * 1.25;
  const y = -v * 1.25 + 0.35;
  const t = x * x + y * y - 1;
  return t * t * t - x * x * y * y * y <= 0;
};

/**
 * An Archimedean spiral, thickened into a usable corridor.
 *
 * A true spiral is `r = θ / (2π·turns)`, so at any angle the arm sits at a known
 * radius — and at that angle it recurs once per completed turn. A cell is in the
 * mask when it is within half a corridor-width of *any* of those arms.
 *
 * The angle must be normalised to 0..2π first: `atan2` returns -π..π, and feeding
 * that in directly puts half the arm at a negative radius, which is what turns a
 * spiral into scattered noise.
 *
 * The corridor is deliberately narrow. Snakes grown inside it have nowhere to go
 * but along the arm, which produces exactly the long curling bodies the shape is
 * chosen for.
 */
const spiral: Field = (u, v) => {
  const r = Math.sqrt(u * u + v * v);
  if (r > 1) return false;

  const turns = 2;
  const halfWidth = 0.2;
  // Solid core, so the innermost arm has somewhere to begin.
  if (r <= halfWidth) return true;

  const raw = Math.atan2(v, u);
  const angle = raw < 0 ? raw + Math.PI * 2 : raw;

  for (let k = 0; k < turns; k += 1) {
    const armRadius = (angle + Math.PI * 2 * k) / (Math.PI * 2 * turns);
    if (Math.abs(r - armRadius) <= halfWidth) return true;
  }
  return false;
};

/** Four wings around a slim body. */
const butterfly: Field = (u, v) => {
  const wing = (cx: number, cy: number, rx: number, ry: number) => {
    const dx = (u - cx) / rx;
    const dy = (v - cy) / ry;
    return dx * dx + dy * dy <= 1;
  };
  const body = Math.abs(u) <= 0.13 && Math.abs(v) <= 0.92;
  return (
    body ||
    wing(-0.48, -0.38, 0.5, 0.55) ||
    wing(0.48, -0.38, 0.5, 0.55) ||
    wing(-0.42, 0.46, 0.42, 0.46) ||
    wing(0.42, 0.46, 0.42, 0.46)
  );
};

const FIELDS: Record<ShapeName, Field> = {
  free,
  diamond,
  circle,
  cross,
  ring,
  heart,
  spiral,
  butterfly,
};

/** Every shape a level may declare. */
export const SHAPE_NAMES = Object.keys(FIELDS) as ShapeName[];

/**
 * Drop cells no snake could ever use.
 *
 * A body is at least two cells long, so a masked cell with no masked neighbour is
 * dead space — it inflates the apparent capacity and starves the generator, which
 * then fails to place its last few arrows for reasons that look mysterious.
 * Pruning repeats until stable, because removing one cell can strand another.
 */
function pruneIsolated(mask: ShapeMask, rows: number, cols: number): void {
  for (;;) {
    let removed = 0;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const cell = row * cols + col;
        if (!mask[cell]) continue;

        let neighbours = 0;
        if (row > 0 && mask[cell - cols]) neighbours += 1;
        if (row + 1 < rows && mask[cell + cols]) neighbours += 1;
        if (col > 0 && mask[cell - 1]) neighbours += 1;
        if (col + 1 < cols && mask[cell + 1]) neighbours += 1;

        if (neighbours === 0) {
          mask[cell] = false;
          removed += 1;
        }
      }
    }
    if (removed === 0) return;
  }
}

/**
 * Build the mask for a shape at a given board size.
 *
 * Cells are sampled at their centres and mapped to -1..1 on each axis, so the
 * same field function produces a sensible outline on a 5x5 board and a 10x10 one.
 */
export function maskFor(shape: ShapeName, rows: number, cols: number): ShapeMask {
  const field = FIELDS[shape] ?? free;
  const mask: ShapeMask = new Array<boolean>(rows * cols).fill(false);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const u = ((col + 0.5) / cols) * 2 - 1;
      const v = ((row + 0.5) / rows) * 2 - 1;
      mask[row * cols + col] = field(u, v);
    }
  }

  pruneIsolated(mask, rows, cols);
  return mask;
}

/** How many cells a shape leaves usable. Guards against masks too small to fill. */
export function maskCapacity(mask: ShapeMask): number {
  return mask.reduce((total, allowed) => total + (allowed ? 1 : 0), 0);
}

/** Render a mask as text, for eyeballing a new shape before generating with it. */
export function renderMask(mask: ShapeMask, rows: number, cols: number): string {
  const lines: string[] = [];
  for (let row = 0; row < rows; row += 1) {
    let line = '';
    for (let col = 0; col < cols; col += 1) line += mask[row * cols + col] ? '#' : '.';
    lines.push(line);
  }
  return lines.join('\n');
}
