/**
 * curriculum.ts — the plan for all 600 levels.
 *
 * Purpose:      Decide what every level is, so the curve is designed rather than
 *               emergent, and so no two levels feel like the same puzzle.
 * Responsibilities:
 *               - Tier definitions (Easy through Extreme).
 *               - The mixed, non-linear progression after level 20.
 *               - Shape rotation, so silhouettes rarely repeat close together.
 * Notes:        Two rules shape everything here.
 *
 *               **Arrow counts are derived, never declared.** A snake occupies
 *               several cells, so "40 arrows" is a wish until you know the mask's
 *               real capacity — a heart on a 12x12 grid holds 82 cells, and 40
 *               six-cell snakes need 240. Every plan states a *fill* instead, and
 *               the count follows from the shape.
 *
 *               **After level 20 the difficulty is deliberately shuffled.** A
 *               monotonic ramp is predictable, and predictability is the thing
 *               that makes a 600-level game feel like a treadmill. Tiers are drawn
 *               from a mix that shifts over the game, so the *average* climbs while
 *               any individual level is a surprise. A player who just failed an
 *               Extreme board might get an Easy one next, and that is the point.
 *
 *               Everything is seeded and deterministic: the same 600 levels are
 *               produced on every machine, on every build.
 */

import type { DifficultyTier } from '../src/game/codec';
import { maskCapacity, maskFor, SHAPE_NAMES, type ShapeName } from './shapes';
import { shapeArtById } from './shapeArt';

export interface LevelPlan {
  readonly id: number;
  readonly name: string;
  readonly tier: DifficultyTier;
  readonly shape: ShapeName;
  readonly rows: number;
  readonly cols: number;
  readonly arrowCount: number;
  readonly minBodyLength: number;
  readonly maxBodyLength: number;
  readonly targetBlindMistakes: number;
  readonly hearts: number;
}

/**
 * What each tier means, in the only terms the generator understands.
 *
 * Board size is the dial that decides whether a level fits the screen. Anything
 * from `superHard` up is deliberately larger than a phone display, which is what
 * makes zoom and pan part of the puzzle rather than a convenience.
 */
interface TierSpec {
  readonly minSize: number;
  readonly maxSize: number;
  /** Fraction of the shape's cells to cover. The density dial. */
  readonly minFill: number;
  readonly maxFill: number;
  readonly minLen: number;
  readonly maxLen: number;
  /** Expected hearts a random-tapping player burns. The difficulty dial. */
  readonly minBlind: number;
  readonly maxBlind: number;
  readonly hearts: number;
  /** Curated 1–5 band shown in level select. */
  readonly band: number;
}

const TIERS: Record<DifficultyTier, TierSpec> = {
  easy: {
    // Sized so even a narrow silhouette still carries 6+ snakes. An "easy" board
    // of three arrows is not easy, it is empty -- there is nothing to read.
    minSize: 8, maxSize: 10,
    minFill: 0.44, maxFill: 0.56,
    minLen: 2, maxLen: 3,
    minBlind: 2, maxBlind: 6,
    hearts: 5, band: 1,
  },
  medium: {
    minSize: 10, maxSize: 13,
    minFill: 0.5, maxFill: 0.6,
    minLen: 3, maxLen: 4,
    minBlind: 6, maxBlind: 14,
    hearts: 5, band: 2,
  },
  hard: {
    minSize: 13, maxSize: 16,
    minFill: 0.54, maxFill: 0.64,
    minLen: 3, maxLen: 5,
    minBlind: 14, maxBlind: 26,
    hearts: 5, band: 3,
  },
  superHard: {
    // Past this size the board no longer fits a phone screen, and inspecting it
    // means panning and zooming. That is the tier's defining feature.
    minSize: 17, maxSize: 21,
    minFill: 0.58, maxFill: 0.68,
    minLen: 3, maxLen: 6,
    minBlind: 26, maxBlind: 48,
    hearts: 5, band: 4,
  },
  extremeHard: {
    minSize: 22, maxSize: 27,
    minFill: 0.62, maxFill: 0.72,
    minLen: 3, maxLen: 6,
    minBlind: 48, maxBlind: 95,
    hearts: 5, band: 5,
  },
};

/**
 * How the tier mix shifts across the game.
 *
 * Each band lists the share of levels drawn from each tier. Easy never vanishes —
 * a run of six punishing boards with no relief is how people stop playing — but
 * its share falls as Extreme's rises.
 */
interface MixBand {
  readonly upTo: number;
  readonly weights: Readonly<Record<DifficultyTier, number>>;
}

const MIX: readonly MixBand[] = [
  { upTo: 150, weights: { easy: 38, medium: 34, hard: 21, superHard: 6, extremeHard: 1 } },
  { upTo: 300, weights: { easy: 24, medium: 31, hard: 28, superHard: 13, extremeHard: 4 } },
  { upTo: 450, weights: { easy: 15, medium: 24, hard: 30, superHard: 22, extremeHard: 9 } },
  { upTo: 600, weights: { easy: 9, medium: 17, hard: 27, superHard: 29, extremeHard: 18 } },
];

/** Deterministic PRNG, so the library rebuilds identically every time. */
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (rng: () => number, lo: number, hi: number): number => lo + rng() * (hi - lo);

/**
 * Levels 1–20 — onboarding.
 *
 * Explicitly *moderately* challenging, not trivial. A first level that solves
 * itself teaches nothing and reads as filler. These start small and open, and by
 * level 20 a careless player is losing hearts — but the whole run stays inside
 * Easy and lower Medium so nobody bounces off before the game has shown itself.
 */
const ONBOARDING_SHAPES: ShapeName[] = [
  'free', 'free', 'diamond', 'free', 'cross',
  'circle', 'free', 'triangle', 'hexagon', 'free',
  'star', 'heart', 'free', 'ring', 'diamond',
  'cloud', 'free', 'shield', 'circle', 'crown',
];

/** Adjectives that vary a level's name when its shape recurs. */
const QUALIFIERS: readonly string[] = [
  'First', 'Quiet', 'Little', 'Open', 'Broken', 'Tangled', 'Twisted', 'Dense',
  'Deep', 'Hidden', 'Silent', 'Woven', 'Crooked', 'Endless', 'Grand', 'Vast',
  'Iron', 'Golden', 'Midnight', 'Crimson', 'Frozen', 'Burning', 'Ancient', 'Final',
];

/** Readable label for a shape, for level names. */
function shapeLabel(shape: ShapeName): string {
  const artwork = shapeArtById(shape);
  if (artwork) return artwork.name;
  return shape.charAt(0).toUpperCase() + shape.slice(1);
}

/**
 * Turn a fill fraction into an arrow count the shape can actually hold.
 *
 * Sized off the mid-point of the length range, since growth lands between the
 * bounds and sizing off the minimum consistently overshoots.
 */
function arrowsFor(
  shape: ShapeName,
  rows: number,
  cols: number,
  fill: number,
  minLen: number,
  maxLen: number,
  floor = 5,
): number {
  const capacity = maskCapacity(maskFor(shape, rows, cols));
  const averageLength = (minLen + maxLen) / 2;
  return Math.max(floor, Math.floor((capacity * fill) / averageLength));
}

/** Which mix band a level falls in. */
function weightsFor(id: number): Readonly<Record<DifficultyTier, number>> {
  for (const band of MIX) {
    if (id <= band.upTo) return band.weights;
  }
  return MIX[MIX.length - 1]!.weights;
}

/** Draw a tier from a weighted mix. */
function pickTier(rng: () => number, weights: Readonly<Record<DifficultyTier, number>>): DifficultyTier {
  const entries = Object.entries(weights) as [DifficultyTier, number][];
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [tier, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return tier;
  }
  return entries[entries.length - 1]![0];
}

/**
 * Shapes that suit a board of this size.
 *
 * Small boards get the analytic shapes, which stay exact at any resolution. A
 * detailed silhouette on a 7x7 grid is unreadable mush, so bitmaps only appear
 * once there are enough cells to carry them.
 */
function shapePoolFor(size: number): readonly ShapeName[] {
  if (size <= 9) return ['free', 'diamond', 'circle', 'cross', 'ring', 'free'];
  return SHAPE_NAMES;
}

function buildOnboarding(): LevelPlan[] {
  const plans: LevelPlan[] = [];

  for (let id = 1; id <= 20; id += 1) {
    const progress = (id - 1) / 19;
    const size = Math.round(6 + progress * 4); // 6x6 up to 10x10
    const shape = ONBOARDING_SHAPES[id - 1] ?? 'free';
    const fill = 0.3 + progress * 0.18;
    const minLen = id <= 6 ? 2 : 3;
    const maxLen = id <= 10 ? 4 : 5;
    // Rises from a gentle 1.5 to about 9 — by the end, careless play costs hearts.
    const blind = 1.5 + progress * progress * 7.5;

    plans.push({
      id,
      name: id === 1 ? 'First Light' : `${QUALIFIERS[id % QUALIFIERS.length]} ${shapeLabel(shape)}`,
      tier: blind < 6 ? 'easy' : 'medium',
      shape,
      rows: size,
      cols: size,
      arrowCount: arrowsFor(shape, size, size, fill, minLen, maxLen),
      minBodyLength: minLen,
      maxBodyLength: maxLen,
      targetBlindMistakes: Number(blind.toFixed(1)),
      hearts: 5,
    });
  }

  return plans;
}

function buildMainRun(): LevelPlan[] {
  const rng = mulberry32(20_260_728);
  const plans: LevelPlan[] = [];

  // Rotate through the shape library rather than picking at random, so a
  // silhouette cannot appear twice within a few levels of itself.
  let shapeCursor = 0;

  for (let id = 21; id <= 600; id += 1) {
    // The last ten are the endgame. A mixed curve is right everywhere else, but
    // finishing 600 levels on a random Medium is a flat note to end on.
    const tier: DifficultyTier = id > 590 ? 'extremeHard' : pickTier(rng, weightsFor(id));
    const spec = TIERS[tier];

    // Level 600 is the largest board in the game.
    const size = id === 600 ? spec.maxSize : Math.round(lerp(rng, spec.minSize, spec.maxSize));
    const pool = shapePoolFor(size);
    const shape = pool[shapeCursor % pool.length]!;
    shapeCursor += 1;

    const fill = lerp(rng, spec.minFill, spec.maxFill);
    // Drift the blind-mistake target upward across the game inside each tier, so
    // a late Hard level is harder than an early one without changing tier.
    const drift = (id - 20) / 580;
    const blind = lerp(rng, spec.minBlind, spec.maxBlind) * (0.85 + drift * 0.3);

    // Slight rectangular variation so not every board is a perfect square.
    const stretch = rng() < 0.25 ? Math.round(lerp(rng, 1, 3)) : 0;
    const rows = size;
    const cols = size + stretch;

    plans.push({
      id,
      name: id === 600 ? 'Last Word' : `${QUALIFIERS[(id * 7) % QUALIFIERS.length]} ${shapeLabel(shape)}`,
      tier,
      shape,
      rows,
      cols,
      arrowCount: arrowsFor(shape, rows, cols, fill, spec.minLen, spec.maxLen),
      minBodyLength: spec.minLen,
      maxBodyLength: spec.maxLen,
      targetBlindMistakes: Number(blind.toFixed(1)),
      hearts: spec.hearts,
    });
  }

  return plans;
}

/** The full 600-level curriculum, in play order. */
export const CURRICULUM: readonly LevelPlan[] = [...buildOnboarding(), ...buildMainRun()];

/** Curated 1–5 band for a tier, shown in level select. */
export function bandOf(tier: DifficultyTier): number {
  return TIERS[tier].band;
}

/** Board sizes above this no longer fit a phone screen and need zoom and pan. */
export const OVERSIZED_BOARD_THRESHOLD = 14;

/** True when a level's board is bigger than a comfortable single screen. */
export function isOversized(plan: LevelPlan): boolean {
  return Math.max(plan.rows, plan.cols) > OVERSIZED_BOARD_THRESHOLD;
}
