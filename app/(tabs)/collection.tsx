/**
 * app/(tabs)/collection.tsx — records, awards and challenge trophies.
 *
 * Purpose:      The cabinet: everything the player has achieved, in one place.
 * Responsibilities:
 *               - Records — personal bests, with the date each was set.
 *               - Awards — the reward ladder, as progress tiles.
 *               - Challenge trophies — one per month, earned by completing days.
 * Notes:        **Every tile is real.** The reference design shows rendered 3D
 *               trophies and medals; those cannot be generated here, so each tile
 *               is a typographic badge in the app's own visual language rather than
 *               a broken-image box. Swapping in artwork later means changing
 *               `Tile`'s inner view and nothing else.
 *
 *               A month's trophy fills as the days are won — "6 of 31" — so an
 *               unfinished month reads as progress rather than failure. Months that
 *               have not happened yet are not shown at all, because a wall of
 *               zeroes for next November is not a collection, it is a to-do list.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen, useTheme, withClick } from '@components';
import {
  CHALLENGE_START,
  challengeId,
  daysInMonth,
  rewardProgress,
  today,
  type RewardProgress,
} from '@challenge';
import { statsOf, useChallengeStore } from '@state/challengeStore';
import { clearedCount, perfectCount, useProgressStore } from '@state/progressStore';
import { radius, spacing, typography, type Palette } from '@theme';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export default function CollectionScreen() {
  const router = useRouter();
  const { palette } = useTheme();

  const records = useChallengeStore((state) => state.records);
  const progressRecords = useProgressStore((state) => state.records);
  const bestPerfect = useProgressStore((state) => state.bestPerfectStreak);

  const now = useMemo(() => today(), []);
  const stats = useMemo(() => statsOf({ records }, now), [records, now]);
  const rewards = useMemo(() => rewardProgress(stats), [stats]);

  const cleared = useMemo(() => clearedCount(progressRecords), [progressRecords]);
  const perfect = useMemo(() => perfectCount(progressRecords), [progressRecords]);

  /**
   * One entry per month of the current year that has already begun.
   *
   * Counting wins per month rather than storing them, like everything else in this
   * feature.
   */
  const trophies = useMemo(() => {
    const out: { month: number; won: number; days: number }[] = [];
    // Start at the month the series began, not January: months before it never had
    // challenges, so a trophy for them could never be earned.
    const from = now.year === CHALLENGE_START.year ? CHALLENGE_START.month : 1;
    for (let month = from; month <= now.month; month += 1) {
      const days = daysInMonth(now.year, month);
      let won = 0;
      for (let day = 1; day <= days; day += 1) {
        if (records[challengeId({ year: now.year, month, day })]?.outcome === 'won') won += 1;
      }
      out.push({ month, won, days });
    }
    return out.reverse();
  }, [records, now]);

  return (
    <Screen scroll>
      <Text style={[styles.pageTitle, { color: palette.text }]}>Collection</Text>

      {/* ---- Records --------------------------------------------------- */}
      <SectionTitle palette={palette} label="Records" />
      <View style={styles.row}>
        <Tile
          palette={palette}
          glyph="▲"
          value={String(stats.longestStreak)}
          label="Longest challenge streak"
        />
        <Tile
          palette={palette}
          glyph="★"
          value={String(bestPerfect)}
          label="Best perfect run"
        />
        <Tile palette={palette} glyph="◆" value={String(cleared)} label="Levels cleared" />
      </View>

      {/* ---- Awards ---------------------------------------------------- */}
      <SectionTitle palette={palette} label="Awards" />
      <View style={styles.grid}>
        {rewards.map((reward) => (
          <AwardTile key={reward.definition.id} palette={palette} reward={reward} />
        ))}
      </View>

      {/* ---- Challenge trophies ---------------------------------------- */}
      <SectionTitle palette={palette} label="Challenge trophies" />
      <Text style={[styles.year, { color: palette.text }]}>{now.year}</Text>

      {trophies.length === 0 ? (
        <Text style={[styles.empty, { color: palette.textMuted }]}>
          Win a daily challenge and this year&apos;s trophies start filling.
        </Text>
      ) : (
        <View style={styles.grid}>
          {trophies.map(({ month, won, days }) => (
            <TrophyTile
              key={month}
              palette={palette}
              label={MONTHS[month - 1]!}
              won={won}
              days={days}
              onPress={() => router.push('/challenge/history')}
            />
          ))}
        </View>
      )}

      <Text style={[styles.footnote, { color: palette.textFaint }]}>
        {perfect} of your {cleared} cleared levels were read without a single mistake.
      </Text>
    </Screen>
  );
}

function SectionTitle({ palette, label }: { palette: Palette; label: string }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.sectionTitle, { color: palette.accent }]}>{label}</Text>
      <View style={[styles.rule, { backgroundColor: palette.border }]} />
    </View>
  );
}

/** A record tile: one number and what it means. */
function Tile({
  palette,
  glyph,
  value,
  label,
}: {
  palette: Palette;
  glyph: string;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.tileWrap}>
      <View style={[styles.tile, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={[styles.tileGlyph, { color: palette.accent }]}>{glyph}</Text>
        <Text style={[styles.tileValue, { color: palette.text }]}>{value}</Text>
      </View>
      <Text style={[styles.tileLabel, { color: palette.textMuted }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

/** An award tile, dimmed until earned, with its progress underneath. */
function AwardTile({ palette, reward }: { palette: Palette; reward: RewardProgress }) {
  const { definition, earned, current } = reward;

  return (
    <View style={styles.tileWrap}>
      <View
        style={[
          styles.tile,
          {
            backgroundColor: earned ? palette.accentMuted : palette.surface,
            borderColor: earned ? palette.accent : palette.border,
          },
        ]}
      >
        <Text
          style={[styles.tileGlyph, { color: earned ? palette.accent : palette.textFaint }]}
        >
          {definition.glyph}
        </Text>
        <Text style={[styles.tileValue, { color: earned ? palette.text : palette.textFaint }]}>
          {definition.threshold}
        </Text>
      </View>
      <Text style={[styles.tileLabel, { color: palette.textMuted }]} numberOfLines={2}>
        {definition.name}
      </Text>
      <Text style={[styles.tileSub, { color: palette.textFaint }]}>
        {current} of {definition.threshold}
      </Text>
    </View>
  );
}

/** A month's trophy, filling as its days are won. */
function TrophyTile({
  palette,
  label,
  won,
  days,
  onPress,
}: {
  palette: Palette;
  label: string;
  won: number;
  days: number;
  onPress: () => void;
}) {
  const complete = won === days;
  const started = won > 0;

  return (
    <View style={styles.tileWrap}>
      <View
        style={[
          styles.tile,
          {
            backgroundColor: complete ? palette.accent : started ? palette.accentMuted : palette.surface,
            borderColor: started ? palette.accent : palette.border,
          },
        ]}
        onTouchEnd={withClick(onPress)}
      >
        <Text
          style={[
            styles.tileGlyph,
            { color: complete ? palette.textOnAccent : started ? palette.accent : palette.textFaint },
          ]}
        >
          ♛
        </Text>
      </View>
      <Text style={[styles.tileLabel, { color: palette.textMuted }]}>{label}</Text>
      <Text style={[styles.tileSub, { color: palette.textFaint }]}>
        {won} of {days}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pageTitle: { ...typography.display, marginBottom: spacing.md },

  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionTitle: { ...typography.heading, fontWeight: '800' },
  rule: { flex: 1, height: 1 },

  row: { flexDirection: 'row', gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

  tileWrap: { width: '31%', alignItems: 'center', marginBottom: spacing.md },
  tile: {
    width: '100%',
    aspectRatio: 1,
    borderWidth: 1,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tileGlyph: { fontSize: 26, fontWeight: '800' },
  tileValue: { ...typography.heading, fontWeight: '800' },
  tileLabel: { ...typography.small, textAlign: 'center', marginTop: spacing.xs },
  tileSub: { ...typography.small, fontSize: 11 },

  year: { ...typography.heading, fontWeight: '800', marginBottom: spacing.sm },
  empty: { ...typography.body, marginBottom: spacing.lg },
  footnote: { ...typography.small, textAlign: 'center', marginTop: spacing.lg },
});
