/**
 * hintStore.ts — the hint buffer.
 *
 * Purpose:      Track how many hints the player has, and where they came from.
 * Responsibilities:
 *               - Spend and grant hints, persisted.
 * Notes:        There is **no currency in ArrowPath** (GDD §9). Hints are the only
 *               consumable, they cannot be bought, and the only way to earn more
 *               is a rewarded ad.
 *
 *               Fresh installs get `SEED_HINTS` free ones. That exists so the game
 *               is never hard-blocked offline: a player with no connection and an
 *               empty buffer would otherwise be told to watch an ad they cannot
 *               load. Restart is always available as the free alternative, but
 *               being *told* to go online to get unstuck is a bad first hour.
 */

import { create } from 'zustand';

import { loadSlice, saveSlice, STORAGE_KEYS } from '@services/storage';

/** Hints a fresh install starts with. See the note above — this is a UX guarantee. */
export const SEED_HINTS = 3;

/** Hints granted per completed rewarded ad. */
export const HINTS_PER_AD = 1;

interface PersistedHints {
  readonly available: number;
  /** Lifetime counters, for a future stats screen and for tuning the reward size. */
  readonly spent: number;
  readonly earned: number;
}

interface HintState extends PersistedHints {
  readonly hydrated: boolean;
  hydrate: () => Promise<void>;
  /** Spend one. Returns false when the buffer is empty; the caller must not assume. */
  spendHint: () => boolean;
  grantHints: (count?: number) => void;
  resetHints: () => void;
}

const DEFAULTS: PersistedHints = { available: SEED_HINTS, spent: 0, earned: 0 };

function persist(state: PersistedHints): void {
  void saveSlice(STORAGE_KEYS.hints, state);
}

export const useHintStore = create<HintState>((set, get) => ({
  ...DEFAULTS,
  hydrated: false,

  hydrate: async () => {
    const data = await loadSlice<PersistedHints>(STORAGE_KEYS.hints, DEFAULTS);
    set({
      available: Math.max(0, Math.floor(data.available ?? SEED_HINTS)),
      spent: Math.max(0, Math.floor(data.spent ?? 0)),
      earned: Math.max(0, Math.floor(data.earned ?? 0)),
      hydrated: true,
    });
  },

  spendHint: () => {
    const { available, spent } = get();
    if (available <= 0) return false;

    const next: PersistedHints = {
      available: available - 1,
      spent: spent + 1,
      earned: get().earned,
    };
    set(next);
    persist(next);
    return true;
  },

  grantHints: (count = HINTS_PER_AD) => {
    const granted = Math.max(0, Math.floor(count));
    if (granted === 0) return;

    const next: PersistedHints = {
      available: get().available + granted,
      spent: get().spent,
      earned: get().earned + granted,
    };
    set(next);
    persist(next);
  },

  resetHints: () => {
    set(DEFAULTS);
    persist(DEFAULTS);
  },
}));
