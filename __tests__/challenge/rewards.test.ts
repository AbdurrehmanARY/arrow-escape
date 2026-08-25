/**
 * The reward ladder.
 *
 * Rewards are derived from real records rather than granted and stored, so the only
 * way they can be wrong is arithmetic — which is exactly the kind of wrong that
 * ships unnoticed and then hands someone a medal they did not earn, or withholds
 * one they did.
 *
 * The property worth protecting hardest is that **a streak reward, once earned,
 * cannot be lost**. Rewards read `longestStreak`, never `currentStreak`; a medal
 * that disappears because you missed a Tuesday is a punishment wearing a medal.
 */

import {
  earnedCount,
  nextReward,
  REWARDS,
  rewardProgress,
  type ChallengeStats,
} from '@challenge';

function stats(over: Partial<ChallengeStats> = {}): ChallengeStats {
  return {
    played: 0,
    won: 0,
    perfect: 0,
    currentStreak: 0,
    longestStreak: 0,
    highestWinStreak: 0,
    bestTimeMs: undefined,
    totalHintsUsed: 0,
    ...over,
  };
}

describe('the ladder itself', () => {
  it('has a reward reachable on the first day', () => {
    // A rewards screen that opens as a list of things you have not done teaches a
    // player the feature is not for them.
    const firstWin = rewardProgress(stats({ won: 1 }));
    expect(firstWin.some((reward) => reward.earned)).toBe(true);
  });

  it('has unique ids', () => {
    const ids = new Set(REWARDS.map((reward) => reward.id));
    expect(ids.size).toBe(REWARDS.length);
  });

  it('orders thresholds within each track', () => {
    for (const metric of ['won', 'streak', 'perfect'] as const) {
      const track = REWARDS.filter((reward) => reward.metric === metric);
      const thresholds = track.map((reward) => reward.threshold);
      expect([...thresholds].sort((a, b) => a - b)).toEqual(thresholds);
    }
  });
});

describe('progress', () => {
  it('is nothing earned on a fresh profile', () => {
    expect(earnedCount(stats())).toBe(0);
    expect(rewardProgress(stats()).every((reward) => reward.fraction === 0)).toBe(true);
  });

  it('caps current at the threshold rather than overshooting the bar', () => {
    const progress = rewardProgress(stats({ won: 10_000 }));
    for (const reward of progress) {
      expect(reward.current).toBeLessThanOrEqual(reward.definition.threshold);
      expect(reward.fraction).toBeLessThanOrEqual(1);
    }
  });

  it('reports a partial fraction between rungs', () => {
    const streak3 = rewardProgress(stats({ longestStreak: 2 })).find(
      (reward) => reward.definition.id === 'streak-3',
    );
    expect(streak3?.earned).toBe(false);
    expect(streak3?.current).toBe(2);
    expect(streak3?.fraction).toBeCloseTo(2 / 3, 6);
  });
});

describe('streak rewards read the best streak, never the current one', () => {
  it('keeps a streak reward after the streak is broken', () => {
    // Won seven in a row last month, nothing today. The medal stays.
    const broken = stats({ currentStreak: 0, longestStreak: 7 });
    const week = rewardProgress(broken).find((reward) => reward.definition.id === 'streak-7');
    expect(week?.earned).toBe(true);
  });

  it('does not award on a current streak that never became a best', () => {
    // Defensive: `longestStreak` is always >= `currentStreak` in real data, so this
    // pins that rewards do not accidentally read the wrong field.
    const odd = stats({ currentStreak: 7, longestStreak: 2 });
    const fighter = rewardProgress(odd).find((reward) => reward.definition.id === 'streak-7');
    expect(fighter?.earned).toBe(false);
  });
});

describe('the next reward', () => {
  it('is undefined once everything is earned', () => {
    const maxed = stats({ won: 1000, longestStreak: 1000, perfect: 1000 });
    expect(nextReward(maxed)).toBeUndefined();
    expect(earnedCount(maxed)).toBe(REWARDS.length);
  });

  it('picks the nearest by fraction, not by absolute distance', () => {
    // Chosen so the two measures disagree. Ranked by *count remaining*, the streak
    // wins: one more day versus five more victories. Ranked by how far through the
    // bar is, the wins are 95% done against the streak's 67% — and that is the one
    // a player recognises as "nearly there", because a progress bar is what they
    // are looking at.
    const close = stats({ won: 95, longestStreak: 2 });

    const nearestByCount = 'streak-3';
    expect(nextReward(close)?.definition.id).not.toBe(nearestByCount);
    expect(nextReward(close)?.definition.id).toBe('won-100');
  });

  it('is the first rung on a fresh profile', () => {
    // Everything is at zero, so nothing has progress — but a nudge must still be
    // offered rather than the screen showing nothing to aim at.
    expect(nextReward(stats())).toBeDefined();
  });
});
