/**
 * streakStore.ts — 7-day progressive daily reward streak.
 *
 * Purpose:      Reward consecutive daily visits with escalating rewards
 *               (League Arrows, Free Hints, Golden Chest).
 */

import { create } from 'zustand';
import { loadSlice, saveSlice, STORAGE_KEYS } from '@services/storage';
import { useHintStore } from './hintStore';
import { useLeagueStore } from './leagueStore';

export interface StreakReward {
  readonly day: number;
  readonly arrows: number;
  readonly hints: number;
  readonly isGoldenChest?: boolean;
}

export const STREAK_REWARDS: readonly StreakReward[] = [
  { day: 1, arrows: 50, hints: 0 },
  { day: 2, arrows: 0, hints: 1 },
  { day: 3, arrows: 100, hints: 0 },
  { day: 4, arrows: 0, hints: 2 },
  { day: 5, arrows: 200, hints: 0 },
  { day: 6, arrows: 0, hints: 3 },
  { day: 7, arrows: 500, hints: 5, isGoldenChest: true },
];

interface PersistedStreak {
  /** Day number (1–7) currently active. */
  readonly currentDay: number;
  /** ISO date string (YYYY-MM-DD) when the reward was last claimed. */
  readonly lastClaimedDate: string | null;
}

interface StreakState extends PersistedStreak {
  readonly hydrated: boolean;
  hydrate: () => Promise<void>;
  /** Check if today's reward can be claimed. */
  canClaimToday: (todayIso?: string) => boolean;
  /** Claim today's daily streak reward. Returns reward claimed or null if already claimed today. */
  claimToday: (todayIso?: string) => StreakReward | null;
  resetStreak: () => void;
}

const EMPTY: PersistedStreak = {
  currentDay: 1,
  lastClaimedDate: null,
};

function getTodayString(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function persist(state: PersistedStreak): void {
  void saveSlice(STORAGE_KEYS.streak, state);
}

export const useStreakStore = create<StreakState>((set, get) => ({
  ...EMPTY,
  hydrated: false,

  hydrate: async () => {
    const loaded = await loadSlice<PersistedStreak>(STORAGE_KEYS.streak, EMPTY);
    set({ ...loaded, hydrated: true });
  },

  canClaimToday: (todayIso = getTodayString()) => {
    const { lastClaimedDate } = get();
    return lastClaimedDate !== todayIso;
  },

  claimToday: (todayIso = getTodayString()) => {
    const { currentDay, lastClaimedDate } = get();

    if (lastClaimedDate === todayIso) {
      return null;
    }

    const reward = STREAK_REWARDS.find((r) => r.day === currentDay) ?? STREAK_REWARDS[0]!;

    // Grant rewards
    if (reward.hints > 0) {
      useHintStore.getState().grantHints(reward.hints);
    }
    if (reward.arrows > 0) {
      useLeagueStore.getState().addBonusPoints(reward.arrows);
    }

    const nextDay = currentDay >= 7 ? 1 : currentDay + 1;
    const nextState: PersistedStreak = {
      currentDay: nextDay,
      lastClaimedDate: todayIso,
    };

    set(nextState);
    persist(nextState);

    return reward;
  },

  resetStreak: () => {
    set(EMPTY);
    persist(EMPTY);
  },
}));
