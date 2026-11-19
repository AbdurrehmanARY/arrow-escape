/**
 * adConfig.ts — advertisement configuration constants.
 *
 * Centralized configuration for all advertisement behavior including
 * cache sizes, timing, and AdMob unit IDs.
 */

import { AD_UNITS } from '@constants';
import { DEFAULT_AD_CONFIG, type AdPreloadConfig } from '../types/ad.types';

/** AdMob unit IDs - production IDs used in all builds */
export const AD_UNIT_IDS = {
  banner: AD_UNITS.banner,
  interstitial: AD_UNITS.interstitial,
  rewarded: AD_UNITS.rewarded,
  rewardedHeartRefill: AD_UNITS.rewardedHeartRefill,
} as const;

/** Ad preloading configuration */
export const AD_PRELOAD_CONFIG: AdPreloadConfig = {
  ...DEFAULT_AD_CONFIG,
  rewardedCacheSize: 3,
  interstitialCacheSize: 2,
  preloadOnIdle: true,
  preloadIntervalMs: 30_000,
  interstitialCooldownMs: 60_000,
  interstitialCadence: 2,
  gracePeriodMs: 90_000,
} as const;

/** Test ad unit IDs (only used in development with USE_TEST_ADS=true) */
export const TEST_AD_UNIT_IDS = {
  banner: 'ca-app-pub-3940256099942544/6300978111',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
  rewardedHeartRefill: 'ca-app-pub-3940256099942544/5224354917',
} as const;

/** Ad loading timeouts (ms) */
export const AD_TIMEOUTS = {
  rewardedLoad: 8_000,
  interstitialLoad: 8_000,
  bannerLoad: 5_000,
  show: 5_000,
} as const;

/** Ad event names */
export const AD_EVENTS = {
  rewarded: {
    loaded: 'loaded',
    earned: 'earned',
    error: 'error',
    closed: 'closed',
    clicked: 'clicked',
    impression: 'impression',
  },
  interstitial: {
    loaded: 'loaded',
    error: 'error',
    closed: 'closed',
    clicked: 'clicked',
    impression: 'impression',
  },
  banner: {
    loaded: 'loaded',
    error: 'error',
    clicked: 'clicked',
    impression: 'impression',
  },
} as const;

/** Ad cache configuration */
export const AD_CACHE_CONFIG = {
  rewarded: {
    maxSize: 3,
    preloadOnInit: true,
    autoReplenish: true,
  },
  interstitial: {
    maxSize: 2,
    preloadOnInit: true,
    autoReplenish: true,
  },
  banner: {
    preloadOnInit: false,
    autoReplenish: false,
  },
} as const;