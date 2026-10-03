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
  calculateAllRewards,
  earnedCount,
  nextReward,
  REWARDS,
  rewardProgress,
  type CalculatedRewardItem,
  type ChallengeStats,
} from '@challenge';
import { LEAGUES, weekOf } from '@league';
import { SHIELD_IMAGES } from '@shared/assets/images';

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

/**
 * The shield award — the ninth item and the fifth award on the ladder.
 *
 * The shield is the only award that is not a counter, and that is where all of
 * its risk lives. `current` is 0 or 1 against a requirement of 1, so the item is
 * either "Unlocked" or "Locked" and can never be "In Progress" — and the two ways
 * it could go wrong are silent:
 *
 * - Awarding a shield to a player who played nothing this week. `leagueForArrows(0)`
 *   returns Bronze, so an existence test written against the *score* instead of
 *   this week's arrows hands out a tier nobody is defending.
 * - Drawing the same shield for everybody. The artwork depends on the league, so an
 *   award that never receives a `shieldId` silently falls back to Bronze and a
 *   Diamond player's tile lies about what they hold.
 *
 * Both are asserted here rather than discovered on a device.
 */

const WEDNESDAY = Date.UTC(2026, 7, 5, 12, 0, 0);

function rewards(
  over: Partial<Parameters<typeof calculateAllRewards>[0]> = {},
): Record<string, CalculatedRewardItem> {
  return calculateAllRewards({
    progressRecords: {},
    challengeRecords: {},
    leagueWeeks: {},
    leagueCounted: [],
    nowMs: WEDNESDAY,
    ...over,
  });
}

/** A week with `arrows` recorded against it, keyed the way the store keys it. */
function weekWith(arrows: number): Record<string, number> {
  return { [weekOf(WEDNESDAY).id]: arrows };
}

describe('the shield award exists', () => {
  it('is the ninth item on the ladder', () => {
    expect(Object.keys(rewards())).toHaveLength(9);
  });

  it('routes to the shield info screen', () => {
    expect(rewards()['shield']?.route).toBe('/challenge/info/shield');
  });

  it('is a 0-or-1 award, so it can never read as "in progress"', () => {
    const item = rewards()['shield']!;
    expect(item.requirement).toBe(1);
    // The only two states reachable with a requirement of 1.
    expect(['locked', 'active']).toContain(item.state);
  });
});

describe('holding a shield', () => {
  it('unlocks from a single arrow earned this week', () => {
    const item = rewards({ leagueWeeks: weekWith(1) })['shield']!;
    expect(item.current).toBe(1);
    expect(item.active).toBe(true);
    expect(item.statusText).toBe('Unlocked');
  });

  it('stays locked on a fresh profile', () => {
    const item = rewards()['shield']!;
    expect(item.current).toBe(0);
    expect(item.state).toBe('locked');
    expect(item.statusText).toBe('Locked');
  });

  it('ignores last week, because the race resets on Monday', () => {
    // Arrows in a *different* week are not a shield this week. Without this the
    // award would read as unlocked for every player who ever played.
    const lastWeek = { [weekOf(WEDNESDAY - 7 * 86_400_000).id]: 5000 };
    expect(rewards({ leagueWeeks: lastWeek })['shield']!.state).toBe('locked');
  });

  it('is counted against the instant the caller gives, not the wall clock', () => {
    // The instant is a parameter precisely so this screen cannot disagree with
    // itself. `useCalculatedRewards` used to omit it and let `calculateAllRewards`
    // call `Date.now()` inside its own memo, so a surface holding a mount-stable
    // instant for `useCurrentShield` was reading the shield tier from one moment
    // and the award state from another. Left open across a Monday rollover, the
    // tile kept drawing last week's shield while the award beside it said Locked.
    // Same stored arrows, both explicitly dated; only the instant differs.
    const earned = { [weekOf(WEDNESDAY).id]: 500 };
    expect(rewards({ leagueWeeks: earned, nowMs: WEDNESDAY })['shield']!.state).toBe('active');
    expect(
      rewards({ leagueWeeks: earned, nowMs: WEDNESDAY + 7 * 86_400_000 })['shield']!.state,
    ).toBe('locked');
  });
});

describe('the shield artwork', () => {
  it('follows the league the caller reports', () => {
    expect(rewards({ shieldId: 'gold' })['shield']!.image).toBe(SHIELD_IMAGES.gold.source);
    expect(rewards({ shieldId: 'diamond' })['shield']!.image).toBe(
      SHIELD_IMAGES.diamond.source,
    );
  });

  it('carries the league id so a surface can re-resolve it against the theme', () => {
    expect(rewards({ shieldId: 'ruby' })['shield']!.shieldId).toBe('ruby');
  });

  it('has no league id on any other award', () => {
    const map = rewards({ shieldId: 'gold' });
    const others = Object.values(map).filter((item) => item.id !== 'shield');
    expect(others.every((item) => item.shieldId === undefined)).toBe(true);
  });

  it('falls back to bronze rather than to nothing', () => {
    // No shield, or a league id that is not a tier: the tile must still draw.
    expect(rewards()['shield']!.image).toBe(SHIELD_IMAGES.bronze.source);
    expect(rewards({ shieldId: 'unobtainium' })['shield']!.image).toBe(
      SHIELD_IMAGES.bronze.source,
    );
  });

  it('resolves every league in the ladder to real artwork', () => {
    // Guards the registry join: a league added to `LEAGUES` with no matching
    // `SHIELD_IMAGES` entry would otherwise only show up as bronze.
    for (const league of LEAGUES) {
      expect(rewards({ shieldId: league.id })['shield']!.image).toBe(
        SHIELD_IMAGES[league.id as keyof typeof SHIELD_IMAGES].source,
      );
    }
  });
});

describe('the ninth item did not disturb the other eight', () => {
  it('leaves every other id present and unchanged in shape', () => {
    const map = rewards();
    for (const id of [
      'level-legend',
      'perfect-play',
      'unstoppable',
      'league-climber',
      'league-fighter',
      'longest-streak',
      'highest-win-streak',
      'most-wins',
    ]) {
      expect(map[id]).toBeDefined();
    }
  });

  it('reports progress on a partially played profile', () => {
    const cleared: Record<string, { timesCleared: number }> = { '0': { timesCleared: 3 } };
    const item = rewards({ progressRecords: cleared })['level-legend']!;
    expect(item.current).toBe(1);
    expect(item.state).toBe('inactive');
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
