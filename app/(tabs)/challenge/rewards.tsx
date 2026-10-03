/**
 * app/challenge/rewards.tsx — what the player has earned.
 *
 * Purpose:      Show the reward ladder, with real progress against every rung.
 * Notes:        **Not a placeholder shelf.** Every reward here is derived from the
 *               records the game already keeps, so the screen is truthful the first
 *               time it is opened and does not have to be rebuilt when an economy
 *               arrives. See `src/challenge/rewards.ts` for the ladder itself.
 *
 *               Locked rewards show their progress rather than hiding it. "2 of 3
 *               days" is an invitation; a grey box with a padlock is a wall.
 *
 *               Uses the 3-state `useCalculatedRewards` hook so that active,
 *               inactive, and locked states all show distinct artwork everywhere.
 */

import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { Screen, ScreenHeader, useTheme, withClick } from '@components';
import { useCalculatedRewards, type CalculatedRewardItem } from '@challenge';
import { radius, spacing, typography, type Palette } from '@theme';

import { useCurrentShield } from '../../../src/hooks/useCurrentShield';

export default function ChallengeRewardsScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  // Mount-stable instant — see `ChallengeBadges` for why the clock lives in state.
  const [nowMs] = useState(() => Date.now());
  const { shield } = useCurrentShield(nowMs);

  const rewards = useCalculatedRewards({ shieldId: shield?.id, nowMs });
  const list = Object.values(rewards);

  const earned = list.filter((r) => r.active);
  const inProgress = list.filter((r) => r.state === 'inactive');
  const locked = list.filter((r) => r.state === 'locked');

  return (
    <Screen palette={palette} scroll>
      <ScreenHeader
        palette={palette}
        title="Rewards"
        subtitle={`${earned.length} of ${list.length} earned`}
        onBack={() => router.back()}
      />

      {earned.length > 0 ? (
        <>
          <Text style={[styles.sectionTitle, { color: palette.textFaint }]}>Earned</Text>
          {earned.map((reward) => (
            <RewardCard key={reward.id} palette={palette} item={reward} onPress={() => router.push(reward.route as any)} />
          ))}
        </>
      ) : null}

      {inProgress.length > 0 ? (
        <>
          <Text style={[styles.sectionTitle, { color: palette.textFaint }]}>In progress</Text>
          {inProgress.map((reward) => (
            <RewardCard key={reward.id} palette={palette} item={reward} onPress={() => router.push(reward.route as any)} />
          ))}
        </>
      ) : null}

      {locked.length > 0 ? (
        <>
          <Text style={[styles.sectionTitle, { color: palette.textFaint }]}>Locked</Text>
          {locked.map((reward) => (
            <RewardCard key={reward.id} palette={palette} item={reward} onPress={() => router.push(reward.route as any)} />
          ))}
        </>
      ) : null}

      <Text style={[styles.footnote, { color: palette.textFaint }]}>
        Rewards are recognition for now — there is nothing to spend them on yet.
      </Text>
    </Screen>
  );
}

function RewardCard({
  palette,
  item,
  onPress,
}: {
  palette: Palette;
  item: CalculatedRewardItem;
  onPress: () => void;
}) {
  const { title, description, current, requirement, state, image, active, unit } = item;
  const fraction = requirement > 0 ? Math.min(current / requirement, 1) : 1;

  return (
    <Pressable
      onPress={withClick(onPress)}
      style={[
        styles.card,
        {
          backgroundColor: palette.surface,
          borderColor: active ? palette.success : palette.border,
        },
      ]}
    >
      {/* Badge / artwork */}
      <View style={styles.artWrap}>
        <Image
          source={image}
          style={[styles.art, state === 'locked' && { opacity: 0.6 }]}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
        {state === 'locked' ? (
          <View style={styles.lockOverlay}>
            <FontAwesome name="lock" size={10} color="#FFFFFF" />
          </View>
        ) : null}
      </View>

      {/* Text body */}
      <View style={styles.cardBody}>
        <Text style={[styles.name, { color: palette.text }]}>{title}</Text>
        <Text style={[styles.description, { color: palette.textMuted }]}>{description}</Text>

        {active ? (
          <Text style={[styles.earnedMark, { color: palette.success }]}>✓ Unlocked</Text>
        ) : state === 'inactive' ? (
          <>
            <View style={[styles.track, { backgroundColor: palette.surfaceRaised }]}>
              <View
                style={[
                  styles.fill,
                  { backgroundColor: palette.accent, width: `${Math.round(fraction * 100)}%` },
                ]}
              />
            </View>
            <Text style={[styles.progressText, { color: palette.textFaint }]}>
              {current} of {requirement} {unit}
            </Text>
          </>
        ) : (
          <Text style={[styles.lockedText, { color: palette.textFaint }]}>
            0 of {requirement} {unit}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    ...typography.small,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
  },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  artWrap: {
    width: 52,
    height: 52,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  art: { width: 52, height: 52 },
  lockOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, gap: 3 },
  name: { ...typography.body, fontWeight: '700' },
  description: { ...typography.small },
  earnedMark: { ...typography.small, fontWeight: '700', marginTop: 2 },
  lockedText: { ...typography.small, marginTop: 2 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: spacing.xs },
  fill: { height: 6, borderRadius: 3 },
  progressText: { ...typography.small },
  footnote: { ...typography.small, textAlign: 'center', marginTop: spacing.lg },
});
