/**
 * stats.ts — everything derivable from a set of challenge records.
 *
 * Purpose:      Turn stored results into the numbers the UI shows.
 * Notes:        **Derived, never stored.** The same rule progress already follows
 *               (decision 20): a stored streak drifts, and a drifted streak either
 *               robs a player of a reward or hands them one they did not earn. Both
 *               are worse than recomputing a dozen numbers from a few hundred rows.
 *
 *               Pure, so the whole of Challenge Mode's arithmetic is testable
 *               without a device, a store, or a clock.
 */

import { challengeId, parseChallengeId, type ChallengeDate, type ChallengeId } from './schedule';
import type { ChallengeRecord, ChallengeStats } from './types';

/** The day before this one. */
export function previousDay(date: ChallengeDate): ChallengeDate {
  const d = new Date(date.year, date.month - 1, date.day);
  d.setDate(d.getDate() - 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

/**
 * Consecutive wins ending at `from`, walking backwards.
 *
 * `from` is normally today. A day that has not been played yet does **not** break
 * the streak — otherwise every streak would read as zero until the player opened
 * the app, which is both wrong and demoralising. The walk starts at the most recent
 * day that has a record.
 */
export function currentStreak(
  records: ReadonlyMap<ChallengeId, ChallengeRecord>,
  from: ChallengeDate,
): number {
  let cursor = from;

  // Skip today if it is simply not played yet; do not skip a loss.
  const todayRecord = records.get(challengeId(cursor));
  if (!todayRecord) cursor = previousDay(cursor);

  let streak = 0;
  for (;;) {
    const record = records.get(challengeId(cursor));
    if (!record || record.outcome !== 'won') return streak;
    streak += 1;
    cursor = previousDay(cursor);
  }
}

/** The longest run of consecutive wins anywhere in the history. */
export function longestStreak(records: ReadonlyMap<ChallengeId, ChallengeRecord>): number {
  const wins = [...records.values()]
    .filter((record) => record.outcome === 'won')
    .map((record) => record.id)
    .sort();

  let best = 0;
  let run = 0;
  let previousId: ChallengeId | undefined;

  for (const id of wins) {
    if (previousId !== undefined) {
      const date = parseChallengeId(id);
      const expected = date ? challengeId(previousDay(date)) : undefined;
      run = expected === previousId ? run + 1 : 1;
    } else {
      run = 1;
    }
    best = Math.max(best, run);
    previousId = id;
  }

  return best;
}

/** Every headline number, from the records alone. */
export function challengeStats(
  records: ReadonlyMap<ChallengeId, ChallengeRecord>,
  from: ChallengeDate,
): ChallengeStats {
  const all = [...records.values()];
  const wins = all.filter((record) => record.outcome === 'won');

  const times = wins.map((record) => record.timeMs).filter((ms) => ms > 0);

  return {
    played: all.length,
    won: wins.length,
    // A perfect challenge is one cleared without a single misread.
    perfect: wins.filter((record) => record.heartsLeft === 5 && record.hintsUsed === 0).length,
    currentStreak: currentStreak(records, from),
    longestStreak: longestStreak(records),
    bestTimeMs: times.length > 0 ? Math.min(...times) : undefined,
    totalHintsUsed: all.reduce((sum, record) => sum + record.hintsUsed, 0),
  };
}

/**
 * Whether a new result should replace the stored one.
 *
 * A win always beats a non-win. Between two wins, fewer hearts spent wins, then a
 * faster time. Replaying a day can only ever improve the record — a second, worse
 * attempt must not erase a good one, or the calendar becomes a record of the last
 * thing you did rather than the best thing.
 */
export function isBetter(next: ChallengeRecord, previous: ChallengeRecord | undefined): boolean {
  if (!previous) return true;
  if (next.outcome === 'won' && previous.outcome !== 'won') return true;
  if (next.outcome !== 'won') return false;
  if (previous.outcome !== 'won') return true;

  if (next.heartsLeft !== previous.heartsLeft) return next.heartsLeft > previous.heartsLeft;
  if (next.hintsUsed !== previous.hintsUsed) return next.hintsUsed < previous.hintsUsed;
  return next.timeMs > 0 && (previous.timeMs <= 0 || next.timeMs < previous.timeMs);
}
