/**
 * Heart accounting.
 *
 * Regression cover for a bug that reached the device: hearts were being deducted
 * twice for a single gesture. The cause was never in the rules — it was the board's
 * per-cell touch targets sitting inside a `GestureDetector` that also carried a
 * double-tap-to-zoom gesture, so one double-tap delivered two `onPress` events and
 * cost two hearts. The gesture is gone, and the play screen now rejects a second
 * delivery inside 120ms.
 *
 * These tests pin the accounting rules the UI must never violate, stated as
 * properties rather than examples: whatever sequence of taps arrives, the numbers
 * have to stay consistent.
 */

import {
  applyOutcome,
  blockedArrows,
  buildLevel,
  legalMoves,
  parseAscii,
  resolveTap,
  startSession,
  tapArrow,
  type Board,
  type BoardState,
  type PlaySession,
} from '@game';
import { gameReducer, initGameState } from '@state/gameReducer';

/** Three snakes queued in a row: only 'a' (index 0) can move. */
const CHAIN = 'c C b B a A';

function setup(hearts = 5): { board: Board; initial: BoardState; session: PlaySession } {
  const built = buildLevel(parseAscii(CHAIN, { hearts }));
  if (!built.ok) throw new Error(built.error);
  return {
    board: built.value.board,
    initial: built.value.initial,
    session: startSession(built.value.initial, hearts),
  };
}

describe('one collision costs exactly one heart', () => {
  it('deducts a single heart per blocked tap', () => {
    const { board, session } = setup();
    const after = tapArrow(board, session, 2).session;
    expect(after.heartsLeft).toBe(4);
    expect(after.mistakes).toBe(1);
  });

  it('deducts nothing when the arrow actually leaves', () => {
    const { board, session } = setup();
    const after = tapArrow(board, session, 0).session;
    expect(after.heartsLeft).toBe(5);
    expect(after.mistakes).toBe(0);
  });

  it('charges each of two deliberate wrong taps once, and only once', () => {
    // Two separate mistakes should cost two hearts. The bug was one *gesture*
    // costing two, which is a different thing and is guarded at the UI layer.
    const { board, session } = setup();
    let current = session;
    current = tapArrow(board, current, 2).session;
    current = tapArrow(board, current, 2).session;
    expect(current.heartsLeft).toBe(3);
    expect(current.mistakes).toBe(2);
  });
});

describe('hearts and mistakes stay consistent', () => {
  it('spent hearts always equal mistakes made', () => {
    const { board, session } = setup();
    let current = session;

    // A deliberately messy sequence: blocked, blocked, good, blocked, good.
    for (const index of [2, 1, 0, 2, 1]) {
      current = tapArrow(board, current, index).session;
      expect(current.maxHearts - current.heartsLeft).toBe(current.mistakes);
    }
  });

  it('never goes negative, however many wrong taps arrive', () => {
    const { board, session } = setup(2);
    let current = session;

    for (let i = 0; i < 20; i += 1) {
      current = tapArrow(board, current, 2).session;
      expect(current.heartsLeft).toBeGreaterThanOrEqual(0);
    }
    expect(current.heartsLeft).toBe(0);
    expect(current.status).toBe('failed');
  });

  it('stops charging once the level is over', () => {
    // Taps that arrive after the last heart — a queued gesture, a stray double
    // delivery — must not keep counting mistakes against a finished level.
    const { board, session } = setup(1);
    let current = tapArrow(board, session, 2).session;
    expect(current.status).toBe('failed');

    const mistakesAtFailure = current.mistakes;
    for (let i = 0; i < 5; i += 1) {
      current = tapArrow(board, current, 2).session;
    }
    expect(current.mistakes).toBe(mistakesAtFailure);
    expect(current.heartsLeft).toBe(0);
  });
});

describe('the outcome the UI reacts to matches the outcome that is applied', () => {
  it('resolveTap agrees with what the session does', () => {
    // The feedback bug: the screen decided which sound to play from the *safe
    // move* set instead of from the tap's actual outcome, so a correct tap could
    // play the collision sound and read as a phantom heart loss.
    const { board, session } = setup();
    let state = session.state;
    let hearts = session.heartsLeft;
    let current = session;

    for (const index of [2, 0, 1, 2]) {
      const predicted = resolveTap(board, state, index);
      const result = tapArrow(board, current, index);

      expect(result.outcome.kind).toBe(predicted.kind);

      if (predicted.kind === 'blocked') {
        expect(result.session.heartsLeft).toBe(hearts - 1);
      } else if (predicted.kind === 'escaped') {
        expect(result.session.heartsLeft).toBe(hearts);
      }

      current = result.session;
      state = current.state;
      hearts = current.heartsLeft;
    }
  });

  it('every blocked arrow costs a heart and every free one does not', () => {
    const { board, session } = setup();

    for (const index of blockedArrows(board, session.state)) {
      expect(tapArrow(board, session, index).session.heartsLeft).toBe(4);
    }
    for (const index of legalMoves(board, session.state)) {
      expect(tapArrow(board, session, index).session.heartsLeft).toBe(5);
    }
  });
});

describe('the reducer keeps the same guarantees', () => {
  it('a blocked tap leaves the board byte-identical', () => {
    const { board, initial } = setup();
    const state = initGameState(initial, 5);
    const next = gameReducer(state, { type: 'tap', board, arrowIndex: 2 });

    expect(next.session.state).toBe(state.session.state);
    expect(Array.from(next.session.state.alive)).toEqual(Array.from(initial.alive));
    expect(next.session.heartsLeft).toBe(4);
  });

  it('charges exactly one heart for a wrong tap made while an arrow is still leaving', () => {
    // The reducer used to refuse taps during the exit animation, and the reason
    // given was that the second tap would "resolve against a board that is
    // mid-change". That was never true: `applyOutcome` runs the moment the tap is
    // accepted, so the board is already correct and only the *drawing* is behind.
    // The guard was costing real taps, so it is gone.
    //
    // What has to survive is the accounting, which is what this pins.
    const { board, initial } = setup();
    let state = initGameState(initial, 5);
    state = gameReducer(state, { type: 'tap', board, arrowIndex: 0 });
    expect(state.departing).toEqual([0]);

    const during = gameReducer(state, { type: 'tap', board, arrowIndex: 2 });
    expect(during.session.heartsLeft).toBe(4);
    expect(during.session.mistakes).toBe(1);
    expect(during.session.maxHearts - during.session.heartsLeft).toBe(during.session.mistakes);
  });

  it('applyOutcome on a blocked result is a no-op', () => {
    const { board, initial } = setup();
    const outcome = resolveTap(board, initial, 2);
    expect(outcome.kind).toBe('blocked');
    expect(applyOutcome(initial, outcome)).toBe(initial);
  });
});
