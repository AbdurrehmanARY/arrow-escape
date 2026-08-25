/**
 * MonthlyTrophyModal.tsx — Interactive Info Modal for Monthly Challenge Trophy.
 *
 * Displays earned gold trophy or in-progress silver trophy with monthly progress,
 * matching the design specs from the user's screenshots.
 */

import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Springy } from './Pressable';
import { withClick } from './sound';
import { fonts, radius, spacing, typography, type Palette } from '@theme';

const TROPHY_ACTIVE = require('../../assets/challenge/trophy_active.jpg');
const TROPHY_INACTIVE = require('../../assets/challenge/trophy_inactive.jpg');

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export interface MonthlyTrophyModalProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly month: number;
  readonly year: number;
  readonly wins: number;
  readonly totalDays: number;
  readonly completedAt?: string;
  readonly onGoToMonth?: () => void;
  readonly palette: Palette;
}

export function MonthlyTrophyModal({
  visible,
  onClose,
  month,
  year,
  wins,
  totalDays,
  completedAt,
  onGoToMonth,
  palette,
}: MonthlyTrophyModalProps) {
  const isCompleted = wins >= totalDays;
  const monthName = MONTHS[month - 1] ?? 'Month';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.scrim} onPress={withClick(onClose)}>
        <Pressable
          style={[
            styles.dialog,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* ---- Trophy Image Header --------------------------------------- */}
          <View style={styles.imageContainer}>
            <Image
              source={isCompleted ? TROPHY_ACTIVE : TROPHY_INACTIVE}
              style={styles.trophyImage}
              resizeMode="contain"
            />
          </View>

          {isCompleted ? (
            /* ---- Earned / Completed Layout ---------------------------------- */
            <View style={styles.content}>
              <View
                style={[
                  styles.datePill,
                  { backgroundColor: palette.surfaceRaised, borderColor: palette.border },
                ]}
              >
                <Text style={[styles.datePillText, { color: palette.textMuted }]}>
                  {completedAt ?? `${monthName} ${year}`}
                </Text>
              </View>

              <Text style={[styles.completedTitle, { color: palette.text }]}>
                You completed the {monthName} {year} challenge!
              </Text>
            </View>
          ) : (
            /* ---- In-Progress / Locked Layout -------------------------------- */
            <View style={styles.content}>
              <Text style={[styles.lockedTitle, { color: palette.accent }]}>
                {monthName} {year}
              </Text>

              <View style={styles.progressRow}>
                <View
                  style={[
                    styles.progressTrack,
                    { backgroundColor: palette.surfaceRaised, borderColor: palette.border },
                  ]}
                >
                  <View
                    style={[
                      styles.progressFill,
                      {
                        backgroundColor: palette.success,
                        width: `${Math.max(14, Math.round((wins / totalDays) * 100))}%`,
                      },
                    ]}
                  >
                    <Text style={[styles.progressCount, { color: palette.textOnAccent }]}>
                      {wins}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.progressTotal, { color: palette.textFaint }]}>
                  {totalDays}
                </Text>
              </View>
            </View>
          )}

          {/* ---- Action Buttons --------------------------------------------- */}
          <View style={styles.actions}>
            {!isCompleted && onGoToMonth && (
              <Springy
                accessibilityRole="button"
                accessibilityLabel="Go to month"
                onPress={withClick(() => {
                  onClose();
                  onGoToMonth();
                })}
                style={[styles.primaryButton, { backgroundColor: '#5B67F6' }]}
              >
                <Text style={styles.primaryButtonText}>Go to month</Text>
              </Springy>
            )}

            <Springy
              accessibilityRole="button"
              accessibilityLabel="Close modal"
              onPress={withClick(onClose)}
              style={[
                styles.secondaryButton,
                { backgroundColor: palette.surface, borderColor: palette.border },
              ]}
            >
              <Text style={[styles.secondaryButtonText, { color: palette.textMuted }]}>
                Close
              </Text>
            </Springy>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  dialog: {
    width: '100%',
    maxWidth: 340,
    borderRadius: radius.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    alignItems: 'center',
    gap: spacing.lg,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  imageContainer: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trophyImage: {
    width: 140,
    height: 140,
  },
  content: {
    alignItems: 'center',
    width: '100%',
    gap: spacing.sm,
  },
  datePill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  datePillText: {
    ...typography.small,
    fontWeight: '700',
  },
  completedTitle: {
    fontFamily: fonts.displayExtra,
    fontWeight: '800',
    fontSize: 20,
    textAlign: 'center',
    lineHeight: 26,
    paddingHorizontal: spacing.sm,
  },
  lockedTitle: {
    fontFamily: fonts.displayExtra,
    fontWeight: '800',
    fontSize: 22,
    textAlign: 'center',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: spacing.md,
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  progressTrack: {
    flex: 1,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  progressFill: {
    height: '100%',
    borderRadius: 16,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: spacing.sm,
  },
  progressCount: {
    ...typography.small,
    fontWeight: '800',
  },
  progressTotal: {
    fontFamily: fonts.displayExtra,
    fontWeight: '800',
    fontSize: 16,
  },
  actions: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  primaryButton: {
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontFamily: fonts.displayExtra,
    fontWeight: '800',
    fontSize: 16,
  },
  secondaryButton: {
    height: 48,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontFamily: fonts.displayExtra,
    fontWeight: '800',
    fontSize: 16,
  },
});
