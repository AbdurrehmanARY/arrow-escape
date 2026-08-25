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
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { rewardArt } from '@challenge/rewardArt';
import { statsOf, useChallengeStore } from '@state/challengeStore';
import { clearedCount, perfectCount, useProgressStore } from '@state/progressStore';
import { fonts, radius, spacing, typography, type Palette } from '@theme';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const TROPHY_ACTIVE = require('../../assets/challenge/trophy_active.jpg');
const TROPHY_INACTIVE = require('../../assets/challenge/trophy_inactive.jpg');

const FLAME_ACTIVE = require('../../assets/challenge/flame_active.jpg');
const FLAME_INACTIVE = require('../../assets/challenge/flame_inactive.jpg');
const CROWN_ACTIVE = require('../../assets/challenge/crown_active.jpg');
const CROWN_INACTIVE = require('../../assets/challenge/crown_inactive.jpg');
const ARROW_ACTIVE = require('../../assets/challenge/arrow_active.jpg');
const ARROW_INACTIVE = require('../../assets/challenge/arrow_inactive.jpg');

function getAwardInfoRoute(id: string): string {
  switch (id) {
    case 'first-win':
      return '/challenge/info/level-legend';
    case 'perfect-1':
      return '/challenge/info/perfect-play';
    case 'perfect-50':
      return '/challenge/info/unstoppable';
    case 'streak-3':
      return '/challenge/info/league-climber';
    case 'streak-7':
      return '/challenge/info/league-fighter';
    case 'won-100':
      return '/challenge/info/most-wins';
    default:
      return '/challenge/info/level-legend';
  }
}

export default function CollectionScreen() {
  const router = useRouter();
  const { palette } = useTheme();

  const records = useChallengeStore((state) => state.records);
  const progressRecords = useProgressStore((state) => state.records);
  const _bestPerfect = useProgressStore((state) => state.bestPerfectStreak);

  const now = useMemo(() => today(), []);
  const stats = useMemo(() => statsOf({ records }, now), [records, now]);
  const rewards = useMemo(() => rewardProgress(stats), [stats]);

  const cleared = useMemo(() => clearedCount(progressRecords), [progressRecords]);
  const perfect = useMemo(() => perfectCount(progressRecords), [progressRecords]);

  /**
   * One entry per month of the current year that has already begun.
   */
  const trophies = useMemo(() => {
    const out: { month: number; won: number; days: number }[] = [];
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
          image={stats.longestStreak > 0 ? FLAME_ACTIVE : FLAME_INACTIVE}
          value={`${stats.longestStreak} days`}
          label="Longest streak"
          onPress={() => router.push('/challenge/info/longest-streak' as any)}
        />
        <Tile
          palette={palette}
          image={stats.highestWinStreak > 0 ? CROWN_ACTIVE : CROWN_INACTIVE}
          value={`${stats.highestWinStreak} streak`}
          label="Highest win streak"
          onPress={() => router.push('/challenge/info/highest-win-streak' as any)}
        />
        <Tile
          palette={palette}
          image={stats.won > 0 ? ARROW_ACTIVE : ARROW_INACTIVE}
          value={`${stats.won} wins`}
          label="Most wins"
          onPress={() => router.push('/challenge/info/most-wins' as any)}
        />
      </View>

      {/* ---- Awards ---------------------------------------------------- */}
      <SectionTitle palette={palette} label="Awards" />
      <View style={styles.grid}>
        {rewards.map((reward) => (
          <AwardTile
            key={reward.definition.id}
            palette={palette}
            reward={reward}
            onPress={() => router.push(getAwardInfoRoute(reward.definition.id) as any)}
          />
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

/** A record tile: 3D artwork, title, and count. */
function Tile({
  palette,
  image,
  value,
  label,
  onPress,
}: {
  palette: Palette;
  image: any;
  value: string;
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable style={styles.tileWrap} onPress={withClick(onPress)}>
      <View
        style={[
          styles.tile,
          {
            backgroundColor: 'transparent',
            borderColor: 'transparent',
            overflow: 'hidden',
          },
        ]}
      >
        <Image source={image} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
      </View>
      <Text style={[styles.tileLabel, { color: palette.text }]} numberOfLines={2}>
        {label}
      </Text>
      <Text style={[styles.tileSub, { color: palette.accent, fontWeight: '800' }]}>{value}</Text>
    </Pressable>
  );
}

/** An award tile, dimmed until earned, with its progress underneath. */
function AwardTile({
  palette,
  reward,
  onPress,
}: {
  palette: Palette;
  reward: RewardProgress;
  onPress: () => void;
}) {
  const { definition, earned, current } = reward;
  const art = rewardArt(definition.id);

  return (
    <Pressable style={styles.tileWrap} onPress={withClick(onPress)}>
      <View
        style={[
          styles.tile,
          {
            backgroundColor: 'transparent',
            borderColor: 'transparent',
            overflow: 'hidden',
          },
        ]}
      >
        {art ? (
          <Image
            source={earned ? art.earned : art.locked}
            style={{ width: '100%', height: '100%' }}
            resizeMode="contain"
          />
        ) : (
          <>
            <Text
              style={[styles.tileGlyph, { color: earned ? palette.accent : palette.textFaint }]}
            >
              {definition.glyph}
            </Text>
            <Text style={[styles.tileValue, { color: earned ? palette.text : palette.textFaint }]}>
              {definition.threshold}
            </Text>
          </>
        )}
      </View>
      <Text style={[styles.tileLabel, { color: palette.text }]} numberOfLines={2}>
        {definition.name}
      </Text>
      <Text style={[styles.tileSub, { color: palette.textMuted }]}>
        {current} of {definition.threshold}
      </Text>
    </Pressable>
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
  return (
    <View style={styles.tileWrap}>
      <View
        style={[
          styles.tile,
          {
            backgroundColor: 'transparent',
            borderColor: 'transparent',
            overflow: 'hidden',
          },
        ]}
        onTouchEnd={withClick(onPress)}
      >
        <Image
          source={won === days ? TROPHY_ACTIVE : TROPHY_INACTIVE}
          style={{ width: '100%', height: '100%' }}
          resizeMode="contain"
        />
      </View>
      <Text style={[styles.tileLabel, { color: palette.text }]}>{label}</Text>
      <Text style={[styles.tileSub, { color: palette.textMuted }]}>
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
  sectionTitle: { ...typography.heading, fontFamily: fonts.displayExtra, fontWeight: '800' },
  rule: { flex: 1, height: 1 },

  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', gap: '4.5%' },

  tileWrap: { width: '30%', alignItems: 'center', marginBottom: spacing.md },
  tile: {
    width: '100%',
    aspectRatio: 1,
    borderWidth: 1,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tileGlyph: { fontSize: 24, fontWeight: '800' },
  tileValue: { ...typography.heading, fontFamily: fonts.displayExtra, fontWeight: '800' },
  tileLabel: { ...typography.small, fontWeight: '700', fontFamily: fonts.bodyBold, textAlign: 'center', marginTop: spacing.xs },
  tileSub: { ...typography.small, fontSize: 11, fontWeight: '500' },

  year: { ...typography.heading, fontFamily: fonts.displayExtra, fontWeight: '800', marginBottom: spacing.sm },
  empty: { ...typography.body, marginBottom: spacing.lg },
  footnote: { ...typography.small, textAlign: 'center', marginTop: spacing.lg },
});
