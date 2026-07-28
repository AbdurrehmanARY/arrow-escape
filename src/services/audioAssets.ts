/**
 * audioAssets.ts — the one place audio files are wired in.
 *
 * Purpose:      Map each sound to a bundled file, or to nothing.
 * Notes:        This file exists because `require()` is resolved by Metro at
 *               **build** time, not at runtime. Wrapping a `require` of a missing
 *               file in a try/catch does not help — the bundler has already
 *               decided the module graph, and the app ships with a broken entry
 *               that can take the native side down when it is handed to the audio
 *               player. A crash on launch is a bad trade for optional sound.
 *
 *               So the registry is explicit and starts empty. The game plays
 *               silently until you add files and uncomment the matching lines,
 *               and there is no way for a missing asset to reach the bundler.
 *
 *               See `assets/audio/README.md` for what each sound should be.
 */

export type SfxName = 'release' | 'blocked' | 'win' | 'fail' | 'tap';

/**
 * Bundled sound effects.
 *
 * To enable one: drop the file into `assets/audio/`, then uncomment its line.
 * Anything left out is simply never played.
 */
export const SFX_ASSETS: Partial<Record<SfxName, number>> = {
  // release: require('../../assets/audio/release.m4a'),
  // blocked: require('../../assets/audio/blocked.m4a'),
  // win: require('../../assets/audio/win.m4a'),
  // fail: require('../../assets/audio/fail.m4a'),
  // tap: require('../../assets/audio/tap.m4a'),
};

/** The looping background track, or `undefined` for silence. */
export const MUSIC_ASSET: number | undefined = undefined;
// export const MUSIC_ASSET: number | undefined = require('../../assets/audio/ambient.m4a');
