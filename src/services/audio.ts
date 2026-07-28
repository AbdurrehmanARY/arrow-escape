/**
 * audio.ts — sound effects and background music.
 *
 * Purpose:      A small, safe wrapper over `expo-audio` so screens can say
 *               `playSfx('release')` without knowing anything about players,
 *               loading, or whether a file exists.
 * Responsibilities:
 *               - Preload and play SFX.
 *               - Loop background music, respecting the settings toggles.
 * Notes:        **Every call is a no-op when the asset is missing.** The audio
 *               files are not in the repo — they are the one part of v0.1 that
 *               cannot be generated — so the game must play perfectly without
 *               them and gain sound the moment they are dropped in. That is why
 *               `SFX_SOURCES` is a lookup that may legitimately return undefined
 *               rather than a hard `require`.
 *
 *               See `assets/audio/README.md` for what to add.
 *
 *               Failures are swallowed by design (TDD §14): a codec problem or a
 *               device with audio focus held by another app must never interrupt
 *               a puzzle.
 */

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import { MUSIC_ASSET, SFX_ASSETS, type SfxName } from './audioAssets';

export type { SfxName };

/** Where a sound lives, or `undefined` if that file has not been added yet. */
const sfxSource = (name: SfxName): number | undefined => SFX_ASSETS[name];

const musicSource = (): number | undefined => MUSIC_ASSET;

const players = new Map<SfxName, AudioPlayer>();
let musicPlayer: AudioPlayer | undefined;
let ready = false;

let sfxEnabled = true;
let musicEnabled = true;

/** Volume per effect, so a swoosh never drowns the win chime. */
const SFX_VOLUME: Record<SfxName, number> = {
  release: 0.5,
  blocked: 0.6,
  win: 0.7,
  fail: 0.6,
  tap: 0.3,
};

/**
 * Prepare the audio session and preload effects.
 *
 * Called once at launch. Safe to call again; later calls do nothing.
 */
export async function initAudio(): Promise<void> {
  if (ready) return;
  ready = true;

  try {
    // Respect the ringer switch and duck rather than seize focus: this is a quiet
    // puzzle game, not something that should stop someone's podcast.
    await setAudioModeAsync({
      playsInSilentMode: false,
      shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers',
    });
  } catch {
    // An audio session we cannot configure is not a reason to fail to launch.
  }

  const names: SfxName[] = ['release', 'blocked', 'win', 'fail', 'tap'];
  for (const name of names) {
    const source = sfxSource(name);
    if (source === undefined) continue;
    try {
      const player = createAudioPlayer(source);
      player.volume = SFX_VOLUME[name];
      players.set(name, player);
    } catch {
      // Skip this effect; the rest still work.
    }
  }
}

/** Mirror the settings toggles into the audio layer. */
export function applyAudioSettings(options: { music: boolean; sfx: boolean }): void {
  sfxEnabled = options.sfx;
  musicEnabled = options.music;

  if (!musicEnabled) {
    stopMusic();
  } else if (musicPlayer === undefined) {
    void startMusic();
  }
}

/** Play a one-shot effect. Silently does nothing if the asset is absent. */
export function playSfx(name: SfxName): void {
  if (!sfxEnabled) return;
  const player = players.get(name);
  if (!player) return;

  try {
    // Rewind first: a second tap during a still-playing effect should retrigger
    // it, not be swallowed.
    player.seekTo(0);
    player.play();
  } catch {
    // A failed effect is not worth interrupting play for.
  }
}

/** Start the looping background track, if there is one. */
export async function startMusic(): Promise<void> {
  if (!musicEnabled || musicPlayer !== undefined) return;

  const source = musicSource();
  if (source === undefined) return;

  try {
    const player = createAudioPlayer(source);
    player.loop = true;
    player.volume = 0.25;
    player.play();
    musicPlayer = player;
  } catch {
    musicPlayer = undefined;
  }
}

export function stopMusic(): void {
  if (!musicPlayer) return;
  try {
    musicPlayer.pause();
    musicPlayer.remove();
  } catch {
    // Nothing useful to do.
  }
  musicPlayer = undefined;
}

/** Release everything. Used when the app is torn down. */
export function disposeAudio(): void {
  stopMusic();
  for (const player of players.values()) {
    try {
      player.remove();
    } catch {
      // Nothing useful to do.
    }
  }
  players.clear();
  ready = false;
}

/** True when at least one sound file was found. Lets Settings explain the silence. */
export function hasAudioAssets(): boolean {
  return players.size > 0 || musicSource() !== undefined;
}
