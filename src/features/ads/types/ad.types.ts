/**
 * ad.types.ts — shared TypeScript types for the advertisement system.
 *
 * Centralized type definitions for all ad-related functionality.
 */

import type { RewardedAd, InterstitialAd, BannerAd, AdEventType, RewardedAdEventType } from 'react-native-google-mobile-ads';

/** Type aliases for the native ad instances */
export type RewardedAdLike = RewardedAd;
export type InterstitialAdLike = InterstitialAd;
export type BannerAdLike = BannerAd;

/** Common ad event types */
export type AdEventName = 'loaded' | 'failed' | 'closed' | 'earned' | 'clicked' | 'impression';

/** Generic ad interface that all ad instances implement */
export interface AdInstance {
  load: () => void;
  show: () => Promise<void>;
  addAdEventListener: (event: AdEventName, handler: (payload?: unknown) => void) => () => void;
  loaded: boolean;
}

/** Rewarded ad specific events */
export interface RewardedAdEventTypes {
  LOADED: 'loaded';
  EARNED_REWARD: 'earned';
  ERROR: 'error';
  CLOSED: 'closed';
  CLICKED: 'clicked';
  IMPRESSION: 'impression';
}

/** Interstitial ad event types */
export interface InterstitialAdEventTypes {
  LOADED: 'loaded';
  ERROR: 'error';
  CLOSED: 'closed';
  CLICKED: 'clicked';
  IMPRESSION: 'impression';
}

/** Rewarded ad outcome */
export type RewardOutcome =
  | { readonly kind: 'earned' }
  | { readonly kind: 'dismissed' }
  | { readonly kind: 'failed'; readonly reason: string };

/** Interstitial ad outcome */
export type InterstitialOutcome =
  | { readonly kind: 'shown' }
  | { readonly kind: 'failed'; readonly reason: string }
  | { readonly kind: 'not_ready' };

/** Ad availability status */
export type AdAvailability = 'ready' | 'loading' | 'unavailable' | 'error';

/** Ad preload configuration */
export interface AdPreloadConfig {
  /** Maximum number of rewarded ads to keep preloaded */
  rewardedCacheSize: number;
  /** Maximum number of interstitial ads to keep preloaded */
  interstitialCacheSize: number;
  /** Preload ads during idle time */
  preloadOnIdle: boolean;
  /** Interval for idle-time preloading checks (ms) */
  preloadIntervalMs: number;
  /** Minimum time between interstitial ads (ms) */
  interstitialCooldownMs: number;
  /** Number of levels between interstitial ads */
  interstitialCadence: number;
  /** Grace period before showing interstitials (ms) */
  gracePeriodMs: number;
}

/** Ad loading state */
export interface AdLoadingState {
  readonly isLoading: boolean;
  readonly loadedCount: number;
  readonly maxCacheSize: number;
  readonly lastError: string | null;
}

/** Ad cache statistics */
export interface AdCacheStats {
  rewardedReady: number;
  rewardedMax: number;
  interstitialReady: number;
  interstitialMax: number;
  lastPreloadAt: number | null;
  lastError: string | null;
}

/** Ad event handler types */
export type AdEventHandler = (payload?: unknown) => void;
export type AdLoadHandler = (ad: AdInstance) => void;
export type AdErrorHandler = (error: unknown) => void;
export type AdCloseHandler = () => void;
export type AdRewardHandler = (reward: unknown) => void;

/** Ad unit IDs configuration */
export interface AdUnitIds {
  readonly banner: string;
  readonly interstitial: string;
  readonly rewarded: string;
  readonly rewardedHeartRefill: string;
}

/** Default ad configuration */
export const DEFAULT_AD_CONFIG = {
  rewardedCacheSize: 3,
  interstitialCacheSize: 2,
  preloadOnIdle: true,
  preloadIntervalMs: 30_000,
  interstitialCooldownMs: 60_000,
  interstitialCadence: 2,
  gracePeriodMs: 90_000,
} as const;