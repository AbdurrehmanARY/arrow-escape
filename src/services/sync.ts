/**
 * sync.ts — moving progress between this device and the account.
 *
 * Purpose:      Make a reinstall survivable and a leaderboard possible, without a
 *               line of server code.
 * Responsibilities:
 *               - `syncProgress`   — merge level records both ways.
 *               - `syncChallenges` — merge daily challenge records both ways.
 *               - `syncLeague`     — push this week's arrows, read the table back.
 *               - `leaderboard`    — the current week, ranked.
 * Notes:        **The device is the source of truth for what happened; the server
 *               is a copy that outlives it.** Every merge here is a *union* that
 *               keeps the better of two values, never a replacement. A player who
 *               plays offline on a plane and then signs in must not lose that
 *               session, and a player who reinstalls must not lose their history —
 *               those are the same requirement seen from two directions, and
 *               last-write-wins gets one of them wrong.
 *
 *               "Better" is per-field and follows the game's own rules: clears
 *               add up, `bestMistakes` takes the *lower*, `bestHeartsLeft` the
 *               higher, and a challenge row is replaced only by a genuinely better
 *               attempt — the same rule `recordResult` already applies locally.
 *
 *               **Every function is a no-op without a session, and swallows every
 *               failure.** Sync is a convenience layered on a game that is fully
 *               playable offline; it must never be the reason a puzzle will not
 *               open. Nothing here is awaited on a path the player can see.
 *
 *               **What this design cannot do is verify a score.** Row-level
 *               security stops a player writing *someone else's* row; it cannot
 *               stop them writing an untrue number into their own. That is the
 *               accepted cost of a client-only league — see the migration in
 *               `supabase/migrations/`.
 */

import { supabase } from './supabase';
import type { ChallengeRecord } from '@challenge';
import type { LevelRecord } from '@state/progressStore';

/** A row of the weekly table, already ranked. */
export interface LeaderboardRow {
  readonly userId: string;
  readonly name: string;
  readonly arrows: number;
  /** 1-based, by arrows descending. */
  readonly rank: number;
}

/**
 * Can this account's data actually be stored?
 *
 * Signing in and syncing are separate things, and every function below fails
 * silently by design — which is right for gameplay and wrong for a status
 * screen, because "signed in" and "signed in but nothing is being saved" look
 * identical to a player. This asks the cheapest question that tells them apart:
 * one row, no filters, discard the result.
 *
 * False means no session, no network, or — most likely during setup — the
 * migration in `supabase/migrations/` has not been run yet.
 */
export async function syncReachable(): Promise<boolean> {
  const client = supabase();
  const userId = await currentUserId();
  if (!client || !userId) return false;

  try {
    const { error } = await client.from('level_records').select('level_id').limit(1);
    return !error;
  } catch {
    return false;
  }
}

/** The signed-in user's id, or undefined when there is no session. */
async function currentUserId(): Promise<string | undefined> {
  const client = supabase();
  if (!client) return undefined;
  const { data } = await client.auth.getSession();
  return data.session?.user.id;
}

/**
 * Merge level records with the account's copy.
 *
 * Returns the merged set for the caller to persist, or `undefined` when there is
 * nothing to sync with — which is the ordinary case and not an error.
 *
 * The union is deliberate. Cleared levels are facts that accumulate; neither side
 * can invalidate the other, so the result is everything both sides know, with the
 * best figures for any level they both know about.
 */
export async function syncProgress(
  local: Record<number, LevelRecord>,
): Promise<Record<number, LevelRecord> | undefined> {
  const client = supabase();
  const userId = await currentUserId();
  if (!client || !userId) return undefined;

  try {
    const { data, error } = await client
      .from('level_records')
      .select('level_id, times_cleared, best_mistakes, best_hearts_left')
      .eq('user_id', userId);

    if (error) return undefined;

    const merged: Record<number, LevelRecord> = { ...local };

    for (const row of data ?? []) {
      const id = row.level_id as number;
      const remote: LevelRecord = {
        timesCleared: row.times_cleared as number,
        bestMistakes: row.best_mistakes as number,
        bestHeartsLeft: row.best_hearts_left as number,
      };
      const mine = merged[id];
      merged[id] = mine === undefined ? remote : better(mine, remote);
    }

    // Push everything back. An upsert of a row that already matches is cheap and
    // saves tracking which side each field came from.
    const rows = Object.entries(merged).map(([levelId, record]) => ({
      user_id: userId,
      level_id: Number(levelId),
      times_cleared: record.timesCleared,
      best_mistakes: record.bestMistakes,
      best_hearts_left: record.bestHeartsLeft,
      updated_at: new Date().toISOString(),
    }));

    if (rows.length > 0) {
      await client.from('level_records').upsert(rows, { onConflict: 'user_id,level_id' });
    }
    return merged;
  } catch {
    // Offline, or the tables are not deployed yet. Neither is worth a word to the
    // player: the game they are holding works exactly the same either way.
    return undefined;
  }
}

/** The better of two records for the same level, field by field. */
function better(a: LevelRecord, b: LevelRecord): LevelRecord {
  return {
    // Clears from two devices are two sets of clears.
    timesCleared: Math.max(a.timesCleared, b.timesCleared),
    // Fewer mistakes is better, and 0 is a perfect read.
    bestMistakes: Math.min(a.bestMistakes, b.bestMistakes),
    bestHeartsLeft: Math.max(a.bestHeartsLeft, b.bestHeartsLeft),
  };
}

/**
 * Merge daily challenge records with the account's copy.
 *
 * A day is replaced only by a *better* attempt, which is the rule `recordResult`
 * already applies on the device: a win beats a loss, and between two wins the one
 * with more hearts left wins, then fewer hints, then a faster time. Replaying a
 * day badly cannot spoil a good record, whichever device it happened on.
 */
export async function syncChallenges(
  local: Record<string, ChallengeRecord>,
): Promise<Record<string, ChallengeRecord> | undefined> {
  const client = supabase();
  const userId = await currentUserId();
  if (!client || !userId) return undefined;

  try {
    const { data, error } = await client
      .from('challenge_records')
      .select('day, level_id, tier, outcome, time_ms, moves, hearts_left, hints_used, completed_at')
      .eq('user_id', userId);

    if (error) return undefined;

    const merged: Record<string, ChallengeRecord> = { ...local };

    for (const row of data ?? []) {
      const remote = {
        id: row.day as string,
        levelId: row.level_id as number,
        tier: row.tier,
        outcome: row.outcome,
        timeMs: row.time_ms as number,
        moves: row.moves as number,
        heartsLeft: row.hearts_left as number,
        hintsUsed: row.hints_used as number,
        completedAt: Date.parse(row.completed_at as string),
        syncedAt: Date.now(),
      } as ChallengeRecord;

      const mine = merged[remote.id];
      merged[remote.id] = mine === undefined || betterAttempt(remote, mine) ? remote : mine;
    }

    const rows = Object.values(merged).map((record) => ({
      user_id: userId,
      day: record.id,
      level_id: record.levelId,
      tier: record.tier,
      outcome: record.outcome,
      time_ms: record.timeMs,
      moves: record.moves,
      hearts_left: record.heartsLeft,
      hints_used: record.hintsUsed,
      completed_at: new Date(record.completedAt).toISOString(),
    }));

    if (rows.length > 0) {
      await client.from('challenge_records').upsert(rows, { onConflict: 'user_id,day' });
    }
    return merged;
  } catch {
    return undefined;
  }
}

/** Is `candidate` a better attempt at a day than `existing`? Mirrors `recordResult`. */
function betterAttempt(candidate: ChallengeRecord, existing: ChallengeRecord): boolean {
  if (candidate.outcome !== existing.outcome) return candidate.outcome === 'won';
  if (candidate.outcome !== 'won') return false;
  if (candidate.heartsLeft !== existing.heartsLeft) {
    return candidate.heartsLeft > existing.heartsLeft;
  }
  if (candidate.hintsUsed !== existing.hintsUsed) return candidate.hintsUsed < existing.hintsUsed;
  return candidate.timeMs < existing.timeMs;
}

/**
 * Push this week's arrows.
 *
 * Takes the higher of the two rather than overwriting: a second device that has
 * been offline holds a *subset* of the week, not a correction to it, and letting
 * it overwrite would quietly delete arrows the player earned.
 */
export async function syncLeague(weekId: string, arrows: number): Promise<number | undefined> {
  const client = supabase();
  const userId = await currentUserId();
  if (!client || !userId) return undefined;

  try {
    const { data } = await client
      .from('league_scores')
      .select('arrows')
      .eq('user_id', userId)
      .eq('week_id', weekId)
      .maybeSingle();

    const best = Math.max(arrows, (data?.arrows as number | undefined) ?? 0);

    await client.from('league_scores').upsert(
      { user_id: userId, week_id: weekId, arrows: best, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,week_id' },
    );
    return best;
  } catch {
    return undefined;
  }
}

/**
 * The current week's table, ranked.
 *
 * Returns an empty array when there is no account or no connection, which the
 * Leagues screen already knows how to render — it has shown "no one to compare
 * with yet" since before this file existed.
 */
export async function leaderboard(weekId: string, limit = 50): Promise<readonly LeaderboardRow[]> {
  const client = supabase();
  if (!client) return [];

  try {
    const { data, error } = await client
      .from('league_scores')
      .select('user_id, arrows, profiles(display_name)')
      .eq('week_id', weekId)
      .order('arrows', { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return data.map((row, index) => {
      const profile = row.profiles as { display_name?: string } | null;
      return {
        userId: row.user_id as string,
        name: profile?.display_name ?? 'Player',
        arrows: row.arrows as number,
        rank: index + 1,
      };
    });
  } catch {
    return [];
  }
}
