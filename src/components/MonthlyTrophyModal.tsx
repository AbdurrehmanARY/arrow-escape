/**
 * MonthlyTrophyModal.tsx — Interactive Info Modal for Monthly Challenge Trophy.
 *
 * Displays earned gold trophy or in-progress silver trophy with monthly progress,
 * matching the design specs from the user's screenshots.
 */

import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Springy } from '@shared/primitives/Pressable';
import { MonthlyTrophyBadge } from './MonthlyTrophyBadge';
import { withClick } from './sound';
import { fonts, radius, spacing, type Palette } from '@theme';

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
  onGoToMonth,
  palette,
}: MonthlyTrophyModalProps) {
  const isCompleted = wins >= totalDays && totalDays > 0;
  const monthName = MONTHS[month - 1] ?? 'Month';
  const progressPercent = totalDays > 0 ? Math.min(100, Math.round((wins / totalDays) * 100)) : 0;

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
            <MonthlyTrophyBadge month={month} earned={isCompleted} size={150} />
          </View>

          {/* ---- Title & Progress ------------------------------------------ */}
          <View style={styles.content}>
            <Text style={[styles.title, { color: palette.accent }]}>
              {monthName} {year}
            </Text>

            {/* Progress bar pill track */}
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
                    width: isCompleted ? '100%' : `${Math.max(16, progressPercent)}%`,
                  },
                ]}
              >
                <Text style={styles.progressCount}>{wins}</Text>
              </View>
              <Text style={[styles.progressTotal, { color: palette.textMuted }]}>
                {totalDays}
              </Text>
            </View>

            {/* Completion status text */}
            {isCompleted ? (
              <View style={styles.completedBlock}>
                <Text style={[styles.completedHeadline, { color: palette.success }]}>
                  All Days Cleared!
                </Text>
                <Text style={[styles.progressSubtitle, { color: palette.textMuted }]}>
                  {wins} / {totalDays} Days Completed
                </Text>
              </View>
            ) : (
              <Text style={[styles.progressSubtitle, { color: palette.textMuted }]}>
                {wins} / {totalDays} Days Completed
              </Text>
            )}
          </View>

          {/* ---- Exactly Two Actions: Go to month + Close ------------------- */}
          <View style={styles.actions}>
            {onGoToMonth && (
              <Springy
                accessibilityRole="button"
                accessibilityLabel="Go to month"
                onPress={withClick(() => {
                  onClose();
                  onGoToMonth();
                })}
                style={[styles.primaryButton, { backgroundColor: palette.accent }]}
              >
                <Text style={[styles.primaryButtonText, { color: palette.textOnAccent }]}>
                  Go to month
                </Text>
              </Springy>
            )}

            <Springy
              accessibilityRole="button"
              accessibilityLabel="Close"
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
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    width: '100%',
    gap: spacing.sm,
  },
  title: {
    fontFamily: fonts.displayExtra,
    fontWeight: '800',
    fontSize: 22,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  progressTrack: {
    width: 200,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  progressFill: {
    height: 30,
    minWidth: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  progressCount: {
    color: '#FFFFFF',
    fontFamily: fonts.displayExtra,
    fontWeight: '800',
    fontSize: 14,
  },
  progressTotal: {
    fontFamily: fonts.displayExtra,
    fontWeight: '800',
    fontSize: 15,
    marginRight: 10,
  },
  completedBlock: {
    alignItems: 'center',
    gap: 2,
    marginTop: spacing.xs,
  },
  completedHeadline: {
    fontFamily: fonts.displayExtra,
    fontWeight: '800',
    fontSize: 17,
    textAlign: 'center',
  },
  progressSubtitle: {
    fontFamily: fonts.displayExtra,
    fontWeight: '700',
    fontSize: 14,
    textAlign: 'center',
  },
  actions: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.md,
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
