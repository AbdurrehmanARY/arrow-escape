/**
 * energyStore.ts — Global Lives & Energy System.
 *
 * Purpose:      Manage global energy hearts (max 5), regenerating 1 heart every
 *               20 minutes (1,200 seconds), with full refill via rewarded ads.
 */

import { create } from 'zustand';
import { loadSlice, saveSlice, STORAGE_KEYS } from '@services/storage';

export const MAX_ENERGY = 5;
export const REGEN_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes in ms

interface PersistedEnergy {
  readonly energy: number;
  readonly lastTimestampMs: number;
}

interface EnergyState extends PersistedEnergy {
  readonly hydrated: boolean;
  hydrate: () => Promise<void>;
  /** Get calculated current energy level accounting for elapsed time. */
  getEnergy: (nowMs?: number) => number;
  /** Seconds until the next heart regenerates (0 if already max energy). */
  secondsUntilNextRegen: (nowMs?: number) => number;
  /** Consume 1 energy heart. Returns true if successful, false if empty. */
  consumeEnergy: (nowMs?: number) => boolean;
  /** Instantly refill energy to MAX_ENERGY (e.g. after watching a rewarded ad). */
  refillEnergy: (nowMs?: number) => void;
  resetEnergy: () => void;
}

const EMPTY: PersistedEnergy = {
  energy: MAX_ENERGY,
  lastTimestampMs: Date.now(),
};

function persist(state: PersistedEnergy): void {
  void saveSlice(STORAGE_KEYS.progress + '_energy', state);
}

function calculateCurrentEnergy(persisted: PersistedEnergy, nowMs: number = Date.now()): { energy: number; lastTimestampMs: number } {
  if (persisted.energy >= MAX_ENERGY) {
    return { energy: MAX_ENERGY, lastTimestampMs: nowMs };
  }

  const elapsedMs = Math.max(0, nowMs - persisted.lastTimestampMs);
  const heartsGained = Math.floor(elapsedMs / REGEN_INTERVAL_MS);

  if (heartsGained <= 0) {
    return persisted;
  }

  const newEnergy = Math.min(MAX_ENERGY, persisted.energy + heartsGained);
  const leftoverMs = elapsedMs % REGEN_INTERVAL_MS;
  const newTimestamp = newEnergy >= MAX_ENERGY ? nowMs : nowMs - leftoverMs;

  return { energy: newEnergy, lastTimestampMs: newTimestamp };
}

export const useEnergyStore = create<EnergyState>((set, get) => ({
  ...EMPTY,
  hydrated: false,

  hydrate: async () => {
    const loaded = await loadSlice<PersistedEnergy>(STORAGE_KEYS.progress + '_energy', EMPTY);
    const updated = calculateCurrentEnergy(loaded);
    set({ ...updated, hydrated: true });
  },

  getEnergy: (nowMs = Date.now()) => {
    const { energy, lastTimestampMs } = get();
    return calculateCurrentEnergy({ energy, lastTimestampMs }, nowMs).energy;
  },

  secondsUntilNextRegen: (nowMs = Date.now()) => {
    const { energy, lastTimestampMs } = get();
    const current = calculateCurrentEnergy({ energy, lastTimestampMs }, nowMs);

    if (current.energy >= MAX_ENERGY) {
      return 0;
    }

    const elapsedMs = Math.max(0, nowMs - current.lastTimestampMs);
    const remainingMs = REGEN_INTERVAL_MS - (elapsedMs % REGEN_INTERVAL_MS);
    return Math.ceil(remainingMs / 1000);
  },

  consumeEnergy: (nowMs = Date.now()) => {
    const current = calculateCurrentEnergy(get(), nowMs);
    if (current.energy <= 0) {
      return false;
    }

    const nextState: PersistedEnergy = {
      energy: current.energy - 1,
      lastTimestampMs: current.energy === MAX_ENERGY ? nowMs : current.lastTimestampMs,
    };

    set(nextState);
    persist(nextState);
    return true;
  },

  refillEnergy: (nowMs = Date.now()) => {
    const nextState: PersistedEnergy = {
      energy: MAX_ENERGY,
      lastTimestampMs: nowMs,
    };
    set(nextState);
    persist(nextState);
  },

  resetEnergy: () => {
    const fresh: PersistedEnergy = {
      energy: MAX_ENERGY,
      lastTimestampMs: Date.now(),
    };
    set(fresh);
    persist(fresh);
  },
}));
