/**
 * rewards.ts — what a player has earned from their challenge history.
 *
 * Purpose:      Turn the record set into a list of rewards, each either earned or
 *               still in progress.
 * Notes:        **Every reward is derived, and every one is real.** The brief asked
 *               for a rewards screen that was UI only; this is deliberately not
 *               that. A shelf of decorative placeholders teaches a player the
 *               feature is dead, and it also has to be thrown away the moment real
 *               rewards exist. Deriving them from records the game already keeps
 *               costs nothing extra and means the screen is truthful from day one.
 *
 *               What is *not* here is anything to spend them on. A reward is
 *               currently recognition — a named milestone with a progress bar —
 *               rather than currency. When there is an economy, `RewardDefinition`
 *               gains a payout field and nothing else about this changes.
 *
 *               Pure TypeScript, so the whole ladder is testable without a device.
 */

import type { ChallengeStats } from './types';

/** How a reward is earned. Kept as data so the list stays declarative. */
export type RewardMetric =
  /** Challenges won, lifetime. */
  | 'won'
  /** Best consecutive-day run. */
  | 'streak'
  /** Wins with all five hearts and no hints. */
  | 'perfect';

export interface RewardDefinition {
  readonly id: string;
  readonly name: string;
  /** One line saying what it takes, in the player's terms. */
  readonly description: string;
  readonly metric: RewardMetric;
  /** The value of `metric` at which this is earned. */
  readonly threshold: number;
  /** A short glyph, so the screen needs no image assets to be legible. */
  readonly glyph: string;
}

/**
 * The ladder.
 *
 * Three tracks rather than one long list, because they reward different things:
 * turning up (`streak`), persistence (`won`), and skill (`perfect`). A player who
 * is good but sporadic and one who is dogged but hint-happy should both find
 * something moving.
 *
 * Thresholds are deliberately close together at the bottom. The first reward has to
 * be reachable on day one or the screen is a list of things you have not done.
 */
export const REWARDS: readonly RewardDefinition[] = [
  { id: 'first-win', name: 'First Light', description: 'Win your first challenge', metric: 'won', threshold: 1, glyph: '◆' },
  { id: 'won-5', name: 'Regular', description: 'Win 5 challenges', metric: 'won', threshold: 5, glyph: '◆' },
  { id: 'won-25', name: 'Committed', description: 'Win 25 challenges', metric: 'won', threshold: 25, glyph: '◆' },
  { id: 'won-100', name: 'Centurion', description: 'Win 100 challenges', metric: 'won', threshold: 100, glyph: '◆' },

  { id: 'streak-3', name: 'On a Roll', description: 'Win 3 days in a row', metric: 'streak', threshold: 3, glyph: '▲' },
  { id: 'streak-7', name: 'Full Week', description: 'Win 7 days in a row', metric: 'streak', threshold: 7, glyph: '▲' },
  { id: 'streak-30', name: 'Unbroken', description: 'Win 30 days in a row', metric: 'streak', threshold: 30, glyph: '▲' },

  { id: 'perfect-1', name: 'Clean Read', description: 'Win without losing a heart or spending a hint', metric: 'perfect', threshold: 1, glyph: '★' },
  { id: 'perfect-10', name: 'Sharp Eye', description: '10 flawless challenge wins', metric: 'perfect', threshold: 10, glyph: '★' },
  { id: 'perfect-50', name: 'Faultless', description: '50 flawless challenge wins', metric: 'perfect', threshold: 50, glyph: '★' },
];

/** A reward with the player's standing against it. */
export interface RewardProgress {
  readonly definition: RewardDefinition;
  readonly earned: boolean;
  /** Where the player is now, capped at the threshold. */
  readonly current: number;
  /** 0..1, for a progress bar. */
  readonly fraction: number;
}

/** Which value of the stats a metric reads. */
function valueFor(metric: RewardMetric, stats: ChallengeStats): number {
  switch (metric) {
    case 'won':
      return stats.won;
    case 'streak':
      // Best ever rather than current: a reward you can *lose* by missing a Tuesday
      // is a punishment wearing a medal.
      return stats.longestStreak;
    case 'perfect':
      return stats.perfect;
  }
}

/** The whole ladder, with progress, in display order: earned last-first, then nearest. */
export function rewardProgress(stats: ChallengeStats): readonly RewardProgress[] {
  return REWARDS.map((definition) => {
    const value = valueFor(definition.metric, stats);
    const current = Math.min(value, definition.threshold);
    return {
      definition,
      earned: value >= definition.threshold,
      current,
      fraction: definition.threshold === 0 ? 1 : current / definition.threshold,
    };
  });
}

/** How many are earned, for a headline count. */
export function earnedCount(stats: ChallengeStats): number {
  return rewardProgress(stats).filter((reward) => reward.earned).length;
}

/**
 * The reward the player is closest to earning, if any remain.
 *
 * Shown on the challenge home as a nudge. Nearest by *fraction* rather than by
 * absolute distance, so "2 of 3 days" outranks "80 of 100 wins".
 */
export function nextReward(stats: ChallengeStats): RewardProgress | undefined {
  const remaining = rewardProgress(stats).filter((reward) => !reward.earned);
  if (remaining.length === 0) return undefined;

  return remaining.reduce((best, reward) => (reward.fraction > best.fraction ? reward : best));
}
