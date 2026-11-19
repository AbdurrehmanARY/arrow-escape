/**
 * useInterstitialAd.ts — hook for interstitial ad interaction.
 */
import { useCallback, useEffect, useState } from 'react';
import { interstitialAdManager } from '../services/InterstitialAdManager';

export function useInterstitialAd() {
  const [isReady, setIsReady] = useState(interstitialAdManager.isReady());
  const [availability, setAvailability] = useState<'ready' | 'loading' | 'unavailable'>(interstitialAdManager.isReady() ? 'ready' : 'unavailable');

  useEffect(() => {
    const checkAvailability = () => {
      setIsReady(interstitialAdManager.isReady());
      setAvailability(interstitialAdManager.isReady() ? 'ready' : 'unavailable');
    };

    const interval = setInterval(checkAvailability, 1000);
    return () => clearInterval(interval);
  }, []);

  const showInterstitial = useCallback(async () => {
    return interstitialAdManager.show();
  }, []);

  const preloadInterstitial = useCallback((count = 1) => {
    interstitialAdManager.preload(count);
  }, []);

  return {
    isReady,
    availability,
    showInterstitial,
    preloadInterstitial,
    getStats: interstitialAdManager.getStats,
  };
}