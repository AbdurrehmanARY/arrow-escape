/**
 * Solver correctness.
 *
 * The project's central guarantee is "every shipped level is solvable", and that
 * guarantee is only as good as this solver. So the graph-peeling engine is not
 * trusted on the strength of its reasoning — it is checked against exhaustive
 * search over hundreds of random boards.
 */

import {
  analyze,
  applyOutcome,
  blockingGraphOf,
  isSolvable,
  legalMoves,
  renderAscii,
  resolveTap,
  solve,
  solveBruteForce,
  verifySolution,
} from '@game';
import { build, randomBoard, seededRandom } from '../helpers';

/** Three snakes in a row, each head blocked by the next. Only 'a' can move. */
const CHAIN = 'c C b B a A';

describe('solve', () => {
  it('solves a chain in dependency order', () => {
    const { board, initial } = build(CHAIN);
    const outcome = solve(board, initial);

    expect(outcome.kind).toBe('solved');
    if (outcome.kind !== 'solved') return;
    expect(outcome.solution).toEqual([0, 1, 2]);
  });

  it('returns an empty solution for an already-clear board', () => {
    const { board, initial } = build('A a .');
    const cleared = applyOutcome(initial, resolveTap(board, initial, 0));
    expect(solve(board, cleared)).toEqual({ kind: 'solved', solution: [] });
  });

  it('names the arrows in the knot when a board cannot be solved', () => {
    const { board, initial } = build('a A B b');
    const outcome = solve(board, initial);

    expect(outcome.kind).toBe('unsolvable');
    if (outcome.kind !== 'unsolvable') return;
    expect(outcome.reason).toMatch(/cycle/);
    expect(outcome.reason).toContain('a');
    expect(outcome.reason).toContain('b');
  });

  it('produces the same canonical solution every run', () => {
    const { board, initial } = build(CHAIN);
    expect(solve(board, initial)).toEqual(solve(board, initial));
  });

  it('treats a self-crossing body as free rather than self-blocked', () => {
    const { board, initial } = build(`
      a a a a
      a . . a
      a A . a
    `);
    expect(isSolvable(board, initial)).toBe(true);
  });
});

describe('blockingGraphOf', () => {
  it('records each blocker once even when it sits on the ray twice', () => {
    // a's head at (0,1) points right; b occupies both (0,2) and (0,3), so it is
    // encountered twice while walking the ray but must appear as one dependency.
    const { board, initial } = build('a A B b');
    const graph = blockingGraphOf(board, initial);

    expect(graph.blockedBy[0]).toEqual([1]);
    expect(graph.blocks[1]).toEqual([0]);
    // Symmetric here: b's head points back into a's body. Hence the cycle.
    expect(graph.blockedBy[1]).toEqual([0]);
  });

  it('is empty for arrows with nothing ahead of them', () => {
    const { board, initial } = build('A a . . .');
    const graph = blockingGraphOf(board, initial);
    expect(graph.blockedBy[0]).toEqual([]);
  });
});

describe('verifySolution', () => {
  it('accepts the solver own output', () => {
    const { board, initial } = build(CHAIN);
    const outcome = solve(board, initial);
    if (outcome.kind !== 'solved') throw new Error('expected solvable fixture');
    expect(verifySolution(board, initial, outcome.solution)).toEqual({ ok: true });
  });

  it('rejects a solution that taps a blocked arrow', () => {
    const { board, initial } = build(CHAIN);
    const result = verifySolution(board, initial, [2, 1, 0]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/step 0/);
  });

  it('rejects a solution that leaves arrows behind', () => {
    const { board, initial } = build(CHAIN);
    const result = verifySolution(board, initial, [0]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/2 arrow\(s\) left/);
  });
});

describe('the fast solver agrees with exhaustive search', () => {
  it('matches brute force on 500 random boards', () => {
    const rng = seededRandom(20260728);
    let solvableCount = 0;
    let unsolvableCount = 0;

    for (let trial = 0; trial < 500; trial += 1) {
      const { board, initial } = randomBoard(rng, {
        rows: 3 + Math.floor(rng() * 3),
        cols: 3 + Math.floor(rng() * 3),
        arrowCount: 2 + Math.floor(rng() * 5),
        maxBodyLength: 2 + Math.floor(rng() * 3),
      });
      if (board.arrows.length === 0) continue;

      const fast = solve(board, initial).kind === 'solved';
      const slow = solveBruteForce(board, initial);

      if (fast !== slow) {
        throw new Error(
          `disagreement (fast=${fast}, brute=${slow}) on:\n${renderAscii(board, initial)}`,
        );
      }
      if (fast) solvableCount += 1;
      else unsolvableCount += 1;
    }

    // Guard against the test passing vacuously because every board fell one way.
    expect(solvableCount).toBeGreaterThan(50);
    expect(unsolvableCount).toBeGreaterThan(10);
  });

  it('every solution the solver returns actually clears the board', () => {
    const rng = seededRandom(13579);
    let verified = 0;

    for (let trial = 0; trial < 400; trial += 1) {
      const { board, initial } = randomBoard(rng, {
        rows: 4,
        cols: 4,
        arrowCount: 2 + Math.floor(rng() * 5),
        maxBodyLength: 4,
      });
      if (board.arrows.length === 0) continue;

      const outcome = solve(board, initial);
      if (outcome.kind !== 'solved') continue;

      const check = verifySolution(board, initial, outcome.solution);
      if (!check.ok) {
        throw new Error(`bad solution:\n${renderAscii(board, initial)}\n${check.error}`);
      }
      verified += 1;
    }

    expect(verified).toBeGreaterThan(50);
  });
});

describe('analyze', () => {
  it('measures a forced chain as fully forced', () => {
    const { board, initial } = build(CHAIN);
    const metrics = analyze(board, initial);

    expect(metrics.solvable).toBe(true);
    expect(metrics.arrowCount).toBe(3);
    expect(metrics.solutionLength).toBe(3);
    expect(metrics.minFrontier).toBe(1);
    expect(metrics.avgFrontier).toBe(1);
    expect(metrics.dependencyDepth).toBe(3);
    expect(metrics.avgBodyLength).toBe(2);
    expect(metrics.avgTurns).toBe(0);
  });

  it('predicts how many hearts a blind player would burn', () => {
    // Three arrows, only one free at a time: a blind player expects 2 wrong taps
    // on the first pick and 1 on the second, so 3 in total.
    const { board, initial } = build(CHAIN);
    expect(analyze(board, initial).expectedBlindMistakes).toBeCloseTo(3, 5);
  });

  it('costs a blind player nothing when every arrow is free', () => {
    const { board, initial } = build(`
      A a . . .
      . . . . .
      B b . . .
    `);
    expect(analyze(board, initial).expectedBlindMistakes).toBe(0);
    expect(analyze(board, initial).minFrontier).toBe(2);
  });

  it('counts bends, which is what makes a body hard to trace', () => {
    const { board, initial } = build(`
      A a a a
      . . . a
      . . . a
    `);
    const metrics = analyze(board, initial);
    expect(metrics.maxBodyLength).toBe(6);
    expect(metrics.avgTurns).toBe(1);
  });

  it('counts crowding between different arrows only', () => {
    // Two snakes lying side by side along their whole length.
    const { board, initial } = build(`
      A a a
      B b b
    `);
    // Three adjacent column pairs between the two rows.
    expect(analyze(board, initial).crowding).toBeCloseTo(1.5, 5);
  });

  it('flags an unsolvable board', () => {
    const { board, initial } = build('a A B b');
    expect(analyze(board, initial).solvable).toBe(false);
  });

  it('suggests a difficulty inside the 1-5 band', () => {
    const rng = seededRandom(2468);
    for (let trial = 0; trial < 60; trial += 1) {
      const { board, initial } = randomBoard(rng, {
        rows: 5,
        cols: 5,
        arrowCount: 5,
        maxBodyLength: 5,
      });
      if (board.arrows.length === 0) continue;
      const { suggestedDifficulty } = analyze(board, initial);
      expect(suggestedDifficulty).toBeGreaterThanOrEqual(1);
      expect(suggestedDifficulty).toBeLessThanOrEqual(5);
    }
  });
});

describe('legalMoves stays consistent with solve', () => {
  it('a solvable board always offers at least one legal move', () => {
    const rng = seededRandom(31337);
    for (let trial = 0; trial < 300; trial += 1) {
      const { board, initial } = randomBoard(rng, {
        rows: 4,
        cols: 4,
        arrowCount: 2 + Math.floor(rng() * 4),
        maxBodyLength: 3,
      });
      if (board.arrows.length === 0) continue;
      if (!isSolvable(board, initial)) continue;
      expect(legalMoves(board, initial).length).toBeGreaterThan(0);
    }
  });
});
