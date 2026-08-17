/**
 * audioAssets.ts — the one place audio files are wired in.
 *
 * Purpose:      Map each sound and track to a bundled file, or to nothing.
 * Notes:        This file exists because `require()` is resolved by Metro at
 *               **build** time, not at runtime. Wrapping a `require` of a missing
 *               file in a try/catch does not help — the bundler has already
 *               decided the module graph, and the app ships with a broken entry
 *               that can take the native side down when it is handed to the audio
 *               player. A crash on launch is a bad trade for optional sound.
 *
 *               So the registry is explicit and starts empty. **The game plays
 *               silently until files are added**, and there is no way for a
 *               missing asset to reach the bundler. Every call site is already
 *               wired; enabling a sound is uncommenting one line.
 *
 *               See `assets/audio/README.md` for what each one should be.
 */

/**
 * Every sound the game asks for, grouped by what it is.
 *
 * The names are the vocabulary the rest of the app speaks — `playSfx('heartLost')`
 * — so they describe the *moment*, never the file. A sound can be swapped, shared
 * between two events, or left out entirely without touching a screen.
 */
export type GameplaySfx =
  | 'arrowPickup'
  | 'arrowRelease'
  | 'correctMove'
  | 'wrongMove'
  | 'collision'
  | 'heartLost'
  | 'lastHeartWarning'
  | 'hintUsed'
  | 'undo'
  | 'levelRestart'
  | 'pause'
  | 'resume';

export type UiSfx = 'buttonClick' | 'toggle' | 'popupOpen' | 'popupClose' | 'rewardCollected';

export type ProgressSfx =
  | 'levelComplete'
  | 'fireworks'
  | 'starCollect'
  | 'difficultyUnlocked'
  | 'achievement';

export type FailureSfx = 'outOfHearts' | 'gameOver';

export type MiscSfx = 'countdown' | 'notification' | 'rewardReady';

export type SfxName = GameplaySfx | UiSfx | ProgressSfx | FailureSfx | MiscSfx;

/** The looping or one-shot music beds. */
export type MusicTrack = 'menu' | 'gameplay' | 'victory' | 'failure';

/**
 * Bundled sound effects.
 *
 * To enable one: drop the file into `assets/audio/sfx/`, then uncomment its line.
 * Anything left out is simply never played — no warning, no fallback, no crash.
 *
 * Files should be **mono, 44.1kHz, `.m4a` (AAC)**. Mono because these are UI
 * sounds with no stereo information to carry, and it halves the bundle. Trim
 * silence from the head of every file: leading silence is indistinguishable from
 * audio latency, and this game plays a sound on every single tap.
 */
export const SFX_ASSETS: Partial<Record<SfxName, number>> = {
  // --- Gameplay ---
  arrowPickup: require('../../assets/audio/sfx/arrow-pickup.wav'),
  arrowRelease: require('../../assets/audio/sfx/arrow-release.wav'),
  correctMove: require('../../assets/audio/sfx/correct-move.wav'),
  wrongMove: require('../../assets/audio/sfx/wrong-move.wav'),
  collision: require('../../assets/audio/sfx/collision.wav'),
  heartLost: require('../../assets/audio/sfx/heart-lost.wav'),
  lastHeartWarning: require('../../assets/audio/sfx/last-heart.wav'),
  hintUsed: require('../../assets/audio/sfx/hint.wav'),
  undo: require('../../assets/audio/sfx/undo.wav'),
  levelRestart: require('../../assets/audio/sfx/restart.wav'),
  pause: require('../../assets/audio/sfx/pause.wav'),
  resume: require('../../assets/audio/sfx/resume.wav'),
  // --- UI ---
  buttonClick: require('../../assets/audio/sfx/button.wav'),
  toggle: require('../../assets/audio/sfx/toggle.wav'),
  popupOpen: require('../../assets/audio/sfx/popup-open.wav'),
  popupClose: require('../../assets/audio/sfx/popup-close.wav'),
  rewardCollected: require('../../assets/audio/sfx/reward-collected.wav'),
  // --- Progress ---
  levelComplete: require('../../assets/audio/sfx/level-complete.wav'),
  fireworks: require('../../assets/audio/sfx/fireworks.wav'),
  starCollect: require('../../assets/audio/sfx/star.wav'),
  difficultyUnlocked: require('../../assets/audio/sfx/difficulty-unlocked.wav'),
  achievement: require('../../assets/audio/sfx/achievement.wav'),
  // --- Failure ---
  outOfHearts: require('../../assets/audio/sfx/out-of-hearts.wav'),
  gameOver: require('../../assets/audio/sfx/game-over.wav'),
  // --- Miscellaneous ---
  countdown: require('../../assets/audio/sfx/countdown.wav'),
  notification: require('../../assets/audio/sfx/notification.wav'),
  rewardReady: require('../../assets/audio/sfx/reward-ready.wav'),
};

/**
 * Bundled music beds.
 *
 * `menu` and `gameplay` loop; `victory` and `failure` are stings that play once
 * and hand back to whatever was playing. Loops must be **seamless** — trimmed on a
 * zero crossing with no trailing silence — or the gap is audible on every repeat
 * and becomes the most noticeable thing in the game.
 */
export const MUSIC_ASSETS: Partial<Record<MusicTrack, number>> = {
  menu: require('../../assets/audio/music/menu.wav'),
  gameplay: require('../../assets/audio/music/gameplay.wav'),
  victory: require('../../assets/audio/music/victory.wav'),
  failure: require('../../assets/audio/music/failure.wav'),
};

/** Tracks that repeat rather than playing once and stopping. */
export const LOOPING_TRACKS: ReadonlySet<MusicTrack> = new Set<MusicTrack>(['menu', 'gameplay']);

/**
 * Per-sound gain, before the player's volume settings.
 *
 * This is the mix, and it is the difference between a game that sounds designed
 * and one that sounds loud. A pickup fires on every interaction and must sit well
 * under a level-complete chime that fires once a level; a collision has to cut
 * through without startling. Values are relative and only meaningful against each
 * other.
 */
export const SFX_GAIN: Record<SfxName, number> = {
  arrowPickup: 0.28,
  arrowRelease: 0.5,
  correctMove: 0.4,
  wrongMove: 0.55,
  collision: 0.6,
  heartLost: 0.65,
  lastHeartWarning: 0.7,
  hintUsed: 0.45,
  undo: 0.4,
  levelRestart: 0.45,
  pause: 0.35,
  resume: 0.35,

  buttonClick: 0.3,
  toggle: 0.3,
  popupOpen: 0.35,
  popupClose: 0.3,
  rewardCollected: 0.6,

  levelComplete: 0.75,
  fireworks: 0.55,
  starCollect: 0.5,
  difficultyUnlocked: 0.7,
  achievement: 0.7,

  outOfHearts: 0.65,
  gameOver: 0.7,

  countdown: 0.5,
  notification: 0.45,
  rewardReady: 0.5,
};

/** Per-track gain, before the player's music volume. */
export const MUSIC_GAIN: Record<MusicTrack, number> = {
  menu: 0.45,
  gameplay: 0.3,
  victory: 0.6,
  failure: 0.5,
};
