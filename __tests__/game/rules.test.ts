/** The rule set: what a tap does, how hearts are spent, and when a level ends. */

import {
  applyOutcome,
  blockedArrows,
  DEFAULT_HEARTS,
  EMPTY,
  hasLegalMove,
  isBoardStuck,
  isCleared,
  legalMoves,
  resolveTap,
  startSession,
  tapArrow,
} from '@game';
import { build } from '../helpers';

describe('tapping a free arrow', () => {
  it('threads the whole snake off the board in one move', () => {
    const { board, initial } = build(`
      A a a
      . . a
    `);
    const outcome = resolveTap(board, initial, 0);

    expect(outcome.kind).toBe('escaped');
    if (outcome.kind !== 'escaped') return;
    expect(outcome.headCell).toBe(0);
    expect(outcome.bodyLength).toBe(4);
    // Head at (0,0) pointing left: one step clears the board.
    expect(outcome.exitDistance).toBe(1);

    const next = applyOutcome(initial, outcome);
    expect(next.remaining).toBe(0);
    expect(isCleared(next)).toBe(true);
    // Every cell the body held is released, not just the head's.
    expect(Array.from(next.occupancy).every((cell) => cell === EMPTY)).toBe(true);
  });

  it('frees only that arrow cells, leaving others in place', () => {
    const { board, initial } = build(`
      A a . B
      . . . b
    `);
    const next = applyOutcome(initial, resolveTap(board, initial, 0));

    expect(next.remaining).toBe(1);
    expect(next.alive[0]).toBe(0);
    expect(next.alive[1]).toBe(1);
    expect(next.occupancy[0]).toBe(EMPTY);
    expect(next.occupancy[3]).toBe(1);
  });
});

describe('tapping a blocked arrow', () => {
  it('changes nothing and names the blocker', () => {
    const { board, initial } = build('a A . b B');
    const outcome = resolveTap(board, initial, 0);

    expect(outcome.kind).toBe('blocked');
    if (outcome.kind !== 'blocked') return;
    expect(outcome.blockerIndex).toBe(1);
    expect(outcome.blockedAt).toBe(3);

    // Identity equality is the contract: nothing changed, so nothing re-renders.
    expect(applyOutcome(initial, outcome)).toBe(initial);
  });
});

describe('invalid taps', () => {
  it('rejects an out-of-range arrow index', () => {
    const { board, initial } = build('A a .');
    expect(resolveTap(board, initial, 99)).toEqual({ kind: 'invalid', reason: 'unknown-arrow' });
    expect(resolveTap(board, initial, -1)).toEqual({ kind: 'invalid', reason: 'unknown-arrow' });
  });

  it('rejects tapping an arrow that already left', () => {
    const { board, initial } = build('A a .');
    const next = applyOutcome(initial, resolveTap(board, initial, 0));
    expect(resolveTap(board, next, 0)).toEqual({ kind: 'invalid', reason: 'already-escaped' });
  });
});

describe('applyOutcome immutability', () => {
  it('leaves the previous state untouched', () => {
    const { board, initial } = build('A a . B b');
    const alive = Array.from(initial.alive);
    const occupancy = Array.from(initial.occupancy);

    applyOutcome(initial, resolveTap(board, initial, 0));

    expect(Array.from(initial.alive)).toEqual(alive);
    expect(Array.from(initial.occupancy)).toEqual(occupancy);
    expect(initial.remaining).toBe(2);
  });
});

describe('legal and blocked arrows', () => {
  it('splits the board into what can move and what cannot', () => {
    const { board, initial } = build('a A . b B');
    expect(legalMoves(board, initial)).toEqual([1]);
    expect(blockedArrows(board, initial)).toEqual([0]);
    expect(hasLegalMove(board, initial)).toBe(true);
  });

  it('reports a mutually blocking pair as stuck', () => {
    // Two heads pointing into each other with no way past.
    const { board, initial } = build('a A B b');
    expect(legalMoves(board, initial)).toEqual([]);
    expect(isBoardStuck(board, initial)).toBe(true);
  });

  it('does not call a cleared board stuck', () => {
    const { board, initial } = build('A a .');
    const cleared = applyOutcome(initial, resolveTap(board, initial, 0));
    expect(isBoardStuck(board, cleared)).toBe(false);
  });
});

describe('sessions and hearts', () => {
  it('starts with the default five hearts', () => {
    const { initial } = build('A a .');
    const session = startSession(initial);
    expect(session.heartsLeft).toBe(DEFAULT_HEARTS);
    expect(session.maxHearts).toBe(DEFAULT_HEARTS);
    expect(session.status).toBe('playing');
    expect(session.mistakes).toBe(0);
  });

  it('honours a per-level heart count', () => {
    const { initial } = build('A a .', 3);
    expect(startSession(initial, 3).heartsLeft).toBe(3);
  });

  it('spends a heart on a blocked tap and leaves the board alone', () => {
    const { board, initial } = build('a A . b B');
    const session = startSession(initial);

    const { session: after, outcome } = tapArrow(board, session, 0);

    expect(outcome.kind).toBe('blocked');
    expect(after.heartsLeft).toBe(DEFAULT_HEARTS - 1);
    expect(after.mistakes).toBe(1);
    expect(after.status).toBe('playing');
    expect(after.state).toBe(session.state);
  });

  it('does not spend a heart on a good tap', () => {
    const { board, initial } = build('a A . b B');
    const { session } = tapArrow(board, startSession(initial), 1);
    expect(session.heartsLeft).toBe(DEFAULT_HEARTS);
    expect(session.state.remaining).toBe(1);
  });

  it('fails the level when the last heart is spent', () => {
    // `c C b B a A`: heads point right, so only index 0 is free and both 1 and 2
    // are stuck. Two *distinct* stuck arrows, because a heart is charged per
    // arrow — tapping index 2 twice would only ever cost one.
    const { board, initial } = build('c C b B a A');
    let session = startSession(initial, 2);

    session = tapArrow(board, session, 2).session;
    expect(session.status).toBe('playing');
    expect(session.heartsLeft).toBe(1);

    session = tapArrow(board, session, 1).session;
    expect(session.status).toBe('failed');
    expect(session.heartsLeft).toBe(0);
  });

  it('charges a stuck arrow once, however many times it is tapped', () => {
    const { board, initial } = build('a A . b B');
    const session = startSession(initial);

    const first = tapArrow(board, session, 0);
    expect(first.outcome.kind).toBe('blocked');
    expect(first.session.heartsLeft).toBe(DEFAULT_HEARTS - 1);
    expect(first.session.chargedArrows.has(0)).toBe(true);

    // Still blocked — the view must keep saying so — but no longer billed.
    const second = tapArrow(board, first.session, 0);
    expect(second.outcome.kind).toBe('blocked');
    expect(second.session.heartsLeft).toBe(DEFAULT_HEARTS - 1);
    expect(second.session.mistakes).toBe(1);
    expect(second.session).toBe(first.session);
  });

  it('ignores taps once the level is over', () => {
    const { board, initial } = build('a A . b B');
    let session = startSession(initial, 1);
    session = tapArrow(board, session, 0).session;
    expect(session.status).toBe('failed');

    const { session: after, outcome } = tapArrow(board, session, 1);
    expect(outcome.kind).toBe('invalid');
    expect(after).toBe(session);
  });

  it('wins when the last arrow leaves', () => {
    const { board, initial } = build('a A . b B');
    let session = startSession(initial);

    session = tapArrow(board, session, 1).session;
    expect(session.status).toBe('playing');

    session = tapArrow(board, session, 0).session;
    expect(session.status).toBe('won');
    expect(session.heartsLeft).toBe(DEFAULT_HEARTS);
  });
});

describe('a full level plays out', () => {
  it('clears independent arrows in any order without spending a heart', () => {
    // Three snakes in separate rows, each head pointing at the near edge. None
    // interacts with another, so every order works.
    const { board, initial } = build(`
      A a . . .
      . . . . .
      B b . . .
      . . . . .
      C c . . .
    `);
    let session = startSession(initial);
    expect(legalMoves(board, session.state)).toEqual([0, 1, 2]);

    for (const index of [2, 0, 1]) {
      const { session: next, outcome } = tapArrow(board, session, index);
      expect(outcome.kind).toBe('escaped');
      session = next;
    }

    expect(session.status).toBe('won');
    expect(session.heartsLeft).toBe(DEFAULT_HEARTS);
  });

  it('opens up blocked arrows as the arrows ahead of them leave', () => {
    // Three heads pointing right in the same row: only the rightmost is free,
    // and each departure releases the next.
    const { board, initial } = build('c C b B a A');
    let session = startSession(initial);

    // Arrows are id-sorted by the parser: index 0 = 'a' (rightmost head).
    expect(legalMoves(board, session.state)).toEqual([0]);

    session = tapArrow(board, session, 0).session;
    expect(legalMoves(board, session.state)).toEqual([1]);

    session = tapArrow(board, session, 1).session;
    expect(legalMoves(board, session.state)).toEqual([2]);

    session = tapArrow(board, session, 2).session;
    expect(session.status).toBe('won');
    expect(session.mistakes).toBe(0);
  });
});
