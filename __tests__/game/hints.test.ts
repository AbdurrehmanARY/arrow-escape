/**
 * Hint safety.
 *
 * The hint system makes one promise to the player: following a hint never costs
 * you the level. Since hints are paid for with a rewarded ad, a hint that ruins a
 * board is worse than no hint at all. These tests hold that promise to the fire.
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
} from '@game';
import { build, randomBoard, SAFE_MOVE, seededRandom, TRAP_BOARD, TRAP_MOVE } from '../helpers';

describe('findSafeMove', () => {
  it('returns the next arrow in a forced chain', () => {
    const { board, initial } = build(`
      v . .
      > > .
      . . .
    `);
    const hint = findSafeMove(board, initial);
    expect(hint).toEqual({ kind: 'move', arrowIndex: 2, arrowId: 'a2' });
  });

  it('reports already-won on a cleared board', () => {
    const { board, initial } = build('> . .');
    const cleared = applyOutcome(initial, resolveTap(board, initial, 0));
    expect(findSafeMove(board, cleared)).toEqual({ kind: 'already-won' });
  });

  it('offers no move — and explains why — on an unsolvable board', () => {
    const { board, initial } = build('> <');
    const hint = findSafeMove(board, initial);
    expect(hint.kind).toBe('no-safe-move');
    if (hint.kind !== 'no-safe-move') return;
    expect(hint.reason).toMatch(/Restart/);
  });

  it('does not claim "no safe move" just because it ran out of search budget', () => {
    const rng = seededRandom(777);
    const { board, initial } = randomBoard(rng, {
      rows: 5,
      cols: 5,
      arrowCount: 12,
      variant: 'slide-and-stop',
    });
    const hint = findSafeMove(board, initial, { maxNodes: 1 });
    if (hint.kind === 'no-safe-move') {
      // The budget-limited wording must be the "too tangled" one, never the
      // definitive "nothing can finish this board".
      expect(hint.reason).toMatch(/too tangled/);
    }
  });
});

describe('a hint never loses the level', () => {
  it.each(['escape-only', 'slide-and-stop'] as const)(
    'holds on 250 random %s boards',
    (variant) => {
      const rng = seededRandom(variant === 'escape-only' ? 111 : 222);
      let checked = 0;

      for (let trial = 0; trial < 250; trial += 1) {
        const { board, initial } = randomBoard(rng, {
          rows: 3 + Math.floor(rng() * 2),
          cols: 3 + Math.floor(rng() * 2),
          arrowCount: 3 + Math.floor(rng() * 4),
          variant,
        });

        if (!isSolvable(board, initial)) continue;

        const hint = findSafeMove(board, initial);
        expect(hint.kind).toBe('move');
        if (hint.kind !== 'move') continue;

        const after = applyOutcome(initial, resolveTap(board, initial, hint.arrowIndex));
        if (!isSolvable(board, after)) {
          throw new Error(
            `hint "${hint.arrowId}" made this ${variant} board unsolvable:\n` +
              renderAscii(board, initial),
          );
        }
        checked += 1;
      }

      expect(checked).toBeGreaterThan(40);
    },
  );

  it('stays safe when followed all the way to a win', () => {
    const rng = seededRandom(8080);
    let levelsFinished = 0;

    for (let trial = 0; trial < 120; trial += 1) {
      const { board, initial } = randomBoard(rng, {
        rows: 4,
        cols: 4,
        arrowCount: 5,
        variant: trial % 2 === 0 ? 'escape-only' : 'slide-and-stop',
      });
      if (!isSolvable(board, initial)) continue;

      let state = initial;
      let guard = 0;
      while (state.remaining > 0 && guard < 200) {
        const hint = findSafeMove(board, state);
        expect(hint.kind).toBe('move');
        if (hint.kind !== 'move') break;
        state = applyOutcome(state, resolveTap(board, state, hint.arrowIndex));
        guard += 1;
      }

      expect(state.remaining).toBe(0);
      levelsFinished += 1;
    }

    expect(levelsFinished).toBeGreaterThan(20);
  });
});

describe('findAllSafeMoves', () => {
  it('under escape-only, every legal move is safe', () => {
    // This is the practical consequence of the monotonicity result: there is
    // nothing to warn the player away from, so assist mode can light up
    // everything that is tappable.
    const rng = seededRandom(303);

    for (let trial = 0; trial < 200; trial += 1) {
      const { board, initial } = randomBoard(rng, {
        rows: 4,
        cols: 4,
        arrowCount: 3 + Math.floor(rng() * 5),
      });
      if (!isSolvable(board, initial)) continue;
      expect(findAllSafeMoves(board, initial)).toEqual(legalMoves(board, initial));
    }
  });

  it('under slide-and-stop, it is a strict subset when the board holds a trap', () => {
    // If this ever fails, slide-and-stop has stopped adding decisions and the
    // variant no longer justifies its extra complexity.
    const { board, initial } = build(TRAP_BOARD, 'slide-and-stop');

    expect(legalMoves(board, initial)).toEqual([SAFE_MOVE, TRAP_MOVE]);
    expect(findAllSafeMoves(board, initial)).toEqual([SAFE_MOVE]);
  });

  it('never widens beyond the legal moves on random boards', () => {
    const rng = seededRandom(404);
    for (let trial = 0; trial < 200; trial += 1) {
      const { board, initial } = randomBoard(rng, {
        rows: 4,
        cols: 4,
        arrowCount: 6,
        variant: 'slide-and-stop',
      });
      const safe = findAllSafeMoves(board, initial);
      const legal = legalMoves(board, initial);
      expect(safe.length).toBeLessThanOrEqual(legal.length);
      expect(legal).toEqual(expect.arrayContaining(safe));
    }
  });

  it('returns nothing on a cleared board', () => {
    const { board, initial } = build('> . .');
    const cleared = applyOutcome(initial, resolveTap(board, initial, 0));
    expect(findAllSafeMoves(board, cleared)).toEqual([]);
  });

  it('agrees with solve about whether anything is safe', () => {
    const rng = seededRandom(606);
    for (let trial = 0; trial < 200; trial += 1) {
      const { board, initial } = randomBoard(rng, {
        rows: 4,
        cols: 4,
        arrowCount: 4,
        variant: trial % 2 === 0 ? 'escape-only' : 'slide-and-stop',
      });
      const anySafe = findAllSafeMoves(board, initial).length > 0;
      expect(anySafe).toBe(solve(board, initial).kind === 'solved');
    }
  });
});
