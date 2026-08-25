/**
 * ads.ts — rewarded ads, and only rewarded ads.
 *
 * Purpose:      Let a player earn a hint by watching an ad, and behave gracefully
 *               when they cannot.
 * Responsibilities:
 *               - Preload one rewarded ad when online.
 *               - Show it and report whether the reward was actually earned.
 * Notes:        **No ad appears anywhere except the explicit "earn a hint" action**
 *               (GDD §9). No interstitials, no banners, nothing on level complete.
 *
 *               The SDK is loaded through a guarded dynamic `require`, not a
 *               static import. `react-native-google-mobile-ads` is a native module
 *               that Expo Go cannot load, and a static import would crash the app
 *               on launch there — taking Phases 1–5 testing down with it. Instead
 *               the module resolves at runtime and, when it is absent, the whole
 *               service reports `unavailable` and the game carries on. Restart is
 *               always free, so nothing is ever blocked behind an ad.
 *
 *               To enable for real, see `docs/ADS_SETUP.md`.
 */

import { NativeModules, TurboModuleRegistry } from 'react-native';

import { AD_UNIT_IDS, USE_TEST_ADS } from '@config';
import { trackTelemetry } from './telemetry';

export type AdAvailability =
  /** The SDK is present and an ad is ready to show. */
  | 'ready'
  /** SDK present, no ad loaded yet — usually offline or still fetching. */
  | 'loading'
  /** SDK not installed (Expo Go), or initialisation failed. */
  | 'unavailable';

export type RewardOutcome =
  | { readonly kind: 'earned' }
  /** Player closed the ad early, so no reward — this is normal, not an error. */
  | { readonly kind: 'dismissed' }
  | { readonly kind: 'failed'; readonly reason: string };

interface RewardedAdLike {
  addAdEventListener: (event: string, handler: (payload?: unknown) => void) => () => void;
  load: () => void;
  show: () => Promise<void> | void;
  loaded: boolean;
}

interface AdsModule {
  RewardedAd: { createForAdRequest: (unitId: string, options?: unknown) => RewardedAdLike };
  RewardedAdEventType: { LOADED: string; EARNED_REWARD: string };
  AdEventType: { CLOSED: string; ERROR: string };
  TestIds: { REWARDED: string };
  default?: () => { initialize: () => Promise<unknown> };
}

let sdk: AdsModule | undefined;
let sdkChecked = false;
let rewarded: RewardedAdLike | undefined;
let loaded = false;

/**
 * Is the *native* half of the ads SDK in this binary?
 *
 * Asked before the JS package is required, and that order is the whole point.
 * The JS package reaches for its native module with
 * `TurboModuleRegistry.getEnforcing`, which **throws** when the module is absent —
 * and it does so lazily, on first property access rather than at `require`. A
 * `try/catch` around the `require` therefore catches nothing, which is exactly how
 * this file came to crash the app on launch while claiming to degrade gracefully.
 *
 * `TurboModuleRegistry.get` is the non-throwing sibling: it returns null instead.
 * Asking it first means the JS package is never even loaded unless the native side
 * is there to answer it.
 *
 * This state is normal and will happen again: installing the npm package and
 * building the native binary are two separate steps, and between them the JS
 * expects a module the app does not have.
 */
function hasNativeAds(): boolean {
  try {
    if (TurboModuleRegistry.get('RNGoogleMobileAdsModule') != null) return true;
    // Older, non-TurboModule registration. Cheap to check and harmless if absent.
    return NativeModules['RNGoogleMobileAdsModule'] != null;
  } catch {
    return false;
  }
}

/** Resolve the SDK once, tolerating its absence. */
function loadSdk(): AdsModule | undefined {
  if (sdkChecked) return sdk;
  sdkChecked = true;

  if (!hasNativeAds()) {
    // No native module: Expo Go, or a build made before the package was added.
    sdk = undefined;
    return sdk;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sdk = require('react-native-google-mobile-ads') as AdsModule;
  } catch {
    sdk = undefined;
  }
  return sdk;
}

function unitId(): string {
  const module = loadSdk();
  if (USE_TEST_ADS && module) return module.TestIds.REWARDED;
  return AD_UNIT_IDS.rewarded;
}

/**
 * Start the SDK and preload one ad.
 *
 * Called once at launch. Keeping an ad warm is what makes "earn a hint" work when
 * a connection briefly drops mid-session (GDD §9).
 */
export async function initAds(): Promise<void> {
  const module = loadSdk();
  if (!module) return;

  try {
    await module.default?.().initialize();
    preload();
  } catch {
    // An SDK that will not initialise simply means no ads this session.
  }
}

/** Fetch the next rewarded ad in the background. */
export function preload(): void {
  const module = loadSdk();
  if (!module) return;

  try {
    const ad = module.RewardedAd.createForAdRequest(unitId(), {
      requestNonPersonalizedAdsOnly: true,
    });

    ad.addAdEventListener(module.RewardedAdEventType.LOADED, () => {
      loaded = true;
    });
    ad.addAdEventListener(module.AdEventType.ERROR, () => {
      loaded = false;
    });

    rewarded = ad;
    loaded = false;
    ad.load();
  } catch {
    rewarded = undefined;
    loaded = false;
  }
}

/** Can the player earn a hint right now? Drives what the hint dialog offers. */
export function availability(): AdAvailability {
  if (!loadSdk()) return 'ready'; // Simulated/dummy ad ready in Expo Go
  if (loaded && rewarded?.loaded !== false) return 'ready';
  return 'loading';
}

/**
 * Show a rewarded ad and resolve with whether the reward was earned.
 *
 * The caller grants the hint — this service never touches the hint store, so the
 * reward rule lives in one place and can be changed without editing ad code.
 */
export function showRewarded(): Promise<RewardOutcome> {
  const module = loadSdk();
  const ad = rewarded;

  if (!module || !ad) {
    // Simulated/dummy ad mode when native SDK is absent (e.g. Expo Go)
    return new Promise<RewardOutcome>((resolve) => {
      setTimeout(() => {
        resolve({ kind: 'earned' });
      }, 1200);
    });
  }
  if (!loaded) {
    return Promise.resolve({
      kind: 'failed',
      reason: 'No ad is ready yet. Check your connection and try again.',
    });
  }

  return new Promise<RewardOutcome>((resolve) => {
    let settled = false;
    const finish = (outcome: RewardOutcome) => {
      if (settled) return;
      settled = true;
      loaded = false;
      if (outcome.kind === 'earned') {
        trackTelemetry({
          name: 'ad_impression',
          payload: { format: 'rewarded', placement: 'rewarded_action' },
        });
      }
      // Immediately start fetching the next one, so a second hint is not a wait.
      preload();
      resolve(outcome);
    };

    let earned = false;

    const offReward = ad.addAdEventListener(module.RewardedAdEventType.EARNED_REWARD, () => {
      earned = true;
    });
    const offClosed = ad.addAdEventListener(module.AdEventType.CLOSED, () => {
      offReward();
      offClosed();
      offError();
      finish(earned ? { kind: 'earned' } : { kind: 'dismissed' });
    });
    const offError = ad.addAdEventListener(module.AdEventType.ERROR, () => {
      offReward();
      offClosed();
      offError();
      finish({ kind: 'failed', reason: 'The ad could not be shown.' });
    });

    try {
      void ad.show();
    } catch {
      finish({ kind: 'failed', reason: 'The ad could not be shown.' });
    }
  });
}

// -----------------------------------------------------------------------------
// Interstitial Ad Management (Cadence & Grace Period)
// -----------------------------------------------------------------------------

const GRACE_PERIOD_MS = 90_000; // 90 seconds initial session grace period
const INTERSTITIAL_COOLDOWN_MS = 60_000; // 60 seconds minimum between interstitials
const CADENCE_LEVELS = 3; // Show interstitial every 3 level completes

const sessionStartTime = Date.now();
let lastInterstitialTime = 0;
let levelCompleteCounter = 0;

/**
 * Triggered on level completion to evaluate interstitial pacing policy.
 *
 * Rules (Master Brief Section 6):
 * - Zero interstitials during the initial 90s grace period.
 * - Shows an interstitial every 3 completed levels.
 * - Respects a 60-second minimum cooldown between ads.
 */
export function recordLevelCompleteAndCheckInterstitial(): Promise<boolean> {
  levelCompleteCounter += 1;

  const now = Date.now();
  const timeSinceSessionStart = now - sessionStartTime;
  const timeSinceLastAd = now - lastInterstitialTime;

  // 1. Check Session Grace Period
  if (timeSinceSessionStart < GRACE_PERIOD_MS) {
    return Promise.resolve(false);
  }

  // 2. Check Level Cadence
  if (levelCompleteCounter % CADENCE_LEVELS !== 0) {
    return Promise.resolve(false);
  }

  // 3. Check Cooldown
  if (lastInterstitialTime > 0 && timeSinceLastAd < INTERSTITIAL_COOLDOWN_MS) {
    return Promise.resolve(false);
  }

  // Record impression time and show ad
  lastInterstitialTime = now;
  return showInterstitial();
}

/** Show an interstitial ad with safe fallbacks. */
export function showInterstitial(): Promise<boolean> {
  const module = loadSdk();
  if (!module) {
    // Expo Go simulated mode
    return new Promise((resolve) => setTimeout(() => resolve(true), 800));
  }

  return new Promise<boolean>((resolve) => {
    try {
      // In native production, fetch and display InterstitialAd unit
      const unit = USE_TEST_ADS ? module.TestIds.REWARDED : AD_UNIT_IDS.interstitial;
      const interstitial = (module as any).InterstitialAd?.createForAdRequest?.(unit, {
        requestNonPersonalizedAdsOnly: true,
      });

      if (!interstitial) {
        resolve(false);
        return;
      }

      let unsubClosed: (() => void) | undefined;
      let unsubError: (() => void) | undefined;

      const finish = (shown: boolean) => {
        unsubClosed?.();
        unsubError?.();
        if (shown) {
          trackTelemetry({
            name: 'ad_impression',
            payload: { format: 'interstitial', placement: 'level_complete' },
          });
        }
        resolve(shown);
      };

      unsubClosed = interstitial.addAdEventListener(module.AdEventType.CLOSED, () => finish(true));
      unsubError = interstitial.addAdEventListener(module.AdEventType.ERROR, () => finish(false));

      interstitial.addAdEventListener(module.RewardedAdEventType?.LOADED || 'loaded', () => {
        try {
          interstitial.show();
        } catch {
          finish(false);
        }
      });

      interstitial.load();
    } catch {
      resolve(false);
    }
  });
}

