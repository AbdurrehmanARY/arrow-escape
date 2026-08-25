/**
 * ChallengeBadges.tsx — Badges section for Challenge and Record Awards.
 *
 * Displays all 8 Record Award types using the single source of truth hook.
 */

import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { useCalculatedRewards } from '@challenge';
import { fonts, radius, spacing, typography, type Palette } from '@theme';

const BADGE_ORDER = [
  'level-legend',
  'perfect-play',
  'unstoppable',
  'league-climber',
  'league-fighter',
  'longest-streak',
  'highest-win-streak',
  'most-wins',
];

export function ChallengeBadges({ palette }: { palette: Palette }) {
  const router = useRouter();
  const rewardsMap = useCalculatedRewards();

  const items = BADGE_ORDER.map((id) => rewardsMap[id]!).filter(Boolean);

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: palette.textFaint }]}>Record Awards & Trophies</Text>

      <View style={styles.grid}>
        {items.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}, ${item.displayValue}`}
            onPress={() => router.push(item.route as any)}
            style={[
              styles.card,
              {
                backgroundColor: palette.surface,
                borderColor: item.active ? palette.accent : palette.border,
              },
            ]}
          >
            <View style={styles.imageContainer}>
              <Image
                source={item.image}
                style={styles.image}
                resizeMode="contain"
              />
            </View>

            <View style={styles.cardContent}>
              <Text style={[styles.cardTitle, { color: palette.text }]} numberOfLines={1}>
                {item.title}
              </Text>
              <Text
                style={[
                  styles.cardValue,
                  { color: item.active ? palette.accent : palette.textMuted },
                ]}
              >
                {item.displayValue}
              </Text>
            </View>

            <View style={[styles.infoBtn, { backgroundColor: palette.accentMuted }]}>
              <FontAwesome name="info-circle" size={16} color={palette.accent} />
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: spacing.md },
  sectionTitle: {
    ...typography.small,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  grid: { gap: spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    gap: spacing.md,
  },
  imageContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: 56, height: 56 },
  cardContent: { flex: 1, gap: 2 },
  cardTitle: {
    fontFamily: fonts.displayExtra,
    fontWeight: '800',
    fontSize: 16,
  },
  cardValue: { ...typography.body, fontWeight: '700' },
  infoBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
