/**
 * app/challenge/history.tsx — every challenge the player has attempted.
 *
 * Purpose:      A scrollable record of past days, newest first, each tappable
 *               through to its detail.
 * Notes:        A `FlatList` rather than a mapped array, because this grows without
 *               bound — a year of daily play is 365 rows and every one of them
 *               would otherwise be mounted at once.
 *
 *               Rows are grouped by month with a sticky header, which is the only
 *               way a long history stays navigable without a date picker.
 */

import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen, ScreenHeader, Springy, useTheme, withClick } from '@components';
import { parseChallengeId, type ChallengeRecord } from '@challenge';
import { TIER_LABELS } from '@game/codec';
import { useChallengeStore } from '@state/challengeStore';
import { radius, spacing, typography, type Palette } from '@theme';

import { formatDuration } from './index';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

type Row =
  | { readonly kind: 'month'; readonly key: string; readonly label: string }
  | { readonly kind: 'record'; readonly key: string; readonly record: ChallengeRecord };

export default function ChallengeHistoryScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const records = useChallengeStore((state) => state.records);

  /**
   * Records newest-first, with a header inserted whenever the month changes.
   *
   * Built once per record change rather than per render: on a long history this is
   * the only allocation on the list's critical path.
   */
  const rows = useMemo<Row[]>(() => {
    const sorted = Object.values(records).sort((a, b) => b.id.localeCompare(a.id));
    const out: Row[] = [];
    let lastMonth = '';

    for (const record of sorted) {
      const date = parseChallengeId(record.id);
      if (!date) continue;
      const monthKey = `${date.year}-${date.month}`;
      if (monthKey !== lastMonth) {
        lastMonth = monthKey;
        out.push({
          kind: 'month',
          key: `m${monthKey}`,
          label: `${MONTHS[date.month - 1]} ${date.year}`,
        });
      }
      out.push({ kind: 'record', key: record.id, record });
    }
    return out;
  }, [records]);

  return (
    <Screen>
      <ScreenHeader
        palette={palette}
        title="History"
        subtitle={`${Object.keys(records).length} challenges attempted`}
        onBack={() => router.back()}
      />

      {rows.length === 0 ? (
        <View style={[styles.empty, { borderColor: palette.border }]}>
          <Text style={[styles.emptyGlyph, { color: palette.textFaint }]}>◆</Text>
          <Text style={[styles.emptyTitle, { color: palette.text }]}>No challenges yet</Text>
          <Text style={[styles.emptyBody, { color: palette.textMuted }]}>
            Every day you play appears here, with your time and how cleanly you read it.
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.key}
          stickyHeaderIndices={[]}
          initialNumToRender={14}
          windowSize={7}
          removeClippedSubviews
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          renderItem={({ item }) =>
            item.kind === 'month' ? (
              <Text style={[styles.month, { color: palette.textFaint }]}>{item.label}</Text>
            ) : (
              <HistoryRow
                palette={palette}
                record={item.record}
                onPress={() => router.push(`/challenge/${item.record.id}`)}
              />
            )
          }
        />
      )}
    </Screen>
  );
}

function HistoryRow({
  palette,
  record,
  onPress,
}: {
  palette: Palette;
  record: ChallengeRecord;
  onPress: () => void;
}) {
  const date = parseChallengeId(record.id);
  const won = record.outcome === 'won';
  const perfect = won && record.heartsLeft === 5 && record.hintsUsed === 0;

  return (
    <Springy
      accessibilityRole="button"
      accessibilityLabel={`${record.id}, ${won ? 'completed' : 'not completed'}`}
      onPress={withClick(onPress)}
      style={[
        styles.row,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
    >
      <View style={[styles.dayBadge, { backgroundColor: won ? palette.success : palette.dangerMuted }]}>
        <Text style={[styles.dayNumber, { color: palette.textOnAccent }]}>{date?.day ?? '?'}</Text>
      </View>

      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, { color: palette.text }]}>
          {TIER_LABELS[record.tier]}
          {perfect ? ' · flawless' : ''}
        </Text>
        <Text style={[styles.rowMeta, { color: palette.textMuted }]}>
          {won
            ? `${formatDuration(record.timeMs)} · ${record.moves} moves · ${record.heartsLeft}/5 hearts`
            : 'Out of hearts'}
        </Text>
      </View>

      <Text style={[styles.chevron, { color: palette.textFaint }]}>›</Text>
    </Springy>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: spacing.xxl },
  month: {
    ...typography.small,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  dayBadge: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dayNumber: { ...typography.body, fontWeight: '800' },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { ...typography.body, fontWeight: '700' },
  rowMeta: { ...typography.small },
  chevron: { fontSize: 24, fontWeight: '700' },

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
