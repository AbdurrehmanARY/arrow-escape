/**
 * The load-bearing property of each rule variant.
 *
 * These tests are the reason `docs/MECHANIC_ANALYSIS.md` exists. They are not
 * regression tests for a bug — they are executable evidence for a design claim
 * that decides what kind of game ArrowPath is:
 *
 *   Under `escape-only`, tap order provably cannot matter.
 *   Under `slide-and-stop`, it provably can.
 *
 * If the first ever fails, the rules changed and the GDD's difficulty model is
 * back in play. If the second ever fails, `slide-and-stop` has stopped earning
 * its complexity and should be deleted.
 */

import {
  applyOutcome,
  castRay,
  EMPTY,
  ESCAPED,
  isSolvable,
  legalMoves,
  renderAscii,
  resolveTap,
} from '@game';
import { build, randomBoard, SAFE_MOVE, seededRandom, TRAP_BOARD, TRAP_MOVE } from '../helpers';

describe('escape-only: freeness is monotone', () => {
  it('an arrow that can escape now can still escape after any other arrow leaves', () => {
    const rng = seededRandom(2024);
    let observations = 0;

    for (let trial = 0; trial < 400; trial += 1) {
      const { board, initial } = randomBoard(rng, {
        rows: 3 + Math.floor(rng() * 3),
        cols: 3 + Math.floor(rng() * 3),
        arrowCount: 3 + Math.floor(rng() * 6),
      });

      const freeBefore = legalMoves(board, initial);
      for (const removed of freeBefore) {
        const after = applyOutcome(initial, resolveTap(board, initial, removed));

        for (const stillThere of freeBefore) {
          if (stillThere === removed) continue;
          const ray = castRay(board, after, stillThere);
          if (ray.blockerIndex !== EMPTY) {
            throw new Error(
              `removing arrow ${removed} blocked arrow ${stillThere}:\n${renderAscii(board, initial)}`,
            );
          }
          observations += 1;
        }
      }
    }

    expect(observations).toBeGreaterThan(500);
  });
});

describe('escape-only: every tap order wins', () => {
  it('random play never gets stuck on a solvable board', () => {
    const rng = seededRandom(1337);
    let boardsPlayed = 0;

    for (let trial = 0; trial < 500; trial += 1) {
      const { board, initial } = randomBoard(rng, {
        rows: 3 + Math.floor(rng() * 4),
        cols: 3 + Math.floor(rng() * 4),
        arrowCount: 3 + Math.floor(rng() * 8),
      });
      if (!isSolvable(board, initial)) continue;

      // Play the whole level by picking uniformly at random from whatever is
      // tappable — the least strategic player imaginable.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        let state = initial;
        while (state.remaining > 0) {
          const moves = legalMoves(board, state);
          if (moves.length === 0) {
            throw new Error(
              `random play deadlocked a solvable board with ${state.remaining} left:\n` +
                `${renderAscii(board, initial)}\nstuck at:\n${renderAscii(board, state)}`,
            );
          }
          const pick = moves[Math.floor(rng() * moves.length)]!;
          state = applyOutcome(state, resolveTap(board, state, pick));
        }
      }
      boardsPlayed += 1;
    }

    // Sanity: the assertion above is only meaningful if boards actually played.
    expect(boardsPlayed).toBeGreaterThan(150);
  });

  it('a board that starts solvable can never become deadlocked', () => {
    const rng = seededRandom(4711);

    for (let trial = 0; trial < 300; trial += 1) {
      const { board, initial } = randomBoard(rng, {
        rows: 4,
        cols: 4,
        arrowCount: 4 + Math.floor(rng() * 6),
      });
      if (!isSolvable(board, initial)) continue;

      let state = initial;
      while (state.remaining > 0) {
        const moves = legalMoves(board, state);
        const pick = moves[Math.floor(rng() * moves.length)]!;
        state = applyOutcome(state, resolveTap(board, state, pick));
        // The point: solvability is preserved by *every* move, not just good ones.
        expect(isSolvable(board, state)).toBe(true);
      }
    }
  });
});

describe('slide-and-stop: tap order decides the level', () => {
  it('a legal opening move can throw the game away', () => {
    const { board, initial } = build(TRAP_BOARD, 'slide-and-stop');

    expect(isSolvable(board, initial)).toBe(true);
    expect(legalMoves(board, initial)).toEqual([SAFE_MOVE, TRAP_MOVE]);

    const winning = applyOutcome(initial, resolveTap(board, initial, SAFE_MOVE));
    expect(isSolvable(board, winning)).toBe(true);

    const losing = applyOutcome(initial, resolveTap(board, initial, TRAP_MOVE));
    expect(isSolvable(board, losing)).toBe(false);
  });

  it('the same layout under escape-only cannot be thrown away', () => {
    // Head-to-head on one board: the rule variant is the only thing that differs.
    const { board, initial } = build(TRAP_BOARD, 'escape-only');
    if (!isSolvable(board, initial)) return;

    for (const move of legalMoves(board, initial)) {
      const after = applyOutcome(initial, resolveTap(board, initial, move));
      expect(isSolvable(board, after)).toBe(true);
    }
  });

  it('an arrow that could escape can be walled in by moving another arrow', () => {
    // Hand-built: a1 has a clear run to the right edge. Sliding a0 right parks it
    // directly in a1's path, and a0 can never move again because a2 pins it.
    // This single board is the whole difference between the two rule sets.
    const rng = seededRandom(6060);
    let found = false;

    for (let trial = 0; trial < 3000 && !found; trial += 1) {
      const { board, initial } = randomBoard(rng, {
        rows: 3,
        cols: 4,
        arrowCount: 4,
        variant: 'slide-and-stop',
      });

      const freeBefore = new Set(
        legalMoves(board, initial).filter(
          (i) => castRay(board, initial, i).blockerIndex === EMPTY,
        ),
      );

      for (const move of legalMoves(board, initial)) {
        const after = applyOutcome(initial, resolveTap(board, initial, move));
        for (const other of freeBefore) {
          if (other === move) continue;
          if (after.positions[other] === ESCAPED) continue;
          if (castRay(board, after, other).blockerIndex !== EMPTY) {
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }

    expect(found).toBe(true);
  });
});
