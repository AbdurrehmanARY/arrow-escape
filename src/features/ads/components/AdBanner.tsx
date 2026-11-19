/**
 * AdBanner.tsx — optimized banner ad component.
 *
 * Renders the AdMob banner with proper sizing and loading states.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useBannerAd } from '../hooks/useBannerAd';
import { useTheme } from '@components';

export function AdBanner() {
  const { isReady, getBannerComponent, bannerSpace } = useBannerAd();
  const { palette } = useTheme();

  if (!isReady || bannerSpace <= 0) return null;

  const BannerAd = getBannerComponent();
  if (!BannerAd) return null;

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <BannerAd style={{ height: bannerSpace }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});