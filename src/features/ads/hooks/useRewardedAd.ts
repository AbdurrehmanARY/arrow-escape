/**
 * useRewardedAd.ts — hook for rewarded ad interaction.
 */
import { useCallback, useEffect, useState } from 'react';
import { rewardedAdManager } from '../services/RewardedAdManager';

export function useRewardedAd() {
  const [isReady, setIsReady] = useState(rewardedAdManager.isReady());
  const [availability, setAvailability] = useState<'ready' | 'loading' | 'unavailable'>(rewardedAdManager.getAvailability());

  useEffect(() => {
    const checkAvailability = () => {
      setIsReady(rewardedAdManager.isReady());
      setAvailability(rewardedAdManager.getAvailability());
    };

    const interval = setInterval(checkAvailability, 1000);
    return () => clearInterval(interval);
  }, []);

  const showRewarded = useCallback(async () => {
    return rewardedAdManager.show();
  }, []);

  const preloadRewarded = useCallback((count = 1) => {
    rewardedAdManager.preload(count);
  }, []);

  return {
    isReady,
    availability,
    showRewarded,
    preloadRewarded,
    getStats: rewardedAdManager.getStats,
  };
}