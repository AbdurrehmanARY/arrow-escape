/**
 * useBannerAd.ts — hook for banner ad interaction.
 */
import { useCallback, useEffect, useState } from 'react';
import { bannerAdManager } from '../services/BannerAdManager';

export function useBannerAd() {
  const [isReady, setIsReady] = useState(bannerAdManager.isReady());
  const [bannerSpace, setBannerSpace] = useState(bannerAdManager.getBannerSpace());

  useEffect(() => {
    const checkAvailability = () => {
      setIsReady(bannerAdManager.isReady());
      setBannerSpace(bannerAdManager.getBannerSpace());
    };

    const interval = setInterval(checkAvailability, 1000);
    return () => clearInterval(interval);
  }, []);

  return {
    isReady,
    bannerSpace,
    getBannerComponent: bannerAdManager.getBannerComponent,
  };
}