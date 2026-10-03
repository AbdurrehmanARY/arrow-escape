/**
 * hooks/useCurrentShield.ts — the league shield the player is holding right now.
 *
 * Purpose:      Answer one question — "is this player holding a shield this week,
 *               and if so, which one?" — for every surface that draws it.
 * Responsibilities:
 *               - Read the two stores the answer is derived from: league weeks
 *                 and challenge records.
 *               - Compose the three domain calls that turn them into a shield:
 *                 `arrowsThisWeek` → `arrowsFor` → `leagueForArrows`.
 *               - Report the score and the week id beside the shield, so a caller
 *                 never has to rebuild half the chain just to print a number.
 * Notes:        **This exists because that chain was written out in three places**
 *               — `app/(tabs)/index.tsx`, `src/hooks/useLeagueBoard.ts` and
 *               `src/challenge/rewards.ts` — and three copies of a rule are three
 *               chances for one of them to drift. It lives in `hooks/` because
 *               that is the only layer already composing `@challenge` + `@state`:
 *               in `state/` it would be a cycle against `challenge → state`, and
 *               in `challenge/` it would be a cycle against `hooks → challenge`.
 *
 * Notes:        **`hasShield` is `arrowsThisWeek > 0`, not `score > 0`.** A weekly
 *               shield is won in the weekly race, and the race resets on Monday.
 *               A player with thousands of lifetime wins and nothing this week
 *               holds no shield, however high their score reads. Making "no
 *               shield" a state the code can represent is what lets the award be
 *               locked and the emblem fall back, instead of handing out a tier
 *               nobody is defending.
 *
 * Notes:        **The score still includes lifetime wins** (`arrowsFor` adds
 *               `stats.won * 250`). That is pre-existing progression behaviour and
 *               deliberately not changed here — `arrowsThisWeek > 0` is used only
 *               as the *existence* test, never as the score.
 */

import { useMemo } from 'react';

import { arrowsFor, leagueForArrows, weekOf, type League } from '@league';
import { arrowsThisWeek, statsOf, useChallengeStore, useLeagueStore } from '@state';

/** What the player holds, and the numbers the answer was derived from. */
export interface CurrentShield {
  /** The league whose shield is held, or `undefined` when the player holds none. */
  readonly shield: League | undefined;
  /** This week's score: arrows cleared, plus the challenge bonus, plus lifetime wins. */
  readonly score: number;
  /** The competition week the shield belongs to, e.g. `2026-W32`. */
  readonly weekId: string;
  /** `arrowsThisWeek > 0`. The existence test, not the tier. */
  readonly hasShield: boolean;
}

/**
 * The shield held at `atMs`.
 *
 * `atMs` is an argument rather than an internal `Date.now()` for the same reason
 * `useLeagueBoard` takes `now`: a surface that prints a countdown and draws a
 * shield must compute both from the same instant, or the two can disagree about
 * which week is on screen — and the disagreement is a shield from last week.
 */
export function useCurrentShield(atMs: number): CurrentShield {
  const weeks = useLeagueStore((state) => state.weeks);
  const challengeRecords = useChallengeStore((state) => state.records);

  return useMemo(() => {
    const weekArrows = arrowsThisWeek({ weeks }, atMs);
    const score = arrowsFor(weekArrows, statsOf({ records: challengeRecords }).won);
    const hasShield = weekArrows > 0;

    return {
      shield: hasShield ? leagueForArrows(score) : undefined,
      score,
      weekId: weekOf(atMs).id,
      hasShield,
    };
  }, [weeks, challengeRecords, atMs]);
}
