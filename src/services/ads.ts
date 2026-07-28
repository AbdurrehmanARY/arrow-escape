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

import { AD_UNIT_IDS, USE_TEST_ADS } from '@config';

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

/** Resolve the SDK once, tolerating its absence. */
function loadSdk(): AdsModule | undefined {
  if (sdkChecked) return sdk;
  sdkChecked = true;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sdk = require('react-native-google-mobile-ads') as AdsModule;
  } catch {
    // Expected in Expo Go and in any build that has not added the native module.
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
  if (!loadSdk()) return 'unavailable';
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
    return Promise.resolve({
      kind: 'failed',
      reason: 'Ads are not available in this build.',
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
