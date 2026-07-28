/**
 * Hint safety.
 *
 * The hint system makes one promise: following a hint never costs you a heart.
 * Hints are paid for with a rewarded ad, so a hint that spends a life is worse
 * than no hint at all. These tests hold that promise to the fire.
 */

import {
  applyOutcome,
  findAllSafeMoves,
  findSafeMove,
  isSolvable,
  legalMoves,
  renderAscii,
  resolveTap,
  solve,
  startSession,
  tapArrow,
} from '@game';
import { build, randomBoard, seededRandom } from '../helpers';

const CHAIN = 'c C b B a A';

describe('findSafeMove', () => {
  it('returns the only arrow that can move in a forced chain', () => {
    const { board, initial } = build(CHAIN);
    expect(findSafeMove(board, initial)).toEqual({ kind: 'move', arrowIndex: 0, arrowId: 'a' });
  });

  it('reports already-won on a cleared board', () => {
    const { board, initial } = build('A a .');
    const cleared = applyOutcome(initial, resolveTap(board, initial, 0));
    expect(findSafeMove(board, cleared)).toEqual({ kind: 'already-won' });
  });

  it('offers no move — and explains why — on an unsolvable board', () => {
    const { board, initial } = build('a A B b');
    const hint = findSafeMove(board, initial);
    expect(hint.kind).toBe('no-safe-move');
    if (hint.kind !== 'no-safe-move') return;
    expect(hint.reason).toMatch(/Restart/);
  });
});

describe('a hint never costs a heart', () => {
  it('holds on 300 random boards', () => {
    const rng = seededRandom(111);
    let checked = 0;

    for (let trial = 0; trial < 300; trial += 1) {
      const { board, initial } = randomBoard(rng, {
        rows: 3 + Math.floor(rng() * 3),
        cols: 3 + Math.floor(rng() * 3),
        arrowCount: 2 + Math.floor(rng() * 5),
        maxBodyLength: 4,
      });
      if (board.arrows.length === 0) continue;
      if (!isSolvable(board, initial)) continue;

      const hint = findSafeMove(board, initial);
      expect(hint.kind).toBe('move');
      if (hint.kind !== 'move') continue;

      const outcome = resolveTap(board, initial, hint.arrowIndex);
      if (outcome.kind !== 'escaped') {
        throw new Error(
          `hint "${hint.arrowId}" was blocked on:\n${renderAscii(board, initial)}`,
        );
      }
      checked += 1;
    }

    expect(checked).toBeGreaterThan(60);
  });

  it('clears a whole level on full hearts when followed all the way', () => {
    const rng = seededRandom(8080);
    let levelsFinished = 0;

    for (let trial = 0; trial < 200; trial += 1) {
      const { board, initial } = randomBoard(rng, {
        rows: 4,
        cols: 4,
        arrowCount: 4,
        maxBodyLength: 3,
      });
      if (board.arrows.length === 0) continue;
      if (!isSolvable(board, initial)) continue;

      let session = startSession(initial);
      let guard = 0;
      while (session.status === 'playing' && guard < 100) {
        const hint = findSafeMove(board, session.state);
        expect(hint.kind).toBe('move');
        if (hint.kind !== 'move') break;
        session = tapArrow(board, session, hint.arrowIndex).session;
        guard += 1;
      }

      expect(session.status).toBe('won');
      // The whole point: not a single heart lost following hints.
      expect(session.mistakes).toBe(0);
      levelsFinished += 1;
    }

    expect(levelsFinished).toBeGreaterThan(30);
  });
});

describe('findAllSafeMoves', () => {
  it('is exactly the set of free arrows on a winnable board', () => {
    const rng = seededRandom(303);
    let checked = 0;

    for (let trial = 0; trial < 300; trial += 1) {
      const { board, initial } = randomBoard(rng, {
        rows: 4,
        cols: 4,
        arrowCount: 2 + Math.floor(rng() * 4),
        maxBodyLength: 4,
      });
      if (board.arrows.length === 0) continue;
      if (!isSolvable(board, initial)) continue;

      // No free arrow can ever be the wrong choice, so "safe" and "legal" match.
      expect(findAllSafeMoves(board, initial)).toEqual(legalMoves(board, initial));
      checked += 1;
    }

    expect(checked).toBeGreaterThan(60);
  });

  it('calls nothing safe on a board that is already past saving', () => {
    // 'a' and 'b' are knotted head-to-head, so this board can never be cleared —
    // but 'c' is still happily tappable. Calling that "safe" would be a lie.
    const { board, initial } = build(`
      a A B b
      . C c .
    `);
    expect(isSolvable(board, initial)).toBe(false);
    expect(legalMoves(board, initial).length).toBeGreaterThan(0);
    expect(findAllSafeMoves(board, initial)).toEqual([]);
  });

  it('returns nothing on a cleared board', () => {
    const { board, initial } = build('A a .');
    const cleared = applyOutcome(initial, resolveTap(board, initial, 0));
    expect(findAllSafeMoves(board, cleared)).toEqual([]);
  });

  it('agrees with solve about whether anything is safe', () => {
    const rng = seededRandom(606);
    for (let trial = 0; trial < 250; trial += 1) {
      const { board, initial } = randomBoard(rng, {
        rows: 4,
        cols: 4,
        arrowCount: 4,
        maxBodyLength: 3,
      });
      if (board.arrows.length === 0) continue;
      const anySafe = findAllSafeMoves(board, initial).length > 0;
      expect(anySafe).toBe(solve(board, initial).kind === 'solved');
    }
  });
});
