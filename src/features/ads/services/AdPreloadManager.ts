/**
 * AdPreloadManager.ts — centralized advertisement preloading coordinator.
 *
 * Coordinates preloading of all ad formats and manages cache replenishment.
 */

import { rewardedAdManager } from './RewardedAdManager';
import { interstitialAdManager } from './InterstitialAdManager';
import { bannerAdManager } from './BannerAdManager';

export class AdPreloadManager {
  private isPreloading = false;

  /** Preload all ad formats */
  async preloadAll(): Promise<void> {
    if (this.isPreloading) return;
    this.isPreloading = true;

    try {
      // Preload rewarded ads
      rewardedAdManager.preload(3);
      
      // Preload interstitial ads
      interstitialAdManager.preload(2);
      
      // Banner doesn't need preloading
      bannerAdManager.preload();
    } finally {
      this.isPreloading = false;
    }
  }

  /** Replenish cache after ad consumption */
  replenishCache(): void {
    rewardedAdManager.preload(1);
    interstitialAdManager.preload(1);
  }

  /** Check if rewarded ads are ready */
  isRewardedReady(): boolean {
    return rewardedAdManager.isReady();
  }

  /** Check if interstitial ads are ready */
  isInterstitialReady(): boolean {
    return interstitialAdManager.isReady();
  }

  /** Get rewarded ad availability */
  getRewardedAvailability(): 'ready' | 'loading' | 'unavailable' {
    return rewardedAdManager.getReadyCount() > 0 ? 'ready' : 'unavailable';
  }

  /** Get interstitial ad availability */
  getInterstitialAvailability(): 'ready' | 'loading' | 'unavailable' {
    return interstitialAdManager.isReady() ? 'ready' : 'unavailable';
  }

  /** Get cache statistics */
  getCacheStats() {
    return {
      rewarded: rewardedAdManager.getStats(),
      interstitial: interstitialAdManager.getStats(),
    };
  }
}

export const adPreloadManager = new AdPreloadManager();