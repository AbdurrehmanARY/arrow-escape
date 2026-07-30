/**
 * audio.ts — sound effects and background music.
 *
 * Purpose:      A small, safe wrapper over `expo-audio` so screens can say
 *               `playSfx('heartLost')` without knowing anything about players,
 *               loading, mixing, or whether a file exists.
 * Responsibilities:
 *               - Preload, cache and play one-shot effects.
 *               - Cross-fade between music beds, and play stings over them.
 *               - Apply the player's volume settings to both.
 * Notes:        **Every call is a no-op when the asset is missing.** The audio
 *               files are not in the repo — they are the one part of this game
 *               that cannot be generated — so it must play perfectly without them
 *               and gain sound the moment they are dropped in. That is why
 *               `SFX_ASSETS` is a lookup that may legitimately return undefined
 *               rather than a hard `require`. See `audioAssets.ts`.
 *
 *               Failures are swallowed by design (TDD §14): a codec problem, or a
 *               device with audio focus held by another app, must never interrupt
 *               a puzzle.
 *
 *               Three things here are about *quality* rather than function, and
 *               each exists because its absence is audible:
 *
 *               - **Voice limiting.** The same effect retriggering many times in a
 *                 few milliseconds is how a tap sound turns into a buzz. See
 *                 `RETRIGGER_GAP_MS`.
 *               - **Fades.** Music that starts and stops abruptly announces itself;
 *                 a short ramp is the difference between a soundtrack and a switch.
 *               - **Caching.** Players are created once and reused, so the first
 *                 tap of a session costs no more than the hundredth.
 */

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import {
  LOOPING_TRACKS,
  MUSIC_ASSETS,
  MUSIC_GAIN,
  SFX_ASSETS,
  SFX_GAIN,
  type MusicTrack,
  type SfxName,
} from './audioAssets';

export type { SfxName, MusicTrack };

/**
 * How the player's settings scale the mix.
 *
 * Master multiplies everything; the category volumes multiply their own half. A
 * mute is kept separate from a volume of zero on purpose — someone who mutes music
 * and later unmutes it expects their level back, not silence.
 */
export interface AudioSettings {
  readonly masterVolume: number;
  readonly musicVolume: number;
  readonly sfxVolume: number;
  readonly musicMuted: boolean;
  readonly sfxMuted: boolean;
}

const DEFAULT_SETTINGS: AudioSettings = {
  masterVolume: 1,
  musicVolume: 0.7,
  sfxVolume: 1,
  musicMuted: false,
  sfxMuted: false,
};

/**
 * Shortest gap between two plays of the *same* effect.
 *
 * Below this the second play is dropped. Two copies of one short sound a few
 * milliseconds apart do not sound like two events — they sound like one distorted
 * event, because the waveforms sum and clip. This game can produce that easily:
 * several arrows may be leaving at once, and a player can tap faster than a sound
 * is long. Different effects are never limited against each other.
 */
const RETRIGGER_GAP_MS = 45;

/** Music fade duration, and how often the ramp is stepped. */
const FADE_MS = 600;
const FADE_STEP_MS = 40;

/** How long a sting keeps the bed ducked before it is brought back up. */
const STING_DUCK_MS = 1400;

const sfxPlayers = new Map<SfxName, AudioPlayer>();
const lastPlayedAt = new Map<SfxName, number>();

interface MusicVoice {
  readonly track: MusicTrack;
  readonly player: AudioPlayer;
  /** Timer driving the current fade, so a new fade can cancel it. */
  fade?: ReturnType<typeof setInterval> | undefined;
}

let bed: MusicVoice | undefined;
let sting: MusicVoice | undefined;
let settings: AudioSettings = DEFAULT_SETTINGS;
let ready = false;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** Final gain for an effect: its own mix level, scaled by what the player chose. */
function sfxVolumeFor(name: SfxName): number {
  if (settings.sfxMuted) return 0;
  return clamp01(SFX_GAIN[name] * settings.sfxVolume * settings.masterVolume);
}

/** Final gain for a track. */
function musicVolumeFor(track: MusicTrack): number {
  if (settings.musicMuted) return 0;
  return clamp01(MUSIC_GAIN[track] * settings.musicVolume * settings.masterVolume);
}

/**
 * Prepare the audio session and preload every effect that has a file.
 *
 * Called once at launch, and safe to call again. Preloading matters more than it
 * looks: creating a player on first use puts a decode on the critical path of the
 * very first tap, which is exactly where latency is noticed.
 */
export async function initAudio(): Promise<void> {
  if (ready) return;
  ready = true;

  try {
    // Respect the ringer switch and mix rather than seize focus: this is a quiet
    // puzzle game, not something that should stop someone's podcast.
    await setAudioModeAsync({
      playsInSilentMode: false,
      shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers',
    });
  } catch {
    // An audio session we cannot configure is not a reason to fail to launch.
  }

  for (const key of Object.keys(SFX_ASSETS) as SfxName[]) {
    const source = SFX_ASSETS[key];
    if (source === undefined) continue;
    try {
      const player = createAudioPlayer(source);
      player.volume = sfxVolumeFor(key);
      sfxPlayers.set(key, player);
    } catch {
      // Skip this effect; the rest still work.
    }
  }
}

/**
 * Mirror the settings into the audio layer.
 *
 * Applied to live players immediately, so changing a volume is audible at once
 * rather than on the next sound.
 */
export function applyAudioSettings(next: Partial<AudioSettings>): void {
  settings = { ...settings, ...next };

  for (const [name, player] of sfxPlayers) {
    try {
      player.volume = sfxVolumeFor(name);
    } catch {
      // A player that will not take a volume is not worth failing over.
    }
  }

  for (const voice of [bed, sting]) {
    if (!voice) continue;
    try {
      voice.player.volume = musicVolumeFor(voice.track);
    } catch {
      // As above.
    }
  }
}

/** The settings currently in force. Exposed for tests and for Settings copy. */
export function audioSettings(): AudioSettings {
  return settings;
}

/**
 * Play a one-shot effect.
 *
 * Silently does nothing if the asset is absent, if effects are muted, or if this
 * same effect fired moments ago — see `RETRIGGER_GAP_MS`.
 */
export function playSfx(name: SfxName): void {
  if (settings.sfxMuted || settings.masterVolume <= 0 || settings.sfxVolume <= 0) return;

  const player = sfxPlayers.get(name);
  if (!player) return;

  const now = Date.now();
  if (now - (lastPlayedAt.get(name) ?? 0) < RETRIGGER_GAP_MS) return;
  lastPlayedAt.set(name, now);

  try {
    player.volume = sfxVolumeFor(name);
    // Rewind first: a second tap after the gap should retrigger the sound, not be
    // swallowed because the player is already past its start.
    player.seekTo(0);
    player.play();
  } catch {
    // A failed effect is not worth interrupting play for.
  }
}

/** Ramp a voice to a target volume, then optionally dispose of it. */
function fadeTo(voice: MusicVoice, target: number, onDone?: () => void): void {
  if (voice.fade) clearInterval(voice.fade);

  let current: number;
  try {
    current = voice.player.volume;
  } catch {
    current = target;
  }

  const steps = Math.max(1, Math.round(FADE_MS / FADE_STEP_MS));
  const delta = (target - current) / steps;
  let remaining = steps;

  voice.fade = setInterval(() => {
    remaining -= 1;
    current = remaining <= 0 ? target : current + delta;
    try {
      voice.player.volume = clamp01(current);
    } catch {
      remaining = 0;
    }
    if (remaining <= 0) {
      if (voice.fade) clearInterval(voice.fade);
      voice.fade = undefined;
      onDone?.();
    }
  }, FADE_STEP_MS);
}

function disposeVoice(voice: MusicVoice): void {
  if (voice.fade) clearInterval(voice.fade);
  try {
    voice.player.pause();
    voice.player.remove();
  } catch {
    // Nothing useful to do.
  }
}

/**
 * Switch the background bed, cross-fading from whatever is playing.
 *
 * Asking for the track already playing does nothing, which is what lets a screen
 * call this on mount without thinking about it — the menu says "play menu" and the
 * play screen says "play gameplay", and moving between them repeatedly does not
 * restart anything.
 */
export function playMusic(track: MusicTrack): void {
  if (bed?.track === track) return;

  const source = MUSIC_ASSETS[track];
  if (source === undefined) {
    // No file for the new track: fade the old one out rather than cutting it, so a
    // partially-scored game still behaves.
    stopMusic();
    return;
  }

  const previous = bed;
  try {
    const player = createAudioPlayer(source);
    player.loop = LOOPING_TRACKS.has(track);
    player.volume = 0;
    player.play();
    bed = { track, player };
    fadeTo(bed, musicVolumeFor(track));
  } catch {
    bed = undefined;
    return;
  }

  if (previous) fadeTo(previous, 0, () => disposeVoice(previous));
}

/**
 * Play a one-shot musical sting over the bed — victory or failure.
 *
 * The bed ducks rather than stopping, so the moment lands without the hole a hard
 * stop would leave behind it.
 */
export function playSting(track: MusicTrack): void {
  const source = MUSIC_ASSETS[track];
  if (source === undefined) return;

  if (sting) disposeVoice(sting);

  try {
    const player = createAudioPlayer(source);
    player.loop = false;
    player.volume = musicVolumeFor(track);
    player.play();
    sting = { track, player };
  } catch {
    sting = undefined;
    return;
  }

  if (bed) {
    const ducked = bed;
    fadeTo(ducked, musicVolumeFor(ducked.track) * 0.25, () => {
      setTimeout(() => {
        // Only if it is still the current bed — the player may have left the screen.
        if (bed === ducked) fadeTo(ducked, musicVolumeFor(ducked.track));
      }, STING_DUCK_MS);
    });
  }
}

/** Fade the bed out and release it. */
export function stopMusic(): void {
  const current = bed;
  bed = undefined;
  if (current) fadeTo(current, 0, () => disposeVoice(current));
}

/** Release everything. Used when the app is torn down. */
export function disposeAudio(): void {
  if (bed) disposeVoice(bed);
  if (sting) disposeVoice(sting);
  bed = undefined;
  sting = undefined;

  for (const player of sfxPlayers.values()) {
    try {
      player.remove();
    } catch {
      // Nothing useful to do.
    }
  }
  sfxPlayers.clear();
  lastPlayedAt.clear();
  ready = false;
}

/**
 * True when at least one audio file was found.
 *
 * Lets Settings explain the silence rather than showing controls that appear
 * broken — a volume control that does nothing is worse than one labelled as
 * waiting for assets.
 */
export function hasAudioAssets(): boolean {
  return sfxPlayers.size > 0 || Object.keys(MUSIC_ASSETS).length > 0;
}
