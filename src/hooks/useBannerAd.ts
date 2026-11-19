import { useMemo } from 'react';
import { bannerHeight, getBannerComponent } from '@services/ads';

export function useBannerAd() {
  const BannerAd = useMemo(() => getBannerComponent(), []);
  const bannerSpace = useMemo(() => bannerHeight(), []);
  const shouldShow = BannerAd != null && bannerSpace > 0;

  return { BannerAd, bannerSpace, shouldShow };
}
