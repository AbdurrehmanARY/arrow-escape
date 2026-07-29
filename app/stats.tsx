/**
 * app/stats.tsx — the record of a long game.
 *
 * Purpose:      Show what 600 levels of play actually amounts to.
 * Notes:        Six hundred levels is a commitment, and a progress bar on the menu
 *               is thin reward for it. This is the screen that says what kind of
 *               player someone has been — not just how far, but how cleanly.
 *
 *               Everything shown is derived from the same `records` the game
 *               already keeps. Nothing extra is tracked, because a stat that
 *               needs its own bookkeeping is a stat that can drift out of sync
 *               with the thing it claims to measure.
 *
 *               No time-played, no accuracy percentage carried to two decimals.
 *               A calm puzzle game measured like a fitness tracker stops being
 *               calm.
 */

import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { IconButton, Screen, useTheme } from '@components';
import { TIER_LABELS, TIER_ORDER, type DifficultyTier } from '@game/codec';
import { ENCODED_LEVELS, LEVEL_COUNT } from '@data/levels';
import { CHAPTERS, chapterProgress } from '@data/chapters';
import {
  clearedByQuality,
  clearedCount,
  isCleared,
  totalMistakes,
  useProgressStore,
} from '@state/progressStore';
import { useHintStore } from '@state/hintStore';
import { radius, spacing, typography, type Palette } from '@theme';

export default function StatsScreen() {
  const router = useRouter();
  const { palette } = useTheme();

  const records = useProgressStore((state) => state.records);
  const streak = useProgressStore((state) => state.perfectStreak);
  const bestStreak = useProgressStore((state) => state.bestPerfectStreak);
  const hintsSpent = useHintStore((state) => state.spent);

  const cleared = useMemo(() => clearedCount(records), [records]);
  const quality = useMemo(() => clearedByQuality(records), [records]);
  const mistakes = useMemo(() => totalMistakes(records), [records]);

  const chaptersDone = useMemo(
    () =>
      CHAPTERS.filter((chapter) => {
        const { cleared: done, total } = chapterProgress(chapter, (id) =>
          isCleared(records, id),
        );
        return done === total;
      }).length,
    [records],
  );

  /** Cleared count per tier, so a player can see what they are good at. */
  const byTier = useMemo(() => {
    const totals = new Map<DifficultyTier, { done: number; total: number }>();
    for (const tier of TIER_ORDER) totals.set(tier, { done: 0, total: 0 });

    for (const level of ENCODED_LEVELS) {
      const entry = totals.get(level.t);
      if (!entry) continue;
      entry.total += 1;
      if (isCleared(records, level.i)) entry.done += 1;
    }
    return totals;
  }, [records]);

  const started = cleared > 0;

  return (
    <Screen>
      <View style={styles.header}>
        <IconButton palette={palette} glyph="←" label="Back" onPress={() => router.back()} />
        <Text style={[styles.title, { color: palette.text }]}>Record</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {!started ? (
          <Text style={[styles.empty, { color: palette.textMuted }]}>
            Clear a level and your record starts here.
          </Text>
        ) : null}

        <View style={styles.tiles}>
          <Tile palette={palette} value={`${cleared}`} of={`/ ${LEVEL_COUNT}`} label="levels cleared" wide />
          <Tile palette={palette} value={`${quality.perfect}`} label="perfect reads" />
          <Tile palette={palette} value={`${chaptersDone}`} of={`/ ${CHAPTERS.length}`} label="chapters done" />
        </View>

        <Section palette={palette} title="Streak">
          <View style={styles.streakRow}>
            <View style={styles.streakItem}>
              <Text style={[styles.streakValue, { color: palette.heart }]}>{streak}</Text>
              <Text style={[styles.streakLabel, { color: palette.textFaint }]}>current</Text>
            </View>
            <View style={styles.streakItem}>
              <Text style={[styles.streakValue, { color: palette.text }]}>{bestStreak}</Text>
              <Text style={[styles.streakLabel, { color: palette.textFaint }]}>best</Text>
            </View>
          </View>
          <Text style={[styles.note, { color: palette.textFaint }]}>
            Levels cleared back to back without a single wrong tap. One misread ends it.
          </Text>
        </Section>

        <Section palette={palette} title="How you clear them">
          <Bar palette={palette} label="Perfect — no wrong taps" value={quality.perfect} total={cleared} color={palette.success} />
          <Bar palette={palette} label="Clean — one or two" value={quality.clean} total={cleared} color={palette.accent} />
          <Bar palette={palette} label="Scraped through" value={quality.scraped} total={cleared} color={palette.arrowBlocker} />
          <Text style={[styles.note, { color: palette.textFaint }]}>
            Counted from your best run on each level, so it only ever improves.
          </Text>
        </Section>

        <Section palette={palette} title="By difficulty">
          {TIER_ORDER.map((tier) => {
            const entry = byTier.get(tier) ?? { done: 0, total: 0 };
            return (
              <Bar
                key={tier}
                palette={palette}
                label={TIER_LABELS[tier]}
                value={entry.done}
                total={entry.total}
                color={palette.accent}
                showTotal
              />
            );
          })}
        </Section>

        <Section palette={palette} title="Along the way">
          <Line palette={palette} label="Wrong taps on your best runs" value={`${mistakes}`} />
          <Line palette={palette} label="Hints used" value={`${hintsSpent}`} />
        </Section>
      </ScrollView>
    </Screen>
  );
}

function Tile({
  palette,
  value,
  of,
  label,
  wide = false,
}: {
  palette: Palette;
  value: string;
  of?: string;
  label: string;
  wide?: boolean;
}) {
  return (
    <View
      style={[
        styles.tile,
        wide && styles.tileWide,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
    >
      <View style={styles.tileValueRow}>
        <Text style={[styles.tileValue, { color: palette.text }]}>{value}</Text>
        {of ? <Text style={[styles.tileOf, { color: palette.textFaint }]}>{of}</Text> : null}
      </View>
      <Text style={[styles.tileLabel, { color: palette.textFaint }]}>{label}</Text>
    </View>
  );
}

function Section({
  palette,
  title,
  children,
}: {
  palette: Palette;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: palette.textFaint }]}>{title.toUpperCase()}</Text>
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        {children}
      </View>
    </View>
  );
}

function Bar({
  palette,
  label,
  value,
  total,
  color,
  showTotal = false,
}: {
  palette: Palette;
  label: string;
  value: number;
  total: number;
  color: string;
  showTotal?: boolean;
}) {
  const fraction = total > 0 ? value / total : 0;

  return (
    <View style={styles.bar}>
      <View style={styles.barHead}>
        <Text style={[styles.barLabel, { color: palette.text }]}>{label}</Text>
        <Text style={[styles.barValue, { color: palette.textMuted }]}>
          {showTotal ? `${value}/${total}` : value}
        </Text>
      </View>
      <View style={[styles.barTrack, { backgroundColor: palette.border }]}>
        <View style={[styles.barFill, { backgroundColor: color, width: `${fraction * 100}%` }]} />
      </View>
    </View>
  );
}

function Line({ palette, label, value }: { palette: Palette; label: string; value: string }) {
  return (
    <View style={styles.line}>
      <Text style={[styles.lineLabel, { color: palette.textMuted }]}>{label}</Text>
      <Text style={[styles.lineValue, { color: palette.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerSpacer: { width: 44 },
  title: { ...typography.title },
  scroll: { paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  empty: { ...typography.body, textAlign: 'center', marginBottom: spacing.lg },

  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    flexGrow: 1,
    flexBasis: '30%',
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  tileWide: { flexBasis: '100%' },
  tileValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  tileValue: { ...typography.display, fontSize: 26, fontVariant: ['tabular-nums'] },
  tileOf: { ...typography.small, fontVariant: ['tabular-nums'] },
  tileLabel: { ...typography.tiny, marginTop: 2 },

  section: { marginTop: spacing.xl },
  sectionTitle: { ...typography.tiny, letterSpacing: 1.3, marginBottom: spacing.sm },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.md },

  streakRow: { flexDirection: 'row', gap: spacing.xl },
  streakItem: { alignItems: 'flex-start' },
  streakValue: { ...typography.display, fontSize: 34, fontVariant: ['tabular-nums'] },
  streakLabel: { ...typography.tiny },

  bar: { gap: spacing.xs },
  barHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  barLabel: { ...typography.small, fontWeight: '600' },
  barValue: { ...typography.small, fontVariant: ['tabular-nums'] },
  barTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },

  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  lineLabel: { ...typography.small, flex: 1 },
  lineValue: { ...typography.body, fontWeight: '700', fontVariant: ['tabular-nums'] },

  note: { ...typography.small, lineHeight: 17 },
});
