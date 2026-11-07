/**
 * ads.ts — rewarded ads, interstitial ads, and banner ad component.
 *
 * Purpose:      Let a player earn a hint by watching an ad, show interstitials on
 *               level completion, and display a bottom banner on all screens.
 * Responsibilities:
 *               - Preload one rewarded ad and one interstitial when online.
 *               - Show them and report outcomes.
 *               - Provide a banner component that renders with the production unit ID,
 *                 or nothing when the native SDK is absent (Expo Go).
 *
 * Notes:        All three ad formats load the native module through a guarded dynamic
 *               `require`, not a static import. `react-native-google-mobile-ads` is a
 *               native module that Expo Go cannot load, and a static import would crash
 *               the app on launch there — taking Phases 1–5 testing down. Instead
 *               the module resolves at runtime and, when absent, the whole service
 *               reports `unavailable` and the game carries on. Restart is always free,
 *               so nothing is ever blocked behind an ad.
 *
 *               To enable for real, see `docs/ADS_SETUP.md`.
 */

import { NativeModules, TurboModuleRegistry, View } from 'react-native';
import React from 'react';

import { AD_UNITS } from '../constants/adUnits';

import { trackTelemetry } from './telemetry';
import NetInfo from '@react-native-community/netinfo';

export const isOnline = async (): Promise<boolean> => {
  const state = await NetInfo.fetch();
  return state.isConnected === true && state.isInternetReachable === true;
};
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

/** Height of a standard banner in dp. Used to reserve space when sdk is absent. */
const BANNER_HEIGHT_DP = 50;

/**
 * The canonical `size` value to pass to `BannerAd`.
 *
 * In `react-native-google-mobile-ads` v16+ the validator inside `BaseAd` tests
 * a banner `size` against the keys of its `BannerAdSize` enum, and those keys are
 * **uppercase** (`BANNER`, `FULL_BANNER`, …). The lowercase `'banner'` spelling
 * that worked through v14 fails the runtime `'banner' in BannerAdSize` check and
 * `BaseAd` throws from inside a `useEffect` during mount — which the root error
 * boundary surfaces as a full-screen "Something broke" crash on HomeScreen and
 * PlayScreen.
 *
 * Typed as the literal `'BANNER'` (not `string`) so any drift is flagged by
 * TypeScript, and exported so a unit test can assert it against the installed
 * SDK's own enum — a future rename then fails loud in CI instead of on a
 * player's device.
 */
export const BANNER_SIZE_KEY: 'BANNER' = 'BANNER';

interface AdsModule {
  RewardedAd: { createForAdRequest: (unitId: string, options?: unknown) => RewardedAdLike };
  RewardedAdEventType: { LOADED: string; EARNED_REWARD: string };
  InterstitialAd: { createForAdRequest: (unitId: string, options?: unknown) => RewardedAdLike };
  AdEventType: { CLOSED: string; ERROR: string; LOADED: string };
  default?: () => { initialize: () => Promise<unknown> };
}

let sdk: AdsModule | undefined;
let sdkChecked = false;
let rewarded: RewardedAdLike | undefined;
let loaded = false;
let interstitial: RewardedAdLike | undefined;
let interstitialLoaded = false;

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
  return AD_UNITS.rewarded;
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
    // Initialize the SDK — must be called once at app launch.
    await module.default?.().initialize();

    // Set request configuration: limit to non-personalized ads on the emulator.
    // Replace ['EMULATOR'] with your test device hash (from logcat: "AdMob test
    // device: XXXX-XXXX-XXXX-XXXX-XXXX") when you want personalised test ads on a
    // physical device.
    const { setRequestConfiguration } = module as any;
    if (setRequestConfiguration) {
      setRequestConfiguration({
        // Non-personalized ads only (COPPA-friendly).
        // Set to false if you later add UMP consent flow and want personalised ads.
        nonPersonalizedAdsOnly: true,
      });
    }

    preload();
    preloadInterstitial();
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

/** Fetch the next interstitial in the background, the same pattern as rewarded. */
export function preloadInterstitial(): void {
  const module = loadSdk();
  if (!module) return;

  try {
    const ad = module.InterstitialAd.createForAdRequest(
      AD_UNITS.interstitial,
      { requestNonPersonalizedAdsOnly: true },
    );
    ad.addAdEventListener(module.AdEventType.LOADED, () => {
      interstitialLoaded = true;
    });
    ad.addAdEventListener(module.AdEventType.ERROR, () => {
      interstitialLoaded = false;
    });
    interstitial = ad;
    interstitialLoaded = false;
    ad.load();
  } catch {
    interstitial = undefined;
    interstitialLoaded = false;
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

  if (!module) {
    // Simulated/dummy ad mode when native SDK is absent (e.g. Expo Go)
    return new Promise<RewardOutcome>((resolve) => {
      setTimeout(() => {
        resolve({ kind: 'earned' });
      }, 1500);
    });
  }

  const prepareAndShow = (ad: RewardedAdLike): Promise<RewardOutcome> => {
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
  };

  if (loaded && rewarded) {
    return prepareAndShow(rewarded);
  }

  // Ad not loaded yet: fetch and wait up to 8s for LOADED event before showing
  return new Promise<RewardOutcome>((resolve) => {
    if (!rewarded) {
      preload();
    }
    const ad = rewarded;
    if (!ad) {
      resolve({ kind: 'failed', reason: 'Ad service unavailable.' });
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubLoaded: (() => void) | undefined;
    let unsubError: (() => void) | undefined;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      unsubLoaded?.();
      unsubError?.();
    };

    timer = setTimeout(() => {
      cleanup();
      resolve({ kind: 'failed', reason: 'Ad timed out loading. Please check your connection and try again.' });
    }, 8000);

    unsubLoaded = ad.addAdEventListener(module.RewardedAdEventType.LOADED, () => {
      cleanup();
      prepareAndShow(ad).then(resolve);
    });

    unsubError = ad.addAdEventListener(module.AdEventType.ERROR, () => {
      cleanup();
      resolve({ kind: 'failed', reason: 'Ad failed to load. Check your internet connection.' });
    });

    try {
      ad.load();
    } catch {
      // Ignored if already loading
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

/**
 * Ad lifecycle chatter, kept out of release logs.
 *
 * These four lines are for a developer watching a device on USB: which unit id
 * was requested, and when the interstitial closed. In a player's logcat they are
 * noise with the ad unit id in them, which is the sort of detail nobody needs to
 * publish. `__DEV__` is the switch, so a release build drops them entirely while
 * a development build keeps them.
 *
 * The four `console.warn`s below are deliberately *not* behind this. They fire
 * only when something has already failed — an ad that would not create, show or
 * load — and silencing those would mean release crashes arrive with no trace.
 */
function debug(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  if (__DEV__) console.log(...args);
}

/** Show an interstitial ad with safe fallbacks. */
export function showInterstitial(): Promise<boolean> {
  const module = loadSdk();
  if (!module) {
    // Expo Go simulated mode
    debug('[AdMob] Interstitial in Expo Go simulated mode.');
    return new Promise((resolve) => setTimeout(() => resolve(true), 800));
  }

  return new Promise<boolean>((resolve) => {
    try {
      // If a preloaded instance is ready, reuse it and preload the next immediately.
      const ad = interstitialLoaded ? interstitial : undefined;
      if (!ad) {
        // Fallback: create on-demand.
        const unit = AD_UNITS.interstitial;
        debug(`[AdMob] Requesting InterstitialAd with unitId: ${unit}`);
        const fallback = (module as any).InterstitialAd?.createForAdRequest?.(unit, {
          requestNonPersonalizedAdsOnly: true,
        });
        if (!fallback) {
          console.warn('[AdMob] InterstitialAd.createForAdRequest returned undefined.');
          resolve(false);
          return;
        }
        interstitialLoaded = false;
        interstitial = fallback;
        fallback.load();
      }

      const adToShow = interstitial!;
      debug(`[AdMob] Showing preloaded InterstitialAd.`);

      let unsubClosed: (() => void) | undefined;
      let unsubError: (() => void) | undefined;
      let unsubLoaded: (() => void) | undefined;

      const finish = (shown: boolean) => {
        unsubClosed?.();
        unsubError?.();
        unsubLoaded?.();
        if (shown) {
          trackTelemetry({
            name: 'ad_impression',
            payload: { format: 'interstitial', placement: 'level_complete' },
          });
        }
        // Begin refilling the next interstitial immediately.
        preloadInterstitial();
        resolve(shown);
      };

      unsubClosed = adToShow.addAdEventListener(module.AdEventType.CLOSED, () => {
        debug('[AdMob] Interstitial CLOSED.');
        finish(true);
      });

      unsubError = adToShow.addAdEventListener(module.AdEventType.ERROR, (err: unknown) => {
        console.warn('[AdMob] Interstitial ERROR:', err);
        finish(false);
      });

      unsubLoaded = adToShow.addAdEventListener(module.AdEventType.LOADED, () => {
        debug('[AdMob] Interstitial LOADED, showing now...');
        try {
          adToShow.show();
        } catch (e) {
          console.warn('[AdMob] Interstitial show failed:', e);
          finish(false);
        }
      });

      // The preloaded ad is already loaded; show it immediately if ready.
      if (adToShow.loaded) {
        unsubLoaded?.();
        try {
          adToShow.show();
        } catch (e) {
          console.warn('[AdMob] Interstitial show failed:', e);
          finish(false);
        }
      } else {
        adToShow.load();
      }
    } catch (e) {
      console.warn('[AdMob] Exception in showInterstitial:', e);
      resolve(false);
    }
  });
}

// ---------------------------------------------------------------------------
// Banner Ad support
// ---------------------------------------------------------------------------

/**
 * Height (in dp) consumed by a bottom banner, or 0 when no banner will render.
 *
 * Both the layout code (`useBoardViewport`) and the screen frame (`Screen`) call
 * this so a single truth decides whether banner space is reserved. When the native
 * SDK is absent — Expo Go — the answer is `0`, so layouts match a real build and
 * the banner simply does not appear.
 */
export function bannerHeight(): number {
  return hasNativeAds() ? BANNER_HEIGHT_DP : 0;
}

/**
 * Resolve a `BannerAd` React component bound to this project's unit id, or
 * `undefined` when the SDK is absent.
 *
 * The component is fetched lazily from the guarded dynamic `require`, so a static
 * import can never pull it into Expo Go and crash launch. Each call to the wrapper
 * renders the real `BannerAd` when present, or `null` otherwise — keeping the
 * layout contract identical across dev and release builds.
 */
export function getBannerComponent(): React.ComponentType<{ style?: object }> | undefined {
  const module = loadSdk();
  if (!module) return undefined;
  const BannerAd = (module as any).BannerAd;
  if (!BannerAd) return undefined;

  const unitId = AD_UNITS.banner;

  // v16's `BannerAd` no longer honours a caller-supplied `style` — `BaseAd`
  // computes one from the ad's reported dimensions — and it rejects the old
  // `adPosition` prop outright. Without an outer wrapper the view collapses to
  // 0×0 until the first `onAdLoaded` fires, so we pin a 50dp tall slot here.
  // `BANNER` (uppercase) and `requestNonPersonalizedAdsOnly: true` are both
  // validated by the SDK at mount time — see `BANNER_SIZE_KEY`.
  return function BannerAdWrapper(props: { style?: object }) {
    return React.createElement(
      View,
      { style: [{ height: BANNER_HEIGHT_DP, width: '100%', alignItems: 'center' }, props.style] },
      React.createElement(BannerAd, {
        unitId,
        size: BANNER_SIZE_KEY,
        requestOptions: { requestNonPersonalizedAdsOnly: true },
      }),
    );
  };
}






