/**
 * Streaks and best-result merging.
 *
 * Two things here are easy to get wrong and both are silently punishing:
 *
 * A **streak that breaks on an unplayed today** reads as zero every morning until
 * the player opens the app, which is both false and demoralising. The walk has to
 * skip a day with no record and stop at a day with a losing one.
 *
 * A **replay that overwrites a win** turns the calendar into a record of the last
 * thing you did rather than the best thing. Someone who clears a challenge and then
 * pokes at it again must not lose their result.
 *
 * Everything is pure, so all of it is asserted here rather than discovered on a
 * device weeks later.
 */

import {
  challengeStats,
  currentStreak,
  isBetter,
  longestStreak,
  previousDay,
  type ChallengeId,
  type ChallengeRecord,
} from '@challenge';

function record(id: ChallengeId, over: Partial<ChallengeRecord> = {}): ChallengeRecord {
  return {
    id,
    levelId: 1,
    tier: 'hard',
    outcome: 'won',
    timeMs: 60_000,
    moves: 20,
    heartsLeft: 5,
    hintsUsed: 0,
    completedAt: 0,
    syncedAt: null,
    ...over,
  };
}

const map = (...records: ChallengeRecord[]) => new Map(records.map((r) => [r.id, r]));

describe('previousDay', () => {
  it('crosses month and year boundaries', () => {
    expect(previousDay({ year: 2026, month: 3, day: 1 })).toEqual({
      year: 2026,
      month: 2,
      day: 28,
    });
    expect(previousDay({ year: 2024, month: 3, day: 1 })).toEqual({
      year: 2024,
      month: 2,
      day: 29,
    });
    expect(previousDay({ year: 2026, month: 1, day: 1 })).toEqual({
      year: 2025,
      month: 12,
      day: 31,
    });
  });
});

describe('current streak', () => {
  const now = { year: 2026, month: 8, day: 4 };

  it('counts consecutive wins ending today', () => {
    const records = map(record('2026-08-04'), record('2026-08-03'), record('2026-08-02'));
    expect(currentStreak(records, now)).toBe(3);
  });

  it('does not break just because today has not been played yet', () => {
    // The important one. Yesterday and the day before were won; today is untouched
    // because it is 9am. That is a streak of two, not zero.
    const records = map(record('2026-08-03'), record('2026-08-02'));
    expect(currentStreak(records, now)).toBe(2);
  });

  it('breaks on a loss rather than skipping it', () => {
    const records = map(
      record('2026-08-03', { outcome: 'failed' }),
      record('2026-08-02'),
      record('2026-08-01'),
    );
    expect(currentStreak(records, now)).toBe(0);
  });

  it('breaks on a missing day in the middle', () => {
    const records = map(record('2026-08-03'), record('2026-08-01'));
    expect(currentStreak(records, now)).toBe(1);
  });

  it('is zero with no records at all', () => {
    expect(currentStreak(new Map(), now)).toBe(0);
  });
});

describe('longest streak', () => {
  it('finds the best run anywhere in the history', () => {
    const records = map(
      record('2026-08-01'),
      record('2026-08-02'),
      record('2026-08-03'),
      // gap
      record('2026-08-06'),
      record('2026-08-07'),
    );
    expect(longestStreak(records)).toBe(3);
  });

  it('ignores losses when measuring runs', () => {
    const records = map(
      record('2026-08-01'),
      record('2026-08-02', { outcome: 'failed' }),
      record('2026-08-03'),
    );
    expect(longestStreak(records)).toBe(1);
  });

  it('handles a run crossing a month boundary', () => {
    const records = map(record('2026-07-31'), record('2026-08-01'), record('2026-08-02'));
    expect(longestStreak(records)).toBe(3);
  });
});

describe('a replay may only improve a day', () => {
  const stored = record('2026-08-04', { heartsLeft: 4, hintsUsed: 1, timeMs: 90_000 });

  it('accepts a first result', () => {
    expect(isBetter(stored, undefined)).toBe(true);
  });

  it('accepts a win over a loss', () => {
    const loss = record('2026-08-04', { outcome: 'failed' });
    expect(isBetter(stored, loss)).toBe(true);
  });

  it('rejects a loss over a win', () => {
    const loss = record('2026-08-04', { outcome: 'failed' });
    expect(isBetter(loss, stored)).toBe(false);
  });

  it('prefers more hearts left', () => {
    expect(isBetter(record('2026-08-04', { heartsLeft: 5, hintsUsed: 1 }), stored)).toBe(true);
    expect(isBetter(record('2026-08-04', { heartsLeft: 3, hintsUsed: 0 }), stored)).toBe(false);
  });

  it('prefers fewer hints when hearts tie', () => {
    expect(isBetter(record('2026-08-04', { heartsLeft: 4, hintsUsed: 0 }), stored)).toBe(true);
    expect(isBetter(record('2026-08-04', { heartsLeft: 4, hintsUsed: 2 }), stored)).toBe(false);
  });

  it('prefers a faster time when hearts and hints tie', () => {
    const faster = record('2026-08-04', { heartsLeft: 4, hintsUsed: 1, timeMs: 45_000 });
    const slower = record('2026-08-04', { heartsLeft: 4, hintsUsed: 1, timeMs: 120_000 });
    expect(isBetter(faster, stored)).toBe(true);
    expect(isBetter(slower, stored)).toBe(false);
  });
});

describe('headline stats', () => {
  const now = { year: 2026, month: 8, day: 4 };

  it('counts plays, wins and perfects separately', () => {
    const records = map(
      record('2026-08-04'), // perfect
      record('2026-08-03', { hintsUsed: 2 }), // won, not perfect
      record('2026-08-02', { outcome: 'failed', heartsLeft: 0 }),
    );
    const stats = challengeStats(records, now);

    expect(stats.played).toBe(3);
    expect(stats.won).toBe(2);
    expect(stats.perfect).toBe(1);
    expect(stats.totalHintsUsed).toBe(2);
  });

  it('reports the fastest win, ignoring losses', () => {
    const records = map(
      record('2026-08-04', { timeMs: 120_000 }),
      record('2026-08-03', { timeMs: 45_000 }),
      record('2026-08-02', { outcome: 'failed', timeMs: 1_000 }),
    );
    expect(challengeStats(records, now).bestTimeMs).toBe(45_000);
  });

  it('has no best time before the first win', () => {
    const records = map(record('2026-08-04', { outcome: 'failed' }));
    expect(challengeStats(records, now).bestTimeMs).toBeUndefined();
  });
});
