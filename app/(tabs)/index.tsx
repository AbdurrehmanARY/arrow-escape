/**
 * app/(tabs)/index.tsx — Home.
 *
 * Purpose:      Get the player into a level in one tap, and put the two recurring
 *               things — leagues and today's challenge — where they cannot be
 *               missed.
 * Notes:        Laid out to the reference design: a streak chip at the top, two
 *               summary cards side by side, the wordmark and current level in the
 *               middle, and one large Play button.
 *
 *               **The cards are live, not decoration.** Leagues shows the real
 *               score and tier; Challenge shows today's date and whether it is
 *               done. A card that always says the same thing is a button wearing a
 *               costume, and players learn to stop looking at it within a day.
 *
 *               Level select moved off this screen — it is reachable from Play's
 *               long tail rather than competing with it. Rank and record live in
 *               the Collection tab now, which is why the old stat row is gone.
 */

import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen, Springy, useTheme, withClick } from '@components';
import { playMusic } from '@services/audio';
import { challengeFor, today } from '@challenge';
import { TIER_LABELS } from '@game/codec';
import { LEVEL_COUNT, tierOf } from '@data/levels';
import { clearedCount, nextLevel, useProgressStore } from '@state/progressStore';
import { useHintStore } from '@state/hintStore';
import { isDayWon, statsOf, useChallengeStore } from '@state/challengeStore';
import { arrowsFor, leagueForArrows } from '@league';
import { arrowsThisWeek, useLeagueStore } from '@state/leagueStore';
import { fonts, MIN_TOUCH_TARGET, radius, spacing, typography, type Palette } from '@theme';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export default function HomeScreen() {
  const router = useRouter();
  const { palette } = useTheme();

  const records = useProgressStore((state) => state.records);
  const hints = useHintStore((state) => state.available);
  const challengeRecords = useChallengeStore((state) => state.records);
  const leagueWeeks = useLeagueStore((state) => state.weeks);

  const now = useMemo(() => today(), []);
  // A lazy state initialiser rather than `useMemo`: the React Compiler treats
  // `Date.now()` in a render body as impure wherever it appears, and it is right —
  // two renders a frame apart would disagree. State is read once, at mount.
  const [nowMs] = useState(() => Date.now());
  const stats = useMemo(() => statsOf({ records: challengeRecords }, now), [challengeRecords, now]);
  // Derived, like every other count in this project — a stored "done today" flag
  // would survive midnight and quietly lie.
  const challengeDone = isDayWon({ records: challengeRecords }, now);

  const cleared = useMemo(() => clearedCount(records), [records]);
  const resume = useMemo(() => nextLevel(records, LEVEL_COUNT), [records]);
  const started = cleared > 0;

  // The same weekly score the Leagues tab shows — derived from the shared domain
  // rather than recomputed here, so the two can never disagree.
  const score = arrowsFor(arrowsThisWeek({ weeks: leagueWeeks }, nowMs), stats.won);
  const league = leagueForArrows(score);

  const todayLevel = challengeFor(now);
  const todayTier = todayLevel === undefined ? undefined : tierOf(todayLevel);

  // The menu bed. Asking for a track already playing is a no-op, so returning to
  // Home from a level cross-fades once and repeat renders cost nothing.
  useEffect(() => {
    playMusic('menu');
  }, []);

  return (
    <Screen scroll>
      {/* ---- Streak chip ------------------------------------------------ */}
      <View style={styles.chipRow}>
        <View style={[styles.chip, { backgroundColor: palette.surface }]}>
          <Text style={[styles.chipGlyph, { color: palette.accent }]}>▲</Text>
          <Text style={[styles.chipValue, { color: palette.text }]}>{stats.currentStreak}</Text>
        </View>
        <View style={[styles.chip, { backgroundColor: palette.surface }]}>
          <Text style={[styles.chipGlyph, { color: palette.accent }]}>💡</Text>
          <Text style={[styles.chipValue, { color: palette.text }]}>{hints}</Text>
        </View>
      </View>

      {/* ---- The two cards ---------------------------------------------- */}
      <View style={styles.cards}>
        <Card
          palette={palette}
          title="Leagues"
          subtitle={league.name}
          onPress={() => router.push('/leagues')}
        >
          <View style={[styles.emblem, { backgroundColor: palette.accentMuted }]}>
            <Text style={[styles.emblemGlyph, { color: palette.accent }]}>◆</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: palette.surfaceRaised }]}>
            <Text style={[styles.pillText, { color: palette.text }]}>{score}</Text>
          </View>
        </Card>

        <Card
          palette={palette}
          title="Challenge"
          subtitle={`${MONTHS[now.month - 1]} ${now.day}`}
          onPress={() => router.push('/challenge')}
        >
          <View
            style={[
              styles.emblem,
              { backgroundColor: challengeDone ? palette.success : palette.accentMuted },
            ]}
          >
            <Text
              style={[
                styles.emblemGlyph,
                { color: challengeDone ? palette.textOnAccent : palette.accent },
              ]}
            >
              ♛
            </Text>
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
              {challengeDone ? 'Done' : todayTier ? TIER_LABELS[todayTier] : 'Play'}
            </Text>
          </View>
        </Card>
      </View>

      {/* ---- Wordmark ---------------------------------------------------- */}
      <View style={styles.brand}>
        <Text style={[styles.wordmark, { color: palette.text }]}>
          <Text style={{ color: palette.accent }}>▲</Text>rrows
        </Text>
        <Text style={[styles.levelLine, { color: palette.accent }]}>Level {resume}</Text>
      </View>

      {/* ---- Play -------------------------------------------------------- */}
      <Springy
        accessibilityRole="button"
        accessibilityLabel={started ? `Continue to level ${resume}` : 'Play level 1'}
        onPress={withClick(() => router.push(`/play/${resume}`))}
        style={[
          styles.play,
          { backgroundColor: palette.accent },
        ]}
      >
        <Text style={[styles.playLabel, { color: palette.textOnAccent }]}>
          {started ? 'Continue' : 'Play'}
        </Text>
      </Springy>

      <Springy
        accessibilityRole="button"
        onPress={withClick(() => router.push('/levels'))}
        style={[styles.secondary,]}
      >
        <Text style={[styles.secondaryLabel, { color: palette.textMuted }]}>
          All levels · {cleared} of {LEVEL_COUNT} cleared
        </Text>
      </Springy>
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
  chipRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  chipGlyph: { fontSize: 15 },
  chipValue: { ...typography.body, fontWeight: '800' },

  cards: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  card: {
    flex: 1,
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
  },
  cardTitle: { ...typography.heading, fontFamily: fonts.displayExtra, fontWeight: '800' },
  cardSubtitle: { ...typography.small },
  emblem: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.sm,
  },
  emblemGlyph: { fontSize: 32, fontWeight: '800' },
  pill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    minWidth: 84,
    alignItems: 'center',
  },
  pillText: { ...typography.body, fontWeight: '700' },

  brand: { alignItems: 'center', marginTop: spacing.xxl, marginBottom: spacing.xxl },
  wordmark: { ...typography.display, fontSize: 42, letterSpacing: -0.5 },
  levelLine: { ...typography.title, fontFamily: fonts.displayExtra, fontWeight: '800', marginTop: spacing.xs },

  play: {
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.xl,
  },
  playLabel: { ...typography.title, fontFamily: fonts.displayExtra, fontWeight: '800' },

  secondary: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  secondaryLabel: { ...typography.small },
});
