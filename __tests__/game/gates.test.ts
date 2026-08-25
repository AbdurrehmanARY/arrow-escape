/**
 * Blockage box removal verification test.
 */

import { buildWith } from '../helpers';
import { castRay, solve, isSolvable } from '@game';

describe('arrow-only blocking behavior (blockage box removed)', () => {
  it('allows straight path when no blocking arrows exist', () => {
    const { board, initial } = buildWith('a A .', {});
    const ray = castRay(board, initial, 0);

    expect(ray.blockedBy).toBe('nothing');
  });

  it('level remains solvable with arrows only', () => {
    const { board, initial } = buildWith('a A .', {});
    const outcome = solve(board, initial);

    expect(outcome.kind).toBe('solved');
  });

  it('correctly detects arrow blocking another arrow', () => {
    const { board, initial } = buildWith('b B .\na A .', {});
    expect(isSolvable(board, initial)).toBe(true);
  });
});
