/**
 * shapeGlyphs.ts — letters, digits and symbols as board silhouettes.
 *
 * Purpose:      Give the level library an alphabet, so a board can be an `A`, a
 *               `7`, or a question mark.
 * Responsibilities:
 *               - Stroke definitions for A–Z, 0–9, and a set of symbols.
 *               - Turning those strokes into a `Field` the mask sampler can use.
 * Notes:        Strokes, not bitmaps, and the reason is thin features. A `1` drawn
 *               as a 16x16 bitmap is a two-pixel column; sampled down to a 9-wide
 *               board it is either gone or four cells thick, and there is no
 *               drawing that survives both ends. A stroke is a distance function,
 *               so the thickness is decided *at the target size* — always at least
 *               one full cell wide, never so wide the counter of an `O` fills in.
 *
 *               That thickness rule is the whole trick, and it is why these are
 *               parameterised on board size rather than being another entry in
 *               `shapeArt`. Everything else about a glyph is geometry.
 *
 *               Coordinates are a 0..1 box, `(0, 0)` top-left. Curves are
 *               polylines: at the resolutions a board actually uses, the
 *               difference between a real arc and eight segments is invisible, and
 *               a polyline needs no special case anywhere downstream.
 */

/** A stroke: a run of points joined end to end, in 0..1 space. */
export type Stroke = readonly (readonly [number, number])[];

/** A closed loop, written once and reused by O, Q, 0, 8 and the symbols. */
function ellipse(cx: number, cy: number, rx: number, ry: number, steps = 14): Stroke {
  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * Math.PI * 2;
    points.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]);
  }
  return points;
}

const OVAL = ellipse(0.5, 0.5, 0.32, 0.4);

/**
 * Every glyph, as a list of strokes.
 *
 * Uppercase only. Lowercase letters differ from their capitals mainly in features
 * smaller than one board cell — the bowl of an `a`, the ascender of a `b` — so at
 * this resolution they would be the same silhouette with a worse name.
 */
export const GLYPH_STROKES: Readonly<Record<string, readonly Stroke[]>> = {
  A: [
    [
      [0.14, 0.9],
      [0.5, 0.1],
      [0.86, 0.9],
    ],
    [
      [0.27, 0.62],
      [0.73, 0.62],
    ],
  ],
  B: [
    [
      [0.22, 0.1],
      [0.22, 0.9],
    ],
    [
      [0.22, 0.1],
      [0.64, 0.1],
      [0.8, 0.28],
      [0.64, 0.48],
      [0.22, 0.48],
    ],
    [
      [0.22, 0.48],
      [0.7, 0.48],
      [0.84, 0.69],
      [0.66, 0.9],
      [0.22, 0.9],
    ],
  ],
  C: [
    [
      [0.82, 0.24],
      [0.6, 0.1],
      [0.34, 0.13],
      [0.18, 0.36],
      [0.18, 0.64],
      [0.34, 0.87],
      [0.6, 0.9],
      [0.82, 0.76],
    ],
  ],
  D: [
    [
      [0.22, 0.1],
      [0.22, 0.9],
    ],
    [
      [0.22, 0.1],
      [0.58, 0.1],
      [0.83, 0.34],
      [0.83, 0.66],
      [0.58, 0.9],
      [0.22, 0.9],
    ],
  ],
  E: [
    [
      [0.24, 0.1],
      [0.24, 0.9],
    ],
    [
      [0.24, 0.1],
      [0.8, 0.1],
    ],
    [
      [0.24, 0.5],
      [0.7, 0.5],
    ],
    [
      [0.24, 0.9],
      [0.8, 0.9],
    ],
  ],
  F: [
    [
      [0.24, 0.1],
      [0.24, 0.9],
    ],
    [
      [0.24, 0.1],
      [0.8, 0.1],
    ],
    [
      [0.24, 0.5],
      [0.7, 0.5],
    ],
  ],
  G: [
    [
      [0.82, 0.24],
      [0.6, 0.1],
      [0.34, 0.13],
      [0.18, 0.36],
      [0.18, 0.64],
      [0.34, 0.87],
      [0.62, 0.9],
      [0.82, 0.74],
      [0.82, 0.55],
      [0.56, 0.55],
    ],
  ],
  H: [
    [
      [0.2, 0.1],
      [0.2, 0.9],
    ],
    [
      [0.8, 0.1],
      [0.8, 0.9],
    ],
    [
      [0.2, 0.5],
      [0.8, 0.5],
    ],
  ],
  I: [
    [
      [0.5, 0.1],
      [0.5, 0.9],
    ],
    [
      [0.27, 0.1],
      [0.73, 0.1],
    ],
    [
      [0.27, 0.9],
      [0.73, 0.9],
    ],
  ],
  J: [
    [
      [0.72, 0.1],
      [0.72, 0.7],
      [0.56, 0.89],
      [0.34, 0.89],
      [0.22, 0.74],
    ],
  ],
  K: [
    [
      [0.22, 0.1],
      [0.22, 0.9],
    ],
    [
      [0.22, 0.55],
      [0.8, 0.1],
    ],
    [
      [0.22, 0.55],
      [0.82, 0.9],
    ],
  ],
  L: [
    [
      [0.26, 0.1],
      [0.26, 0.9],
      [0.78, 0.9],
    ],
  ],
  M: [
    [
      [0.14, 0.9],
      [0.14, 0.1],
      [0.5, 0.58],
      [0.86, 0.1],
      [0.86, 0.9],
    ],
  ],
  N: [
    [
      [0.2, 0.9],
      [0.2, 0.1],
      [0.8, 0.9],
      [0.8, 0.1],
    ],
  ],
  O: [OVAL],
  P: [
    [
      [0.22, 0.9],
      [0.22, 0.1],
      [0.66, 0.1],
      [0.82, 0.3],
      [0.66, 0.51],
      [0.22, 0.51],
    ],
  ],
  Q: [
    OVAL,
    [
      [0.6, 0.66],
      [0.88, 0.96],
    ],
  ],
  R: [
    [
      [0.22, 0.9],
      [0.22, 0.1],
      [0.66, 0.1],
      [0.82, 0.3],
      [0.66, 0.51],
      [0.22, 0.51],
    ],
    [
      [0.5, 0.51],
      [0.82, 0.9],
    ],
  ],
  S: [
    [
      [0.8, 0.22],
      [0.56, 0.1],
      [0.3, 0.14],
      [0.21, 0.32],
      [0.36, 0.46],
      [0.68, 0.56],
      [0.8, 0.72],
      [0.68, 0.88],
      [0.4, 0.9],
      [0.2, 0.79],
    ],
  ],
  T: [
    [
      [0.5, 0.1],
      [0.5, 0.9],
    ],
    [
      [0.15, 0.1],
      [0.85, 0.1],
    ],
  ],
  U: [
    [
      [0.2, 0.1],
      [0.2, 0.66],
      [0.36, 0.88],
      [0.64, 0.88],
      [0.8, 0.66],
      [0.8, 0.1],
    ],
  ],
  V: [
    [
      [0.15, 0.1],
      [0.5, 0.9],
      [0.85, 0.1],
    ],
  ],
  W: [
    [
      [0.09, 0.1],
      [0.28, 0.9],
      [0.5, 0.42],
      [0.72, 0.9],
      [0.91, 0.1],
    ],
  ],
  X: [
    [
      [0.17, 0.1],
      [0.83, 0.9],
    ],
    [
      [0.83, 0.1],
      [0.17, 0.9],
    ],
  ],
  Y: [
    [
      [0.17, 0.1],
      [0.5, 0.5],
      [0.83, 0.1],
    ],
    [
      [0.5, 0.5],
      [0.5, 0.9],
    ],
  ],
  Z: [
    [
      [0.2, 0.1],
      [0.8, 0.1],
      [0.2, 0.9],
      [0.8, 0.9],
    ],
  ],

  '0': [OVAL],
  '1': [
    [
      [0.32, 0.26],
      [0.52, 0.1],
      [0.52, 0.9],
    ],
    [
      [0.28, 0.9],
      [0.74, 0.9],
    ],
  ],
  '2': [
    [
      [0.2, 0.26],
      [0.36, 0.1],
      [0.64, 0.1],
      [0.8, 0.3],
      [0.2, 0.9],
      [0.83, 0.9],
    ],
  ],
  '3': [
    [
      [0.22, 0.12],
      [0.66, 0.11],
      [0.79, 0.3],
      [0.5, 0.48],
      [0.79, 0.63],
      [0.7, 0.86],
      [0.28, 0.9],
    ],
  ],
  '4': [
    [
      [0.68, 0.1],
      [0.17, 0.66],
      [0.86, 0.66],
    ],
    [
      [0.68, 0.1],
      [0.68, 0.9],
    ],
  ],
  '5': [
    [
      [0.8, 0.1],
      [0.26, 0.1],
      [0.22, 0.45],
      [0.6, 0.42],
      [0.8, 0.62],
      [0.7, 0.87],
      [0.27, 0.88],
    ],
  ],
  '6': [
    [
      [0.75, 0.12],
      [0.42, 0.16],
      [0.21, 0.45],
      [0.21, 0.74],
      [0.42, 0.9],
      [0.68, 0.88],
      [0.8, 0.68],
      [0.62, 0.52],
      [0.28, 0.55],
    ],
  ],
  '7': [
    [
      [0.17, 0.1],
      [0.83, 0.1],
      [0.42, 0.9],
    ],
  ],
  '8': [ellipse(0.5, 0.29, 0.25, 0.19), ellipse(0.5, 0.7, 0.31, 0.2)],
  '9': [
    [
      [0.25, 0.88],
      [0.58, 0.84],
      [0.79, 0.55],
      [0.79, 0.26],
      [0.58, 0.1],
      [0.32, 0.12],
      [0.2, 0.32],
      [0.38, 0.48],
      [0.72, 0.45],
    ],
  ],

  plus: [
    [
      [0.5, 0.14],
      [0.5, 0.86],
    ],
    [
      [0.14, 0.5],
      [0.86, 0.5],
    ],
  ],
  minus: [
    [
      [0.12, 0.5],
      [0.88, 0.5],
    ],
  ],
  times: [
    [
      [0.18, 0.18],
      [0.82, 0.82],
    ],
    [
      [0.82, 0.18],
      [0.18, 0.82],
    ],
  ],
  equals: [
    [
      [0.14, 0.36],
      [0.86, 0.36],
    ],
    [
      [0.14, 0.64],
      [0.86, 0.64],
    ],
  ],
  divide: [
    [
      [0.14, 0.5],
      [0.86, 0.5],
    ],
    [
      [0.5, 0.22],
      [0.5, 0.24],
    ],
    [
      [0.5, 0.76],
      [0.5, 0.78],
    ],
  ],
  question: [
    [
      [0.24, 0.28],
      [0.36, 0.11],
      [0.64, 0.1],
      [0.78, 0.28],
      [0.66, 0.46],
      [0.5, 0.56],
      [0.5, 0.68],
    ],
    [
      [0.5, 0.85],
      [0.5, 0.9],
    ],
  ],
  exclaim: [
    [
      [0.5, 0.1],
      [0.5, 0.62],
    ],
    [
      [0.5, 0.82],
      [0.5, 0.9],
    ],
  ],
  percent: [
    ellipse(0.28, 0.26, 0.13, 0.14),
    ellipse(0.72, 0.74, 0.13, 0.14),
    [
      [0.16, 0.9],
      [0.84, 0.1],
    ],
  ],
  hashSign: [
    [
      [0.34, 0.1],
      [0.26, 0.9],
    ],
    [
      [0.7, 0.1],
      [0.62, 0.9],
    ],
    [
      [0.14, 0.35],
      [0.86, 0.35],
    ],
    [
      [0.14, 0.65],
      [0.86, 0.65],
    ],
  ],
  asterisk: [
    [
      [0.5, 0.12],
      [0.5, 0.88],
    ],
    [
      [0.19, 0.31],
      [0.81, 0.69],
    ],
    [
      [0.81, 0.31],
      [0.19, 0.69],
    ],
  ],
  arrowGlyph: [
    [
      [0.1, 0.5],
      [0.9, 0.5],
    ],
    [
      [0.58, 0.2],
      [0.9, 0.5],
      [0.58, 0.8],
    ],
  ],
  infinity: [ellipse(0.29, 0.5, 0.21, 0.26), ellipse(0.71, 0.5, 0.21, 0.26)],
};

/** Every glyph id, in a stable order. */
export const GLYPH_IDS: readonly string[] = Object.keys(GLYPH_STROKES);

/** Human-readable name, for level titles. */
export function glyphName(id: string): string {
  if (id.length === 1) return /[0-9]/.test(id) ? `Digit ${id}` : `Letter ${id}`;
  return id.charAt(0).toUpperCase() + id.slice(1).replace(/([A-Z])/g, ' $1');
}

/** Squared distance from a point to a segment. Squared, to skip a square root. */
function distanceToSegmentSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return (px - cx) * (px - cx) + (py - cy) * (py - cy);
}

/**
 * Stroke half-width for a glyph on a given board, in 0..1 units.
 *
 * This is the function that makes glyph shapes work at all, and both bounds
 * matter. The floor keeps the stroke at least one and a bit cells wide, because a
 * stroke thinner than a cell samples into a dashed line and the mask pruner then
 * deletes it. The ceiling stops a `0` on a small board from being a filled blob:
 * past about a fifth of the box, counters close and every round glyph becomes the
 * same shape.
 */
function halfWidthFor(rows: number, cols: number): number {
  const smallest = Math.min(rows, cols);
  return Math.min(0.11, Math.max(0.055, 1.15 / smallest));
}

/**
 * A glyph as a field over the -1..1 box every other shape uses.
 *
 * Returns `undefined` for an unknown id so the caller can fall through to the
 * other shape families rather than silently drawing a blank board.
 */
export function glyphField(
  id: string,
  rows: number,
  cols: number,
): ((u: number, v: number) => boolean) | undefined {
  const strokes = GLYPH_STROKES[id];
  if (!strokes) return undefined;

  const half = halfWidthFor(rows, cols);
  const thresholdSq = half * half;

  return (u, v) => {
    const x = (u + 1) / 2;
    const y = (v + 1) / 2;
    for (const stroke of strokes) {
      for (let i = 1; i < stroke.length; i += 1) {
        const a = stroke[i - 1]!;
        const b = stroke[i]!;
        if (distanceToSegmentSq(x, y, a[0], a[1], b[0], b[1]) <= thresholdSq) return true;
      }
    }
    return false;
  };
}
