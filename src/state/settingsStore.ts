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
  /**
   * Music and effects on/off.
   *
   * Kept alongside the volumes rather than folded into them, because a mute and a
   * volume of zero are different intentions: someone who mutes music and unmutes
   * it later expects their level back, not silence.
   */
  readonly music: boolean;
  readonly sfx: boolean;
  /** 0..1. Scales everything, including the category volumes below. */
  readonly masterVolume: number;
  readonly musicVolume: number;
  readonly sfxVolume: number;
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
  toggle: (
    key: 'music' | 'sfx' | 'haptics' | 'reducedMotion' | 'confirmRestart' | 'assist',
  ) => void;
  resetSettings: () => void;
}

const DEFAULTS: PersistedSettings = {
  music: true,
  sfx: true,
  // Music sits under effects by default: it plays continuously, and a bed at the
  // same level as the sounds it is meant to sit behind is the commonest way a
  // mobile game ends up muted entirely.
  masterVolume: 1,
  musicVolume: 0.7,
  sfxVolume: 1,
  haptics: true,
  reducedMotion: false,
  confirmRestart: true,
  assist: false,
  themeId: DEFAULT_THEME_ID,
};

function persist(state: PersistedSettings): void {
  void saveSlice(STORAGE_KEYS.settings, state);
}

/**
 * A saved volume, or the default.
 *
 * Clamped rather than trusted: a save written by another build, or edited by hand,
 * must not be able to set a gain above one — that is where clipping comes from,
 * and it would be baked into the player's settings with no obvious way back.
 */
function volume(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback;
}

/** Strip anything unknown, so a save from another build cannot inject a bad value. */
function sanitise(data: PersistedSettings): PersistedSettings {
  return {
    music: Boolean(data.music),
    sfx: Boolean(data.sfx),
    masterVolume: volume(data.masterVolume, DEFAULTS.masterVolume),
    musicVolume: volume(data.musicVolume, DEFAULTS.musicVolume),
    sfxVolume: volume(data.sfxVolume, DEFAULTS.sfxVolume),
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
    const {
      hydrated: _hydrated,
      hydrate: _h,
      set: _s,
      toggle: _t,
      resetSettings: _r,
      ...rest
    } = get();
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
