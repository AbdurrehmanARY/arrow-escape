// UpdateBanner.tsx -- Banner shown when an OTA update is available.

import React from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import Animated from 'react-native-reanimated';
import { useTheme, PillButton } from '@components';
import { useOTAUpdates } from '../hooks/useOTAUpdates';

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingTop: Platform.OS === 'ios' ? 20 : 0,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  icon: {
    fontSize: 20,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  subtitle: {
    fontSize: 12,
    opacity: 0.8,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  progressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  progressBar: {
    height: '100%',
    borderRadius: 0,
  },
});

export function UpdateBanner() {
  const { palette } = useTheme();
  const {
    updateAvailable,
    isDownloading,
    downloadProgress,
    error,
    fetchUpdate,
    reloadApp,
    dismissUpdate,
  } = useOTAUpdates();

  if (!updateAvailable && !isDownloading) return null;

  const bannerBg = isDownloading ? palette.accentMuted : palette.accent;
  const textColor = isDownloading ? palette.text : palette.textOnAccent;
  const secondaryText = isDownloading ? palette.textMuted : 'rgba(255,255,255,0.8)';

  const handleUpdateNow = async () => {
    await fetchUpdate();
  };

  const handleRestart = async () => {
    await reloadApp();
  };

  const handleLater = () => {
    dismissUpdate();
  };

  if (isDownloading) {
    return (
      <View style={styles.container}>
        <View style={[styles.banner, { backgroundColor: bannerBg }]}>
          <View style={styles.content}>
            <View style={styles.textContainer}>
              <Text style={[styles.title, { color: textColor }]}>Downloading Update</Text>
              <Text style={[styles.subtitle, { color: secondaryText }]}>
                {Math.round(downloadProgress * 100)}% complete
              </Text>
            </View>
            <ActivityIndicator size="small" color={textColor} />
          </View>
          <View style={styles.progressContainer}>
            <Animated.View
              style={[
                styles.progressBar,
                { backgroundColor: textColor, width: `${downloadProgress * 100}%` },
              ]}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.banner, { backgroundColor: bannerBg }]}>
        <View style={styles.content}>
          <View style={styles.textContainer}>
            <Text style={[styles.title, { color: textColor }]}>Update Available</Text>
            <Text style={[styles.subtitle, { color: secondaryText }]}>New version ready to install</Text>
          </View>
          <View style={styles.actions}>
            <PillButton
              palette={palette}
              label="Update Now"
              onPress={handleUpdateNow}
              primary={true}
            />
            <PillButton
              palette={palette}
              label="Later"
              onPress={handleLater}
              primary={false}
            />
          </View>
        </View>
      </View>
    </View>
  );
}
