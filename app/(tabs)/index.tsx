/**
 * app/(tabs)/index.tsx — Home.
 *
 * Purpose:      Get the player into a level in one tap, and put the two recurring
 *               things — leagues and today's challenge — where they cannot be
 *               missed.
 */

import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen, Springy, useTheme, withClick } from '@components';
import { playMusic } from '@services/audio';
import { today } from '@challenge';
import { LEVEL_COUNT, tierOf } from '@data/levels';
import { TIER_LABELS } from '@game/codec';
import { clearedCount, nextLevel, useProgressStore } from '@state/progressStore';
import { isDayWon, statsOf, useChallengeStore } from '@state/challengeStore';
import { arrowsFor, formatRemaining, leagueForArrows, msRemaining, weekOf } from '@league';
import { arrowsThisWeek, useLeagueStore } from '@state/leagueStore';
import { fonts, MIN_TOUCH_TARGET, radius, spacing, typography, type Palette } from '@theme';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const LEAGUE_IMAGES: Record<string, any> = {
  bronze: require('../../assets/images/shield_bronze.jpg'),
  silver: require('../../assets/images/shield_silver.jpg'),
  gold: require('../../assets/images/shield_gold.jpg'),
  ruby: require('../../assets/images/shield_ruby.jpg'),
  obsidian: require('../../assets/images/shield_obsidian.jpg'),
  diamond: require('../../assets/images/shield_diamond.jpg'),
};

const CUP_IMAGE = require('../../assets/images/cup.png');
const ARROW_ICON = require('../../assets/images/arrow_icon.png');

export default function HomeScreen() {
  const router = useRouter();
  const { palette } = useTheme();

  const records = useProgressStore((state) => state.records);
  const challengeRecords = useChallengeStore((state) => state.records);
  const leagueWeeks = useLeagueStore((state) => state.weeks);

  const now = useMemo(() => today(), []);
  const [nowMs] = useState(() => Date.now());
  const stats = useMemo(() => statsOf({ records: challengeRecords }, now), [challengeRecords, now]);
  const challengeDone = isDayWon({ records: challengeRecords }, now);

  const cleared = useMemo(() => clearedCount(records), [records]);
  const resume = useMemo(() => nextLevel(records, LEVEL_COUNT), [records]);
  const resumeTier = tierOf(resume);
  const resumeTierLabel = resumeTier ? TIER_LABELS[resumeTier] : 'Medium';

  const score = arrowsFor(arrowsThisWeek({ weeks: leagueWeeks }, nowMs), stats.won);
  const league = leagueForArrows(score);
  const currentWeek = useMemo(() => weekOf(nowMs), [nowMs]);
  const remainingText = formatRemaining(msRemaining(currentWeek, nowMs));

  useEffect(() => {
    playMusic('menu');
  }, []);

  return (
    <Screen scroll={false}>
      <View style={styles.container}>
        {/* ---- The two cards at top ---------------------------------------- */}
        <View style={styles.cards}>
          <Card
            palette={palette}
            title="Leagues"
            subtitle={`${remainingText} left`}
            onPress={() => router.push('/leagues')}
          >
            <View style={styles.emblemContainer}>
              <Image
                source={LEAGUE_IMAGES[league.id] ?? LEAGUE_IMAGES.bronze}
                style={styles.cardImage}
                resizeMode="contain"
              />
            </View>
            <View style={[styles.pillRow, { backgroundColor: palette.surfaceRaised }]}>
              <Image
                source={ARROW_ICON}
                style={styles.pillIcon}
                resizeMode="contain"
              />
              <Text style={[styles.pillText, { color: palette.text }]}>{score}</Text>
            </View>
          </Card>

          <Card
            palette={palette}
            title="Challenge"
            subtitle={`${MONTHS[now.month - 1]} ${now.day}`}
            onPress={() => router.push('/challenge')}
          >
            <View style={styles.emblemContainer}>
              <Image
                source={CUP_IMAGE}
                style={styles.cardImage}
                resizeMode="contain"
              />
            </View>
            <View
              style={[
                styles.pill,
                { backgroundColor: challengeDone ? palette.surfaceRaised : palette.accent },
              ]}
            >
              <Text
                style={[
                  styles.pillText,
                  { color: challengeDone ? palette.textMuted : palette.textOnAccent },
                ]}
              >
                {challengeDone ? 'Done' : 'Play'}
              </Text>
            </View>
          </Card>
        </View>

        {/* ---- Centered interactive block (Brand + Play button + Subtitle) -- */}
        <View style={styles.centerSection}>
          <View style={styles.brand}>
            <View style={styles.wordmarkRow}>
              <Text style={[styles.wordmarkIcon, { color: palette.accent }]}>▲</Text>
              <Text style={[styles.wordmarkText, { color: palette.text }]}>rrows</Text>
            </View>
            <Text style={[styles.levelLine, { color: palette.accent }]}>
              Level {resume}
            </Text>
            <Text style={[styles.levelDifficulty, { color: palette.textMuted }]}>
              {resumeTierLabel}
            </Text>
          </View>

          <Springy
            accessibilityRole="button"
            accessibilityLabel={`Play level ${resume}`}
            onPress={withClick(() => router.push(`/play/${resume}`))}
            style={[
              styles.play,
              { backgroundColor: palette.accent },
            ]}
          >
            <Text style={[styles.playLabel, { color: palette.textOnAccent }]}>
              Play
            </Text>
          </Springy>

          <Springy
            accessibilityRole="button"
            onPress={withClick(() => router.push('/levels'))}
            style={[styles.secondary]}
          >
            <Text style={[styles.secondaryLabel, { color: palette.textMuted }]}>
              All levels · {cleared} of {LEVEL_COUNT} cleared
            </Text>
          </Springy>
        </View>
      </View>
    </Screen>
  );
}

function Card({
  palette,
  title,
  subtitle,
  onPress,
  children,
}: {
  palette: Palette;
  title: string;
  subtitle: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Springy
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}`}
      onPress={withClick(onPress)}
      style={[
        styles.card,
        { backgroundColor: palette.surface },
      ]}
    >
      <Text style={[styles.cardTitle, { color: palette.text }]}>{title}</Text>
      <Text style={[styles.cardSubtitle, { color: palette.textMuted }]}>{subtitle}</Text>
      {children}
    </Springy>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
  },
  cards: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  card: {
    flex: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  cardTitle: { ...typography.heading, fontSize: 20, fontFamily: fonts.displayExtra, fontWeight: '800', textAlign: 'center' },
  cardSubtitle: { ...typography.small, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  emblemContainer: {
    width: 134,
    height: 134,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
    overflow: 'hidden',
  },
  cardImage: {
    width: 134,
    height: 134,
    borderRadius: radius.sm,
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    minWidth: 76,
  },
  pillIcon: {
    width: 20,
    height: 20,
    backgroundColor: 'transparent',
  },
  pill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
    borderRadius: radius.pill,
    minWidth: 76,
    alignItems: 'center',
  },
  pillText: { ...typography.body, fontSize: 14, fontWeight: '800' },

  centerSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    marginVertical: spacing.sm,
  },
  brand: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  wordmarkIcon: {
    fontFamily: fonts.displayExtra,
    fontSize: 28,
    lineHeight: 34,
  },
  wordmarkText: {
    fontFamily: fonts.displayExtra,
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 38,
    letterSpacing: -0.5,
  },
  levelLine: { ...typography.title, fontFamily: fonts.displayExtra, fontWeight: '800', marginTop: 2, textAlign: 'center' },
  levelDifficulty: { ...typography.body, fontWeight: '700', marginTop: 1, textAlign: 'center' },

  play: {
    width: '85%',
    maxWidth: 340,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playLabel: {
    fontFamily: fonts.displayExtra,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1,
  },

  secondary: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  secondaryLabel: { ...typography.small, fontSize: 12, textAlign: 'center' },
});
