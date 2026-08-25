/**
 * challenge/types.ts — what a challenge result is.
 *
 * Purpose:      Describe a completed daily challenge as plain data, so the same
 *               shape works for a local record today and a synced row later.
 * Notes:        **Designed for a backend that does not exist yet.** The brief asks
 *               for login, leaderboards and cloud sync to be addable later without
 *               a refactor, and the way to earn that is to decide now what a result
 *               *is* — not to build the plumbing.
 *
 *               Three properties make this syncable:
 *
 *               - **The id is the date**, so two devices producing a record for the
 *                 same day produce rows with the same primary key. Merging is a
 *                 comparison, not a reconciliation.
 *               - **Every field is a scalar the server can verify.** Moves, time and
 *                 hints are checkable against a replay; nothing here is an opinion.
 *               - **`syncedAt` exists from day one.** Adding the field later would
 *                 mean migrating every stored record; leaving it null costs nothing.
 */

import type { DifficultyTier } from '@game/codec';

import type { ChallengeId } from './schedule';

/** How a challenge attempt ended. */
export type ChallengeOutcome =
  /** Cleared the board. */
  | 'won'
  /** Ran out of hearts. */
  | 'failed'
  /** Started and left. Recorded so a half-finished day is not shown as untouched. */
  | 'abandoned';

/**
 * One day's result.
 *
 * Only the best attempt is kept per day. A daily challenge that can be farmed for a
 * better time stops being a daily challenge and becomes a grind, so a repeat play
 * is allowed but only improves the record — it never replaces a win with a loss.
 */
export interface ChallengeRecord {
  /** `YYYY-MM-DD`. The primary key, locally and eventually on a server. */
  readonly id: ChallengeId;
  /** The level that was played, so a record can be replayed or verified. */
  readonly levelId: number;
  readonly tier: DifficultyTier;
  readonly outcome: ChallengeOutcome;
  /** Wall-clock milliseconds from first tap to the board clearing. */
  readonly timeMs: number;
  /** Taps spent, including the ones that cost a heart. */
  readonly moves: number;
  /** Hearts remaining at the end. Five means a perfect read. */
  readonly heartsLeft: number;
  readonly hintsUsed: number;
  /** When the record was written, epoch ms. */
  readonly completedAt: number;
  /**
   * When this row was last pushed to a server, or `null` if never.
   *
   * Unused today and deliberately present anyway — see the note at the top.
   */
  readonly syncedAt: number | null;
}

/** Everything derivable from a set of records. Computed, never stored. */
export interface ChallengeStats {
  readonly played: number;
  readonly won: number;
  readonly perfect: number;
  /** Consecutive days won, counting back from the most recent challenge day. */
  readonly currentStreak: number;
  readonly longestStreak: number;
  readonly highestWinStreak: number;
  /** Fastest win in ms, or `undefined` with no wins. */
  readonly bestTimeMs: number | undefined;
  readonly totalHintsUsed: number;
}
