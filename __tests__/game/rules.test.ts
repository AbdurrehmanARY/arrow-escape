/** The rule set: what a tap does under each variant, and when a level is over. */

import {
  applyOutcome,
  getStatus,
  hasLegalMove,
  isCleared,
  legalMoves,
  resolveTap,
  tap,
  toCell,
} from '@game';
import { build } from '../helpers';

describe('escape-only variant', () => {
  it('lets an arrow with a clear path fly off the board', () => {
    const { board, initial } = build('> . . .');
    const outcome = resolveTap(board, initial, 0);

    expect(outcome.kind).toBe('escaped');
    if (outcome.kind !== 'escaped') return;
    // Three empty cells ahead, plus one more to clear the edge entirely.
    expect(outcome.distance).toBe(4);

    const next = applyOutcome(initial, outcome);
    expect(next.remaining).toBe(0);
    expect(isCleared(next)).toBe(true);
  });

  it('does nothing at all when the path is blocked', () => {
    const { board, initial } = build('> . < .');
    const outcome = resolveTap(board, initial, 0);

    expect(outcome.kind).toBe('blocked');
    if (outcome.kind !== 'blocked') return;
    expect(outcome.blockerIndex).toBe(1);

    // Identity equality is the contract: nothing changed, so nothing re-renders.
    expect(applyOutcome(initial, outcome)).toBe(initial);
  });

  it('never moves an arrow part-way, even with room ahead', () => {
    const { board, initial } = build('> . . <');
    const { outcome, next } = tap(board, initial, 0);
    expect(outcome.kind).toBe('blocked');
    expect(next.positions[0]).toBe(initial.positions[0]);
  });
});

describe('slide-and-stop variant', () => {
  it('slides a blocked arrow up against the blocker', () => {
    const { board, initial } = build('> . . <', 'slide-and-stop');
    const outcome = resolveTap(board, initial, 0);

    expect(outcome.kind).toBe('moved');
    if (outcome.kind !== 'moved') return;
    expect(outcome.from).toBe(0);
    expect(outcome.to).toBe(2);
    expect(outcome.distance).toBe(2);
    expect(outcome.blockerIndex).toBe(1);

    const next = applyOutcome(initial, outcome);
    expect(next.remaining).toBe(2); // moved, not removed
    expect(next.positions[0]).toBe(2);
    expect(next.occupancy[0]).toBe(-1);
    expect(next.occupancy[2]).toBe(0);
  });

  it('still lets a clear arrow escape', () => {
    const { board, initial } = build('> . . .', 'slide-and-stop');
    expect(resolveTap(board, initial, 0).kind).toBe('escaped');
  });

  it('reports blocked when the arrow is already hard against the blocker', () => {
    const { board, initial } = build('> < .', 'slide-and-stop');
    expect(resolveTap(board, initial, 0).kind).toBe('blocked');
  });
});

describe('invalid taps', () => {
  it('rejects an out-of-range arrow index', () => {
    const { board, initial } = build('> . .');
    expect(resolveTap(board, initial, 99)).toEqual({ kind: 'invalid', reason: 'unknown-arrow' });
    expect(resolveTap(board, initial, -1)).toEqual({ kind: 'invalid', reason: 'unknown-arrow' });
  });

  it('rejects tapping an arrow that already left', () => {
    const { board, initial } = build('> . .');
    const next = applyOutcome(initial, resolveTap(board, initial, 0));
    expect(resolveTap(board, next, 0)).toEqual({ kind: 'invalid', reason: 'already-escaped' });
  });
});

describe('applyOutcome immutability', () => {
  it('leaves the previous state untouched', () => {
    const { board, initial } = build('> . . .');
    const before = Array.from(initial.positions);
    const beforeOccupancy = Array.from(initial.occupancy);

    applyOutcome(initial, resolveTap(board, initial, 0));

    expect(Array.from(initial.positions)).toEqual(before);
    expect(Array.from(initial.occupancy)).toEqual(beforeOccupancy);
    expect(initial.remaining).toBe(1);
  });
});

describe('legal moves and status', () => {
  it('lists only arrows whose tap changes something', () => {
    // a0 can leave to the left; a1 is walled in behind it.
    const { board, initial } = build('< < .');
    expect(legalMoves(board, initial)).toEqual([0]);
    expect(hasLegalMove(board, initial)).toBe(true);
  });

  it('counts a partial slide as a legal move only under slide-and-stop', () => {
    const art = '> . . <';

    const strict = build(art, 'escape-only');
    expect(legalMoves(strict.board, strict.initial)).toEqual([]);

    const slide = build(art, 'slide-and-stop');
    expect(legalMoves(slide.board, slide.initial)).toEqual([0, 1]);
  });

  it('reports won on an empty board', () => {
    const { board, initial } = build('> . .');
    const next = applyOutcome(initial, resolveTap(board, initial, 0));
    expect(getStatus(board, next)).toBe('won');
  });

  it('reports playing while a move remains', () => {
    // a1 has a clear run to the right edge; a0 is stuck behind it for now.
    const { board, initial } = build('> > .');
    expect(legalMoves(board, initial)).toEqual([1]);
    expect(getStatus(board, initial)).toBe('playing');
  });

  it('reports deadlocked when two arrows converge on the same gap', () => {
    // Under escape-only neither can pass the other, and neither ever moves.
    const { board, initial } = build('> . <');
    expect(getStatus(board, initial)).toBe('deadlocked');
  });

  it('reports deadlocked when two arrows face each other with no way out', () => {
    // The minimal knot: each arrow is the other's only obstacle, forever.
    const { board, initial } = build('> <');
    expect(legalMoves(board, initial)).toEqual([]);
    expect(getStatus(board, initial)).toBe('deadlocked');
  });

  it('treats a four-arrow pinwheel as deadlocked', () => {
    // Each arrow points at the next one around the ring, so none can ever leave.
    const { board, initial } = build(`
      > v
      ^ <
    `);
    expect(legalMoves(board, initial)).toEqual([]);
    expect(getStatus(board, initial)).toBe('deadlocked');
  });
});

describe('a full level plays out', () => {
  it('clears a three-deep dependency chain in the only order that works', () => {
    // a2 must leave before a1 can move, and a1 before a0.
    const { board, initial } = build(`
      v . .
      > > .
      . . .
    `);
    let state = initial;

    for (const expected of [2, 1, 0]) {
      expect(legalMoves(board, state)).toEqual([expected]);
      const outcome = resolveTap(board, state, expected);
      expect(outcome.kind).toBe('escaped');
      state = applyOutcome(state, outcome);
    }

    expect(isCleared(state)).toBe(true);
    expect(getStatus(board, state)).toBe('won');
    expect(state.occupancy.every((cell) => cell === -1)).toBe(true);
    expect(state.occupancy[toCell(1, 1, 3)]).toBe(-1);
  });
});
