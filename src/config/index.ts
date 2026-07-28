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
export const APP_VERSION = '1.0.0';

/**
 * Use Google's test ad units.
 *
 * Tied to `__DEV__` so a release build cannot accidentally ship test ads, and a
 * development build cannot accidentally serve real ones.
 */
export const USE_TEST_ADS = __DEV__;

/**
 * Real AdMob unit ids, used only in release builds.
 *
 * Placeholders until an AdMob account exists — see `docs/ADS_SETUP.md`. Leaving
 * them as placeholders is safe: `USE_TEST_ADS` keeps development on test units,
 * and the ads service degrades to "unavailable" rather than crashing if a unit id
 * is rejected.
 */
export const AD_UNIT_IDS = {
  rewarded: 'ca-app-pub-0000000000000000/0000000000',
} as const;

/** Board sizes above this get a smaller minimum cell, so 12x12 still fits a phone. */
export const LARGE_BOARD_THRESHOLD = 10;

/** Milliseconds the win overlay waits before it can be dismissed, so it registers. */
export const WIN_OVERLAY_DELAY_MS = 260;
