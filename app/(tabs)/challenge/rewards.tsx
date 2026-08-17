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
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen, ScreenHeader, useTheme } from '@components';
import { rewardProgress, today, type RewardProgress } from '@challenge';
import { statsOf, useChallengeStore } from '@state/challengeStore';
import { radius, spacing, typography, type Palette } from '@theme';

export default function ChallengeRewardsScreen() {
  const router = useRouter();
  const { palette } = useTheme();

  const records = useChallengeStore((state) => state.records);
  const now = useMemo(() => today(), []);
  const stats = useMemo(() => statsOf({ records }, now), [records, now]);
  const rewards = useMemo(() => rewardProgress(stats), [stats]);

  const earned = rewards.filter((reward) => reward.earned);
  const locked = rewards.filter((reward) => !reward.earned);

  return (
    <Screen scroll>
      <ScreenHeader
        palette={palette}
        title="Rewards"
        subtitle={`${earned.length} of ${rewards.length} earned`}
        onBack={() => router.back()}
      />

      {earned.length > 0 ? (
        <>
          <Text style={[styles.sectionTitle, { color: palette.textFaint }]}>Earned</Text>
          {earned.map((reward) => (
            <RewardCard key={reward.definition.id} palette={palette} reward={reward} />
          ))}
        </>
      ) : null}

      {locked.length > 0 ? (
        <>
          <Text style={[styles.sectionTitle, { color: palette.textFaint }]}>In progress</Text>
          {locked.map((reward) => (
            <RewardCard key={reward.definition.id} palette={palette} reward={reward} />
          ))}
        </>
      ) : null}

      <Text style={[styles.footnote, { color: palette.textFaint }]}>
        Rewards are recognition for now — there is nothing to spend them on yet.
      </Text>
    </Screen>
  );
}

function RewardCard({ palette, reward }: { palette: Palette; reward: RewardProgress }) {
  const { definition, earned, current, fraction } = reward;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: palette.surface,
          borderColor: earned ? palette.success : palette.border,
        },
      ]}
    >
      <View
        style={[
          styles.glyphWrap,
          { backgroundColor: earned ? palette.success : palette.surfaceRaised },
        ]}
      >
        <Text
          style={[styles.glyph, { color: earned ? palette.textOnAccent : palette.textFaint }]}
        >
          {definition.glyph}
        </Text>
      </View>

      <View style={styles.cardBody}>
        <Text style={[styles.name, { color: palette.text }]}>{definition.name}</Text>
        <Text style={[styles.description, { color: palette.textMuted }]}>
          {definition.description}
        </Text>

        {earned ? (
          <Text style={[styles.earnedMark, { color: palette.success }]}>Earned</Text>
        ) : (
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
              {current} of {definition.threshold}
            </Text>
          </>
        )}
      </View>
    </View>
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
  glyphWrap: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 22, fontWeight: '800' },
  cardBody: { flex: 1, gap: 3 },
  name: { ...typography.body, fontWeight: '700' },
  description: { ...typography.small },
  earnedMark: { ...typography.small, fontWeight: '700', marginTop: 2 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: spacing.xs },
  fill: { height: 6, borderRadius: 3 },
  progressText: { ...typography.small },

  footnote: { ...typography.small, textAlign: 'center', marginTop: spacing.lg },
});
