/**
 * config/index.ts — build-time constants and feature flags.
 *
 * Purpose:      One place for anything that differs between a dev build and a
 *               release build, so no screen ever branches on `__DEV__` itself.
 * Notes:        Ad unit ids are the reason this file exists. Shipping a build that
 *               serves *test* ads earns nothing; shipping a dev build that serves
 *               *real* ads gets an AdMob account suspended. Both are one-line
 *               mistakes, so the decision is made here, once, from `__DEV__`
 *               rather than remembered at each call site.
 */

/** Semantic version shown in Settings → About. Keep in step with `app.json`. */
export const APP_VERSION = '1.0.1';

/**
 * Use Google's test ad units.
 *
 * Tied to `__DEV__` so a release build cannot accidentally ship test ads, and a
 * development build cannot accidentally serve real ones.
 *
 * `EXPO_PUBLIC_USE_TEST_ADS=true` is an explicit, opt-in override for the one
 * case `__DEV__` cannot cover: a **standalone test APK**. Our config plugin
 * `plugins/withStandaloneDebugBundling.js` sets `debuggableVariants = []` so the
 * `debug` variant embeds its JS bundle instead of waiting on a Metro server — but
 * React Native's Gradle plugin then bundles that variant with `--dev false`
 * (`TaskConfiguration.kt`), so `__DEV__` is `false` even in a debug APK. Without
 * this override a tester APK would serve *real* ads, which is exactly the mistake
 * `USE_TEST_ADS` exists to prevent.
 *
 * The override is deliberately asymmetrical: it can only ever turn test ads ON.
 * A production or EAS release build that does not set the variable keeps the
 * `__DEV__` behaviour, so a stray env var can never leak test ads to players.
 */
export const USE_TEST_ADS =
  __DEV__ || process.env.EXPO_PUBLIC_USE_TEST_ADS === 'true';

/**
 * Real AdMob unit ids, used only in release builds.
 *
 * Placeholders until an AdMob account exists — see `docs/ADS_SETUP.md`. Leaving
 * them as placeholders is safe: `USE_TEST_ADS` keeps development on test units,
 * and the ads service degrades to "unavailable" rather than crashing if a unit id
 * is rejected.
 */
export const AD_UNIT_IDS = {
  rewarded: 'ca-app-pub-1159231009656865/8148752594',
  interstitial: 'ca-app-pub-1159231009656865/8024252217',
} as const;

/** Board sizes above this get a smaller minimum cell, so 12x12 still fits a phone. */
export const LARGE_BOARD_THRESHOLD = 10;

/**
 * TESTING ONLY — open every level regardless of progress.
 *
 * Set to `false` to restore normal sequential progression. Nothing else needs to
 * change: unlocking is derived through `playableUpTo`, which is the single place
 * this flag is read, so flipping it back cannot leave a stale unlock behind.
 *
 * While it is on, the menu and level select both show a visible TESTING badge.
 * A build flag that looks identical to production is how one ships by accident,
 * and this one would hand every player the whole game.
 */
export const UNLOCK_ALL_LEVELS = false;

/**
 * How long the win overlay waits before covering the board.
 *
 * The last snake threading out is the most satisfying moment in the game, and
 * slapping a modal over it instantly throws that away. This is long enough for
 * the exit animation to finish, short enough that it never feels like waiting.
 *
 * **Must stay comfortably above `RELEASE_MS`.** If the overlay can arrive before
 * the last snake has left, the one moment this delay exists to protect is the one
 * moment it covers up.
 */
export const WIN_OVERLAY_DELAY_MS = 1150;
