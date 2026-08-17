/**
 * schedule.ts — which level is a given day's challenge.
 *
 * Purpose:      Turn a calendar date into a specific, hard level, the same way on
 *               every device and without a server.
 * Responsibilities:
 *               - `challengeFor`     — the level for one date.
 *               - `challengePool`    — the levels a challenge may draw from.
 *               - `isChallengeDay`   — whether a date has a challenge at all.
 * Notes:        **Pure TypeScript. No React, no storage, no clock.** The date is
 *               always passed in, never read from `Date.now()`, which is what makes
 *               this testable and what will make a server able to agree with it.
 *
 *               **Deterministic without coordination.** Every player gets the same
 *               puzzle on the same day because the choice is a pure function of the
 *               date, not because anything was fetched. That is the property that
 *               lets Challenge Mode ship before there is a backend, and it is also
 *               the property a backend must preserve rather than replace — when
 *               login arrives, the server validates a result it can recompute
 *               rather than handing out assignments.
 *
 *               **Hard levels only.** A daily challenge that might be a tutorial
 *               board is not a challenge. The pool is restricted to the tiers that
 *               are genuinely difficult, which is the one rule from the brief that
 *               shapes the data model rather than the UI.
 */

import { ENCODED_LEVELS } from '@data/levels';
import type { DifficultyTier } from '@game/codec';

/**
 * The tiers a challenge may use: **Hard and above, with nothing below it.**
 *
 * An earlier version stopped at Brutal, on the reasoning that a daily nobody can
 * finish in one sitting breaks the habit it is meant to build. That was overruled
 * deliberately — the brief is "minimum Hard", so Extreme Hard and Nightmare are in.
 *
 * The consequence is worth stating rather than discovering: roughly one day in five
 * will be a board most players cannot clear. Past days stay open precisely so a
 * brutal Tuesday can be come back to, and a lost day does not have to end a run
 * that was otherwise going well.
 */
export const CHALLENGE_TIERS: readonly DifficultyTier[] = [
  'hard',
  'superHard',
  'extremeHard',
  'brutal',
  'nightmare',
];

/**
 * The first day that has a challenge at all.
 *
 * Challenges did not exist before this, so a calendar showing empty circles back to
 * 1970 would be inviting players to play days that never happened. Anything earlier
 * is not "missed", it simply is not a challenge day.
 *
 * A constant rather than a stored install date on purpose: every device must agree
 * on when the series began, and a server later has to agree with them.
 */
export const CHALLENGE_START: ChallengeDate = { year: 2026, month: 7, day: 1 };

/** A calendar day, as year/month/day. Deliberately not a `Date`. */
export interface ChallengeDate {
  readonly year: number;
  /** 1-12, not the zero-based month a `Date` reports. */
  readonly month: number;
  /** 1-31. */
  readonly day: number;
}

/**
 * A challenge's stable identity.
 *
 * `YYYY-MM-DD`. Sorts lexicographically, reads unambiguously in a log, and is the
 * obvious primary key for the row a server will eventually store.
 */
export type ChallengeId = string;

/** `YYYY-MM-DD` for a date. */
export function challengeId(date: ChallengeDate): ChallengeId {
  const month = String(date.month).padStart(2, '0');
  const day = String(date.day).padStart(2, '0');
  return `${date.year}-${month}-${day}`;
}

/** Parse a `YYYY-MM-DD` back into a date, or `undefined` if it is malformed. */
export function parseChallengeId(id: ChallengeId): ChallengeDate | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(id);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return { year, month, day };
}

/** Today, in the device's local timezone. The one place a clock is read. */
export function today(now: Date = new Date()): ChallengeDate {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

/**
 * Every level a challenge may draw from, in id order.
 *
 * Computed once. The library is fixed at build time, so this cannot change while
 * the app is running and there is nothing to invalidate.
 */
let pool: readonly number[] | undefined;

export function challengePool(): readonly number[] {
  if (pool) return pool;
  pool = ENCODED_LEVELS.filter((level) => CHALLENGE_TIERS.includes(level.t)).map(
    (level) => level.i,
  );
  return pool;
}

/**
 * Mix a date into a well-distributed 32-bit number.
 *
 * A plain `year*10000 + month*100 + day` walked the pool almost in order, so
 * consecutive days drew neighbouring levels and a week of challenges came from one
 * corner of the library. This is the finalising step of MurmurHash3, which is cheap
 * and scatters sequential inputs thoroughly — exactly the property wanted here.
 */
function mix(value: number): number {
  let h = value >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * The level id for a given day, or `undefined` if there are no eligible levels.
 *
 * Stable for a date, and independent of anything the player has done — two people
 * on opposite sides of the world get the same puzzle, and reinstalling does not
 * reroll it.
 */
export function challengeFor(date: ChallengeDate): number | undefined {
  const levels = challengePool();
  if (levels.length === 0) return undefined;

  const seed = date.year * 10000 + date.month * 100 + date.day;
  return levels[mix(seed) % levels.length];
}

/**
 * Whether a date is playable as a challenge.
 *
 * Three rules. Future days are locked — the whole point of a daily is that it
 * arrives. Days before `CHALLENGE_START` are not challenges at all, because the
 * series had not begun. Everything between stays open, because a missed day should
 * be recoverable; a streak rewards consistency rather than punishing a busy
 * Tuesday — and now that Nightmare boards are in the pool, some days will need
 * coming back to.
 */
export function isChallengeDay(date: ChallengeDate, now: ChallengeDate): boolean {
  const id = challengeId(date);
  return id >= challengeId(CHALLENGE_START) && id <= challengeId(now);
}

/** Days in a month, handling leap years. */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Which weekday a month starts on, as a Monday-first index (0 = Monday).
 *
 * Monday-first because the calendar in the design starts there, and because
 * `Date.getDay()` is Sunday-first, which is the classic off-by-one in this code.
 */
export function firstWeekdayOfMonth(year: number, month: number): number {
  const sundayFirst = new Date(year, month - 1, 1).getDay();
  return (sundayFirst + 6) % 7;
}
