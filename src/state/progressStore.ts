/**
 * progressStore.ts — which levels are done, and where the player left off.
 *
 * Purpose:      Persistent progress, shared across the menu, level select, and
 *               the game screen.
 * Responsibilities:
 *               - Completed levels and their best result.
 *               - Which level "Play" continues to.
 *               - Hydration from disk on launch.
 * Notes:        Zustand rather than a reducer because three unrelated screens read
 *               this, and it outlives any one of them (TDD §7).
 *
 *               Unlocking is derived, never stored. A stored "highest unlocked"
 *               can drift out of sync with the completed set after a migration or
 *               a partial write, and the failure mode is a player locked out of
 *               levels they have finished. Deriving it cannot drift.
 */

import { create } from 'zustand';

import { loadSlice, saveSlice, STORAGE_KEYS } from '@services/storage';

/** What the player achieved on a level, kept for the level-select badges. */
export interface LevelRecord {
  /** Fewest wrong taps across all clears. 0 means a perfect read. */
  readonly bestMistakes: number;
  /** Hearts left on the best run. */
  readonly bestHeartsLeft: number;
  readonly timesCleared: number;
}

interface PersistedProgress {
  readonly records: Record<number, LevelRecord>;
  readonly lastPlayed: number;
  /** Consecutive levels cleared without a wrong tap. Broken by any mistake. */
  readonly perfectStreak: number;
  readonly bestPerfectStreak: number;
}

interface ProgressState extends PersistedProgress {
  readonly hydrated: boolean;
  hydrate: () => Promise<void>;
  completeLevel: (id: number, mistakes: number, heartsLeft: number) => void;
  setLastPlayed: (id: number) => void;
  resetProgress: () => void;
}

const EMPTY: PersistedProgress = {
  records: {},
  lastPlayed: 1,
  perfectStreak: 0,
  bestPerfectStreak: 0,
};

/** Persist without blocking the caller — saves are not on the critical path. */
function persist(state: PersistedProgress): void {
  void saveSlice(STORAGE_KEYS.progress, state);
}

export const useProgressStore = create<ProgressState>((set, get) => ({
  ...EMPTY,
  hydrated: false,

  hydrate: async () => {
    const data = await loadSlice<PersistedProgress>(STORAGE_KEYS.progress, EMPTY);
    set({
      records: data.records ?? {},
      lastPlayed: data.lastPlayed ?? 1,
      // Defaulted rather than trusted: a save written before streaks existed has
      // neither field, and `undefined + 1` would quietly become NaN forever.
      perfectStreak: data.perfectStreak ?? 0,
      bestPerfectStreak: data.bestPerfectStreak ?? 0,
      hydrated: true,
    });
  },

  completeLevel: (id, mistakes, heartsLeft) => {
    const { records } = get();
    const previous = records[id];

    const next: LevelRecord = {
      bestMistakes: previous ? Math.min(previous.bestMistakes, mistakes) : mistakes,
      bestHeartsLeft: previous ? Math.max(previous.bestHeartsLeft, heartsLeft) : heartsLeft,
      timesCleared: (previous?.timesCleared ?? 0) + 1,
    };

    // A clean read extends the streak; any wrong tap ends it. Replays count, so
    // the streak is a statement about how you are playing *now* rather than a
    // permanent record — which is what makes it worth chasing.
    const perfect = mistakes === 0;
    const perfectStreak = perfect ? get().perfectStreak + 1 : 0;

    const updated: PersistedProgress = {
      records: { ...records, [id]: next },
      lastPlayed: Math.max(get().lastPlayed, id),
      perfectStreak,
      bestPerfectStreak: Math.max(get().bestPerfectStreak, perfectStreak),
    };
    set(updated);
    persist(updated);
  },

  setLastPlayed: (id) => {
    const updated: PersistedProgress = {
      records: get().records,
      lastPlayed: id,
      perfectStreak: get().perfectStreak,
      bestPerfectStreak: get().bestPerfectStreak,
    };
    set(updated);
    persist(updated);
  },

  resetProgress: () => {
    set(EMPTY);
    persist(EMPTY);
  },
}));

// ---------------------------------------------------------------------------
// Derived selectors
// ---------------------------------------------------------------------------

/** Has this level been cleared at least once? */
export function isCleared(records: Record<number, LevelRecord>, id: number): boolean {
  return (records[id]?.timesCleared ?? 0) > 0;
}

/**
 * The highest level the player may open.
 *
 * Derived from the completed set: level 1 is always open, and level N opens once
 * N-1 is cleared. Nothing to keep in sync, so nothing to drift.
 */
export function highestUnlocked(records: Record<number, LevelRecord>, total: number): number {
  let unlocked = 1;
  while (unlocked < total && isCleared(records, unlocked)) unlocked += 1;
  return unlocked;
}

/** Where the "Play" button should go: the first level not yet cleared. */
export function nextLevel(records: Record<number, LevelRecord>, total: number): number {
  for (let id = 1; id <= total; id += 1) {
    if (!isCleared(records, id)) return id;
  }
  return total;
}

/** How many levels have been cleared. Drives the menu's progress line. */
export function clearedCount(records: Record<number, LevelRecord>): number {
  return Object.values(records).filter((record) => record.timesCleared > 0).length;
}

/** Levels cleared without a single wrong tap. The mark of a clean read. */
export function perfectCount(records: Record<number, LevelRecord>): number {
  return Object.values(records).filter(
    (record) => record.timesCleared > 0 && record.bestMistakes === 0,
  ).length;
}

/** Levels cleared, split by how well. Drives the stats screen. */
export function clearedByQuality(records: Record<number, LevelRecord>): {
  perfect: number;
  clean: number;
  scraped: number;
} {
  let perfect = 0;
  let clean = 0;
  let scraped = 0;

  for (const record of Object.values(records)) {
    if (record.timesCleared === 0) continue;
    if (record.bestMistakes === 0) perfect += 1;
    else if (record.bestMistakes <= 2) clean += 1;
    else scraped += 1;
  }

  return { perfect, clean, scraped };
}

/** Total wrong taps ever made across best runs. An honest measure of the journey. */
export function totalMistakes(records: Record<number, LevelRecord>): number {
  return Object.values(records).reduce(
    (sum, record) => sum + (record.timesCleared > 0 ? record.bestMistakes : 0),
    0,
  );
}
