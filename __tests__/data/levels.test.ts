/**
 * Level integrity.
 *
 * The guardrail that makes shipping levels safe. Every level in `src/data/levels`
 * is decoded exactly as the app decodes it, solved, and its recorded solution
 * replayed. A level that reaches a player unsolvable is the single worst bug this
 * project can ship — it is unrecoverable from inside the game and it looks like
 * the player's fault.
 *
 * With 600 levels this runs as a handful of sweeps rather than a `describe.each`
 * per level: 600 suites of five tests each is 3,000 test cases and minutes of CI
 * for no extra information. A sweep that throws names the offending level.
 */

import {
  analyze,
  buildLevel,
  indexOfArrow,
  legalMoves,
  NO_GROUP,
  solve,
  verifySolution,
} from '@game';
import { TIER_ORDER, type DifficultyTier } from '@game/codec';
import { ENCODED_LEVELS, LEVEL_COUNT, levelById, summaryOf, tierOf } from '@data/levels';

const ALL_IDS = Array.from({ length: LEVEL_COUNT }, (_, i) => i + 1);

describe('the shipped level library', () => {
  it('ships the full 600-level set', () => {
    expect(LEVEL_COUNT).toBe(600);
    expect(ENCODED_LEVELS).toHaveLength(600);
  });

  it('numbers levels 1..N with no gaps', () => {
    const ids = ENCODED_LEVELS.map((level) => level.i).sort((a, b) => a - b);
    expect(ids).toEqual(ALL_IDS);
  });

  it('gives every level a name, a tier, and a band', () => {
    for (const level of ENCODED_LEVELS) {
      expect(level.n.length).toBeGreaterThan(0);
      expect(TIER_ORDER).toContain(level.t);
      expect(level.d).toBeGreaterThanOrEqual(1);
      expect(level.d).toBeLessThanOrEqual(5);
      expect(level.h).toBeGreaterThan(0);
    }
  });

  it('reads a summary without decoding the level', () => {
    const summary = summaryOf(1);
    expect(summary?.name.length).toBeGreaterThan(0);
    expect(summary?.rows).toBeGreaterThan(0);
    expect(tierOf(1)).toBeDefined();
    expect(summaryOf(9999)).toBeUndefined();
  });

  it('looks levels up by id, and returns undefined for ones that do not exist', () => {
    expect(levelById(1)?.id).toBe(1);
    expect(levelById(LEVEL_COUNT)?.id).toBe(LEVEL_COUNT);
    expect(levelById(0)).toBeUndefined();
    expect(levelById(9999)).toBeUndefined();
  });

  it('caches a decoded level rather than decoding it twice', () => {
    // Decoding a 27x30 board is not free, and the board is re-read on every
    // render of the play screen.
    expect(levelById(2)).toBe(levelById(2));
  });
});

describe('every level', () => {
  it('decodes, builds, and is solvable', () => {
    for (const id of ALL_IDS) {
      const level = levelById(id);
      if (!level) throw new Error(`level ${id} is missing`);

      const built = buildLevel(level);
      if (!built.ok) throw new Error(`level ${id} "${level.name}": ${built.error}`);

      const outcome = solve(built.value.board, built.value.initial);
      if (outcome.kind !== 'solved') {
        throw new Error(`level ${id} "${level.name}" is UNSOLVABLE: ${outcome.reason}`);
      }
    }
  });

  it('records a solution that actually clears the board', () => {
    for (const id of ALL_IDS) {
      const level = levelById(id)!;
      const built = buildLevel(level);
      if (!built.ok) continue;

      const { board, initial } = built.value;
      const solution = level.solution ?? [];

      if (solution.length !== board.arrows.length) {
        throw new Error(
          `level ${id} "${level.name}": solution has ${solution.length} steps for ${board.arrows.length} arrows`,
        );
      }

      const indices = solution.map((arrowId) => indexOfArrow(board, arrowId));
      if (indices.includes(-1)) {
        throw new Error(`level ${id} "${level.name}": solution names an arrow that does not exist`);
      }

      const replay = verifySolution(board, initial, indices);
      if (!replay.ok) throw new Error(`level ${id} "${level.name}": ${replay.error}`);
    }
  });

  it('opens with at least one tappable arrow', () => {
    for (const id of ALL_IDS) {
      const built = buildLevel(levelById(id)!);
      if (!built.ok) continue;
      const moves = legalMoves(built.value.board, built.value.initial);
      if (moves.length === 0) {
        throw new Error(`level ${id} has nothing tappable on the first move`);
      }
    }
  });

  it('has enough arrows to be a puzzle', () => {
    // A board of two snakes is not an easy level, it is an empty one — there is
    // nothing to read, which is the entire skill the game tests.
    for (const id of ALL_IDS) {
      const level = levelById(id)!;
      if (level.arrows.length < 4) {
        throw new Error(`level ${id} "${level.name}" has only ${level.arrows.length} arrows`);
      }
    }
  });
});

describe('the difficulty mix', () => {
  const measured = ALL_IDS.map((id) => {
    const level = levelById(id)!;
    const built = buildLevel(level);
    if (!built.ok) throw new Error(built.error);
    return {
      id,
      level,
      tier: tierOf(id)!,
      metrics: analyze(built.value.board, built.value.initial),
    };
  });

  const byTier = (tier: DifficultyTier) => measured.filter((m) => m.tier === tier);

  it('uses every tier', () => {
    // Ten tiers over 600 levels, and the ends are deliberately thin: Tutorial is
    // spent by level 100 and Nightmare barely exists before level 450. A dozen is
    // the floor at which a tier is a real band rather than a rounding error.
    for (const tier of TIER_ORDER) {
      expect(byTier(tier).length).toBeGreaterThanOrEqual(12);
    }
  });

  it('orders the tiers by actual measured difficulty', () => {
    // The tiers are named by intent; this checks the generator delivered on it.
    const averages = TIER_ORDER.map((tier) => {
      const rows = byTier(tier);
      return rows.reduce((sum, m) => sum + m.metrics.expectedBlindMistakes, 0) / rows.length;
    });

    for (let i = 1; i < averages.length; i += 1) {
      expect(averages[i]!).toBeGreaterThan(averages[i - 1]!);
    }
  });

  it('keeps onboarding gentle but not trivial', () => {
    // Levels 1-20 must be survivable by a careless player, and must still be
    // worth playing — a level that solves itself teaches nothing.
    for (const m of measured.slice(0, 20)) {
      expect(m.metrics.expectedBlindMistakes).toBeLessThan(12);
      expect(m.level.arrows.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('stops being predictable after onboarding', () => {
    // The whole point of the mixed curve: a player must not be able to guess the
    // next level's difficulty from the last one. If the run after level 20 were
    // sorted, every step would rise.
    const after = measured.slice(20);
    let descents = 0;
    for (let i = 1; i < after.length; i += 1) {
      if (after[i]!.metrics.expectedBlindMistakes < after[i - 1]!.metrics.expectedBlindMistakes) {
        descents += 1;
      }
    }
    expect(descents).toBeGreaterThan(after.length * 0.3);
  });

  it('still climbs overall from start to finish', () => {
    const firstFifty = measured.slice(0, 50);
    const lastFifty = measured.slice(-50);
    const mean = (rows: typeof measured) =>
      rows.reduce((sum, m) => sum + m.metrics.expectedBlindMistakes, 0) / rows.length;

    expect(mean(lastFifty)).toBeGreaterThan(mean(firstFifty) * 5);
  });

  it('ends on the hardest tier', () => {
    expect(tierOf(LEVEL_COUNT)).toBe('nightmare');
  });
});

describe('dense levels', () => {
  /**
   * Board coverage: cells carrying a snake, over cells on the board.
   *
   * Measured against the *board*, not against the silhouette, because that is what
   * a player sees. The distinction is not academic — the first attempt at these
   * levels measured 85% of a shield-shaped mask and shipped 54% of the grid.
   */
  const coverageOf = (id: number): number => {
    const level = levelById(id)!;
    const cells = level.arrows.reduce((sum, arrow) => sum + arrow.body.length, 0);
    return cells / (level.rows * level.cols);
  };

  const packed = ALL_IDS.filter((id) => coverageOf(id) >= 0.7);

  it('ships a real run of boards packed to roughly four cells in five', () => {
    expect(packed.length).toBeGreaterThanOrEqual(30);
  });

  it('spreads them across the harder tiers rather than hoarding them at the top', () => {
    // The point of dense levels is that they are a different *kind* of hard, not a
    // higher degree of it — so they have to appear where a player meets them long
    // before the endgame.
    const tiers = new Set(packed.map((id) => tierOf(id)));
    expect(tiers.size).toBeGreaterThanOrEqual(4);
    expect([...tiers].some((tier) => tier === 'medium' || tier === 'tricky')).toBe(true);
  });

  it('keeps every one of them solvable', () => {
    // The whole difficulty of building these. At this density almost every random
    // board is a knot of mutual blocking, which is why the generator constructs a
    // winning order rather than generating and checking.
    for (const id of packed) {
      const built = buildLevel(levelById(id)!);
      if (!built.ok) throw new Error(`level ${id}: ${built.error}`);
      const outcome = solve(built.value.board, built.value.initial);
      if (outcome.kind !== 'solved') {
        throw new Error(`dense level ${id} is UNSOLVABLE: ${outcome.reason}`);
      }
    }
  });

  it('stays within what the renderer can afford', () => {
    // Density is bought with long snakes rather than many of them. Hundreds of
    // arrows on one board is a frame-rate problem, not a harder puzzle.
    for (const id of packed) {
      expect(levelById(id)!.arrows.length).toBeLessThanOrEqual(110);
    }
  });
});

describe('gates in the shipped library', () => {
  const built = ALL_IDS.map((id) => {
    const level = levelById(id)!;
    const result = buildLevel(level);
    if (!result.ok) throw new Error(`level ${id}: ${result.error}`);
    return { id, level, ...result.value };
  });

  const shutterLevels = built.filter((entry) => entry.board.hasShutters);
  const gatedLevels = built.filter((entry) => entry.board.hasObstacles);

  it('ships enough gated levels for the mechanic to be learnable', () => {
    // A mechanic that appears five times in six hundred levels is a curiosity, not
    // a mechanic — the player meets it, fails once, and never sees it again.
    expect(gatedLevels.length).toBeGreaterThan(80);
    expect(shutterLevels.length).toBeGreaterThan(25);
  });

  it('survives the round trip through the codec', () => {
    // Gates, colours and walls are all optional fields the encoder omits when they
    // are absent, which is exactly the shape of bug that ships a level whose gates
    // silently vanished.
    for (const entry of gatedLevels) {
      expect(entry.board.groups.length).toBeGreaterThan(0);
      const coloured = entry.board.arrows.filter((arrow) => arrow.group !== NO_GROUP);
      expect(coloured.length).toBeGreaterThan(0);
    }
  });

  it('gives every shutter level genuine order-dependence', () => {
    // The reason a shutter is worth its cost. A level named for a closing gate had
    // better contain a tap that actually closes one on you, or the name is a lie
    // and the mechanic teaches nothing.
    for (const entry of shutterLevels) {
      const metrics = analyze(entry.board, entry.initial);
      expect(metrics.orderMatters).toBe(true);
      expect(metrics.blunderRate).toBeGreaterThan(0);
    }
  });

  it('leaves every other level order-proof', () => {
    // The complement, and the more important half: 560 levels still play by the
    // rule that no tap order can lose you the board.
    for (const entry of built) {
      if (entry.board.hasShutters) continue;
      expect(analyze(entry.board, entry.initial).blunderRate).toBe(0);
    }
  });
});

describe('board sizes', () => {
  it('includes boards far larger than a phone screen', () => {
    // Super Hard and Extreme are defined by needing pan and zoom. If nothing is
    // oversized, those tiers have lost their defining feature.
    const oversized = ENCODED_LEVELS.filter((level) => Math.max(level.r, level.c) > 14);
    expect(oversized.length).toBeGreaterThan(100);
  });

  it('keeps onboarding boards on a single screen', () => {
    for (const level of ENCODED_LEVELS.slice(0, 20)) {
      expect(Math.max(level.r, level.c)).toBeLessThanOrEqual(12);
    }
  });
});

describe('shape variety', () => {
  it('draws on the whole silhouette library', () => {
    const shapes = new Set(ENCODED_LEVELS.map((level) => level.l));
    expect(shapes.size).toBeGreaterThan(40);
  });

  it('never repeats a silhouette in consecutive levels', () => {
    for (let i = 1; i < ENCODED_LEVELS.length; i += 1) {
      const current = ENCODED_LEVELS[i]!;
      const previous = ENCODED_LEVELS[i - 1]!;
      if (current.l === previous.l && current.l !== 'free') {
        throw new Error(`levels ${previous.i} and ${current.i} both use "${current.l}"`);
      }
    }
  });
});
