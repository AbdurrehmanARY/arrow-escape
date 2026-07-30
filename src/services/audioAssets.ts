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
  // arrowPickup: require('../../assets/audio/sfx/arrow-pickup.m4a'),
  // arrowRelease: require('../../assets/audio/sfx/arrow-release.m4a'),
  // correctMove: require('../../assets/audio/sfx/correct-move.m4a'),
  // wrongMove: require('../../assets/audio/sfx/wrong-move.m4a'),
  // collision: require('../../assets/audio/sfx/collision.m4a'),
  // heartLost: require('../../assets/audio/sfx/heart-lost.m4a'),
  // lastHeartWarning: require('../../assets/audio/sfx/last-heart.m4a'),
  // hintUsed: require('../../assets/audio/sfx/hint.m4a'),
  // undo: require('../../assets/audio/sfx/undo.m4a'),
  // levelRestart: require('../../assets/audio/sfx/restart.m4a'),
  // pause: require('../../assets/audio/sfx/pause.m4a'),
  // resume: require('../../assets/audio/sfx/resume.m4a'),
  // --- UI ---
  // buttonClick: require('../../assets/audio/sfx/button.m4a'),
  // toggle: require('../../assets/audio/sfx/toggle.m4a'),
  // popupOpen: require('../../assets/audio/sfx/popup-open.m4a'),
  // popupClose: require('../../assets/audio/sfx/popup-close.m4a'),
  // rewardCollected: require('../../assets/audio/sfx/reward-collected.m4a'),
  // --- Progress ---
  // levelComplete: require('../../assets/audio/sfx/level-complete.m4a'),
  // fireworks: require('../../assets/audio/sfx/fireworks.m4a'),
  // starCollect: require('../../assets/audio/sfx/star.m4a'),
  // difficultyUnlocked: require('../../assets/audio/sfx/difficulty-unlocked.m4a'),
  // achievement: require('../../assets/audio/sfx/achievement.m4a'),
  // --- Failure ---
  // outOfHearts: require('../../assets/audio/sfx/out-of-hearts.m4a'),
  // gameOver: require('../../assets/audio/sfx/game-over.m4a'),
  // --- Miscellaneous ---
  // countdown: require('../../assets/audio/sfx/countdown.m4a'),
  // notification: require('../../assets/audio/sfx/notification.m4a'),
  // rewardReady: require('../../assets/audio/sfx/reward-ready.m4a'),
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
  // menu: require('../../assets/audio/music/menu.m4a'),
  // gameplay: require('../../assets/audio/music/gameplay.m4a'),
  // victory: require('../../assets/audio/music/victory.m4a'),
  // failure: require('../../assets/audio/music/failure.m4a'),
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
