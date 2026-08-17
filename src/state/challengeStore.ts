/**
 * challengeStore.ts — daily challenge results, kept across launches.
 *
 * Purpose:      Persist one best result per day, and expose the derived numbers
 *               the Challenge screens show.
 * Responsibilities:
 *               - Hydrate records from disk on launch.
 *               - Record a finished attempt, keeping only the better of the two.
 *               - Expose stats as selectors, never as stored fields.
 * Notes:        Mirrors `progressStore` deliberately — same shape, same
 *               fire-and-forget persistence, same "derive, never store" rule for
 *               anything computable (decision 20). A stored streak drifts, and a
 *               drifted streak either robs a player of a reward or hands them one
 *               they did not earn.
 *
 *               **Built for a server that does not exist yet.** Records are keyed
 *               by `YYYY-MM-DD`, so two devices writing the same day produce rows
 *               with the same primary key and merging is a comparison rather than a
 *               reconciliation. `syncedAt` is present and always null for now;
 *               adding it later would mean migrating every stored record.
 */

import { create } from 'zustand';

import {
  challengeId,
  challengeStats,
  isBetter,
  today,
  type ChallengeDate,
  type ChallengeId,
  type ChallengeRecord,
  type ChallengeStats,
} from '@challenge';
import { loadSlice, saveSlice, STORAGE_KEYS } from '@services/storage';
import { syncChallenges } from '@services/sync';

interface PersistedChallenges {
  /** Keyed by `YYYY-MM-DD`. An object rather than a Map, so it serialises. */
  readonly records: Record<ChallengeId, ChallengeRecord>;
}

interface ChallengeState extends PersistedChallenges {
  readonly hydrated: boolean;
  hydrate: () => Promise<void>;
  /** Store a finished attempt. Silently ignored if the stored one is better. */
  recordResult: (record: ChallengeRecord) => void;
  resetChallenges: () => void;
  /** Merge the day records with the account's copy. Never throws, never blocks. */
  pullAndPush: () => Promise<void>;
}

const EMPTY: PersistedChallenges = { records: {} };

/** Persist without blocking the caller — saves are not on the critical path. */
function persist(state: PersistedChallenges): void {
  void saveSlice(STORAGE_KEYS.challenges, state);
}

export const useChallengeStore = create<ChallengeState>((set, get) => ({
  ...EMPTY,
  hydrated: false,

  hydrate: async () => {
    const loaded = await loadSlice<PersistedChallenges>(STORAGE_KEYS.challenges, EMPTY);
    set({ ...loaded, hydrated: true });
  },

  recordResult: (record) => {
    const { records } = get();
    // A repeat play may only improve the day. Letting a worse second attempt
    // overwrite a win turns the calendar into a record of the last thing you did
    // rather than the best thing.
    if (!isBetter(record, records[record.id])) return;

    const next = { records: { ...records, [record.id]: record } };
    set(next);
    persist(next);
  },

  resetChallenges: () => {
    set(EMPTY);
    persist(EMPTY);
  },

  pullAndPush: async () => {
    const merged = await syncChallenges(get().records);
    if (!merged) return;
    set({ records: merged });
    persist({ records: merged });
  },
}));

// ---------------------------------------------------------------------------
// Selectors. Derived on read so nothing can drift out of sync with the records.
// ---------------------------------------------------------------------------

/** The stored result for a day, if it has been played. */
export function recordFor(
  state: Pick<ChallengeState, 'records'>,
  date: ChallengeDate,
): ChallengeRecord | undefined {
  return state.records[challengeId(date)];
}

/** Whether a day has been cleared. */
export function isDayWon(state: Pick<ChallengeState, 'records'>, date: ChallengeDate): boolean {
  return state.records[challengeId(date)]?.outcome === 'won';
}

/** Every headline number, recomputed from the records. */
export function statsOf(
  state: Pick<ChallengeState, 'records'>,
  from: ChallengeDate = today(),
): ChallengeStats {
  return challengeStats(new Map(Object.entries(state.records)), from);
}

/** Records for one month, newest first. Used by the history screen. */
export function recordsForMonth(
  state: Pick<ChallengeState, 'records'>,
  year: number,
  month: number,
): readonly ChallengeRecord[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  return Object.values(state.records)
    .filter((record) => record.id.startsWith(prefix))
    .sort((a, b) => b.id.localeCompare(a.id));
}
