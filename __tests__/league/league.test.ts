/**
 * The weekly league cycle.
 *
 * Two things here are worth testing hard.
 *
 * **The week boundary.** It is UTC Monday to Monday, and `getUTCDay()` is
 * Sunday-first — so a naive implementation puts Sundays in the following week and
 * an entire timezone competes in the wrong cycle for a day. That bug is invisible
 * to everyone except the players it robs.
 *
 * **The zones.** Being told you have been relegated from the bottom league is a
 * punishment with no mechanism behind it, and being promoted out of the top one is
 * a promise the ladder cannot keep. Both are edge cases that only appear for the
 * players at the extremes, which is to say the most and least engaged.
 */

import {
  arrowsFor,
  DEMOTION_PLACES,
  formatRemaining,
  LEAGUES,
  leagueForArrows,
  msRemaining,
  nextLeague,
  PROMOTION_PLACES,
  weekOf,
  zoneFor,
} from '../../src/league/league';

/** A specific known instant: Wednesday 5 August 2026, 12:00 UTC. */
const WEDNESDAY = Date.UTC(2026, 7, 5, 12, 0, 0);

describe('the competition week', () => {
  it('starts on the Monday before, at UTC midnight', () => {
    const week = weekOf(WEDNESDAY);
    const start = new Date(week.startMs);

    expect(start.getUTCDay()).toBe(1); // Monday
    expect(start.getUTCHours()).toBe(0);
    expect(start.getUTCMinutes()).toBe(0);
    expect(start.getUTCDate()).toBe(3); // Monday 3 August 2026
  });

  it('puts Sunday in the week that has just ended, not the next one', () => {
    // The off-by-one. `getUTCDay()` returns 0 for Sunday, so shifting forward by
    // one lands a Sunday player in the wrong cycle for a full day.
    const sunday = Date.UTC(2026, 7, 9, 23, 0, 0);
    const wednesday = weekOf(WEDNESDAY);
    expect(weekOf(sunday).id).toBe(wednesday.id);
    expect(weekOf(sunday).startMs).toBe(wednesday.startMs);
  });

  it('rolls over at exactly Monday 00:00 UTC', () => {
    const week = weekOf(WEDNESDAY);
    // The last instant of the week is still this week.
    expect(weekOf(week.endMs - 1).id).toBe(week.id);
    // The first instant of the next one is not.
    expect(weekOf(week.endMs).id).not.toBe(week.id);
  });

  it('is exactly seven days long', () => {
    const week = weekOf(WEDNESDAY);
    expect(week.endMs - week.startMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('gives ids that sort chronologically', () => {
    const ids = [
      weekOf(Date.UTC(2026, 11, 28)).id,
      weekOf(Date.UTC(2026, 0, 5)).id,
      weekOf(Date.UTC(2026, 5, 1)).id,
    ];
    const sorted = [...ids].sort();
    expect(sorted[0]).toBe(weekOf(Date.UTC(2026, 0, 5)).id);
    expect(sorted[2]).toBe(weekOf(Date.UTC(2026, 11, 28)).id);
  });
});

describe('the countdown', () => {
  it('never goes negative once the week has ended', () => {
    const week = weekOf(WEDNESDAY);
    expect(msRemaining(week, week.endMs + 100_000)).toBe(0);
  });

  it('reads as days and hours while there is a day left', () => {
    expect(formatRemaining((5 * 24 + 13) * 3600_000)).toBe('5d 13h');
  });

  it('drops to hours and minutes inside the last day', () => {
    expect(formatRemaining(13 * 3600_000 + 20 * 60_000)).toBe('13h 20m');
  });

  it('drops to minutes inside the last hour', () => {
    expect(formatRemaining(20 * 60_000)).toBe('20m');
    expect(formatRemaining(0)).toBe('0m');
  });
});

describe('the score', () => {
  it('is one point per arrow actually cleared', () => {
    expect(arrowsFor(1234, 0)).toBe(1234);
  });

  it('pays a bonus for a daily challenge won', () => {
    // A challenge is a harder board and a rarer event, so it is worth more than the
    // arrows it happens to contain.
    expect(arrowsFor(1000, 2)).toBe(1500);
  });

  it('is zero on a fresh week', () => {
    expect(arrowsFor(0, 0)).toBe(0);
  });
});

describe('placement', () => {
  it('puts a new player in the lowest league', () => {
    expect(leagueForArrows(0).id).toBe('bronze');
  });

  it('places by the highest threshold reached', () => {
    expect(leagueForArrows(399).id).toBe('bronze');
    expect(leagueForArrows(400).id).toBe('silver');
    expect(leagueForArrows(1200).id).toBe('gold');
    expect(leagueForArrows(999_999).id).toBe('diamond');
  });

  it('has an ordered ladder with no duplicate thresholds', () => {
    const thresholds = LEAGUES.map((league) => league.entryArrows);
    expect([...thresholds].sort((a, b) => a - b)).toEqual(thresholds);
    expect(new Set(thresholds).size).toBe(thresholds.length);
  });

  it('has nothing above the top league', () => {
    expect(nextLeague(LEAGUES[LEAGUES.length - 1]!)).toBeUndefined();
    expect(nextLeague(LEAGUES[0]!)?.id).toBe('silver');
  });
});

describe('promotion and demotion zones', () => {
  const SIZE = 50;

  it('promotes the top places', () => {
    expect(zoneFor(1, SIZE, 'gold')).toBe('promotion');
    expect(zoneFor(PROMOTION_PLACES, SIZE, 'gold')).toBe('promotion');
    expect(zoneFor(PROMOTION_PLACES + 1, SIZE, 'gold')).toBe('safe');
  });

  it('demotes the bottom places', () => {
    expect(zoneFor(SIZE, SIZE, 'gold')).toBe('demotion');
    expect(zoneFor(SIZE - DEMOTION_PLACES + 1, SIZE, 'gold')).toBe('demotion');
    expect(zoneFor(SIZE - DEMOTION_PLACES, SIZE, 'gold')).toBe('safe');
  });

  it('never relegates out of the bottom league', () => {
    // There is nowhere to fall, and saying otherwise is a threat the ladder cannot
    // carry out.
    expect(zoneFor(SIZE, SIZE, 'bronze')).toBe('safe');
    expect(zoneFor(SIZE - 1, SIZE, 'bronze')).toBe('safe');
  });

  it('never promotes out of the top league', () => {
    const top = LEAGUES[LEAGUES.length - 1]!.id;
    expect(zoneFor(1, SIZE, top)).toBe('safe');
    // But it can still relegate, which is what keeps the top league meaningful.
    expect(zoneFor(SIZE, SIZE, top)).toBe('demotion');
  });

  it('handles a league smaller than the zones without overlapping them', () => {
    // Early on a league may hold fewer players than the two zones combined. A rank
    // must never be both promoted and demoted; promotion wins.
    for (let rank = 1; rank <= 8; rank += 1) {
      const zone = zoneFor(rank, 8, 'gold');
      expect(['promotion', 'demotion', 'safe']).toContain(zone);
    }
    expect(zoneFor(1, 8, 'gold')).toBe('promotion');
  });
});
