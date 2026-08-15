/**
 * app/challenge/stats.tsx — Challenge Statistics.
 *
 * Purpose:      The full picture of a player's challenge history, beyond the four
 *               numbers the home screen has room for.
 * Notes:        Every figure is recomputed from the stored records on render. There
 *               is no cached summary anywhere in this feature, deliberately — see
 *               `challengeStore`.
 *
 *               Percentages are shown alongside counts rather than instead of them.
 *               "62%" after four challenges is noise; "5 of 8" is a fact.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen, ScreenHeader, useTheme } from '@components';
import { today } from '@challenge';
import { statsOf, useChallengeStore } from '@state/challengeStore';
import { radius, spacing, typography, type Palette } from '@theme';

import { formatDuration } from './index';

export default function ChallengeStatsScreen() {
  const router = useRouter();
  const { palette } = useTheme();

  const records = useChallengeStore((state) => state.records);
  const now = useMemo(() => today(), []);
  const stats = useMemo(() => statsOf({ records }, now), [records, now]);

  const all = useMemo(() => Object.values(records), [records]);
  const wins = useMemo(() => all.filter((r) => r.outcome === 'won'), [all]);

  const averageMoves = wins.length
    ? Math.round(wins.reduce((sum, r) => sum + r.moves, 0) / wins.length)
    : 0;
  const averageTime = wins.length
    ? Math.round(wins.reduce((sum, r) => sum + r.timeMs, 0) / wins.length)
    : 0;
  const hintless = wins.filter((r) => r.hintsUsed === 0).length;

  return (
    <Screen scroll>
      <ScreenHeader
        palette={palette}
        title="Statistics"
        subtitle="Your challenge history"
        onBack={() => router.back()}
      />

      {all.length === 0 ? (
        <Empty palette={palette} />
      ) : (
        <>
          <Section palette={palette} title="Streaks">
            <Row palette={palette} label="Current streak" value={`${stats.currentStreak} days`} />
            <Row palette={palette} label="Longest streak" value={`${stats.longestStreak} days`} />
          </Section>

          <Section palette={palette} title="Results">
            <Row palette={palette} label="Challenges played" value={String(stats.played)} />
            <Row
              palette={palette}
              label="Won"
              value={`${stats.won} of ${stats.played}`}
              detail={stats.played > 0 ? `${Math.round((stats.won / stats.played) * 100)}%` : undefined}
            />
            <Row palette={palette} label="Flawless wins" value={String(stats.perfect)} />
            <Row palette={palette} label="Won without a hint" value={String(hintless)} />
          </Section>

          <Section palette={palette} title="Speed">
            <Row
              palette={palette}
              label="Fastest win"
              value={stats.bestTimeMs === undefined ? '—' : formatDuration(stats.bestTimeMs)}
            />
            <Row
              palette={palette}
              label="Average win"
              value={averageTime > 0 ? formatDuration(averageTime) : '—'}
            />
            <Row
              palette={palette}
              label="Average moves"
              value={averageMoves > 0 ? String(averageMoves) : '—'}
            />
          </Section>

          <Section palette={palette} title="Help used">
            <Row palette={palette} label="Hints spent" value={String(stats.totalHintsUsed)} />
          </Section>
        </>
      )}
    </Screen>
  );
}

function Empty({ palette }: { palette: Palette }) {
  return (
    <View style={[styles.empty, { borderColor: palette.border }]}>
      <Text style={[styles.emptyGlyph, { color: palette.textFaint }]}>◆</Text>
      <Text style={[styles.emptyTitle, { color: palette.text }]}>Nothing to show yet</Text>
      <Text style={[styles.emptyBody, { color: palette.textMuted }]}>
        Play a daily challenge and your streaks, times and best reads will appear here.
      </Text>
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
      <Text style={[styles.sectionTitle, { color: palette.textFaint }]}>{title}</Text>
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        {children}
      </View>
    </View>
  );
}

function Row({
  palette,
  label,
  value,
  detail,
}: {
  palette: Palette;
  label: string;
  value: string;
  detail?: string | undefined;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: palette.textMuted }]}>{label}</Text>
      <View style={styles.rowRight}>
        <Text style={[styles.rowValue, { color: palette.text }]}>{value}</Text>
        {detail ? (
          <Text style={[styles.rowDetail, { color: palette.textFaint }]}>{detail}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.lg },
  sectionTitle: {
    ...typography.small,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
  },
  card: { borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  rowLabel: { ...typography.body, flexShrink: 1 },
  rowRight: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  rowValue: { ...typography.body, fontWeight: '700' },
  rowDetail: { ...typography.small },

  empty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyGlyph: { fontSize: 40 },
  emptyTitle: { ...typography.heading },
  emptyBody: { ...typography.body, textAlign: 'center' },
});
