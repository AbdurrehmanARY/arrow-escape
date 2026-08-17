/**
 * The daily challenge must be the same puzzle for everyone, every time.
 *
 * That property is the whole reason Challenge Mode can ship before there is a
 * backend: nobody is *assigned* a puzzle, everyone computes the same one. It is
 * also the property a server must later agree with rather than replace — when login
 * arrives it should be able to recompute and verify a submitted result, not hand
 * out assignments.
 *
 * So determinism is tested first, difficulty second, and the calendar arithmetic
 * third, because an off-by-one in a leap year is exactly the kind of thing that
 * ships.
 */

import { TIER_ORDER } from '@game/codec';
import { levelById, tierOf } from '@data/levels';

import {
  CHALLENGE_START,
  CHALLENGE_TIERS,
  challengeFor,
  challengeId,
  challengePool,
  daysInMonth,
  firstWeekdayOfMonth,
  isChallengeDay,
  parseChallengeId,
  today,
} from '@challenge/schedule';

describe('the daily challenge', () => {
  it('gives the same level for the same date, every time', () => {
    const date = { year: 2026, month: 8, day: 4 };
    const first = challengeFor(date);
    expect(first).toBeDefined();

    // Called a hundred times, from a cold pool and a warm one.
    for (let i = 0; i < 100; i += 1) {
      expect(challengeFor({ ...date })).toBe(first);
    }
  });

  it('never picks anything below Hard', () => {
    // Sample a full year. A daily that might be a tutorial board is not a daily
    // challenge, and this is the one rule from the brief that shapes the data.
    for (let month = 1; month <= 12; month += 1) {
      for (let day = 1; day <= daysInMonth(2026, month); day += 1) {
        const levelId = challengeFor({ year: 2026, month, day });
        expect(levelId).toBeDefined();

        const tier = tierOf(levelId!);
        expect(CHALLENGE_TIERS).toContain(tier);
        // The brief is "minimum Hard": nothing easier may appear, ever.
        expect(['tutorial', 'easy', 'casual', 'medium', 'tricky']).not.toContain(tier);
      }
    }
  });

  it('never picks a level that does not exist', () => {
    for (const id of challengePool()) {
      expect(levelById(id)).toBeDefined();
    }
  });

  it('spreads consecutive days across the library rather than walking it in order', () => {
    // The naive seed — year*10000 + month*100 + day — moves by one per day and so
    // drew neighbouring levels all week. The hash exists to prevent that, and this
    // is what would catch its removal.
    const ids: number[] = [];
    for (let day = 1; day <= 28; day += 1) {
      ids.push(challengeFor({ year: 2026, month: 2, day })!);
    }

    let adjacent = 0;
    for (let i = 1; i < ids.length; i += 1) {
      if (Math.abs(ids[i]! - ids[i - 1]!) <= 2) adjacent += 1;
    }

    // A sequential walk would make this 27. Allow a few coincidences.
    expect(adjacent).toBeLessThan(5);
  });

  it('uses more than one tier across a month', () => {
    const tiers = new Set<string>();
    for (let day = 1; day <= 31; day += 1) {
      tiers.add(tierOf(challengeFor({ year: 2026, month: 1, day })!)!);
    }
    expect(tiers.size).toBeGreaterThan(1);
    // And every one of them is in tier order, i.e. a real tier.
    for (const tier of tiers) expect(TIER_ORDER).toContain(tier);
  });
});

describe('challenge ids', () => {
  it('round-trip through parsing', () => {
    const date = { year: 2026, month: 3, day: 9 };
    expect(challengeId(date)).toBe('2026-03-09');
    expect(parseChallengeId('2026-03-09')).toEqual(date);
  });

  it('sort lexicographically in date order', () => {
    const ids = ['2026-12-01', '2026-01-02', '2026-01-10', '2025-11-30'];
    expect([...ids].sort()).toEqual(['2025-11-30', '2026-01-02', '2026-01-10', '2026-12-01']);
  });

  it('reject malformed input rather than guessing', () => {
    for (const bad of ['2026-13-01', '2026-00-01', '2026-01-00', 'nonsense', '2026-1-1']) {
      expect(parseChallengeId(bad)).toBeUndefined();
    }
  });
});

describe('which days are playable', () => {
  const now = { year: 2026, month: 8, day: 4 };

  it('locks the future, because the point of a daily is that it arrives', () => {
    expect(isChallengeDay({ year: 2026, month: 8, day: 5 }, now)).toBe(false);
    expect(isChallengeDay({ year: 2027, month: 1, day: 1 }, now)).toBe(false);
  });

  it('keeps the past open back to the start, so a missed day is recoverable', () => {
    expect(isChallengeDay({ year: 2026, month: 8, day: 3 }, now)).toBe(true);
    expect(isChallengeDay(CHALLENGE_START, now)).toBe(true);
  });

  it('locks everything before the series began', () => {
    // Not "missed" — those days were never challenges, and a calendar offering
    // them would be inviting players to play days that never happened.
    expect(isChallengeDay({ year: 2026, month: 6, day: 30 }, now)).toBe(false);
    expect(isChallengeDay({ year: 2025, month: 1, day: 1 }, now)).toBe(false);
  });

  it('allows today', () => {
    expect(isChallengeDay(now, now)).toBe(true);
  });
});

describe('calendar arithmetic', () => {
  it('handles leap years', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28);
  });

  it('knows month lengths', () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
  });

  it('starts weeks on Monday, not Sunday', () => {
    // 1 August 2026 is a Saturday. Monday-first that is index 5, and the classic
    // bug here is reporting 6 by using `getDay()` directly.
    expect(firstWeekdayOfMonth(2026, 8)).toBe(5);
    // 1 June 2026 is a Monday.
    expect(firstWeekdayOfMonth(2026, 6)).toBe(0);
  });
});

describe('today', () => {
  it('reads the clock only when asked to', () => {
    // The date is otherwise always passed in — that is what makes every function
    // above testable, and what will let a server agree with the client.
    expect(today(new Date(2026, 7, 4))).toEqual({ year: 2026, month: 8, day: 4 });
  });
});
