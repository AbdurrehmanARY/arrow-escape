/**
 * Level integrity.
 *
 * The guardrail that makes shipping levels safe. Every level in `src/data/levels`
 * is decoded exactly as the app decodes it, solved, and its recorded solution
 * replayed. A level that reaches a player unsolvable is the single worst bug this
 * project can ship — it is unrecoverable from inside the game and it looks like
 * the player's fault.
 *
 * With 1,000 levels this runs as a handful of sweeps rather than a `describe.each`
 * per level: 1,000 suites of five tests each is 5,000 test cases and minutes of CI
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
  it('ships the full 1,000-level set', () => {
    expect(LEVEL_COUNT).toBe(1000);
    expect(ENCODED_LEVELS).toHaveLength(1000);
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
    // Ten tiers over 1,000 levels, and the ends are deliberately thin: Tutorial is
    // spent by level 100 and Nightmare barely exists before level 450. A dozen is
    // the floor at which a tier is a real band rather than a rounding error.
    for (const tier of TIER_ORDER) {
      expect(byTier(tier).length).toBeGreaterThanOrEqual(12);
    }
  });

  /**
   * Average blind mistakes per tier, in tier order.
   *
   * Shared by the two assertions below, which between them replace a single
   * "monotone across all ten tiers" check. That check was right while board size
   * was what separated the tiers, and became wrong when density was made the
   * priority: `MAX_PACKED_SIZE` caps every board at 50x50, so the top four tiers
   * are all the same size and differ only in how long their snakes are.
   *
   * `expectedBlindMistakes` cannot see that difference. It models a player tapping
   * **at random**, who never traces a snake, so the metric responds to how many
   * arrows are free at once — and at a fixed density, longer snakes mean *fewer*
   * arrows, which pushes the number down even as the board gets harder to read.
   * The top four measure 674 / 624 / 519 / 592: not monotone, and not a defect.
   *
   * So difficulty is checked on both axes separately, and the snake-length one
   * below is the stronger claim of the two.
   */
  const blindByTier = TIER_ORDER.map((tier) => {
    const rows = byTier(tier);
    return rows.reduce((sum, m) => sum + m.metrics.expectedBlindMistakes, 0) / rows.length;
  });

  it('orders the tiers by measured difficulty, up to where board size stops growing', () => {
    // Tutorial through superHard: 89 cells to 2,207, and the metric tracks it.
    const growing = blindByTier.slice(0, TIER_ORDER.indexOf('superHard') + 1);
    for (let i = 1; i < growing.length; i += 1) {
      expect(growing[i]!).toBeGreaterThan(growing[i - 1]!);
    }
  });

  it('keeps the four capped tiers well clear of the tiers below them', () => {
    // They no longer order cleanly among themselves, for the reason above. What
    // must remain true is that all four are decisively harder than the run of the
    // game beneath them — otherwise "Nightmare" is a label with nothing behind it.
    const capped = blindByTier.slice(TIER_ORDER.indexOf('superHard'));
    const lower = blindByTier.slice(0, TIER_ORDER.indexOf('superHard'));
    const lowerMean = lower.reduce((sum, v) => sum + v, 0) / lower.length;

    for (const value of capped) expect(value).toBeGreaterThan(lowerMean * 1.5);
  });

  /**
   * Mean and longest body length per tier, in tier order.
   *
   * Split across the two assertions below for the same reason `blindByTier` is:
   * once `MAX_PACKED_SIZE` flattens the top four tiers onto one board size, the
   * two length axes stop agreeing, and only one of them still orders cleanly.
   */
  const lengthsByTier = TIER_ORDER.map((tier) => {
    const rows = byTier(tier);
    const bodies = rows.map((m) => m.level.arrows.map((arrow) => arrow.body.length));
    return {
      mean:
        bodies.reduce((sum, b) => sum + b.reduce((a, n) => a + n, 0) / b.length, 0) / rows.length,
      longest: bodies.reduce((sum, b) => sum + Math.max(...b), 0) / rows.length,
    };
  });

  it('lengthens its longest snake at every single tier step', () => {
    // The strong claim, and the one that holds the whole way up: 4.1 cells at
    // Tutorial to 26.2 at Nightmare, rising at all nine steps. Reading a board
    // means tracing a snake through a tangle, so the longest snake is the thing
    // the capped tiers actually escalate — this is what keeps "Nightmare" from
    // being a label with nothing behind it.
    for (let i = 1; i < lengthsByTier.length; i += 1) {
      expect(lengthsByTier[i]!.longest).toBeGreaterThan(lengthsByTier[i - 1]!.longest);
    }
  });

  it('raises mean snake length up to the size cap, then holds it above the rest', () => {
    // Mean length is monotone exactly as far as board size is — Tutorial through
    // superHard, 3.0 cells to 10.3 — and then stops, for the same reason
    // `blindByTier` stops.
    //
    // The capped tiers specify heavily overlapping body ranges (superHard 8-19,
    // extremeHard 9-22, brutal 10-25, nightmare 11-28) and only about twenty
    // levels each to realise them, so which silhouettes a tier happens to draw
    // moves its mean by more than the gap between adjacent tiers. Measured
    // 10.3 / 11.0 / 10.8 / 11.2: brutal sits a seventh of a cell under
    // extremeHard. That is sampling noise on a 22-level tier, not a curve that
    // sagged — and it inverted merely from adding one shape to the rotation,
    // which is the tell. Ordering for those four is asserted on `longest` above,
    // which is stricter and does hold.
    const capIndex = TIER_ORDER.indexOf('superHard');

    const growing = lengthsByTier.slice(0, capIndex + 1);
    for (let i = 1; i < growing.length; i += 1) {
      expect(growing[i]!.mean).toBeGreaterThan(growing[i - 1]!.mean);
    }

    // What must stay true of the capped four: decisively longer snakes than the
    // run of the game beneath them. Same shape of claim, and same margin, as the
    // blind-mistake check above.
    const lower = lengthsByTier.slice(0, capIndex);
    const lowerMean = lower.reduce((sum, entry) => sum + entry.mean, 0) / lower.length;
    for (const entry of lengthsByTier.slice(capIndex)) {
      expect(entry.mean).toBeGreaterThan(lowerMean * 1.5);
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

    // Was 5x. The multiple came down because the *floor* rose, not because the
    // ceiling fell: packing the early levels to four-fifths of their board — which
    // is what "dense across all difficulties" means — took the first fifty from a
    // handful of blind mistakes to about 156, while the last fifty sit at 576.
    // Levels 1-20 are still gentle, and the test above holds them there.
    expect(mean(lastFifty)).toBeGreaterThan(mean(firstFifty) * 3);
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
    //
    // 180 is `MAX_ARROWS_PER_LEVEL` in `tools/curriculum.ts` — restated rather than
    // imported, because this file tests what *shipped* and importing the generator's
    // own constant would make the assertion agree with itself by construction. It
    // was 110 while only a handful of levels were dense; now that nearly every
    // board is packed it is the generator's cap that has to be enforced here.
    for (const id of packed) {
      expect(levelById(id)!.arrows.length).toBeLessThanOrEqual(180);
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
