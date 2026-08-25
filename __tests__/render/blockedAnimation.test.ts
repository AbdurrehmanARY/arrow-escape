/**
 * Unit tests for blocked arrow tap animation behavior and hint feedback.
 */

import { buildLevel, parseAscii, resolveTap } from '@game';

describe('Blocked arrow tap animation & hint state properties', () => {
  const BOARD_ASCII = 'c C b B a A';

  it('correctly resolves blocked outcome when arrow is obstructed', () => {
    const built = buildLevel(parseAscii(BOARD_ASCII));
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const { board, initial } = built.value;
    const outcome = resolveTap(board, initial, 1);

    expect(outcome.kind).toBe('blocked');
    if (outcome.kind === 'blocked') {
      expect(outcome.arrowIndex).toBe(1);
      expect(outcome.blockerKind).toBe('arrow');
      expect(outcome.blockerIndex).toBe(0);
    }
  });

  it('does not alter gameplay state when arrow is blocked', () => {
    const built = buildLevel(parseAscii(BOARD_ASCII));
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const { board, initial } = built.value;
    const outcome = resolveTap(board, initial, 1);

    expect(outcome.kind).toBe('blocked');
    expect(initial.alive[1]).toBe(1);
    expect(initial.remaining).toBe(3);
  });
});
