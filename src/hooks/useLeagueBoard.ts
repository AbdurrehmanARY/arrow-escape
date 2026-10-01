/**
 * hooks/useLeagueBoard.ts — the fifty-row table the leagues screen draws.
 *
 * Purpose:      Work out which league the player is in this week and where they
 *               sit in its table, from the clock the screen already ticks.
 * Responsibilities:
 *               - Own the week / stats / leaderboard memos and their dependency arrays.
 *               - Own `LeaderboardEntry` and the `LEADERBOARD_ROSTER` the table is
 *                 built from.
 *               - Report the league, the countdown text, the player's arrow count
 *                 and the rank-ordered rows.
 * Notes:        The three memos and their dependency arrays are carried over exactly
 *               as they were. The clock advances once a minute and the table is
 *               rebuilt with it, so widening or narrowing a dependency array here
 *               changes how often forty-nine synthetic scores are regenerated —
 *               which is the difference between a table that holds still and one
 *               whose opponents shuffle under the player's eyes.
 *
 *               `userName` is an argument rather than another store read, because the
 *               screen holds a name the player has typed but not yet saved, and the
 *               table has to place *that* name. The stores it does read are the two
 *               the table is derived from and nothing else.
 *
 *               Extracted verbatim from `app/(tabs)/leagues.tsx`.
 */

import { useMemo } from 'react';

import { today } from '@challenge';
import { arrowsFor, formatRemaining, leagueForArrows, msRemaining, weekOf } from '@league';
import { statsOf, useChallengeStore , arrowsThisWeek, useLeagueStore } from '@state';


/** One row of the weekly table, once it has been scored and ranked. */
export interface LeaderboardEntry {
  id: string;
  rank: number;
  flag: string;
  name: string;
  arrows: number;
  isUser?: boolean;
}

/**
 * The forty-nine opponents, in the order they are seeded.
 *
 * Rank and score are not here on purpose: both fall out of where the player lands,
 * so a fixed roster would be a fixed table, and the point is that the table is the
 * player's own league at their own level.
 */
const LEADERBOARD_ROSTER: Omit<LeaderboardEntry, 'rank' | 'isUser' | 'arrows'>[] = [
  { id: '1', flag: '🇨🇦', name: 'Player02997' },
  { id: '2', flag: '🇺🇸', name: 'AdrianLee' },
  { id: '3', flag: '🇬🇧', name: 'OliviaRoss' },
  { id: '4', flag: '🇪🇬', name: 'UnicornCape' },
  { id: '5', flag: '🌐', name: 'CobaltFern5' },
  { id: '6', flag: '🇮🇪', name: 'LateToGame' },
  { id: '7', flag: '🌐', name: 'OopsIWon' },
  { id: '8', flag: '🇨🇾', name: 'Crispy5' },
  { id: '9', flag: '🇫🇷', name: 'Player07688' },
  { id: '10', flag: '🌐', name: 'X3na' },
  { id: '11', flag: '🇪🇸', name: 'ArrowPro99' },
  { id: '12', flag: '🇩🇪', name: 'MasterNinja' },
  { id: '13', flag: '🇯🇵', name: 'KageRider' },
  { id: '14', flag: '🇧🇷', name: 'SilvaSpeed' },
  { id: '15', flag: '🇦🇺', name: 'OzzyEscape' },
  { id: '16', flag: '🇨🇳', name: 'ChenZen' },
  { id: '17', flag: '🇲🇽', name: 'MateoV' },
  { id: '18', flag: '🇸🇪', name: 'SvenBold' },
  { id: '19', flag: '🇮🇳', name: 'MayaP' },
  { id: '20', flag: '🇷🇺', name: 'ViktorK' },
  { id: '21', flag: '🇰🇷', name: 'ChloeSun' },
  { id: '22', flag: '🇨🇦', name: 'LiamW' },
  { id: '23', flag: '🇺🇸', name: 'SophiaStar' },
  { id: '24', flag: '🇳🇴', name: 'LucasNord' },
  { id: '25', flag: '🇮🇹', name: 'IsabellaB' },
  { id: '26', flag: '🇬🇧', name: 'EthanHunt' },
  { id: '27', flag: '🇦🇪', name: 'AmiraL' },
  { id: '28', flag: '🇿🇦', name: 'NoahZ' },
  { id: '29', flag: '🇳🇱', name: 'EmmaV' },
  { id: '30', flag: '🇳🇿', name: 'OliverQ' },
  { id: '31', flag: '🇸🇬', name: 'ZoeSwift' },
  { id: '32', flag: '🇦🇷', name: 'LeoFire' },
  { id: '33', flag: '🇵🇹', name: 'AriaSky' },
  { id: '34', flag: '🇦🇹', name: 'MaxPower' },
  { id: '35', flag: '🇮🇪', name: 'LilyBloom' },
  { id: '36', flag: '🇭🇰', name: 'KaiStorm' },
  { id: '37', flag: '🇩🇰', name: 'NoraGold' },
  { id: '38', flag: '🇨🇱', name: 'GabrielS' },
  { id: '39', flag: '🇬🇷', name: 'ElenaR' },
  { id: '40', flag: '🇧🇪', name: 'HugoBoss' },
  { id: '41', flag: '🇵🇱', name: 'MilaZen' },
  { id: '42', flag: '🇸🇦', name: 'TariqK' },
  { id: '43', flag: '🇫🇮', name: 'SaraMoon' },
  { id: '44', flag: '🇵🇪', name: 'DiegoR' },
  { id: '45', flag: '🇯🇵', name: 'YukiT' },
  { id: '46', flag: '🇩🇪', name: 'LarsB' },
  { id: '47', flag: '🇹🇷', name: 'FatimaH' },
  { id: '48', flag: '🇪🇸', name: 'CarlosM' },
  { id: '49', flag: '🇺🇦', name: 'AnnaBell' },
];

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
 * The player's league and the weekly table around them.
 *
 * Opponents are scaled into the band above the player's own league entry, so the
 * table always reads as a race rather than as a list of strangers with impossible
 * scores. The player is then merged in and the whole thing ranked, which is why the
 * rows carry their rank rather than being numbered by the caller: the zones drawn
 * between rows sit at fixed ranks, not at fixed positions in the roster.
 */
export function useLeagueBoard({ now, userName }: UseLeagueBoardArgs) {
  const weeks = useLeagueStore((state) => state.weeks);
  const challengeRecords = useChallengeStore((state) => state.records);

  const week = useMemo(() => weekOf(now), [now]);
  const stats = useMemo(
    () => statsOf({ records: challengeRecords }, today()),
    [challengeRecords],
  );

  const userArrows = arrowsFor(arrowsThisWeek({ weeks }, now), stats.won);
  const userLeague = leagueForArrows(userArrows);
  const remainingText = formatRemaining(msRemaining(week, now));

  // Construct dynamic 50-player leaderboard starting from Bronze
  const leaderboardData = useMemo(() => {
    const maxScore =
      userLeague.id === 'bronze'
        ? 380
        : userLeague.id === 'silver'
          ? 1150
          : userLeague.id === 'gold'
            ? 2450
            : userLeague.id === 'ruby'
              ? 4950
              : userLeague.id === 'obsidian'
                ? 8950
                : 15000;

    const minScore = userLeague.entryArrows + 5;

    // Generate 49 opponent scores realistically scaled across league range
    const opponents: LeaderboardEntry[] = LEADERBOARD_ROSTER.map((opp, index) => {
      const ratio = 1 - index / 48;
      const arrows = Math.max(1, Math.round(minScore + ratio * (maxScore - minScore)));
      return {
        ...opp,
        rank: 0,
        arrows,
      };
    });

    const userEntry: LeaderboardEntry = {
      id: 'you',
      rank: 0,
      flag: '🇵🇰',
      name: userName,
      arrows: userArrows,
      isUser: true,
    };

    const combined = [...opponents, userEntry];
    combined.sort((a, b) => b.arrows - a.arrows);

    return combined.map((entry, idx) => ({
      ...entry,
      rank: idx + 1,
    }));
  }, [userArrows, userLeague, userName]);

  return { week, stats, userArrows, userLeague, remainingText, leaderboardData };
}
