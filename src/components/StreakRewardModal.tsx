/**
 * StreakRewardModal.tsx — 7-Day Progressive Streak Rewards Modal.
 *
 * Displays a 7-day reward roadmap (League Arrows, Hints, Golden Chest)
 * with interactive claim buttons and clear active state indicators.
 */

import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { STREAK_REWARDS, useStreakStore, type StreakReward } from '@state/streakStore';
import { fonts, radius, spacing, typography, type Palette } from '@theme';
import { Springy } from './Pressable';
import { withClick } from './sound';

export interface StreakRewardModalProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly palette: Palette;
  readonly onRewardClaimed?: (reward: StreakReward) => void;
}

export function StreakRewardModal({
  visible,
  onClose,
  palette,
  onRewardClaimed,
}: StreakRewardModalProps) {
  const currentDay = useStreakStore((state) => state.currentDay);
  const canClaim = useStreakStore((state) => state.canClaimToday());
  const claimToday = useStreakStore((state) => state.claimToday);

  const [claimedReward, setClaimedReward] = useState<StreakReward | null>(null);

  const handleClaim = () => {
    const reward = claimToday();
    if (reward) {
      setClaimedReward(reward);
      onRewardClaimed?.(reward);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={withClick(onClose)}>
        <Pressable
          style={[styles.dialog, { backgroundColor: palette.surface, borderColor: palette.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <Text style={[styles.eyebrow, { color: palette.accent }]}>DAILY REWARD STREAK</Text>
          <Text style={[styles.title, { color: palette.text }]}>7-Day Bonus Roadmap</Text>

          {claimedReward ? (
            <View style={styles.claimedContainer}>
              <Text style={styles.claimedEmoji}>
                {claimedReward.isGoldenChest ? '🎁' : claimedReward.hints > 0 ? '💡' : '🏹'}
              </Text>
              <Text style={[styles.claimedTitle, { color: palette.text }]}>
                {claimedReward.isGoldenChest
                  ? 'GOLDEN CHEST UNLOCKED!'
                  : 'REWARD CLAIMED!'}
              </Text>
              <Text style={[styles.claimedSubtitle, { color: palette.textMuted }]}>
                {claimedReward.arrows > 0 ? `+${claimedReward.arrows} League Arrows ` : ''}
                {claimedReward.hints > 0 ? `+${claimedReward.hints} Free Hints` : ''}
              </Text>
            </View>
          ) : (
            /* 7-Day Grid */
            <View style={styles.grid}>
              {STREAK_REWARDS.map((reward) => {
                const isActive = reward.day === currentDay;
                const isPast = reward.day < currentDay;
                const isChest = reward.isGoldenChest;

                return (
                  <View
                    key={reward.day}
                    style={[
                      styles.card,
                      {
                        backgroundColor: isActive
                          ? palette.surfaceRaised
                          : palette.surface,
                        borderColor: isActive ? palette.accent : palette.border,
                        opacity: isPast ? 0.6 : 1,
                      },
                      isChest && styles.chestCard,
                    ]}
                  >
                    <Text style={[styles.dayLabel, { color: palette.textFaint }]}>
                      DAY {reward.day}
                    </Text>
                    <Text style={styles.iconEmoji}>
                      {isChest ? '👑' : reward.hints > 0 ? '💡' : '🏹'}
                    </Text>
                    <Text style={[styles.rewardValue, { color: palette.text }]}>
                      {reward.arrows > 0 ? `+${reward.arrows}` : `+${reward.hints} Hint`}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actions}>
            {canClaim && !claimedReward ? (
              <Springy
                accessibilityRole="button"
                onPress={withClick(handleClaim)}
                style={[styles.primaryButton, { backgroundColor: palette.accent }]}
              >
                <Text style={[styles.primaryButtonText, { color: palette.textOnAccent }]}>
                  Claim Day {currentDay} Reward
                </Text>
              </Springy>
            ) : (
              <Springy
                accessibilityRole="button"
                onPress={withClick(onClose)}
                style={[
                  styles.secondaryButton,
                  { backgroundColor: palette.surfaceRaised, borderColor: palette.border },
                ]}
              >
                <Text style={[styles.secondaryButtonText, { color: palette.text }]}>
                  {claimedReward ? 'Awesome!' : 'Close'}
                </Text>
              </Springy>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  eyebrow: {
    ...typography.tiny,
    letterSpacing: 1.4,
    fontWeight: '800',
  },
  title: {
    fontFamily: fonts.displayExtra,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  claimedContainer: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.xs,
  },
  claimedEmoji: {
    fontSize: 48,
  },
  claimedTitle: {
    fontFamily: fonts.displayExtra,
    fontSize: 18,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  claimedSubtitle: {
    ...typography.body,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'center',
    marginVertical: spacing.sm,
  },
  card: {
    width: '30%',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    gap: 2,
  },
  chestCard: {
    width: '96%',
    marginTop: spacing.xs,
    paddingVertical: spacing.md,
  },
  dayLabel: {
    ...typography.tiny,
    fontWeight: '800',
    fontSize: 10,
  },
  iconEmoji: {
    fontSize: 20,
    marginVertical: 2,
  },
  rewardValue: {
    ...typography.small,
    fontWeight: '700',
    fontSize: 12,
  },
  actions: {
    width: '100%',
    marginTop: spacing.sm,
  },
  primaryButton: {
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontFamily: fonts.displayExtra,
    fontWeight: '800',
    fontSize: 16,
  },
  secondaryButton: {
    height: 48,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontFamily: fonts.displayExtra,
    fontWeight: '800',
    fontSize: 16,
  },
});
