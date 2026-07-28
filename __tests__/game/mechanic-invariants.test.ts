/**
 * The load-bearing properties of the rule set.
 *
 * These are not regression tests for a bug — they are executable evidence for the
 * design claims the whole game rests on:
 *
 *   1. Tap *order* can never lose a level. Removing a snake only ever frees
 *      cells, so an arrow that is free stays free until it is tapped.
 *   2. Therefore the failure mode is *wrong taps*, not wrong plans, and the heart
 *      counter is what makes the game a game.
 *
 * If (1) ever fails, the rules changed and the difficulty model in `analyze()`
 * needs rethinking from scratch. See `docs/MECHANIC_ANALYSIS.md`.
 */

import {
  applyOutcome,
  castRay,
  EMPTY,
  isSolvable,
  legalMoves,
  renderAscii,
  resolveTap,
  startSession,
  tapArrow,
} from '@game';
import { build, randomBoard, seededRandom } from '../helpers';

describe('freeness is monotone', () => {
  it('an arrow that can leave now can still leave after any other arrow goes', () => {
    const rng = seededRandom(2024);
    let observations = 0;

    for (let trial = 0; trial < 400; trial += 1) {
      const { board, initial } = randomBoard(rng, {
        rows: 3 + Math.floor(rng() * 3),
        cols: 3 + Math.floor(rng() * 3),
        arrowCount: 3 + Math.floor(rng() * 4),
        maxBodyLength: 4,
      });
      if (board.arrows.length === 0) continue;

      const freeBefore = legalMoves(board, initial);
      for (const removed of freeBefore) {
        const after = applyOutcome(initial, resolveTap(board, initial, removed));

        for (const stillThere of freeBefore) {
          if (stillThere === removed) continue;
          if (castRay(board, after, stillThere).blockerIndex !== EMPTY) {
            throw new Error(
              `removing arrow ${removed} blocked arrow ${stillThere}:\n` +
                renderAscii(board, initial),
            );
          }
          observations += 1;
        }
      }
    }

    expect(observations).toBeGreaterThan(300);
  });
});

describe('tap order cannot lose a level', () => {
  it('random play always clears a solvable board', () => {
    const rng = seededRandom(1337);
    let boardsPlayed = 0;

    for (let trial = 0; trial < 400; trial += 1) {
      const { board, initial } = randomBoard(rng, {
        rows: 3 + Math.floor(rng() * 4),
        cols: 3 + Math.floor(rng() * 4),
        arrowCount: 3 + Math.floor(rng() * 6),
        maxBodyLength: 4,
      });
      if (board.arrows.length === 0) continue;
      if (!isSolvable(board, initial)) continue;

      // Play the whole level by picking uniformly at random from whatever is
      // free — the least strategic player imaginable.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        let state = initial;
        while (state.remaining > 0) {
          const moves = legalMoves(board, state);
          if (moves.length === 0) {
            throw new Error(
              `random play stalled with ${state.remaining} left:\n` +
                `${renderAscii(board, initial)}\nstuck at:\n${renderAscii(board, state)}`,
            );
          }
          const pick = moves[Math.floor(rng() * moves.length)]!;
          state = applyOutcome(state, resolveTap(board, state, pick));
        }
      }
      boardsPlayed += 1;
    }

    expect(boardsPlayed).toBeGreaterThan(100);
  });

  it('solvability survives every single move, not just good ones', () => {
    const rng = seededRandom(4711);

    for (let trial = 0; trial < 250; trial += 1) {
      const { board, initial } = randomBoard(rng, {
        rows: 4,
        cols: 4,
        arrowCount: 3 + Math.floor(rng() * 4),
        maxBodyLength: 4,
      });
      if (board.arrows.length === 0) continue;
      if (!isSolvable(board, initial)) continue;

      let state = initial;
      while (state.remaining > 0) {
        const moves = legalMoves(board, state);
        const pick = moves[Math.floor(rng() * moves.length)]!;
        state = applyOutcome(state, resolveTap(board, state, pick));
        expect(isSolvable(board, state)).toBe(true);
      }
    }
  });

  it('a blocked tap never changes the board, so it cannot ruin the level', () => {
    const rng = seededRandom(9090);
    let blockedTapsSeen = 0;

    for (let trial = 0; trial < 300; trial += 1) {
      const { board, initial } = randomBoard(rng, {
        rows: 4,
        cols: 4,
        arrowCount: 4,
        maxBodyLength: 4,
      });
      if (board.arrows.length === 0) continue;

      for (let i = 0; i < board.arrows.length; i += 1) {
        const outcome = resolveTap(board, initial, i);
        if (outcome.kind !== 'blocked') continue;
        expect(applyOutcome(initial, outcome)).toBe(initial);
        blockedTapsSeen += 1;
      }
    }

    expect(blockedTapsSeen).toBeGreaterThan(50);
  });
});

describe('hearts are the only way to lose', () => {
  it('a player who taps blindly can fail a board that is perfectly solvable', () => {
    // The whole design in one test: this board can always be cleared, but a
    // player who cannot read it will run out of hearts trying.
    const { board, initial } = build('c C b B a A');
    expect(isSolvable(board, initial)).toBe(true);

    let session = startSession(initial, 2);
    // Two taps on the arrow at the back of the queue, which is blocked twice over.
    session = tapArrow(board, session, 2).session;
    session = tapArrow(board, session, 2).session;

    expect(session.status).toBe('failed');
    // The board itself was never damaged — only the player's hearts.
    expect(session.state.remaining).toBe(3);
    expect(isSolvable(board, session.state)).toBe(true);
  });

  it('the same board is cleared without losing a heart when read correctly', () => {
    const { board, initial } = build('c C b B a A');
    let session = startSession(initial, 2);

    for (const index of [0, 1, 2]) {
      session = tapArrow(board, session, index).session;
    }

    expect(session.status).toBe('won');
    expect(session.mistakes).toBe(0);
  });
});
