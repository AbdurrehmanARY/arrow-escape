/**
 * curriculum.ts — the plan for all 600 levels.
 *
 * Purpose:      Decide what every level is, so the curve is designed rather than
 *               emergent, and so no two levels feel like the same puzzle.
 * Responsibilities:
 *               - Tier definitions (Tutorial through Nightmare).
 *               - The mixed, non-linear progression after level 20.
 *               - Shape rotation, so silhouettes rarely repeat close together.
 *               - Which levels carry gates, and which carry shutters.
 * Notes:        Three rules shape everything here.
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
 *               **A gate is an intent, not a fact.** Whether a given board can
 *               take one and stay solvable is not knowable until the board exists,
 *               so a plan asks and the generator reports what it managed. The build
 *               log prints shutters-placed against shutters-planned for exactly
 *               that reason — a planning level that quietly failed to get its
 *               shutter is an ordinary level wearing the wrong name.
 *
 *               Everything is seeded and deterministic: the same 600 levels are
 *               produced on every machine, on every build.
 */

import type { DifficultyTier } from '../src/game/codec';
import type { GateMode } from '../src/game';
import {
  maskCapacity,
  maskFor,
  maskRegionCount,
  shapeDisplayName,
  SHAPE_NAMES,
  type ShapeName,
} from './shapes';
import { GLYPH_IDS } from './shapeGlyphs';
import { PROCEDURAL_IDS } from './shapeProcedural';

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
  /**
   * A gate for the generator to try to place, if any.
   *
   * "Try" is the operative word. Whether a gate can be added to a given board and
   * leave it solvable — and, for a shutter, leave it genuinely order-dependent —
   * is not knowable until the board exists. The plan states an intent; the
   * generator reports what it managed.
   */
  readonly gate?: GatePlan;
}

export interface GatePlan {
  readonly mode: GateMode;
  /** How many distinct colours to use. More colours, more to keep track of. */
  readonly groupCount: number;
  /** Gate cells per colour. */
  readonly cellsPerGroup: number;
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
  /** Probability that a level in this tier attempts an `opens` gate. */
  readonly gateChance: number;
}

/**
 * The ten tiers.
 *
 * **Board size is the dial that was set from outside.** Medium is 30x30, Hard 40,
 * Super Hard 50, Nightmare 60, by request; the other six interpolate between them.
 * Everything else in this table is a consequence of that, and the consequences are
 * not small — this is the one place in the project where the numbers cannot be
 * reasoned about in isolation, because size, density and difficulty are bound
 * together.
 *
 * **Fill had to fall sharply as size rose.** `expectedBlindMistakes` tracks arrow
 * count against how narrow the frontier is, so it grows much faster than area. At
 * the old fills a 40x40 Hard board measured **697** where the tier asked for 45 —
 * fifteen times over — and Extreme, Brutal and Nightmare could not be generated at
 * all, because at that density nearly every board is a knot of mutual blocking
 * that no amount of repair unpicks. Big boards are therefore *sparser* boards:
 * roughly a fifth covered at Medium against a half at Nightmare. A 30x30 board with
 * twenty-five snakes is spacious and fair, which is what Medium should be.
 *
 * **Bodies got much longer** — 2–4 cells at Tutorial to 6–28 at Nightmare. Long
 * snakes are the main tracing burden, and they are also how a big board is filled
 * without needing hundreds of them.
 *
 * **The blind-mistake ranges are measured, not chosen.** They come from
 * `npx tsx tools/probe-tiers.ts`, which generates one sample per tier in seconds
 * rather than the half hour a full build now takes. Change a size or a fill and
 * they must be re-derived — a target that was right at one board size is off by an
 * order of magnitude at another.
 *
 * **Gates** give the upper tiers a second difficulty axis that is not reading at
 * all. `gateChance` is how often an `opens` gate is worth attempting; shutter
 * levels are placed deliberately rather than sampled — see `PLANNING_STEP`.
 */
/**
 * Largest board that can still be packed to the requested density.
 *
 * See `probe-density.ts`. Coverage achieved by the packer: 91% at 30x30, 88% at
 * 40x40, 80% at 50x50, 72% at 60x60 — and the arrow count needed to do better at
 * 60 runs past 250, which the renderer should not be asked to carry. Fifty is the
 * point where density and size stop fighting.
 */
export const MAX_PACKED_SIZE = 50;

const TIERS: Record<DifficultyTier, TierSpec> = {
  tutorial: {
    // Small and open on purpose. The only tier where a careless player should be
    // able to finish without losing a heart.
    minSize: 8,
    maxSize: 11,
    minFill: 0.95,
    maxFill: 0.95,
    minLen: 2,
    maxLen: 4,
    minBlind: 1,
    maxBlind: 4,
    hearts: 5,
    band: 1,
    gateChance: 0,
  },
  easy: {
    // Sized so even a narrow silhouette still carries 6+ snakes. An "easy" board
    // of three arrows is not easy, it is empty -- there is nothing to read.
    minSize: 12,
    maxSize: 16,
    minFill: 0.95,
    maxFill: 0.95,
    minLen: 2,
    maxLen: 5,
    minBlind: 4,
    maxBlind: 14,
    hearts: 5,
    band: 1,
    gateChance: 0,
  },
  casual: {
    minSize: 18,
    maxSize: 24,
    minFill: 0.95,
    maxFill: 0.95,
    minLen: 3,
    maxLen: 8,
    minBlind: 14,
    maxBlind: 45,
    hearts: 5,
    band: 2,
    gateChance: 0,
  },
  medium: {
    minSize: 27,
    maxSize: 32,
    minFill: 0.95,
    maxFill: 0.95,
    minLen: 3,
    maxLen: 11,
    minBlind: 40,
    maxBlind: 110,
    hearts: 5,
    band: 2,
    gateChance: 0.15,
  },
  tricky: {
    minSize: 32,
    maxSize: 37,
    minFill: 0.95,
    maxFill: 0.95,
    minLen: 4,
    maxLen: 13,
    minBlind: 95,
    maxBlind: 200,
    hearts: 5,
    band: 3,
    gateChance: 0.25,
  },
  hard: {
    minSize: 37,
    maxSize: 42,
    minFill: 0.95,
    maxFill: 0.95,
    minLen: 4,
    maxLen: 15,
    minBlind: 180,
    maxBlind: 330,
    hearts: 5,
    band: 3,
    gateChance: 0.35,
  },
  // The four tiers below all hit `MAX_ARROWS_PER_LEVEL`, which changes what the
  // minimum length is *for*. On a small board it stops the generator scattering
  // trivial two-cell stubs. Here the arrow count is already pinned, so coverage is
  // exactly `180 x achieved body length / capacity` — and a higher floor is the
  // only lever that raises it without putting more snakes on screen. Measured at
  // the old floors these four came in at 77-78% of the playable area against a
  // target of 80-90%; the floors below are what closes that gap for free.
  superHard: {
    // Past this size the board no longer fits a phone screen, and inspecting it
    // means panning and zooming. That is the tier's defining feature.
    minSize: 46,
    maxSize: 52,
    minFill: 0.95,
    maxFill: 0.95,
    minLen: 8,
    maxLen: 19,
    minBlind: 280,
    maxBlind: 430,
    hearts: 5,
    band: 4,
    gateChance: 0.4,
  },
  extremeHard: {
    minSize: 50,
    maxSize: 55,
    minFill: 0.95,
    maxFill: 0.95,
    minLen: 9,
    maxLen: 22,
    minBlind: 330,
    maxBlind: 500,
    hearts: 5,
    band: 4,
    gateChance: 0.45,
  },
  brutal: {
    minSize: 54,
    maxSize: 58,
    minFill: 0.95,
    maxFill: 0.95,
    minLen: 10,
    maxLen: 25,
    minBlind: 380,
    maxBlind: 560,
    hearts: 5,
    band: 5,
    gateChance: 0.5,
  },
  nightmare: {
    minSize: 57,
    maxSize: 60,
    minFill: 0.95,
    maxFill: 0.95,
    minLen: 11,
    maxLen: 28,
    minBlind: 430,
    maxBlind: 650,
    hearts: 5,
    band: 5,
    gateChance: 0.55,
  },
};

/**
 * Every Nth level from `PLANNING_FROM` is a planning level: it carries a `shuts`
 * gate, so tap order can lose it.
 *
 * Placed on a fixed cadence rather than sampled from the mix for two reasons. A
 * mechanic that can lose you a level without spending a heart needs to arrive
 * predictably enough to be learned, and proving a shutter board solvable is a
 * search rather than a graph peel — affordable forty times in a build, not six
 * hundred. They start well after the tutorial so the base rule is solid first.
 */
const PLANNING_STEP = 12;
const PLANNING_FROM = 120;

/**
 * True if this level id is one of the planning levels.
 *
 * The last ten are excluded. They are the endgame, they are the biggest boards in
 * the game, and a shutter would force them down to a size that undoes the point of
 * finishing there.
 */
export function isPlanningLevel(id: number): boolean {
  return id >= PLANNING_FROM && id <= 590 && id % PLANNING_STEP === 0;
}

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
  {
    upTo: 120,
    weights: {
      tutorial: 14,
      easy: 30,
      casual: 26,
      medium: 18,
      tricky: 8,
      hard: 3,
      superHard: 1,
      extremeHard: 0,
      brutal: 0,
      nightmare: 0,
    },
  },
  {
    upTo: 240,
    weights: {
      tutorial: 4,
      easy: 17,
      casual: 23,
      medium: 24,
      tricky: 17,
      hard: 10,
      superHard: 4,
      extremeHard: 1,
      brutal: 0,
      nightmare: 0,
    },
  },
  {
    upTo: 360,
    weights: {
      tutorial: 1,
      easy: 9,
      casual: 15,
      medium: 21,
      tricky: 20,
      hard: 17,
      superHard: 11,
      extremeHard: 5,
      brutal: 1,
      nightmare: 0,
    },
  },
  {
    upTo: 480,
    weights: {
      tutorial: 0,
      easy: 4,
      casual: 9,
      medium: 15,
      tricky: 18,
      hard: 20,
      superHard: 17,
      extremeHard: 11,
      brutal: 7,
      nightmare: 1,
    },
  },
  {
    upTo: 600,
    weights: {
      tutorial: 0,
      easy: 2,
      casual: 5,
      medium: 9,
      tricky: 13,
      hard: 17,
      superHard: 19,
      extremeHard: 17,
      brutal: 16,
      nightmare: 7,
    },
  },
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
  'free',
  'free',
  'diamond',
  'free',
  'cross',
  'circle',
  'free',
  'triangle',
  'hexagon',
  'free',
  'star',
  'heart',
  'free',
  'ring',
  'diamond',
  'cloud',
  'free',
  'shield',
  'circle',
  'crown',
];

/** Adjectives that vary a level's name when its shape recurs. */
const QUALIFIERS: readonly string[] = [
  'First',
  'Quiet',
  'Little',
  'Open',
  'Broken',
  'Tangled',
  'Twisted',
  'Dense',
  'Deep',
  'Hidden',
  'Silent',
  'Woven',
  'Crooked',
  'Endless',
  'Grand',
  'Vast',
  'Iron',
  'Golden',
  'Midnight',
  'Crimson',
  'Frozen',
  'Burning',
  'Ancient',
  'Final',
];

/**
 * Names for levels where tap order can lose you the board.
 *
 * Deliberately ominous and deliberately consistent. These are the only levels in
 * the game where a mistake costs more than a heart, and the name is the one place
 * that difference can be signalled before the player finds out the hard way.
 */
const PLANNING_QUALIFIERS: readonly string[] = [
  'Sealed',
  'One-Way',
  'Closing',
  'Shuttered',
  'Falling',
  'Last-Chance',
  'Narrowing',
  'Vanishing',
  'Fading',
  'Collapsing',
  'Receding',
  'Final-Door',
];

/** Names for levels carrying an ordinary (opening) gate. */
const GATED_QUALIFIERS: readonly string[] = [
  'Locked',
  'Keyed',
  'Barred',
  'Gated',
  'Sworn',
  'Guarded',
  'Bolted',
  'Warded',
  'Chained',
  'Bound',
  'Held',
  'Watched',
];

/** Readable label for a shape, for level names. */
function shapeLabel(shape: ShapeName): string {
  return shapeDisplayName(shape);
}

/**
 * Fraction of a mask a random self-avoiding fill can realistically use.
 *
 * Must match `check-curriculum.ts`, which is the thing that fails the build when a
 * plan overshoots. Growth paints itself into corners and abandons pockets too
 * small to hold another body, so raw capacity is always an overestimate.
 */
export const USABLE_FRACTION = 0.6;

/**
 * The same figure for a **packed** board, which is nearly every level.
 *
 * `growPackedBoard` places centre-outward and does not strand pockets the way a
 * random walk does; measured across the shipped library it fills about 87% of the
 * playable area. Sizing those plans at 0.6 was not merely pessimistic, it was the
 * binding constraint on the four biggest tiers: `arrowsFor` capped nightmare at
 * 114 arrows when the board had room for 180, and the tier came in at 72% against
 * a target of 80-90%.
 *
 * Still short of the measured 87%, because this figure decides how much snake to
 * *ask* for and asking for slightly less than will fit is the safe direction — the
 * packer keeps what it can place and the level is simply a little sparser, where
 * overshooting wastes attempts on plans that cannot be met.
 */
export const PACKED_USABLE_FRACTION = 0.85;

/**
 * Hard ceiling on how many snakes one level may contain.
 *
 * Nothing in the difficulty model wants this — by every metric, more arrows is
 * more difficulty. It exists for the two things the model does not see.
 *
 * **Rendering.** Each snake is three or four SVG nodes — arrows past
 * `SIMPLIFY_ABOVE_ARROWS` drop their shadow and highlight, which is most of the
 * cost. A packed 50x50 board wants about 180 of them, which is the most this
 * renderer should be asked to carry; the untuned figure at full coverage on 60x60
 * is past 250 and climbing.
 *
 * **Patience.** Clearing 300 snakes on one board is not a harder puzzle than
 * clearing 110, it is the same puzzle four times over. Difficulty on the big
 * boards comes from tracing long snakes through a tangle, which is what the raised
 * body lengths are for.
 */
const MAX_ARROWS_PER_LEVEL = 180;

/**
 * Turn a fill fraction into an arrow count the shape can actually hold.
 *
 * Sized off the mid-point of the length range, since growth lands between the
 * bounds and sizing off the minimum consistently overshoots.
 *
 * The hard cap on the second line is what stops long bodies from quietly breaking
 * the plan. With bodies of 2–6 the fill term was almost always the binding
 * constraint; at 7–14 it stops being one, and a nightmare board would happily ask
 * for forty twelve-cell snakes on a silhouette that can hold twenty. The cap is
 * stated in terms of the *minimum* length because that is the floor below which
 * `growBoard` throws a snake away and tries again.
 */
function arrowsFor(
  shape: ShapeName,
  rows: number,
  cols: number,
  fill: number,
  minLen: number,
  maxLen: number,
  floor = 5,
  usable = USABLE_FRACTION,
): number {
  const capacity = maskCapacity(maskFor(shape, rows, cols));
  const averageLength = (minLen + maxLen) / 2;
  // Divided by a fraction of the aspiration, because a packed walk rarely reaches
  // its target: it runs out of room and is kept anyway, so the achieved average is
  // roughly 60% of what was asked. Sizing off the aspiration leaves the board short
  // of arrows and short of coverage.
  const byFill = Math.floor((capacity * fill) / (averageLength * 0.6));
  const byCapacity = Math.floor((capacity * usable) / minLen);
  return Math.max(1, Math.min(Math.max(floor, byFill), byCapacity, MAX_ARROWS_PER_LEVEL));
}

/** Which mix band a level falls in. */
function weightsFor(id: number): Readonly<Record<DifficultyTier, number>> {
  for (const band of MIX) {
    if (id <= band.upTo) return band.weights;
  }
  return MIX[MIX.length - 1]!.weights;
}

/** Draw a tier from a weighted mix. */
function pickTier(
  rng: () => number,
  weights: Readonly<Record<DifficultyTier, number>>,
): DifficultyTier {
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
/**
 * How often a level uses a silhouette instead of the whole grid.
 *
 * This is the dial where two requirements pull against each other, and there is no
 * setting that satisfies both.
 *
 * Density is measured against the **grid**, because that is what a player sees. A
 * silhouette only occupies part of the grid — a letter or a helix is a third of it
 * — so packing that mask to 93% still leaves a board that looks half empty. With
 * shapes on every level, measured coverage came out at 50% average against a
 * target of 80–90%.
 *
 * So most levels are now the open rectangle, and shaped ones are a deliberate
 * minority where the silhouette is the point. Raise this for more variety of
 * outline; lower it for more levels that look packed. It cannot buy both.
 */
const SHAPED_LEVEL_SHARE = 0.25;

function shapePoolFor(size: number, demanding: boolean): readonly ShapeName[] {
  if (size <= 9) return ['free', 'diamond', 'circle', 'cross', 'ring', 'free'];

  // Glyphs need enough cells for a stroke to stay a stroke, and the perforated
  // procedural families need enough for their holes to read as holes. Below about
  // twelve both degrade into an indistinct blob, which is worse than a plain
  // rectangle because it looks like a shape that failed.
  const pool = size <= 12 ? SHAPE_NAMES.filter((name) => !isFineDetailShape(name)) : SHAPE_NAMES;

  // A tier that promises real difficulty cannot deliver it on a shape that breaks
  // the board into islands, however it is seeded — see `maskRegionCount`.
  return demanding ? pool.filter((name) => !FRAGMENTING_SHAPES.has(name)) : pool;
}

/** Shapes that need a reasonably large grid to read as themselves. */
function isFineDetailShape(name: ShapeName): boolean {
  return GLYPH_IDS.includes(name) || PROCEDURAL_IDS.includes(name);
}

/**
 * Shapes that cannot carry a genuinely hard level, measured rather than declared.
 *
 * Two independent ways a silhouette caps difficulty, and it took measuring both to
 * find out which one dominates:
 *
 * - **Islands.** Arrows in separate regions can never block each other, so every
 *   extra island raises how many arrows are free at once, and difficulty here is
 *   almost entirely "how few can move right now".
 * - **Capacity.** A narrow silhouette on a 28x28 board holds a third of the snakes
 *   an open one does, and a sparse board is a easy board whatever it is called.
 *
 * Capacity turned out to be much the larger effect. Filtering on islands alone
 * actually made the top tiers *easier*, because it left them a pool of detailed
 * but thin silhouettes — brutal boards fell from 25 arrows to 18. Both filters
 * together is what holds the top of the curve up.
 *
 * Measured at a reference size because it is a property of the silhouette that is
 * easy to misjudge by eye, and because a shape added later is then classified
 * correctly with nothing to remember to update.
 */
const MAX_ISLANDS_FOR_HARD_TIERS = 2;
const MIN_CAPACITY_FOR_HARD_TIERS = 0.55;

/**
 * Board size at which shape properties are measured.
 *
 * A silhouette's capacity and how many islands it leaves are both size-dependent,
 * so both filters classify against the same yardstick rather than each picking one.
 */
const REFERENCE_SIZE = 18;

const FRAGMENTING_SHAPES: ReadonlySet<ShapeName> = new Set(
  SHAPE_NAMES.filter((name) => {
    const mask = maskFor(name, REFERENCE_SIZE, REFERENCE_SIZE);
    const islands = maskRegionCount(mask, REFERENCE_SIZE, REFERENCE_SIZE);
    const fill = maskCapacity(mask) / (REFERENCE_SIZE * REFERENCE_SIZE);
    return islands > MAX_ISLANDS_FOR_HARD_TIERS || fill < MIN_CAPACITY_FOR_HARD_TIERS;
  }),
);

/** Tiers at or above this blind-mistake floor need a shape that can carry it. */
const DEMANDING_MIN_BLIND = 28;

function buildOnboarding(): LevelPlan[] {
  const plans: LevelPlan[] = [];

  for (let id = 1; id <= 20; id += 1) {
    const progress = (id - 1) / 19;
    // Capped at 12 deliberately, even though every other tier grew. At the minimum
    // cell size a 12-wide board is the largest that fits a phone without panning,
    // and the first twenty levels are where a player is learning what an arrow even
    // is. Making them learn the camera at the same time is one thing too many.
    const size = Math.round(8 + progress * 4); // 8x8 up to 12x12
    const shape = ONBOARDING_SHAPES[id - 1] ?? 'free';
    const fill = 0.32 + progress * 0.2;
    // Bodies lengthen across the twenty as well as everything else: the first few
    // boards are readable at a glance precisely because their snakes are short,
    // and that is the thing being taken away.
    const minLen = id <= 6 ? 2 : id <= 13 ? 3 : 4;
    const maxLen = id <= 6 ? 4 : id <= 13 ? 5 : 6;
    // Rises from a gentle 1.5 to about 10 — by the end, careless play costs hearts.
    const blind = 1.5 + progress * progress * 8.5;

    plans.push({
      id,
      name: id === 1 ? 'First Light' : `${QUALIFIERS[id % QUALIFIERS.length]} ${shapeLabel(shape)}`,
      tier: blind < 3 ? 'tutorial' : blind < 7 ? 'easy' : 'casual',
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
  let lastShape: ShapeName | undefined;

  for (let id = 21; id <= 600; id += 1) {
    const planning = isPlanningLevel(id);

    // The last ten are the endgame. A mixed curve is right everywhere else, but
    // finishing 600 levels on a random Medium is a flat note to end on.
    const tier: DifficultyTier = id > 590 ? 'nightmare' : pickTier(rng, weightsFor(id));
    const spec = TIERS[tier];

    // Level 600 is the largest board in the game.
    let size = id === 600 ? spec.maxSize : Math.round(lerp(rng, spec.minSize, spec.maxSize));

    // Density has a reach, and past it the board simply cannot be filled: covering
    // four-fifths of a 60x60 grid needs upwards of 250 snakes, which is past what
    // the renderer should carry and past what the walk can place before the board
    // closes up. Measured coverage falls from 88% at 40x40 to 72% at 60x60.
    //
    // Since density was set as the highest priority, board size yields to it. The
    // largest boards are 50 a side rather than 60 — still four screens, still
    // needing zoom and pan, and now actually packed.
    size = Math.min(size, MAX_PACKED_SIZE);

    // Planning levels are capped well below their tier's usual size. Proving a
    // shutter board solvable is a search rather than a graph peel, and the cost of
    // that search is what decides whether the library builds in half a minute or
    // half an hour. It costs these levels nothing worth having: a shutter is about
    // sequence, and sequence is legible on a board you can see all at once.
    if (planning) size = Math.min(size, 24);

    // Rotate rather than sample, so a silhouette cannot appear twice within a few
    // levels of itself. The skip loop matters now that the pool differs level to
    // level — a demanding tier draws from a smaller set, so the same cursor value
    // can land on the same shape two levels running even though it advanced.
    let shape: ShapeName;
    if (rng() < SHAPED_LEVEL_SHARE) {
      const pool = shapePoolFor(size, spec.minBlind >= DEMANDING_MIN_BLIND);
      shape = pool[shapeCursor % pool.length]!;
      shapeCursor += 1;
      for (let skip = 0; skip < pool.length && shape === lastShape; skip += 1) {
        shape = pool[shapeCursor % pool.length]!;
        shapeCursor += 1;
      }
    } else {
      shape = 'free';
    }
    lastShape = shape;

    // Shutter levels are not packed (see `build-levels.ts`), so they need a fill
    // that suits an open board rather than the packing target every other level
    // uses. They are the one deliberate exception to the density target, and the
    // reason is the mechanic rather than the generator: a `shuts` gate asks the
    // player to work out an *order*, and an order can only be read off a board
    // sparse enough to see the dependencies in. Packing these would hide the one
    // thing they exist to teach.
    //
    // Raised from a quarter now that the search is bounded (`SCREEN_BUDGET`) and
    // proving a candidate no longer costs minutes — but deliberately still well
    // under the packing target.
    const fill = planning ? 0.45 : lerp(rng, spec.minFill, spec.maxFill);
    // Drift the blind-mistake target upward across the game inside each tier, so
    // a late Hard level is harder than an early one without changing tier.
    const drift = (id - 20) / 580;
    const blind = lerp(rng, spec.minBlind, spec.maxBlind) * (0.85 + drift * 0.3);

    // Slight rectangular variation so not every board is a perfect square. Dense
    // boards lean on this harder: they are all the same silhouette, so size and
    // proportion are the only things left to tell them apart.
    const stretch = rng() < 0.3 ? Math.round(lerp(rng, 1, 4)) : 0;
    const rows = size;
    const cols = size + stretch;

    // Bodies are capped on planning levels too, for the same reason — and because
    // a level asking two hard questions at once usually asks neither well.
    // On a dense board they are capped differently: long snakes are what keep the
    // arrow count renderable at four-fifths coverage, but a snake longer than about
    // a dozen cells on a 24-wide board wraps the whole thing and stops reading as a
    // shape at all.
    const maxLen = planning ? Math.min(spec.maxLen, 9) : spec.maxLen;
    const minLen = Math.min(spec.minLen, maxLen);

    const gate: GatePlan | undefined = planning
      ? { mode: 'shuts', groupCount: 1, cellsPerGroup: 1 + Math.floor(rng() * 2) }
      : rng() < spec.gateChance
        ? {
            mode: 'opens',
            groupCount: rng() < 0.3 ? 2 : 1,
            cellsPerGroup: 1 + Math.floor(rng() * 3),
          }
        : undefined;

    plans.push({
      id,
      name: nameFor(id, shape, planning, gate !== undefined),
      tier,
      shape,
      rows,
      cols,
      // Shutter levels are the only ones grown at random rather than packed, so
      // they are the only ones the conservative fraction still describes.
      arrowCount: arrowsFor(
        shape,
        rows,
        cols,
        fill,
        minLen,
        maxLen,
        5,
        planning ? USABLE_FRACTION : PACKED_USABLE_FRACTION,
      ),
      minBodyLength: minLen,
      maxBodyLength: maxLen,
      targetBlindMistakes: Number(blind.toFixed(1)),
      hearts: spec.hearts,
      ...(gate ? { gate } : {}),
    });
  }

  return plans;
}

/**
 * A level's name.
 *
 * Planning levels get their own vocabulary. It is the only signal in the game that
 * a board plays by a different rule, and a player who has just lost one without
 * spending a heart deserves to have been warned by something.
 */
function nameFor(id: number, shape: ShapeName, planning: boolean, gated: boolean): string {
  if (id === 600) return 'Last Word';
  if (planning)
    return `${PLANNING_QUALIFIERS[id % PLANNING_QUALIFIERS.length]} ${shapeLabel(shape)}`;
  if (gated) return `${GATED_QUALIFIERS[id % GATED_QUALIFIERS.length]} ${shapeLabel(shape)}`;
  return `${QUALIFIERS[(id * 7) % QUALIFIERS.length]} ${shapeLabel(shape)}`;
}

/** The full 600-level curriculum, in play order. */
export const CURRICULUM: readonly LevelPlan[] = [...buildOnboarding(), ...buildMainRun()];

/** Curated 1–5 band for a tier, shown in level select. */
export function bandOf(tier: DifficultyTier): number {
  return TIERS[tier].band;
}

/** Board sizes above this no longer fit a phone screen and need zoom and pan. */
export const OVERSIZED_BOARD_THRESHOLD = 15;

/** True when a level's board is bigger than a comfortable single screen. */
export function isOversized(plan: LevelPlan): boolean {
  return Math.max(plan.rows, plan.cols) > OVERSIZED_BOARD_THRESHOLD;
}
