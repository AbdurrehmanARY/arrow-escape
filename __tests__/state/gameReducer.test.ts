/**
 * The live board state machine.
 *
 * This layer decides what the *player* experiences: when a heart is spent, when
 * the board is allowed to change, and what the screen is told to animate. The
 * rules underneath it are already proven in `__tests__/game`, so these tests are
 * about sequencing and guards rather than about the rules themselves.
 */

import { buildLevel, DEFAULT_HEARTS, parseAscii, type Board, type BoardState } from '@game';
import { gameReducer, initGameState, type GameState } from '@state/gameReducer';

/** Three snakes queued in a row: only the front one ('a', index 0) can move. */
const CHAIN = 'c C b B a A';

function setup(art = CHAIN, hearts = DEFAULT_HEARTS): {
  board: Board;
  initial: BoardState;
  state: GameState;
} {
  const built = buildLevel(parseAscii(art, { hearts }));
  if (!built.ok) throw new Error(built.error);
  return {
    board: built.value.board,
    initial: built.value.initial,
    state: initGameState(built.value.initial, hearts),
  };
}

describe('initGameState', () => {
  it('starts a level with full hearts and nothing in flight', () => {
    const { state } = setup();
    expect(state.session.heartsLeft).toBe(DEFAULT_HEARTS);
    expect(state.session.status).toBe('playing');
    expect(state.departing).toBeUndefined();
    expect(state.highlight).toBeUndefined();
    expect(state.taps).toBe(0);
  });
});

describe('tapping a free arrow', () => {
  it('removes it, marks it departing, and counts the tap', () => {
    const { board, state } = setup();
    const next = gameReducer(state, { type: 'tap', board, arrowIndex: 0 });

    expect(next.session.state.remaining).toBe(2);
    expect(next.departing).toBe(0);
    expect(next.taps).toBe(1);
    expect(next.highlight).toBeUndefined();
    expect(next.session.heartsLeft).toBe(DEFAULT_HEARTS);
  });

  it('reports the win once the last arrow goes', () => {
    const { board, state } = setup();
    let current = state;
    for (const index of [0, 1, 2]) {
      current = gameReducer(current, { type: 'tap', board, arrowIndex: index });
      current = gameReducer(current, { type: 'departed' });
    }
    expect(current.session.status).toBe('won');
    expect(current.message).toMatch(/clear/i);
  });
});

describe('tapping a blocked arrow', () => {
  it('spends a heart, leaves the board alone, and names the blocker', () => {
    const { board, state } = setup();
    const next = gameReducer(state, { type: 'tap', board, arrowIndex: 2 });

    expect(next.session.heartsLeft).toBe(DEFAULT_HEARTS - 1);
    expect(next.session.state.remaining).toBe(3);
    expect(next.session.state).toBe(state.session.state);
    expect(next.highlight?.blocked).toBe(2);
    expect(next.highlight?.blocker).toBe(1);
    expect(next.message).toContain('"b"');
  });

  it('bumps the nonce on every failed tap so an identical shake can replay', () => {
    // Without a changing nonce, tapping the same blocked arrow twice would not
    // re-trigger the animation and the second tap would look ignored.
    const { board, state } = setup();
    const once = gameReducer(state, { type: 'tap', board, arrowIndex: 2 });
    const twice = gameReducer(once, { type: 'tap', board, arrowIndex: 2 });

    expect(twice.highlight?.nonce).toBeGreaterThan(once.highlight!.nonce);
    expect(twice.session.heartsLeft).toBe(DEFAULT_HEARTS - 2);
  });

  it('fails the level when the last heart goes', () => {
    const { board, state } = setup(CHAIN, 2);
    let current = gameReducer(state, { type: 'tap', board, arrowIndex: 2 });
    expect(current.session.status).toBe('playing');

    current = gameReducer(current, { type: 'tap', board, arrowIndex: 2 });
    expect(current.session.status).toBe('failed');
    expect(current.message).toMatch(/out of hearts/i);
    // The board it leaves behind is untouched — that is the promise the fail
    // screen makes to the player.
    expect(current.session.state.remaining).toBe(3);
  });
});

describe('guards', () => {
  it('ignores a tap while another arrow is still flying', () => {
    // A fast double-tap would otherwise start a second release before the first
    // finished, and the board would appear to skip an animation.
    const { board, state } = setup();
    const flying = gameReducer(state, { type: 'tap', board, arrowIndex: 0 });
    const ignored = gameReducer(flying, { type: 'tap', board, arrowIndex: 1 });

    expect(ignored).toBe(flying);
  });

  it('accepts the next tap once the animation reports back', () => {
    const { board, state } = setup();
    let current = gameReducer(state, { type: 'tap', board, arrowIndex: 0 });
    current = gameReducer(current, { type: 'departed' });
    expect(current.departing).toBeUndefined();

    current = gameReducer(current, { type: 'tap', board, arrowIndex: 1 });
    expect(current.session.state.remaining).toBe(1);
  });

  it('ignores a tap on an arrow that already left', () => {
    const { board, state } = setup();
    let current = gameReducer(state, { type: 'tap', board, arrowIndex: 0 });
    current = gameReducer(current, { type: 'departed' });

    const again = gameReducer(current, { type: 'tap', board, arrowIndex: 0 });
    expect(again).toBe(current);
    expect(again.taps).toBe(1);
  });

  it('ignores taps once the level is over', () => {
    const { board, state } = setup(CHAIN, 1);
    const failed = gameReducer(state, { type: 'tap', board, arrowIndex: 2 });
    expect(failed.session.status).toBe('failed');

    expect(gameReducer(failed, { type: 'tap', board, arrowIndex: 0 })).toBe(failed);
  });

  it('returns the same object when a no-op action arrives', () => {
    // Identity equality is what stops React re-rendering the board for nothing.
    const { state } = setup();
    expect(gameReducer(state, { type: 'departed' })).toBe(state);
    expect(gameReducer(state, { type: 'clearHighlight' })).toBe(state);
  });
});

describe('clearing the highlight', () => {
  it('drops the flash but keeps the spent heart', () => {
    const { board, state } = setup();
    const blocked = gameReducer(state, { type: 'tap', board, arrowIndex: 2 });
    const cleared = gameReducer(blocked, { type: 'clearHighlight' });

    expect(cleared.highlight).toBeUndefined();
    expect(cleared.session.heartsLeft).toBe(DEFAULT_HEARTS - 1);
  });
});

describe('restart', () => {
  it('restores the board, the hearts, and the mistake count', () => {
    const { board, initial, state } = setup();
    let current = gameReducer(state, { type: 'tap', board, arrowIndex: 2 });
    current = gameReducer(current, { type: 'tap', board, arrowIndex: 0 });

    const fresh = gameReducer(current, {
      type: 'restart',
      initial,
      hearts: DEFAULT_HEARTS,
    });

    expect(fresh.session.heartsLeft).toBe(DEFAULT_HEARTS);
    expect(fresh.session.mistakes).toBe(0);
    expect(fresh.session.state.remaining).toBe(3);
    expect(fresh.taps).toBe(0);
    expect(fresh.departing).toBeUndefined();
    expect(fresh.highlight).toBeUndefined();
  });

  it('works even from a failed level', () => {
    const { board, initial, state } = setup(CHAIN, 1);
    const failed = gameReducer(state, { type: 'tap', board, arrowIndex: 2 });
    const fresh = gameReducer(failed, { type: 'restart', initial, hearts: 1 });

    expect(fresh.session.status).toBe('playing');
    expect(fresh.session.heartsLeft).toBe(1);
  });
});
