/**
 * curriculum.ts — the shape of the 50-level v0.1 difficulty curve.
 *
 * Purpose:      Say what every level should be, so the generator has a target and
 *               the curve is a designed thing rather than an emergent one.
 * Responsibilities:
 *               - One `LevelPlan` per level, in play order.
 * Notes:        Follows GDD §6's four bands, with one correction learned the hard
 *               way: **arrow counts are derived, not declared.** A snake occupies
 *               several cells, so "18 arrows" is a wish, not a plan — a heart mask
 *               on a 10x10 grid has 56 usable cells, and 18 six-cell snakes need
 *               108. Every plan here states a *fill* — how much of its shape to
 *               cover — and the count follows from the mask's real capacity.
 *
 *               The other correction: high difficulty is **many moderate snakes**,
 *               not a few enormous ones. A board of long ropes is easy because
 *               each one is easy to follow; a board packed with similar short ones
 *               is where tracing genuinely hurts. So grids grow faster than bodies
 *               do across the curve.
 *
 *               `targetBlindMistakes` is the load-bearing dial — expected hearts a
 *               random-tapping player would spend, against the 5 a level grants:
 *
 *                 well below 5 → careless play survives (onboarding)
 *                 around 5     → reading matters but forgiving
 *                 well above 5 → only correct reading wins (mastery)
 *
 *               The curve deliberately dips after each spike. A player who has
 *               just fought through a hard level needs a breather, or the ramp
 *               reads as relentless rather than rising (GDD §6).
 */

import { maskCapacity, maskFor, type ShapeName } from './shapes';

export interface LevelPlan {
  readonly id: number;
  readonly name: string;
  readonly shape: ShapeName;
  readonly rows: number;
  readonly cols: number;
  readonly arrowCount: number;
  readonly minBodyLength: number;
  readonly maxBodyLength: number;
  readonly targetBlindMistakes: number;
  readonly hearts: number;
}

interface BandSpec {
  readonly name: string;
  readonly shape: ShapeName;
  readonly rows: number;
  readonly cols: number;
  /** Fraction of the shape's cells to cover. The density dial. */
  readonly fill: number;
  readonly minLen: number;
  readonly maxLen: number;
  readonly blind: number;
}

/**
 * Levels 1–10 — Onboarding.
 *
 * Short, mostly straight bodies on an open board. The job is to teach the tap,
 * that the arrowhead is what matters, and that a blocked tap costs a heart.
 * Nothing here should be genuinely losable.
 */
const onboarding: BandSpec[] = [
  { name: 'First Light', shape: 'free', rows: 5, cols: 5, fill: 0.3, minLen: 2, maxLen: 3, blind: 0.6 },
  { name: 'Two Ways', shape: 'free', rows: 5, cols: 5, fill: 0.36, minLen: 2, maxLen: 3, blind: 1.0 },
  { name: 'Queue', shape: 'free', rows: 6, cols: 6, fill: 0.34, minLen: 2, maxLen: 3, blind: 1.4 },
  { name: 'Elbow', shape: 'free', rows: 6, cols: 6, fill: 0.4, minLen: 2, maxLen: 4, blind: 1.8 },
  { name: 'Crossing', shape: 'cross', rows: 7, cols: 7, fill: 0.42, minLen: 2, maxLen: 4, blind: 2.0 },
  { name: 'Nook', shape: 'free', rows: 6, cols: 6, fill: 0.46, minLen: 2, maxLen: 4, blind: 2.4 },
  { name: 'Sidestep', shape: 'free', rows: 7, cols: 7, fill: 0.42, minLen: 3, maxLen: 4, blind: 2.8 },
  { name: 'Lattice', shape: 'diamond', rows: 7, cols: 7, fill: 0.46, minLen: 2, maxLen: 4, blind: 2.6 },
  { name: 'Bend', shape: 'free', rows: 7, cols: 7, fill: 0.48, minLen: 3, maxLen: 4, blind: 3.2 },
  { name: 'Knot', shape: 'free', rows: 7, cols: 7, fill: 0.52, minLen: 3, maxLen: 4, blind: 3.6 },
];

/**
 * Levels 11–25 — Foundations.
 *
 * Shapes arrive, bodies start bending, and tracing becomes a real act. Around
 * here a careless player starts losing hearts.
 */
const foundations: BandSpec[] = [
  { name: 'Compass', shape: 'cross', rows: 8, cols: 8, fill: 0.46, minLen: 3, maxLen: 4, blind: 4.0 },
  { name: 'Facet', shape: 'diamond', rows: 8, cols: 8, fill: 0.48, minLen: 3, maxLen: 5, blind: 4.4 },
  { name: 'Orbit', shape: 'circle', rows: 8, cols: 8, fill: 0.48, minLen: 3, maxLen: 5, blind: 4.8 },
  { name: 'Thicket', shape: 'free', rows: 8, cols: 8, fill: 0.5, minLen: 3, maxLen: 5, blind: 5.2 },
  { name: 'Breather', shape: 'free', rows: 7, cols: 7, fill: 0.42, minLen: 3, maxLen: 4, blind: 3.4 },
  { name: 'Crossroads', shape: 'cross', rows: 9, cols: 9, fill: 0.5, minLen: 3, maxLen: 5, blind: 5.6 },
  { name: 'Halo', shape: 'ring', rows: 8, cols: 8, fill: 0.5, minLen: 3, maxLen: 4, blind: 5.4 },
  { name: 'Weave', shape: 'free', rows: 8, cols: 8, fill: 0.54, minLen: 3, maxLen: 5, blind: 6.0 },
  { name: 'Prism', shape: 'diamond', rows: 9, cols: 9, fill: 0.52, minLen: 3, maxLen: 5, blind: 6.2 },
  { name: 'Quiet', shape: 'free', rows: 7, cols: 8, fill: 0.44, minLen: 3, maxLen: 4, blind: 3.8 },
  { name: 'Wheel', shape: 'circle', rows: 9, cols: 9, fill: 0.52, minLen: 3, maxLen: 5, blind: 6.6 },
  { name: 'Tangle', shape: 'free', rows: 9, cols: 9, fill: 0.54, minLen: 3, maxLen: 5, blind: 7.0 },
  { name: 'Loom', shape: 'free', rows: 9, cols: 9, fill: 0.56, minLen: 3, maxLen: 5, blind: 7.2 },
  { name: 'Signet', shape: 'ring', rows: 9, cols: 9, fill: 0.54, minLen: 3, maxLen: 5, blind: 7.4 },
  { name: 'Pause', shape: 'free', rows: 8, cols: 8, fill: 0.44, minLen: 3, maxLen: 4, blind: 4.6 },
];

/**
 * Levels 26–40 — Tightening.
 *
 * Dense boards with bodies running alongside each other. Guessing now reliably
 * costs the level.
 */
const tightening: BandSpec[] = [
  { name: 'Braid', shape: 'free', rows: 9, cols: 9, fill: 0.58, minLen: 3, maxLen: 5, blind: 8.0 },
  { name: 'Mosaic', shape: 'diamond', rows: 10, cols: 10, fill: 0.56, minLen: 3, maxLen: 5, blind: 8.5 },
  { name: 'Gyre', shape: 'spiral', rows: 9, cols: 9, fill: 0.56, minLen: 3, maxLen: 5, blind: 9.0 },
  { name: 'Thornfield', shape: 'free', rows: 10, cols: 10, fill: 0.56, minLen: 3, maxLen: 5, blind: 9.5 },
  { name: 'Respite', shape: 'free', rows: 8, cols: 9, fill: 0.48, minLen: 3, maxLen: 5, blind: 6.0 },
  { name: 'Cathedral', shape: 'cross', rows: 10, cols: 10, fill: 0.58, minLen: 3, maxLen: 5, blind: 10.0 },
  { name: 'Meridian', shape: 'circle', rows: 10, cols: 10, fill: 0.58, minLen: 3, maxLen: 6, blind: 10.5 },
  { name: 'Coil', shape: 'spiral', rows: 10, cols: 10, fill: 0.58, minLen: 3, maxLen: 5, blind: 11.0 },
  { name: 'Deadfall', shape: 'free', rows: 10, cols: 10, fill: 0.6, minLen: 3, maxLen: 6, blind: 11.5 },
  { name: 'Clearing', shape: 'free', rows: 9, cols: 9, fill: 0.5, minLen: 3, maxLen: 5, blind: 7.5 },
  { name: 'Reliquary', shape: 'ring', rows: 10, cols: 10, fill: 0.58, minLen: 3, maxLen: 6, blind: 12.0 },
  { name: 'Filigree', shape: 'diamond', rows: 11, cols: 11, fill: 0.58, minLen: 3, maxLen: 6, blind: 12.5 },
  { name: 'Snarl', shape: 'free', rows: 11, cols: 11, fill: 0.6, minLen: 3, maxLen: 6, blind: 13.0 },
  { name: 'Vault', shape: 'cross', rows: 11, cols: 11, fill: 0.6, minLen: 3, maxLen: 6, blind: 13.5 },
  { name: 'Threshold', shape: 'free', rows: 11, cols: 11, fill: 0.62, minLen: 3, maxLen: 6, blind: 14.0 },
];

/**
 * Levels 41–50 — Mastery.
 *
 * The set-piece shapes at full size, densely packed. These are meant to take
 * several minutes and to feel earned.
 */
const mastery: BandSpec[] = [
  { name: 'Wingspan', shape: 'butterfly', rows: 11, cols: 11, fill: 0.6, minLen: 3, maxLen: 6, blind: 15.0 },
  { name: 'Devotion', shape: 'heart', rows: 11, cols: 11, fill: 0.6, minLen: 3, maxLen: 6, blind: 15.5 },
  { name: 'Maelstrom', shape: 'spiral', rows: 11, cols: 11, fill: 0.6, minLen: 3, maxLen: 6, blind: 16.0 },
  { name: 'Interlude', shape: 'free', rows: 10, cols: 10, fill: 0.5, minLen: 3, maxLen: 5, blind: 10.0 },
  { name: 'Cardinal', shape: 'cross', rows: 12, cols: 12, fill: 0.62, minLen: 3, maxLen: 6, blind: 17.0 },
  { name: 'Solstice', shape: 'circle', rows: 12, cols: 12, fill: 0.62, minLen: 3, maxLen: 6, blind: 18.0 },
  { name: 'Keepsake', shape: 'heart', rows: 12, cols: 12, fill: 0.62, minLen: 3, maxLen: 6, blind: 18.5 },
  { name: 'Labyrinth', shape: 'spiral', rows: 12, cols: 12, fill: 0.62, minLen: 3, maxLen: 6, blind: 19.5 },
  { name: 'Chrysalis', shape: 'butterfly', rows: 12, cols: 12, fill: 0.64, minLen: 3, maxLen: 6, blind: 20.0 },
  { name: 'Last Word', shape: 'heart', rows: 12, cols: 12, fill: 0.64, minLen: 3, maxLen: 6, blind: 21.0 },
];

/** Hearts granted per level. Constant for v0.1 — the difficulty dial is the board. */
const HEARTS = 5;

/**
 * Turn a fill fraction into an arrow count the shape can actually hold.
 *
 * Uses the mid-point of the body-length range: growth lands somewhere between the
 * bounds, and sizing off the minimum would consistently overshoot.
 */
function arrowsFor(spec: BandSpec): number {
  const capacity = maskCapacity(maskFor(spec.shape, spec.rows, spec.cols));
  const averageLength = (spec.minLen + spec.maxLen) / 2;
  return Math.max(3, Math.floor((capacity * spec.fill) / averageLength));
}

/** The full curriculum, in play order. */
export const CURRICULUM: readonly LevelPlan[] = [
  ...onboarding,
  ...foundations,
  ...tightening,
  ...mastery,
].map((spec, index) => ({
  id: index + 1,
  name: spec.name,
  shape: spec.shape,
  rows: spec.rows,
  cols: spec.cols,
  arrowCount: arrowsFor(spec),
  minBodyLength: spec.minLen,
  maxBodyLength: spec.maxLen,
  targetBlindMistakes: spec.blind,
  hearts: HEARTS,
}));

/** Which band a level belongs to. Used in the build report and level select. */
export function bandOf(id: number): 'Onboarding' | 'Foundations' | 'Tightening' | 'Mastery' {
  if (id <= 10) return 'Onboarding';
  if (id <= 25) return 'Foundations';
  if (id <= 40) return 'Tightening';
  return 'Mastery';
}
