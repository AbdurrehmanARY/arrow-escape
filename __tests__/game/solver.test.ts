/**
 * Solver correctness.
 *
 * The project's central guarantee is "every shipped level is solvable", and that
 * guarantee is only as good as this solver. So the fast engines are not trusted
 * on the strength of their reasoning — they are checked against exhaustive search
 * over thousands of random boards.
 */

import {
  analyze,
  applyOutcome,
  isSolvable,
  legalMoves,
  renderAscii,
  resolveTap,
  solve,
  solveBruteForce,
  verifySolution,
} from '@game';
import { build, randomBoard, SAFE_MOVE, seededRandom, TRAP_BOARD, TRAP_MOVE } from '../helpers';

describe('solve — escape-only', () => {
  it('solves a chain in dependency order', () => {
    const { board, initial } = build(`
      v . .
      > > .
      . . .
    `);
    const outcome = solve(board, initial);
    expect(outcome.kind).toBe('solved');
    if (outcome.kind !== 'solved') return;
    expect(outcome.solution).toEqual([2, 1, 0]);
  });

  it('returns an empty solution for an already-clear board', () => {
    const { board, initial } = build('> . .');
    const cleared = applyOutcome(initial, resolveTap(board, initial, 0));
    expect(solve(board, cleared)).toEqual({ kind: 'solved', solution: [] });
  });

  it('names the arrows in the knot when a board cannot be solved', () => {
    const { board, initial } = build('> <');
    const outcome = solve(board, initial);
    expect(outcome.kind).toBe('unsolvable');
    if (outcome.kind !== 'unsolvable') return;
    expect(outcome.reason).toMatch(/cycle/);
    expect(outcome.reason).toContain('a0');
    expect(outcome.reason).toContain('a1');
  });

  it('produces the same canonical solution every run', () => {
    const { board, initial } = build(`
      > . . .
      . v . .
      . . < .
    `);
    const first = solve(board, initial);
    const second = solve(board, initial);
    expect(first).toEqual(second);
  });
});

describe('solve — slide-and-stop', () => {
  it('finds an order that clears a board a naive order would ruin', () => {
    const { board, initial } = build(TRAP_BOARD, 'slide-and-stop');
    const outcome = solve(board, initial);

    expect(outcome.kind).toBe('solved');
    if (outcome.kind !== 'solved') return;
    // It must open with the safe tap, not the one that walls the board in.
    expect(outcome.solution[0]).toBe(SAFE_MOVE);
    expect(verifySolution(board, initial, outcome.solution)).toEqual({ ok: true });
  });

  it('proves the losing tap really does lose', () => {
    const { board, initial } = build(TRAP_BOARD, 'slide-and-stop');
    const after = applyOutcome(initial, resolveTap(board, initial, TRAP_MOVE));
    expect(solve(board, after).kind).toBe('unsolvable');
  });

  it('two arrows converging head-on jam instead of passing', () => {
    // Under slide-and-stop they close the gap and then neither can ever move.
    const { board, initial } = build('> . . <', 'slide-and-stop');
    expect(solve(board, initial).kind).toBe('unsolvable');
  });

  it('detects an unwinnable knot', () => {
    const { board, initial } = build('> <', 'slide-and-stop');
    expect(solve(board, initial).kind).toBe('unsolvable');
  });

  it('reports exhausted rather than unsolvable when it runs out of budget', () => {
    const rng = seededRandom(4242);
    const { board, initial } = randomBoard(rng, {
      rows: 6,
      cols: 6,
      arrowCount: 16,
      variant: 'slide-and-stop',
    });
    const outcome = solve(board, initial, { maxNodes: 1 });
    // With a one-node budget it must never claim a definitive "unsolvable".
    expect(outcome.kind).not.toBe('unsolvable');
  });
});

describe('verifySolution', () => {
  it('accepts the solver own output', () => {
    const { board, initial } = build(`
      v . .
      > > .
      . . .
    `);
    const outcome = solve(board, initial);
    if (outcome.kind !== 'solved') throw new Error('expected solvable fixture');
    expect(verifySolution(board, initial, outcome.solution)).toEqual({ ok: true });
  });

  it('rejects a solution that taps a blocked arrow', () => {
    const { board, initial } = build(`
      v . .
      > > .
      . . .
    `);
    const result = verifySolution(board, initial, [0, 1, 2]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/step 0/);
  });

  it('rejects a solution that leaves arrows behind', () => {
    const { board, initial } = build(`
      v . .
      > > .
      . . .
    `);
    const result = verifySolution(board, initial, [2]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/2 arrow\(s\) left/);
  });
});

describe('fast engines agree with exhaustive search', () => {
  it('escape-only: matches brute force on 600 random boards', () => {
    const rng = seededRandom(20260728);
    let solvableCount = 0;

    for (let trial = 0; trial < 600; trial += 1) {
      const rows = 3 + Math.floor(rng() * 3);
      const cols = 3 + Math.floor(rng() * 3);
      const arrowCount = 2 + Math.floor(rng() * 7);
      const { board, initial } = randomBoard(rng, { rows, cols, arrowCount });

      const fast = solve(board, initial).kind === 'solved';
      const slow = solveBruteForce(board, initial);

      if (fast !== slow) {
        throw new Error(
          `escape-only disagreement (fast=${fast}, brute=${slow}) on:\n${renderAscii(board, initial)}`,
        );
      }
      if (fast) solvableCount += 1;
    }

    // Guard against the test silently passing because nothing was ever solvable.
    expect(solvableCount).toBeGreaterThan(100);
  });

  it('slide-and-stop: matches brute force on 300 random boards', () => {
    const rng = seededRandom(99991);
    let solvableCount = 0;

    for (let trial = 0; trial < 300; trial += 1) {
      const rows = 3 + Math.floor(rng() * 2);
      const cols = 3 + Math.floor(rng() * 2);
      const arrowCount = 2 + Math.floor(rng() * 5);
      const { board, initial } = randomBoard(rng, {
        rows,
        cols,
        arrowCount,
        variant: 'slide-and-stop',
      });

      const fast = solve(board, initial).kind === 'solved';
      const slow = solveBruteForce(board, initial);

      if (fast !== slow) {
        throw new Error(
          `slide-and-stop disagreement (fast=${fast}, brute=${slow}) on:\n${renderAscii(board, initial)}`,
        );
      }
      if (fast) solvableCount += 1;
    }

    expect(solvableCount).toBeGreaterThan(50);
  });

  it('every solution the solver returns actually clears the board', () => {
    const rng = seededRandom(13579);

    for (let trial = 0; trial < 400; trial += 1) {
      const variant = trial % 2 === 0 ? 'escape-only' : 'slide-and-stop';
      const { board, initial } = randomBoard(rng, {
        rows: 3 + Math.floor(rng() * 3),
        cols: 3 + Math.floor(rng() * 3),
        arrowCount: 2 + Math.floor(rng() * 6),
        variant,
      });

      const outcome = solve(board, initial);
      if (outcome.kind !== 'solved') continue;

      const check = verifySolution(board, initial, outcome.solution);
      if (!check.ok) {
        throw new Error(`bad solution on ${variant}:\n${renderAscii(board, initial)}\n${check.error}`);
      }
    }
  });
});

describe('analyze', () => {
  it('measures a forced chain as fully forced', () => {
    const { board, initial } = build(`
      v . .
      > > .
      . . .
    `);
    const metrics = analyze(board, initial);

    expect(metrics.solvable).toBe(true);
    expect(metrics.arrowCount).toBe(3);
    expect(metrics.solutionLength).toBe(3);
    // Measured over the two steps where a choice was theoretically possible.
    expect(metrics.minFrontier).toBe(1);
    expect(metrics.avgFrontier).toBe(1);
    expect(metrics.forcedSteps).toBe(2);
    expect(metrics.dependencyDepth).toBe(3);
  });

  it('measures an open board as unforced', () => {
    // Four arrows, each pointing at its own nearest edge — no interaction at all.
    const { board, initial } = build(`
      ^ . ^
      . . .
      v . v
    `);
    const metrics = analyze(board, initial);

    expect(metrics.solvable).toBe(true);
    expect(metrics.dependencyDepth).toBe(1);
    expect(metrics.forcedSteps).toBe(0);
    expect(metrics.minFrontier).toBe(2);
    expect(metrics.avgFrontier).toBe(3);
  });

  it('flags an unsolvable board', () => {
    const { board, initial } = build('> <');
    expect(analyze(board, initial).solvable).toBe(false);
  });

  it('counts trap moves under slide-and-stop', () => {
    const { board, initial } = build(TRAP_BOARD, 'slide-and-stop');
    const metrics = analyze(board, initial);

    expect(metrics.solvable).toBe(true);
    expect(metrics.arrowCount).toBe(5);
    expect(metrics.trapMoves).toBe(1);
  });

  it('reports zero trap moves for the same layout under escape-only', () => {
    // The identical board carries no risk when arrows cannot reposition — which
    // is the measurable form of "escape-only has no decisions to get wrong".
    const { board, initial } = build(TRAP_BOARD, 'escape-only');
    expect(analyze(board, initial).trapMoves).toBe(0);
  });

  it('suggests a difficulty inside the 1-5 band', () => {
    const rng = seededRandom(2468);
    for (let trial = 0; trial < 50; trial += 1) {
      const { board, initial } = randomBoard(rng, { rows: 5, cols: 5, arrowCount: 10 });
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
        arrowCount: 2 + Math.floor(rng() * 6),
      });
      if (!isSolvable(board, initial)) continue;
      expect(legalMoves(board, initial).length).toBeGreaterThan(0);
    }
  });
});
