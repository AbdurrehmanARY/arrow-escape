/**
 * MonthlyTrophyBadge.tsx — Render 12 distinct monthly trophy cups with transparent backgrounds.
 *
 * Purpose:      Renders a 3D sculpted cup trophy for each month (January - December)
 *               with month-specific gem colors, badges, and active/inactive states
 *               on a 100% transparent background.
 */

import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Image, StyleSheet, Text, View } from 'react-native';
import { getMonthlyTrophyAsset } from '@challenge';

export interface MonthlyTrophyBadgeProps {
  readonly month: number;
  readonly earned: boolean;
  readonly size?: number | undefined;
  readonly showBadge?: boolean | undefined;
}

export function MonthlyTrophyBadge({
  month,
  earned,
  size = 120,
  showBadge = false,
}: MonthlyTrophyBadgeProps) {
  const asset = getMonthlyTrophyAsset(month, earned);

  return (
    <View
      style={[
        styles.container,
        size ? { width: size, height: size } : { width: '100%', height: '100%' },
      ]}
    >
      <Image source={asset} style={styles.image} resizeMode="contain" />
      {showBadge ? (
        earned ? (
          <View style={[styles.starBadge, { backgroundColor: '#10B981' }]}>
            <Text style={styles.starText}>✓</Text>
          </View>
        ) : (
          <View style={[styles.starBadge, { backgroundColor: 'rgba(100, 116, 139, 0.75)' }]}>
            <FontAwesome name="lock" size={10} color="#FFFFFF" />
          </View>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    backgroundColor: 'transparent',
  },
  image: {
    width: '100%',
    height: '100%',
  },

  starBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  starText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
});
