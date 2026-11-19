/**
 * BannerAdManager.ts — manages banner ad lifecycle.
 */
import { loadAdsModule } from './AdMobService';
import type { ComponentType } from 'react';

export class BannerAdManager {
  private bannerComponent: ComponentType<any> | undefined;
  private bannerSpace = 0;
  private loaded = false;

  constructor() {
    const module = loadAdsModule();
    if (module?.BannerAd) {
      this.bannerComponent = module.BannerAd as ComponentType<any>;
      this.bannerSpace = 50; // Default banner height
      this.loaded = true;
    }
  }

  isReady(): boolean {
    return this.loaded;
  }

  getBannerComponent() {
    return this.bannerComponent;
  }

  getBannerSpace(): number {
    return this.bannerSpace;
  }

  preload(): void {
    // Banner ads don't need preloading in the same way
    // They load on demand when rendered
  }
}

export const bannerAdManager = new BannerAdManager();