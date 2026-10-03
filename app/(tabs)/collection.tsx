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

import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import FontAwesome from '@expo/vector-icons/FontAwesome';
import { MonthlyTrophyBadge, MonthlyTrophyModal, Screen, useTheme, withClick } from '@components';
import { playMusic } from '@services/audio';
import {
  challengeId,
  daysInMonth,
  today,
  useCalculatedRewards,
  type CalculatedRewardItem,
} from '@challenge';
import { statsOf, useChallengeStore , clearedCount, perfectCount, useProgressStore } from '@state';
import { useCurrentShield } from '../../src/hooks/useCurrentShield';

import { fonts, radius, spacing, typography, type Palette } from '@theme';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

function getAwardInfoRoute(id: string): string {
  switch (id) {
    case 'level-legend':
      return '/challenge/info/level-legend';
    case 'perfect-play':
      return '/challenge/info/perfect-play';
    case 'unstoppable':
      return '/challenge/info/unstoppable';
    case 'league-climber':
      return '/challenge/info/league-climber';
    case 'league-fighter':
      return '/challenge/info/league-fighter';
    case 'shield':
      return '/challenge/info/shield';
    case 'longest-streak':
      return '/challenge/info/longest-streak';
    case 'highest-win-streak':
      return '/challenge/info/highest-win-streak';
    case 'most-wins':
      return '/challenge/info/most-wins';
    default:
      return '/';
  }
}

export default function CollectionScreen() {
  const router = useRouter();
  const { palette } = useTheme();

  const records = useChallengeStore((state) => state.records);
  const progressRecords = useProgressStore((state) => state.records);
  // Mount-stable, for the same reason as every other caller: a re-render must not
  // be able to resolve a different week than the tiles already drawn.
  const [nowMs] = useState(() => Date.now());
  const { shield } = useCurrentShield(nowMs);

  useEffect(() => {
    playMusic('menu');
  }, []);

  const now = useMemo(() => today(), []);
  const stats = useMemo(() => statsOf({ records }, now), [records, now]);

  const calculatedRewards = useCalculatedRewards({ shieldId: shield?.id, nowMs });
  const rewardsList = useMemo(
    () =>
      Object.values(calculatedRewards).filter(
        (item) =>
          item.id !== 'longest-streak' &&
          item.id !== 'highest-win-streak' &&
          item.id !== 'most-wins',
      ),
    [calculatedRewards],
  );

  const cleared = useMemo(() => clearedCount(progressRecords), [progressRecords]);
  const perfect = useMemo(() => perfectCount(progressRecords), [progressRecords]);

  /**
   * All 12 monthly challenge trophies (January through December) for the current year.
   */
  const trophies = useMemo(() => {
    const out: { month: number; won: number; days: number }[] = [];
    for (let month = 1; month <= 12; month += 1) {
      const days = daysInMonth(now.year, month);
      let won = 0;
      for (let day = 1; day <= days; day += 1) {
        if (records[challengeId({ year: now.year, month, day })]?.outcome === 'won') won += 1;
      }
      out.push({ month, won, days });
    }
    return out;
  }, [records, now]);

  const [modalMonth, setModalMonth] = useState<number | null>(null);

  const modalTrophy = useMemo(
    () => (modalMonth !== null ? trophies.find((t) => t.month === modalMonth) : undefined),
    [modalMonth, trophies],
  );

  return (
    <Screen palette={palette} scroll>
      <Text style={[styles.pageTitle, { color: palette.text }]}>Collection</Text>

      {/* ---- Records --------------------------------------------------- */}
      <SectionTitle palette={palette} label="Records" />
      <View style={styles.grid}>
        {calculatedRewards['longest-streak'] ? (
          <Tile
            palette={palette}
            image={calculatedRewards['longest-streak'].image}
            state={calculatedRewards['longest-streak'].state}
            label="Longest Streak"
            subText={
              calculatedRewards['longest-streak'].state === 'active'
                ? `${stats.longestStreak} days`
                : calculatedRewards['longest-streak'].state === 'inactive'
                  ? `${stats.longestStreak}/7 days`
                  : 'Locked'
            }
            onPress={() => router.push('/challenge/info/longest-streak' as any)}
          />
        ) : null}

        {calculatedRewards['highest-win-streak'] ? (
          <Tile
            palette={palette}
            image={calculatedRewards['highest-win-streak'].image}
            state={calculatedRewards['highest-win-streak'].state}
            label="Highest Win Streak"
            subText={
              calculatedRewards['highest-win-streak'].state === 'active'
                ? `${stats.highestWinStreak} wins`
                : calculatedRewards['highest-win-streak'].state === 'inactive'
                  ? `${stats.highestWinStreak}/10 wins`
                  : 'Locked'
            }
            onPress={() => router.push('/challenge/info/highest-win-streak' as any)}
          />
        ) : null}

        {calculatedRewards['most-wins'] ? (
          <Tile
            palette={palette}
            image={calculatedRewards['most-wins'].image}
            state={calculatedRewards['most-wins'].state}
            label="Most Wins"
            subText={
              calculatedRewards['most-wins'].state === 'active'
                ? `${stats.won} wins`
                : calculatedRewards['most-wins'].state === 'inactive'
                  ? `${stats.won}/30 wins`
                  : 'Locked'
            }
            onPress={() => router.push('/challenge/info/most-wins' as any)}
          />
        ) : null}
      </View>

      {/* ---- Awards ---------------------------------------------------- */}
      <SectionTitle palette={palette} label="Awards" />
      <View style={styles.grid}>
        {rewardsList.map((item) => (
          <AwardTile
            key={item.id}
            palette={palette}
            item={item}
            onPress={() => router.push(getAwardInfoRoute(item.id) as any)}
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
              month={month}
              label={MONTHS[month - 1]!}
              won={won}
              days={days}
              onPress={() => setModalMonth(month)}
            />
          ))}
        </View>
      )}

      <Text style={[styles.footnote, { color: palette.textFaint }]}>
        {perfect} of your {cleared} cleared levels were read without a single mistake.
      </Text>

      <MonthlyTrophyModal
        visible={modalMonth !== null}
        month={modalMonth ?? 1}
        year={now.year}
        wins={modalTrophy?.won ?? 0}
        totalDays={modalTrophy?.days ?? 30}
        palette={palette}
        onClose={() => setModalMonth(null)}
        onGoToMonth={() => {
          const m = modalMonth;
          setModalMonth(null);
          if (m) {
            router.push({ pathname: '/challenge', params: { month: m, year: now.year } } as any);
          }
        }}
      />
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

/** A record tile: 3D artwork card, title, and date. */
function Tile({
  palette,
  image,
  state,
  label,
  subText,
  onPress,
}: {
  palette: Palette;
  image?: any | undefined;
  state?: 'active' | 'inactive' | 'locked';
  label: string;
  subText: string;
  onPress?: () => void;
}) {
  return (
    <Pressable style={styles.tileWrap} onPress={withClick(onPress)}>
      <View style={[styles.tileCard, { backgroundColor: 'transparent' }]}>
        <Image
          source={image}
          style={[styles.tileImage, state === 'locked' && { opacity: 0.75 }]}
          resizeMode="contain"
        />
        {state === 'locked' ? (
          <View style={styles.lockBadgeOverlay}>
            <FontAwesome name="lock" size={11} color="#FFFFFF" />
          </View>
        ) : null}
      </View>
      <Text style={[styles.tileLabel, { color: palette.text }]} numberOfLines={2}>
        {label}
      </Text>
      <Text
        style={[
          styles.tileSub,
          {
            color:
              state === 'active'
                ? palette.accent
                : state === 'inactive'
                  ? palette.textMuted
                  : palette.textFaint,
          },
        ]}
      >
        {subText}
      </Text>
    </Pressable>
  );
}

/** An award tile: active/inactive/locked icon card, name, and progress. */
function AwardTile({
  palette,
  item,
  onPress,
}: {
  palette: Palette;
  item: CalculatedRewardItem;
  onPress: () => void;
}) {
  const { title, current, requirement, state, image } = item;

  return (
    <Pressable style={styles.tileWrap} onPress={withClick(onPress)}>
      {/* Transparent, like `Tile` and `TrophyTile` above. This one tile was the only
          card in the grid painted an opaque `'white'`, which read as correct against
          the light Paper theme and as a hole cut in the screen on the other five —
          the award art is alpha-cut 3D imagery, so there is nothing for a white
          plate behind it to reveal. `AwardInfoLayout` already draws the same artwork
          on transparent for the same reason. */}
      <View style={[styles.tileCard, { backgroundColor: 'transparent' }]}>
        <Image
          source={image}
          style={[styles.tileImage, state === 'locked' && { opacity: 0.75 }]}
          resizeMode="contain"
        />
        {state === 'locked' ? (
          <View style={styles.lockBadgeOverlay}>
            <FontAwesome name="lock" size={11} color="#FFFFFF" />
          </View>
        ) : null}
      </View>
      <Text style={[styles.tileLabel, { color: palette.text }]} numberOfLines={2}>
        {title}
      </Text>
      <Text
        style={[
          styles.tileSub,
          {
            color:
              state === 'active'
                ? palette.accent
                : state === 'inactive'
                  ? palette.textMuted
                  : palette.textFaint,
          },
        ]}
      >
        {state === 'active' ? 'Unlocked' : state === 'inactive' ? `${current} of ${requirement}` : 'Locked'}
      </Text>
    </Pressable>
  );
}

/** A month's trophy tile. */
function TrophyTile({
  palette,
  month,
  label,
  won,
  days,
  onPress,
}: {
  palette: Palette;
  month: number;
  label: string;
  won: number;
  days: number;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.tileWrap} onPress={withClick(onPress)}>
      <View style={[styles.tileCard, { backgroundColor: 'transparent' }]}>
        <MonthlyTrophyBadge month={month} earned={won === days} />
      </View>
      <Text style={[styles.tileLabel, { color: palette.text }]}>{label}</Text>
      <Text style={[styles.tileSub, { color: palette.textMuted }]}>
        {won} of {days}
      </Text>
    </Pressable>
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

  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },

  tileWrap: { width: '31%', alignItems: 'center', marginBottom: spacing.md },
  tileCard: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: spacing.xs,
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  lockBadgeOverlay: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 15,
  },
  tileBadgeOverlay: {
    position: 'absolute',
    bottom: 4,
    alignSelf: 'center',
    zIndex: 10,
  },
  tileBadgeText: {
    fontSize: 24,
    lineHeight: 26,
    fontFamily: fonts.displayExtra,
    fontWeight: '900',
    color: '#FFFFFF',
    textShadowColor: '#000000',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
    letterSpacing: -0.5,
    includeFontPadding: false,
  },
  tileGlyph: { fontSize: 24, fontWeight: '800' },
  tileLabel: {
    ...typography.small,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: fonts.bodyBold,
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 15,
  },
  tileSub: { ...typography.small, fontSize: 11, fontWeight: '500', color: '#64748B', marginTop: 1 },

  year: { ...typography.heading, fontFamily: fonts.displayExtra, fontWeight: '800', marginBottom: spacing.sm },
  empty: { ...typography.body, marginBottom: spacing.lg },
  footnote: { ...typography.small, textAlign: 'center', marginTop: spacing.lg },
});
