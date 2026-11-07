/**
 * config/index.ts — build-time constants and feature flags.
 *
 * Purpose:      One place for anything that differs between a dev build and a
 *               release build, so no screen ever branches on `__DEV__` itself.
 * Notes:        Ad unit IDs point to production AdMob units. The game always
 *               serves production ads in all build modes.
 */

import { AD_UNITS } from '../constants/adUnits';

/** Semantic version shown in Settings → About. Keep in step with `app.json`. */
export const APP_VERSION = '1.0.3';

/**
 * Real AdMob unit ids — used in ALL builds (development and production).
 * No test ad units are used.
 */
export const AD_UNIT_IDS = {
  banner:       AD_UNITS.banner,
  interstitial: AD_UNITS.interstitial,
  rewarded:     AD_UNITS.rewarded,
} as const;

/** Board sizes above this get a smaller minimum cell, so 12x12 still fits a phone. */
export const LARGE_BOARD_THRESHOLD = 10;

/**
 * How long the win overlay waits before covering the board.
 *
 * The last snake threading out is the most satisfying moment in the game, and
 * slapping a modal over it instantly throws that away. This is long enough for
 * the exit animation to finish, short enough that it never feels like waiting.
 *
 * **Must stay comfortably above `MAX_RELEASE_MS`** (from `render/timings.ts`). If the overlay can arrive before
 * the last snake has left, the one moment this delay exists to protect is the one
 * moment it covers up.
 */
export const WIN_OVERLAY_DELAY_MS = 950;
