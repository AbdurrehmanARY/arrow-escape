/**
 * league.ts — the weekly competitive cycle.
 *
 * Purpose:      Decide which league a player is in, what their score is, when the
 *               week ends, and who goes up or down.
 * Responsibilities:
 *               - `LEAGUES`        — the ladder, bronze to diamond.
 *               - `weekOf`         — which cycle a moment belongs to.
 *               - `arrowsFor`      — score from cleared levels and challenges.
 *               - `zoneFor`        — promotion, demotion, or neither.
 * Notes:        **Pure TypeScript. No React, no storage, no network, no clock** —
 *               every function takes the time it needs as an argument. That is what
 *               makes the whole thing testable, and it is also what will let a
 *               server agree with the client rather than argue with it.
 *
 *               **The score is arrows, not points.** A player earns one arrow per
 *               arrow they actually clear off a board, which means the number on the
 *               leaderboard is a thing they did rather than a formula they have to
 *               trust. It also cannot be inflated by replaying a cleared level,
 *               because progress only counts a level once.
 *
 *               **A league week is Monday to Monday, in UTC.** Local midnight would
 *               mean a player in Auckland and one in Los Angeles compete over
 *               different windows, and the one whose week ends later can always see
 *               the final standings before playing. UTC is the only boundary that is
 *               the same for everyone.
 */

/** One rung of the ladder. */
export interface League {
  readonly id: string;
  readonly name: string;
  /** Arrows needed in a single week to be placed here at all. */
  readonly entryArrows: number;
}

/**
 * The ladder.
 *
 * Six rungs, matching the reference design's six shields. Thresholds are a starting
 * guess and will need tuning against a real distribution — but they are applied
 * honestly, so the shield shown is always the shield earned.
 */
export const LEAGUES: readonly League[] = [
  { id: 'bronze', name: 'Bronze', entryArrows: 0 },
  { id: 'silver', name: 'Silver', entryArrows: 400 },
  { id: 'gold', name: 'Gold', entryArrows: 1200 },
  { id: 'ruby', name: 'Ruby', entryArrows: 2500 },
  { id: 'obsidian', name: 'Obsidian', entryArrows: 5000 },
  { id: 'diamond', name: 'Diamond', entryArrows: 9000 },
];

/**
 * How many finish inside the promotion zone, and how many drop.
 *
 * Ten up, five down, out of a nominal fifty. Promotion is deliberately more generous
 * than demotion: a league that mostly sends people down is a league people stop
 * entering.
 */
export const PROMOTION_PLACES = 10;
export const DEMOTION_PLACES = 5;

/** Where a rank sits at the end of a week. */
export type Zone = 'promotion' | 'demotion' | 'safe';

/** A week of competition, identified by the Monday it starts on. */
export interface LeagueWeek {
  /** `YYYY-Www`, e.g. `2026-W32`. Sorts chronologically and reads unambiguously. */
  readonly id: string;
  /** Epoch ms of the Monday 00:00 UTC that opens the week. */
  readonly startMs: number;
  /** Epoch ms of the next Monday 00:00 UTC. Exclusive. */
  readonly endMs: number;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The Monday 00:00 UTC at or before a moment.
 *
 * `getUTCDay()` is Sunday-first, so Sunday must map back six days rather than
 * forward one — the classic off-by-one that puts a whole timezone in the wrong week.
 */
function mondayBefore(atMs: number): number {
  const date = new Date(atMs);
  const day = date.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - daysSinceMonday,
  );
}

/** ISO-8601 week number, so the id matches what a server would compute. */
function isoWeek(atMs: number): { year: number; week: number } {
  // Shift to the Thursday of this week: ISO defines the year by which year that
  // Thursday falls in, which is what makes week 1 well defined across a boundary.
  const thursday = new Date(mondayBefore(atMs) + 3 * 24 * 60 * 60 * 1000);
  const year = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstMonday = mondayBefore(firstThursday.getTime());
  const week = Math.round((thursday.getTime() - firstMonday) / WEEK_MS) + 1;
  return { year, week };
}

/** The competition week containing a moment. */
export function weekOf(atMs: number): LeagueWeek {
  const startMs = mondayBefore(atMs);
  const { year, week } = isoWeek(atMs);
  return {
    id: `${year}-W${String(week).padStart(2, '0')}`,
    startMs,
    endMs: startMs + WEEK_MS,
  };
}

/** Milliseconds left in the week. Never negative. */
export function msRemaining(week: LeagueWeek, atMs: number): number {
  return Math.max(0, week.endMs - atMs);
}

/**
 * `5d 13h`, `13h 20m`, or `20m` — whichever unit pair still says something.
 *
 * Seconds are deliberately never shown. A countdown ticking every second on a
 * screen nobody is racing against is noise, and it forces a re-render a second.
 */
export function formatRemaining(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Arrows earned this week.
 *
 * One per arrow actually cleared off a board, plus a bonus for each daily challenge
 * won — a challenge is a harder board and a rarer event, so it is worth more than
 * the arrows it happens to contain.
 */
export function arrowsFor(arrowsCleared: number, challengeWins: number): number {
  return arrowsCleared + challengeWins * 250;
}

/** The highest league a weekly score qualifies for. */
export function leagueForArrows(arrows: number): League {
  let current: League = LEAGUES[0]!;
  for (const league of LEAGUES) if (arrows >= league.entryArrows) current = league;
  return current;
}

/** The league above this one, or `undefined` at the top. */
export function nextLeague(league: League): League | undefined {
  const index = LEAGUES.findIndex((entry) => entry.id === league.id);
  return index >= 0 ? LEAGUES[index + 1] : undefined;
}

/**
 * Whether a rank is promoted, demoted, or safe.
 *
 * `size` is how many are in the league this week. Ranks are 1-based. The bottom
 * `DEMOTION_PLACES` drop **except** in the lowest league, where there is nowhere to
 * fall — being told you have been relegated from Bronze is a punishment with no
 * mechanism behind it.
 */
export function zoneFor(rank: number, size: number, leagueId: string): Zone {
  if (rank <= PROMOTION_PLACES && leagueId !== LEAGUES[LEAGUES.length - 1]!.id) {
    return 'promotion';
  }
  const lowest = LEAGUES[0]!.id;
  if (leagueId !== lowest && rank > size - DEMOTION_PLACES) return 'demotion';
  return 'safe';
}
