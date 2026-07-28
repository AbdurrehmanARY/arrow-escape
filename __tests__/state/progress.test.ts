/**
 * Progress selectors.
 *
 * These decide what a player can open and where "Play" sends them. Getting them
 * wrong strands someone outside a level they have already finished, which is the
 * kind of bug that looks like lost progress and gets an app uninstalled.
 *
 * The selectors are pure functions of the completed set on purpose — unlocking is
 * *derived*, never stored, so it has nothing to drift out of sync with.
 */

import {
  clearedCount,
  highestUnlocked,
  isCleared,
  nextLevel,
  perfectCount,
  type LevelRecord,
} from '@state/progressStore';

const cleared = (mistakes = 1): LevelRecord => ({
  bestMistakes: mistakes,
  bestHeartsLeft: 5 - mistakes,
  timesCleared: 1,
});

/** Build a record set from a list of cleared level ids. */
function records(ids: number[], mistakes = 1): Record<number, LevelRecord> {
  return Object.fromEntries(ids.map((id) => [id, cleared(mistakes)]));
}

describe('isCleared', () => {
  it('is true only once a level has actually been finished', () => {
    expect(isCleared(records([1, 2]), 1)).toBe(true);
    expect(isCleared(records([1, 2]), 3)).toBe(false);
  });

  it('treats a level that was opened but never cleared as not cleared', () => {
    const touched: Record<number, LevelRecord> = {
      4: { bestMistakes: 0, bestHeartsLeft: 5, timesCleared: 0 },
    };
    expect(isCleared(touched, 4)).toBe(false);
  });
});

describe('highestUnlocked', () => {
  it('opens only level 1 on a fresh install', () => {
    expect(highestUnlocked({}, 50)).toBe(1);
  });

  it('opens the next level after each one cleared', () => {
    expect(highestUnlocked(records([1]), 50)).toBe(2);
    expect(highestUnlocked(records([1, 2, 3]), 50)).toBe(4);
  });

  it('stops at the first gap rather than skipping ahead', () => {
    // Clearing level 5 out of order must not unlock 2, 3 and 4 behind it.
    expect(highestUnlocked(records([1, 2, 5]), 50)).toBe(3);
  });

  it('never points past the last level', () => {
    expect(highestUnlocked(records([1, 2, 3]), 3)).toBe(3);
  });
});

describe('nextLevel', () => {
  it('sends a new player to level 1', () => {
    expect(nextLevel({}, 50)).toBe(1);
  });

  it('sends a returning player to the first level they have not cleared', () => {
    expect(nextLevel(records([1, 2, 3]), 50)).toBe(4);
  });

  it('skips over a gap to find the genuinely unfinished one', () => {
    expect(nextLevel(records([1, 3, 4]), 50)).toBe(2);
  });

  it('stays on the last level once everything is done', () => {
    expect(nextLevel(records([1, 2, 3]), 3)).toBe(3);
  });
});

describe('counters', () => {
  it('counts cleared levels', () => {
    expect(clearedCount({})).toBe(0);
    expect(clearedCount(records([1, 2, 7]))).toBe(3);
  });

  it('counts only levels cleared without a wrong tap as perfect', () => {
    const mixed: Record<number, LevelRecord> = {
      ...records([1, 2], 0),
      ...records([3], 2),
    };
    expect(perfectCount(mixed)).toBe(2);
    expect(clearedCount(mixed)).toBe(3);
  });

  it('does not count an unfinished level as perfect just because it has no mistakes', () => {
    const touched: Record<number, LevelRecord> = {
      1: { bestMistakes: 0, bestHeartsLeft: 5, timesCleared: 0 },
    };
    expect(perfectCount(touched)).toBe(0);
  });
});
