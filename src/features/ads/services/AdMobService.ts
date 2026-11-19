/**
 * AdMobService.ts — low-level Google Mobile Ads SDK wrapper.
 *
 * Provides a clean abstraction over the react-native-google-mobile-ads SDK,
 * handling module loading, ad creation, and event listener management.
 */

import { Platform } from 'react-native';
import type { RewardedAdLike, InterstitialAdLike } from '../types/ad.types';

/** Ads module type from react-native-google-mobile-ads */
type AdsModule = typeof import('react-native-google-mobile-ads');

/** Cached SDK module */
let sdkModule: AdsModule | undefined;
let sdkChecked = false;

/** Check if native ads module is available */
function hasNativeAds(): boolean {
  if (Platform.OS !== 'android') return false;
  try {
    // TurboModuleRegistry.get throws if module not found
    // Using get instead to avoid throwing
    const { TurboModuleRegistry } = require('react-native');
    if (TurboModuleRegistry.get('RNGoogleMobileAdsModule') != null) return true;
    const { NativeModules } = require('react-native');
    return NativeModules.RNGoogleMobileAdsModule != null;
  } catch {
    return false;
  }
}

/** Load the SDK module once */
export function loadAdsModule(): AdsModule | undefined {
  if (sdkChecked) return sdkModule;
  sdkChecked = true;

  if (!hasNativeAds()) {
    return undefined;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sdkModule = require('react-native-google-mobile-ads') as AdsModule;
  } catch {
    sdkModule = undefined;
  }
  return sdkModule;
}

/** Get the loaded SDK module */
export function getAdsModule(): AdsModule | undefined {
  return loadAdsModule();
}

/** Create a rewarded ad instance */
export function createRewardedAd(unitId: string): ReturnType<AdsModule['RewardedAd']['createForAdRequest']> | null {
  const module = loadAdsModule();
  if (!module) return null;

  try {
    return module.RewardedAd.createForAdRequest(unitId, { requestNonPersonalizedAdsOnly: true });
  } catch {
    return null;
  }
}

/** Create an interstitial ad instance */
export function createInterstitialAd(unitId: string): ReturnType<AdsModule['InterstitialAd']['createForAdRequest']> | null {
  const module = loadAdsModule();
  if (!module) return null;

  try {
    return module.InterstitialAd.createForAdRequest(unitId, { requestNonPersonalizedAdsOnly: true });
  } catch {
    return null;
  }
}

/** Check if SDK is available */
export function isAdsAvailable(): boolean {
  return hasNativeAds();
}

/** Ad event type constants */
export const AdEvents = {
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

/** Type-safe event listener wrapper */
export function addAdEventListener<T extends object>(
  ad: { addAdEventListener: (event: string, handler: (payload?: unknown) => void) => () => void },
  event: string,
  handler: (payload?: unknown) => void
): () => void {
  return ad.addAdEventListener(event, handler);
}

/** Safe ad show wrapper */
export async function safeShowAd(ad: { show: () => Promise<void> }): Promise<boolean> {
  try {
    await ad.show();
    return true;
  } catch (error) {
    console.warn('[AdMob] Ad show failed:', error);
    return false;
  }
}

/** Safe ad load wrapper */
export function safeLoadAd(ad: { load: () => void }): void {
  try {
    ad.load();
  } catch {
    // Ignore if already loading
  }
}

/** Ad size constants */
export const AD_SIZES = {
  banner: 'BANNER',
} as const;

/** Request options for all ads */
export const REQUEST_OPTIONS = {
  requestNonPersonalizedAdsOnly: true,
} as const;