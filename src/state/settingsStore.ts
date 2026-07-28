/**
 * settingsStore.ts — player preferences.
 *
 * Purpose:      Everything the player can change about how the game behaves or
 *               looks, persisted across launches.
 * Responsibilities:
 *               - Audio, motion, haptics, assist, confirmation, and theme.
 * Notes:        Theme lives here rather than in a separate store because it is a
 *               preference like any other, and because Settings is the only screen
 *               that writes it.
 *
 *               Defaults are chosen so a fresh install is pleasant and quiet:
 *               sound on but modest, motion on, assist off. Assist off matters —
 *               it highlights every safe arrow, which removes most of the
 *               challenge, so it must be something a player opts into.
 */

import { create } from 'zustand';

import { loadSlice, saveSlice, STORAGE_KEYS } from '@services/storage';
import { DEFAULT_THEME_ID } from '@theme';

interface PersistedSettings {
  readonly music: boolean;
  readonly sfx: boolean;
  readonly haptics: boolean;
  /** Swap animations for instant state changes. Accessibility and low-end perf. */
  readonly reducedMotion: boolean;
  /** Ask before restarting a level in progress. */
  readonly confirmRestart: boolean;
  /** Permanently highlight every arrow that can leave. Makes levels much easier. */
  readonly assist: boolean;
  readonly themeId: string;
}

interface SettingsState extends PersistedSettings {
  readonly hydrated: boolean;
  hydrate: () => Promise<void>;
  set: <K extends keyof PersistedSettings>(key: K, value: PersistedSettings[K]) => void;
  toggle: (key: 'music' | 'sfx' | 'haptics' | 'reducedMotion' | 'confirmRestart' | 'assist') => void;
  resetSettings: () => void;
}

const DEFAULTS: PersistedSettings = {
  music: true,
  sfx: true,
  haptics: true,
  reducedMotion: false,
  confirmRestart: true,
  assist: false,
  themeId: DEFAULT_THEME_ID,
};

function persist(state: PersistedSettings): void {
  void saveSlice(STORAGE_KEYS.settings, state);
}

/** Strip anything unknown, so a save from another build cannot inject a bad value. */
function sanitise(data: PersistedSettings): PersistedSettings {
  return {
    music: Boolean(data.music),
    sfx: Boolean(data.sfx),
    haptics: Boolean(data.haptics),
    reducedMotion: Boolean(data.reducedMotion),
    confirmRestart: Boolean(data.confirmRestart),
    assist: Boolean(data.assist),
    themeId: typeof data.themeId === 'string' ? data.themeId : DEFAULT_THEME_ID,
  };
}

export const useSettingsStore = create<SettingsState>((setState, get) => ({
  ...DEFAULTS,
  hydrated: false,

  hydrate: async () => {
    const data = await loadSlice<PersistedSettings>(STORAGE_KEYS.settings, DEFAULTS);
    setState({ ...sanitise(data), hydrated: true });
  },

  set: (key, value) => {
    setState({ [key]: value } as Pick<PersistedSettings, typeof key>);
    const { hydrated: _hydrated, hydrate: _h, set: _s, toggle: _t, resetSettings: _r, ...rest } = get();
    persist({ ...rest, [key]: value });
  },

  toggle: (key) => {
    get().set(key, !get()[key]);
  },

  resetSettings: () => {
    setState(DEFAULTS);
    persist(DEFAULTS);
  },
}));
