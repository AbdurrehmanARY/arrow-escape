/**
 * AdDiagnostics.tsx — development-only advertisement diagnostics screen.
 *
 * Displays real-time ad cache status, loading states, and statistics.
 * Only rendered in development mode.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRewardedAd } from '../hooks/useRewardedAd';
import { useInterstitialAd } from '../hooks/useInterstitialAd';
import { useBannerAd } from '../hooks/useBannerAd';
import { useTheme } from '@components';

export function AdDiagnostics() {
  const { palette } = useTheme();
  const { isReady: rewardedReady, availability: rewardedAvail, getStats: getRewardedStats } = useRewardedAd();
  const { isReady: interstitialReady, availability: interstitialAvail, getStats: getInterstitialStats } = useInterstitialAd();
  const { isReady: bannerReady, getBannerComponent } = useBannerAd();

  const [stats, setStats] = useState({
    rewarded: { ready: 0, total: 0, loading: 0 },
    interstitial: { ready: 0, total: 0, loading: 0 },
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setStats({
        rewarded: rewardedAdManager.getStats(),
        interstitial: interstitialAdManager.getStats(),
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!__DEV__) return null;

  const rewardedStats = rewardedAdManager.getStats();
  const interstitialStats = interstitialAdManager.getStats();

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <Text style={[styles.title, { color: palette.text }]}>Ad Diagnostics</Text>
      
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: palette.text }]}>Rewarded Ads</Text>
        <Text style={[styles.stat, { color: palette.text }]}>Status: {rewardedAdManager.getAvailability()}</Text>
        <Text style={[styles.stat, { color: palette.text }]}>Ready: {rewardedAdManager.getReadyCount()}/{rewardedAdManager.getTotalCount()}</Text>
        <Text style={[styles.stat, { color: palette.text }]}>Loading: {rewardedAdManager.getStats().loading}</Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: palette.text }]}>Interstitial Ads</Text>
        <Text style={[styles.stat, { color: palette.text }]}>Status: {interstitialAdManager.getAvailability()}</Text>
        <Text style={[styles.stat, { color: palette.text }]}>Ready: {interstitialAdManager.getReadyCount()}/{interstitialAdManager.getTotalCount()}</Text>
        <Text style={[styles.stat, { color: palette.text }]}>Loading: {interstitialAdManager.getStats().loading}</Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: palette.text }]}>Banner Ads</Text>
        <Text style={[styles.stat, { color: palette.text }]}>Ready: {bannerAdManager.isReady() ? 'Yes' : 'No'}</Text>
        <Text style={[styles.stat, { color: palette.text }]}>Space: {bannerAdManager.getBannerSpace()}dp</Text>
      </View>
    </View>
  );
}

// Import managers at module level for diagnostics
import { rewardedAdManager } from '../services/RewardedAdManager';
import { interstitialAdManager } from '../services/InterstitialAdManager';
import { bannerAdManager } from '../services/BannerAdManager';

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
  },
  section: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  stat: {
    fontSize: 14,
    fontFamily: 'monospace',
  },
});