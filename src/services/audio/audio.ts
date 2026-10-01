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
import { clamp01, fadeTo } from './audioFades';
import { triggerHapticForSfx } from '../haptics';

import {
  LOOPING_TRACKS,
  MUSIC_ASSETS,
  MUSIC_GAIN,
  SFX_ASSETS,
  SFX_GAIN,
  VOICE_ASSETS,
  VOICE_GAIN,
  type MusicTrack,
  type SfxName,
  type VoiceName,
} from './audioAssets';

export type { SfxName, MusicTrack, VoiceName };

/**
 * How the player's settings scale the mix.
 *
 * Master multiplies everything; category volumes multiply their respective streams.
 * Three distinct categories: Music, Sound Effects, and Voice/Announcements.
 */
export interface AudioSettings {
  readonly masterVolume: number;
  readonly musicVolume: number;
  readonly sfxVolume: number;
  readonly voiceVolume: number;
  readonly musicMuted: boolean;
  readonly sfxMuted: boolean;
  readonly voiceMuted: boolean;
}

const DEFAULT_SETTINGS: AudioSettings = {
  masterVolume: 1,
  musicVolume: 0.7,
  sfxVolume: 1,
  voiceVolume: 0.9,
  musicMuted: false,
  sfxMuted: false,
  voiceMuted: false,
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

/** How long a sting keeps the bed ducked before it is brought back up. */
const STING_DUCK_MS = 1400;

const sfxPlayers = new Map<SfxName, AudioPlayer>();
const voicePlayers = new Map<VoiceName, AudioPlayer>();
const lastPlayedAt = new Map<SfxName, number>();
let arrowReleaseTimer: ReturnType<typeof setTimeout> | undefined;
let activeVoice: { readonly name: VoiceName; readonly player: AudioPlayer } | undefined;

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

/** Final gain for an effect: its own mix level, scaled by what the player chose. */
function sfxVolumeFor(name: SfxName): number {
  if (settings.sfxMuted) return 0;
  return clamp01(SFX_GAIN[name] * settings.sfxVolume * settings.masterVolume);
}

/** Final gain for a voice/announcement event. */
function voiceVolumeFor(name: VoiceName): number {
  if (settings.voiceMuted) return 0;
  return clamp01(VOICE_GAIN[name] * settings.voiceVolume * settings.masterVolume);
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
    // Enable playback in silent mode so ringer switch doesn't silence the game
    await setAudioModeAsync({
      playsInSilentMode: true,
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

  for (const [name, player] of voicePlayers) {
    try {
      player.volume = voiceVolumeFor(name);
    } catch {
      // As above.
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
 * Play a one-shot effect and trigger matching haptics.
 *
 * Silently does nothing if the asset is absent, if effects are muted, or if this
 * same effect fired moments ago — see `RETRIGGER_GAP_MS`.
 */
export function playSfx(name: SfxName): void {
  // Always trigger haptics regardless of audio mute state so physical feedback works
  triggerHapticForSfx(name);

  if (settings.sfxMuted || settings.masterVolume <= 0 || settings.sfxVolume <= 0) return;

  let player = sfxPlayers.get(name);
  if (!player) {
    const source = SFX_ASSETS[name];
    if (source !== undefined) {
      try {
        player = createAudioPlayer(source);
        player.volume = sfxVolumeFor(name);
        sfxPlayers.set(name, player);
      } catch {
        // Skip
      }
    }
  }
  if (!player) return;

  const now = Date.now();
  if (now - (lastPlayedAt.get(name) ?? 0) < RETRIGGER_GAP_MS) return;
  lastPlayedAt.set(name, now);

  try {
    player.volume = sfxVolumeFor(name);
    try {
      player.pause();
      player.seekTo(0);
    } catch {
      // Ignore rewind errors
    }
    player.play();

    if (name === 'arrowRelease') {
      if (arrowReleaseTimer) clearTimeout(arrowReleaseTimer);
      arrowReleaseTimer = setTimeout(() => {
        stopSfx('arrowRelease');
      }, 1000);
    }
  } catch {
    // A failed effect is not worth interrupting play for.
  }
}

/**
 * Immediately stop a specific sound effect and rewind it to 0.
 */
export function stopSfx(name: SfxName): void {
  if (name === 'arrowRelease' && arrowReleaseTimer) {
    clearTimeout(arrowReleaseTimer);
    arrowReleaseTimer = undefined;
  }
  const player = sfxPlayers.get(name);
  if (!player) return;
  try {
    player.pause();
    player.seekTo(0);
  } catch {
    // Ignore error
  }
}

/**
 * Immediately stop all sound effects and rewind them to 0.
 * Background music beds continue playing uninterrupted.
 */
export function stopAllSfx(): void {
  for (const player of sfxPlayers.values()) {
    try {
      player.pause();
      player.seekTo(0);
    } catch {
      // Ignore error
    }
  }
}

/**
 * Play a voice / announcement event (victory calls, fail announcements, milestone celebrations).
 */
export function playVoice(name: VoiceName): void {
  if (settings.voiceMuted || settings.masterVolume <= 0 || settings.voiceVolume <= 0) return;
  const source = VOICE_ASSETS[name];
  if (source === undefined) return;

  if (activeVoice) {
    try {
      activeVoice.player.pause();
      activeVoice.player.seekTo(0);
    } catch {
      // Ignore
    }
    activeVoice = undefined;
  }

  let player = voicePlayers.get(name);
  if (!player) {
    try {
      player = createAudioPlayer(source);
      voicePlayers.set(name, player);
    } catch {
      return;
    }
  }

  try {
    player.volume = voiceVolumeFor(name);
    player.pause();
    player.seekTo(0);
    player.play();
    activeVoice = { name, player };
  } catch {
    // Ignore
  }
}

/**
 * Stop any active voice announcement.
 */
export function stopVoice(): void {
  if (activeVoice) {
    try {
      activeVoice.player.pause();
      activeVoice.player.seekTo(0);
    } catch {
      // Ignore
    }
    activeVoice = undefined;
  }
}

/**
 * Clean up transient audio (all SFX and voice announcements) when navigating or unmounting.
 */
export function cleanupAudioOnUnmount(): void {
  stopAllSfx();
  stopVoice();
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

  for (const player of voicePlayers.values()) {
    try {
      player.remove();
    } catch {
      // Nothing useful to do.
    }
  }
  voicePlayers.clear();
  activeVoice = undefined;
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
