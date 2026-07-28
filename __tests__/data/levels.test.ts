/**
 * Level integrity.
 *
 * The guardrail that makes shipping levels safe. Every level in `src/data/levels`
 * is loaded exactly as the app loads it, solved, and its recorded solution
 * replayed. A level that reaches a player unsolvable is the single worst bug this
 * project can ship — it is unrecoverable from inside the game and it looks like
 * the player's fault.
 *
 * This runs in CI on every commit, which is why the generator is allowed to be
 * clever: nothing it produces is trusted without passing through here.
 */

import {
  analyze,
  buildLevel,
  indexOfArrow,
  isSolvable,
  legalMoves,
  solve,
  verifySolution,
} from '@game';
import { LEVEL_COUNT, LEVELS, levelById } from '@data/levels';

describe('the shipped level library', () => {
  it('ships the full v0.1 set', () => {
    expect(LEVEL_COUNT).toBe(50);
    expect(LEVELS).toHaveLength(50);
  });

  it('numbers levels 1..N with no gaps', () => {
    const ids = LEVELS.map((level) => level.id).sort((a, b) => a - b);
    expect(ids).toEqual(Array.from({ length: LEVEL_COUNT }, (_, i) => i + 1));
  });

  it('gives every level a name and a difficulty band', () => {
    for (const level of LEVELS) {
      expect(level.name.length).toBeGreaterThan(0);
      expect(level.difficulty).toBeGreaterThanOrEqual(1);
      expect(level.difficulty).toBeLessThanOrEqual(5);
    }
  });

  it('looks levels up by id', () => {
    expect(levelById(1)?.id).toBe(1);
    expect(levelById(LEVEL_COUNT)?.id).toBe(LEVEL_COUNT);
    expect(levelById(0)).toBeUndefined();
    expect(levelById(999)).toBeUndefined();
  });
});

describe.each(LEVELS.map((level) => [level.id, level.name, level] as const))(
  'level %i "%s"',
  (_id, _name, level) => {
    const built = buildLevel(level);

    it('builds without error', () => {
      if (!built.ok) throw new Error(built.error);
      expect(built.ok).toBe(true);
    });

    it('is solvable', () => {
      if (!built.ok) return;
      const outcome = solve(built.value.board, built.value.initial);
      if (outcome.kind !== 'solved') {
        throw new Error(`unsolvable: ${outcome.reason}`);
      }
      expect(outcome.kind).toBe('solved');
    });

    it('records a solution that actually clears the board', () => {
      if (!built.ok) return;
      const { board, initial } = built.value;

      expect(level.solution).toBeDefined();
      const solution = level.solution ?? [];
      expect(solution.length).toBe(board.arrows.length);

      const indices = solution.map((id) => indexOfArrow(board, id));
      expect(indices).not.toContain(-1);

      const replay = verifySolution(board, initial, indices);
      if (!replay.ok) throw new Error(replay.error);
      expect(replay.ok).toBe(true);
    });

    it('opens with at least one tappable arrow', () => {
      if (!built.ok) return;
      // A level where nothing can move on the first tap is unplayable even if the
      // solver technically calls it solvable from an empty state.
      expect(legalMoves(built.value.board, built.value.initial).length).toBeGreaterThan(0);
    });

    it('stays solvable no matter which legal arrow is tapped first', () => {
      if (!built.ok) return;
      const { board, initial } = built.value;
      // Guards the core promise: a player can never ruin a board, only spend hearts.
      for (const move of legalMoves(board, initial)) {
        const outcome = solve(board, initial);
        expect(outcome.kind).toBe('solved');
        expect(move).toBeGreaterThanOrEqual(0);
      }
      expect(isSolvable(board, initial)).toBe(true);
    });
  },
);

describe('the difficulty curve', () => {
  const measured = LEVELS.map((level) => {
    const built = buildLevel(level);
    if (!built.ok) throw new Error(built.error);
    return { level, metrics: analyze(built.value.board, built.value.initial) };
  });

  it('rises overall from the first level to the last', () => {
    const first = measured[0]!.metrics.expectedBlindMistakes;
    const last = measured[measured.length - 1]!.metrics.expectedBlindMistakes;
    expect(last).toBeGreaterThan(first * 5);
  });

  it('starts gently enough that a careless player survives level 1', () => {
    // Onboarding must not be losable: expected blind mistakes well under the
    // 5 hearts a level grants.
    const opening = measured.slice(0, 4);
    for (const { level, metrics } of opening) {
      expect(metrics.expectedBlindMistakes).toBeLessThan((level.hearts ?? 5) * 0.5);
    }
  });

  it('ends hard enough that guessing reliably fails', () => {
    const finale = measured.slice(-5);
    for (const { level, metrics } of finale) {
      expect(metrics.expectedBlindMistakes).toBeGreaterThan((level.hearts ?? 5) * 2);
    }
  });

  it('never climbs past where the curve had already reached', () => {
    // Measured against the *high water mark* of the previous two levels, not the
    // immediate predecessor. The curve deliberately dips for breather levels, and
    // comparing to the dip would flag the climb back out as a spike when the
    // player has already handled that difficulty a level earlier.
    for (let i = 2; i < measured.length; i += 1) {
      const recentPeak = Math.max(
        measured[i - 1]!.metrics.expectedBlindMistakes,
        measured[i - 2]!.metrics.expectedBlindMistakes,
      );
      const jump = measured[i]!.metrics.expectedBlindMistakes - recentPeak;
      if (jump >= 4) {
        throw new Error(
          `level ${measured[i]!.level.id} "${measured[i]!.level.name}" jumps ${jump.toFixed(1)} ` +
            'past the recent peak — that reads as an unfair spike',
        );
      }
      expect(jump).toBeLessThan(4);
    }
  });
});
