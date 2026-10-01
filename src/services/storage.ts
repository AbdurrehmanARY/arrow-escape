/**
 * storage.ts — the only place the app touches the disk.
 *
 * Purpose:      Load and save the player's progress, settings, and hints, safely.
 * Responsibilities:
 *               - A versioned save envelope with migration.
 *               - Read/write helpers that never throw.
 * Notes:        Corruption-safe by design (TDD §9). A save that fails to parse,
 *               is from a future version, or is half-written falls back to a fresh
 *               default rather than crashing on launch. Losing progress is bad;
 *               an app that will not open is worse, and unrecoverable without a
 *               reinstall.
 *
 *               Writes are fire-and-forget with a caught rejection: a failed save
 *               must never interrupt play. The next meaningful event will write
 *               again anyway.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

/** Bump when the shape of a persisted slice changes, and add a migration below. */
export const SAVE_VERSION = 1;

const KEY_PREFIX = 'arrowpath:v1:';

export interface SaveEnvelope<T> {
  readonly version: number;
  readonly data: T;
}

/**
 * What the player achieved on one level, as persisted.
 *
 * Purpose:      This is the *shape on disk*, so it belongs to the layer that owns
 *               disk — not to the store that happens to write it.
 * Why here:     `sync.ts` needs this type to merge two devices' progress, and the
 *               service layer must never import from `state/`. When the type lived
 *               in `progressStore`, `sync.ts` -> `state/progressStore` and
 *               `progressStore` -> `sync.ts` formed a cycle (type-only, so no
 *               runtime bug, but an inverted dependency all the same). Owning it
 *               here means `sync.ts` depends downward only, permanently.
 * Note:        `progressStore` re-exports it, so every existing import of
 *               `LevelRecord` from `@state` keeps working unchanged.
 */
export interface LevelRecord {
  /** Fewest wrong taps across all clears. 0 means a perfect read. */
  readonly bestMistakes: number;
  /** Hearts left on the best run. */
  readonly bestHeartsLeft: number;
  readonly timesCleared: number;
}

/** Dev-only logging, so a storage hiccup is visible in development and silent in production. */
function warn(message: string, error: unknown): void {
  if (__DEV__) {
    console.warn(`[storage] ${message}`, error);
  }
}

/**
 * Read a slice, falling back to `fallback` on absence, corruption, or a version
 * this build does not understand.
 */
export async function loadSlice<T>(
  key: string,
  fallback: T,
  migrate?: (version: number, data: unknown) => T | undefined,
): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + key);
    if (raw === null) return fallback;

    const parsed = JSON.parse(raw) as Partial<SaveEnvelope<T>>;
    if (typeof parsed !== 'object' || parsed === null) return fallback;
    if (typeof parsed.version !== 'number') return fallback;

    if (parsed.version === SAVE_VERSION) {
      return (parsed.data as T) ?? fallback;
    }

    // A save from a *newer* build cannot be understood and must not be guessed at.
    if (parsed.version > SAVE_VERSION) return fallback;

    const migrated = migrate?.(parsed.version, parsed.data);
    return migrated ?? fallback;
  } catch (error) {
    warn(`could not read "${key}", starting fresh`, error);
    return fallback;
  }
}

/** Write a slice. Never throws — a failed save must not interrupt play. */
export async function saveSlice<T>(key: string, data: T): Promise<void> {
  try {
    const envelope: SaveEnvelope<T> = { version: SAVE_VERSION, data };
    await AsyncStorage.setItem(KEY_PREFIX + key, JSON.stringify(envelope));
  } catch (error) {
    warn(`could not write "${key}"`, error);
  }
}

/** Wipe everything this app has stored. Used by Settings → Reset progress. */
export async function clearAll(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((key) => key.startsWith(KEY_PREFIX));
    if (ours.length > 0) await AsyncStorage.multiRemove(ours);
  } catch (error) {
    warn('could not clear saved data', error);
  }
}

export const STORAGE_KEYS = {
  progress: 'progress',
  settings: 'settings',
  hints: 'hints',
  onboarding: 'onboarding',
  challenges: 'challenges',
  league: 'league',
  streak: 'streak',
} as const;
