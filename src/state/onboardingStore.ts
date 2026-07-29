/**
 * onboardingStore.ts — which teaching moments the player has already had.
 *
 * Purpose:      Show each piece of first-run guidance exactly once, ever.
 * Responsibilities:
 *               - Track and persist which coach moments have been seen.
 * Notes:        The GDD asks for an *invisible* tutorial — the design teaches, no
 *               text walls (§6). That works when a rule can be inferred from
 *               watching it happen. This one cannot: nothing about a board of
 *               ropes tells you that the arrowhead is what matters, or that the
 *               straight line out from it must be empty. A player who does not
 *               know that reads the whole thing as random.
 *
 *               So this is the smallest honest compromise: one sentence the first
 *               time it is relevant, then never again. Three moments total, each
 *               fired by the situation it explains rather than queued up front.
 *
 *               Kept separate from `settingsStore` because these are not
 *               preferences — the player never chooses them, and they must
 *               survive a settings reset being an entirely different action.
 */

import { create } from 'zustand';

import { loadSlice, saveSlice, STORAGE_KEYS } from '@services/storage';

/** Each one-time moment, fired by the situation it explains. */
export type CoachMoment =
  /** First ever level, before the first tap: what the goal is. */
  | 'welcome'
  /** The first time a tap is blocked: why it failed and what it cost. */
  | 'firstBlock'
  /** The first time hearts run low: that the board is still fine. */
  | 'lowHearts'
  /**
   * The first board carrying a gate: that the coloured squares are doors and the
   * matching arrows are the keys.
   *
   * A gate is the one thing on the board that a player genuinely cannot infer by
   * watching. Everything else about this game rewards looking harder; a closed
   * gate just looks like a wall until the moment it stops being one.
   */
  | 'firstGate'
  /**
   * The first board where clearing a colour *shuts* a gate.
   *
   * The single most important card in the set, because it is the only rule in the
   * game that can cost a player the level without costing them a heart. Meeting
   * that unannounced reads as a bug.
   */
  | 'firstShutter';

interface PersistedOnboarding {
  readonly seen: Partial<Record<CoachMoment, boolean>>;
}

interface OnboardingState extends PersistedOnboarding {
  readonly hydrated: boolean;
  hydrate: () => Promise<void>;
  /** True if this moment still needs showing. */
  shouldShow: (moment: CoachMoment) => boolean;
  markSeen: (moment: CoachMoment) => void;
  /** Used by Settings → Reset, so a reset genuinely starts over. */
  resetOnboarding: () => void;
}

const EMPTY: PersistedOnboarding = { seen: {} };

function persist(state: PersistedOnboarding): void {
  void saveSlice(STORAGE_KEYS.onboarding, state);
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  ...EMPTY,
  hydrated: false,

  hydrate: async () => {
    const data = await loadSlice<PersistedOnboarding>(STORAGE_KEYS.onboarding, EMPTY);
    set({ seen: data.seen ?? {}, hydrated: true });
  },

  shouldShow: (moment) => {
    const { hydrated, seen } = get();
    // Never show anything before the saved state is known, or a returning player
    // gets the welcome card again for a frame on every single launch.
    return hydrated && seen[moment] !== true;
  },

  markSeen: (moment) => {
    if (get().seen[moment] === true) return;
    const next: PersistedOnboarding = { seen: { ...get().seen, [moment]: true } };
    set(next);
    persist(next);
  },

  resetOnboarding: () => {
    set(EMPTY);
    persist(EMPTY);
  },
}));
