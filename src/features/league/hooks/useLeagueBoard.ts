/**
 * features/league/hooks/useLeagueBoard.ts — the weekly table the leagues screen draws.
 *
 * Purpose:      Work out which league the player is in this week, how long is
 *               left, and where they sit among *real* opponents.
 * Responsibilities:
 *               - Own the week / stats / leaderboard memos and their dependency arrays.
 *               - Fetch this week's actual table from `services/sync`.
 *               - Report the league, the countdown text, the player's arrow count
 *                 and the rank-ordered rows, plus whether the fetch is still in flight.
 * Notes:        **This used to invent its opponents.** A roster of forty-nine
 *               hardcoded names with flag emoji (`LEADERBOARD_ROSTER`), with
 *               scores scaled into the band above the player's own league every
 *               time the clock ticked — `ratio = 1 - index / 48` — then merged
 *               with the player and ranked. It read as a race and it was
 *               fiction. A player who signed in, played a week and climbed to
 *               second place had been racing nobody, which is worse than an
 *               empty table because an empty table tells the truth.
 *
 *               The real table is `leaderboard(weekId)` in `services/sync`. It
 *               returns `[]` when Supabase is not configured or there is no
 *               account, and the screen renders its empty state rather than
 *               filling the gap with people who do not exist.
 *
 * Notes:        `userName` is an argument rather than another store read, because
 *               the screen holds a name the player has typed but not yet saved,
 *               and the table has to place *that* name. The stores it does read
 *               are the ones the table is derived from and nothing else.
 *
 * Notes:        The fetch runs on `weekId`, not on the clock. The countdown
 *               ticks once a minute and this must not chase it — a table that
 *               refetched every minute would be a request a player never asked
 *               for, and the merge below already folds in anything the device
 *               knows that the server does not.
 *
 * Notes:        **The league and score come from `useCurrentShield`, not from a
 *               chain written out here.** This file used to compute
 *               `arrowsFor(arrowsThisWeek(...), stats.won)` and
 *               `leagueForArrows(...)` inline — the second of three copies of
 *               the same rule, in a layer that already composes `@league` and
 *               `@state`, which is precisely what `useCurrentShield` exists to
 *               own. Note the fallback: this hook always returns a league, because
 *               the zones on screen are drawn relative to the player's own, so a
 *               player holding no shield is placed in Bronze. That is a *board*
 *               placeholder, not an award — `useCurrentShield().shield` is
 *               `undefined` for the same player, and only that value is allowed to
 *               say "you hold nothing".
 */

import { useEffect, useMemo, useState } from 'react';

import { today } from '@challenge';
import { formatRemaining, msRemaining, weekOf, LEAGUES } from '@league';
import { leaderboard, type LeaderboardRow } from '@services/sync';
import { statsOf, useAuthStore, useChallengeStore } from '@state';
import { useCurrentShield } from '@hooks';

/** One row of the weekly table, once it has been scored and ranked. */
export interface LeaderboardEntry {
  /** The account id for a real row, or `'you'` for the player's own. */
  id: string;
  rank: number;
  name: string;
  arrows: number;
  isUser?: boolean;
}

/**
 * A placeholder avatar for every row.
 *
 * The old roster attached a country flag to each fabricated player, and real
 * rows come back from `profiles.display_name` with no country at all — inventing
 * a flag would be inventing a fact about a real person. One neutral glyph for
 * everyone says "there is a player here" without saying anything untrue.
 */
export const NEUTRAL_AVATAR = '◆';

export interface UseLeagueBoardArgs {
  /**
   * The current time in ms. The caller owns the clock because it also drives the
   * countdown text, and the two must agree — a table computed on a different
   * instant than the one printed above it will disagree about the week.
   */
  readonly now: number;
  /** The name to place in the table, which may be one the player is still typing. */
  readonly userName: string;
}

/**
 * The player's league and this week's real table around them.
 *
 * Rows carry their rank rather than being numbered by the caller: the zones the
 * screen draws sit at fixed *ranks*, so on a short table the promotion divider
 * at rank 11 and the demotion divider at rank 46 simply never render. That is
 * the guard — there is no length threshold to get wrong, because each divider
 * already keys off the rank it labels.
 */
export function useLeagueBoard({ now, userName }: UseLeagueBoardArgs) {
  const challengeRecords = useChallengeStore((state) => state.records);
  const session = useAuthStore((state) => state.session);

  const week = useMemo(() => weekOf(now), [now]);
  const stats = useMemo(
    () => statsOf({ records: challengeRecords }, today()),
    [challengeRecords],
  );

  const { shield, score: userArrows } = useCurrentShield(now);
  const userLeague = shield ?? LEAGUES[0]!;
  const remainingText = formatRemaining(msRemaining(week, now));

  const weekId = week.id;
  const userId = session?.user.id;

  const [remote, setRemote] = useState<readonly LeaderboardRow[]>([]);
  /**
   * The week `remote` actually belongs to, rather than a `loading` flag.
   *
   * `loading = fetched !== weekId` is derived instead of set, because the only
   * write in the effect below happens inside an awaited callback. A synchronous
   * `setLoading(true)` at the top of an effect would cascade a render for a
   * state that was already knowable — the week changed, so the old rows are
   * already stale — and React's rule against it is the right one.
   */
  const [fetched, setFetched] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      let rows: readonly LeaderboardRow[] = [];
      try {
        rows = await leaderboard(weekId);
      } catch {
        // A query that throws is the same as a query that found nothing: no
        // table, not a broken screen.
        rows = [];
      }
      if (cancelled) return;
      setRemote(rows);
      setFetched(weekId);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [weekId]);

  const loading = fetched !== weekId;

  const leaderboardData = useMemo<LeaderboardEntry[]>(() => {
    // No server rows means no table. The player still sees their league, shield,
    // countdown and arrow count above the list; what is missing is a thing that
    // does not exist. Filling it in would be inventing opponents, and an empty
    // table is the only honest answer to "who else is playing this week?".
    if (remote.length === 0) return [];

    const entries: LeaderboardEntry[] = remote.map((row) => ({
      id: row.userId,
      rank: row.rank,
      name: row.name,
      arrows: row.arrows,
      isUser: userId !== undefined && row.userId === userId,
    }));

    const own = entries.find((entry) => entry.isUser);
    if (own) {
      // The name may be one the player has typed but not saved, and the local
      // count can be ahead of the row the server last saw — the push happens
      // after a clear. Neither is fabrication: this device is correcting a
      // player who is already in the table.
      own.name = userName;
      own.arrows = Math.max(own.arrows, userArrows);
    } else if (userId !== undefined) {
      entries.push({ id: userId, rank: 0, name: userName, arrows: userArrows, isUser: true });
    }

    entries.sort((a, b) => b.arrows - a.arrows);
    return entries.map((entry, index) => ({ ...entry, rank: index + 1 }));
  }, [remote, userArrows, userId, userName]);

  return { week, stats, userArrows, userLeague, remainingText, leaderboardData, loading };
}
