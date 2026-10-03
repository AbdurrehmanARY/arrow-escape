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

import { useTheme } from './Screen';
import { withAlpha } from '@theme';

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
  // Only for the badge below. The cup itself is baked art in a fixed colour, so it
  // takes the palette like everything else rather than being re-tinted per theme.
  const { palette } = useTheme();

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
          <View style={[styles.starBadge, { backgroundColor: palette.success }]}>
            {/* `palette.background`, not white: `success` runs from `#0B6E4F` (Paper,
                near-black green) to `#6BFFB0` (a near-neon mint), so a fixed white
                tick is legible on the dark end and all but invisible on the light
                end. The background token is the one colour guaranteed to contrast
                with the theme's own fills, and it is what the lock glyph below uses. */}
            <Text style={[styles.starText, { color: palette.background }]}>✓</Text>
          </View>
        ) : (
          <View style={[styles.starBadge, { backgroundColor: withAlpha(palette.textFaint, 0.9) }]}>
            <FontAwesome name="lock" size={10} color={palette.background} />
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
    fontSize: 11,
    fontWeight: '900',
  },
});
