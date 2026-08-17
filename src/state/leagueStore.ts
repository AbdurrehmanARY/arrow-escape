/**
 * leagueStore.ts — arrows collected, week by week.
 *
 * Purpose:      Keep the running score a league standing is built from.
 * Notes:        **Stored per week, not as a running total.** A league resets every
 *               Monday, so a single lifetime counter could not answer the only
 *               question the screen asks. Keying by week id also means a late sync
 *               can attribute arrows to the week they were actually earned in
 *               rather than the week they arrived.
 *
 *               **Arrows are counted when a level is cleared for the first time**,
 *               and never again. Replaying a cleared board must not farm score —
 *               otherwise the leaderboard measures patience rather than skill, and
 *               the easiest levels become the most efficient ones to grind.
 *
 *               Old weeks are pruned. A player who opens the app daily for two years
 *               would otherwise accumulate a hundred dead rows in a file read on
 *               every launch, and nothing above `HISTORY_WEEKS` is ever displayed.
 */

import { create } from 'zustand';

import { weekOf } from '@league';
import { loadSlice, saveSlice, STORAGE_KEYS } from '@services/storage';
import { syncLeague } from '@services/sync';

/** How many past weeks to keep. Enough for a history view, small enough to stay cheap. */
const HISTORY_WEEKS = 12;

interface PersistedLeague {
  /** Arrows earned, keyed by week id (`2026-W32`). */
  readonly weeks: Record<string, number>;
  /** Level ids already counted, so a replay cannot be farmed. */
  readonly counted: readonly number[];
}

interface LeagueState extends PersistedLeague {
  readonly hydrated: boolean;
  hydrate: () => Promise<void>;
  /** Record a first-time clear. Ignored if this level has already been counted. */
  addClear: (levelId: number, arrows: number, atMs: number) => void;
  /** Record a challenge win, which is worth its bonus rather than its arrows. */
  addChallengeWin: (atMs: number) => void;
  resetLeague: () => void;
  /**
   * Push this week's arrows to the account.
   *
   * Only the current week is sent. Past weeks are already settled — a league that
   * has ended cannot change — and re-uploading twelve of them on every clear would
   * be twelve writes to say nothing.
   */
  pushWeek: (atMs: number) => Promise<void>;
}

const EMPTY: PersistedLeague = { weeks: {}, counted: [] };

/** Bonus arrows for a daily challenge. Mirrors `arrowsFor` in the domain. */
const CHALLENGE_BONUS = 250;

function persist(state: PersistedLeague): void {
  void saveSlice(STORAGE_KEYS.league, state);
}

/** Drop everything older than `HISTORY_WEEKS`, newest kept. */
function prune(weeks: Record<string, number>): Record<string, number> {
  const ids = Object.keys(weeks).sort().reverse().slice(0, HISTORY_WEEKS);
  const out: Record<string, number> = {};
  for (const id of ids) out[id] = weeks[id]!;
  return out;
}

export const useLeagueStore = create<LeagueState>((set, get) => ({
  ...EMPTY,
  hydrated: false,

  hydrate: async () => {
    const loaded = await loadSlice<PersistedLeague>(STORAGE_KEYS.league, EMPTY);
    set({ ...loaded, hydrated: true });
  },

  addClear: (levelId, arrows, atMs) => {
    const { counted, weeks } = get();
    // First clear only. A replay earns nothing, so the board that is quickest to
    // beat never becomes the best way to climb.
    if (counted.includes(levelId)) return;

    const id = weekOf(atMs).id;
    const next: PersistedLeague = {
      weeks: prune({ ...weeks, [id]: (weeks[id] ?? 0) + arrows }),
      counted: [...counted, levelId],
    };
    set(next);
    persist(next);
  },

  addChallengeWin: (atMs) => {
    const { weeks, counted } = get();
    const id = weekOf(atMs).id;
    const next: PersistedLeague = {
      weeks: prune({ ...weeks, [id]: (weeks[id] ?? 0) + CHALLENGE_BONUS }),
      counted,
    };
    set(next);
    persist(next);
  },

  resetLeague: () => {
    set(EMPTY);
    persist(EMPTY);
  },

  pushWeek: async (atMs) => {
    const id = weekOf(atMs).id;
    const mine = get().weeks[id] ?? 0;
    const best = await syncLeague(id, mine);

    // The server may hold more than this device does — another device, or the
    // same one before a reinstall. Take the higher back so the two agree.
    if (best !== undefined && best > mine) {
      const next: PersistedLeague = {
        weeks: { ...get().weeks, [id]: best },
        counted: get().counted,
      };
      set(next);
      persist(next);
    }
  },
}));

/** Arrows earned in the week containing `atMs`. */
export function arrowsThisWeek(
  state: Pick<LeagueState, 'weeks'>,
  atMs: number,
): number {
  return state.weeks[weekOf(atMs).id] ?? 0;
}

/** Every recorded week, newest first. For a future history view. */
export function weekHistory(
  state: Pick<LeagueState, 'weeks'>,
): readonly { id: string; arrows: number }[] {
  return Object.entries(state.weeks)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([id, arrows]) => ({ id, arrows }));
}
