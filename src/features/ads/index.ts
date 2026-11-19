/**
 * index.ts — barrel exports for the ads feature.
 */

export * from './config/adConfig';
export * from './types/ad.types';
export * from './services/AdMobService';
export * from './services/RewardedAdManager';
export * from './services/InterstitialAdManager';
export * from './services/BannerAdManager';
export * from './services/AdPreloadManager';
export * from './services/AdIdleManager';
export * from './hooks/useRewardedAd';
export * from './hooks/useInterstitialAd';
export * from './hooks/useBannerAd';
export * from './components/AdBanner';
export * from './components/AdDiagnostics';

// Singleton instances
export { rewardedAdManager } from './services/RewardedAdManager';
export { interstitialAdManager } from './services/InterstitialAdManager';
export { bannerAdManager } from './services/BannerAdManager';
export { adPreloadManager } from './services/AdPreloadManager';
export { adIdleManager } from './services/AdIdleManager';