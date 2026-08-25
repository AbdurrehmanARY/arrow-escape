/**
 * src/components/AwardInfoLayout.tsx — Shared Info Page Template matching reference design.
 *
 * Purpose:      Display award detail view with 3D artwork card, badge number,
 *               earned date pill, description, progress bar, and close button.
 */

import { Image, type ImageSourcePropType, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen, useTheme } from './Screen';
import { Springy } from './Pressable';
import { withClick } from './sound';
import { fonts, radius, spacing, typography } from '@theme';

export interface AwardInfoLayoutProps {
  image: ImageSourcePropType;
  badgeNumber?: number | string | undefined;
  dateText: string;
  title: string;
  description: string;
  nextTargetText?: string | undefined;
  progressCurrent?: number | undefined;
  progressTotal?: number | undefined;
  subPillText?: string | undefined;
  subDetailText?: string | undefined;
  hideCardFrame?: boolean | undefined;
  onClose?: (() => void) | undefined;
}

export function AwardInfoLayout({
  image,
  badgeNumber,
  dateText,
  title: _title,
  description,
  nextTargetText,
  progressCurrent,
  progressTotal,
  subPillText,
  subDetailText,
  hideCardFrame,
  onClose,
}: AwardInfoLayoutProps) {
  const router = useRouter();
  const { palette } = useTheme();

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      router.back();
    }
  };

  const hasProgress = progressCurrent !== undefined && progressTotal !== undefined && progressTotal > 0;
  const progressPercent = hasProgress
    ? Math.min(100, Math.max(8, Math.round((progressCurrent! / progressTotal!) * 100)))
    : 0;

  return (
    <Screen>
      <View style={styles.centerWrapper}>
        {/* ---- 3D Image Graphic with Badge Number -------------------------- */}
        <View style={hideCardFrame ? styles.cardOuterClean : styles.cardOuter}>
          <Image source={image} style={styles.cardImage} resizeMode="contain" />
          {badgeNumber !== undefined ? (
            <View style={styles.badgeOverlay}>
              <Text style={styles.badgeText}>{badgeNumber}</Text>
            </View>
          ) : null}
        </View>

        {/* ---- Date Pill Badge -------------------------------------------- */}
        <View style={[styles.datePill, { backgroundColor: palette.surfaceRaised }]}>
          <Text style={[styles.dateText, { color: palette.textMuted }]}>{dateText}</Text>
        </View>

        {/* ---- Description Message ---------------------------------------- */}
        <Text style={[styles.descriptionText, { color: palette.text }]}>{description}</Text>

        {/* ---- Sub Status Section (e.g. Current status) ------------------- */}
        {subPillText || subDetailText ? (
          <View style={styles.subStatusContainer}>
            {subPillText ? (
              <View style={[styles.subPill, { backgroundColor: palette.surfaceRaised }]}>
                <Text style={[styles.subPillText, { color: palette.textMuted }]}>{subPillText}</Text>
              </View>
            ) : null}
            {subDetailText ? (
              <Text style={[styles.subDetailText, { color: palette.text }]}>{subDetailText}</Text>
            ) : null}
          </View>
        ) : null}

        {/* ---- Next Award Progress Bar ------------------------------------ */}
        {nextTargetText || hasProgress ? (
          <View style={styles.progressContainer}>
            {nextTargetText ? (
              <Text style={[styles.nextTargetText, { color: palette.textMuted }]}>{nextTargetText}</Text>
            ) : null}

            {hasProgress ? (
              <View style={[styles.progressTrack, { backgroundColor: palette.border }]}>
                <View style={[styles.progressFill, { width: `${progressPercent}%`, backgroundColor: palette.success }]}>
                  <Text style={styles.progressFillText}>{progressCurrent}</Text>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* ---- Close Button ----------------------------------------------- */}
        <Springy
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={withClick(handleClose)}
          style={[styles.closeButton, { borderColor: palette.border, backgroundColor: palette.surface }]}
        >
          <Text style={[styles.closeButtonText, { color: palette.textMuted }]}>Close</Text>
        </Springy>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    width: '100%',
  },

  cardOuter: {
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: '#F0F4FA',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: spacing.md,
    // Soft circular shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3,
  },
  cardImage: {
    width: 175,
    height: 175,
    borderRadius: 87.5,
  },
  badgeOverlay: {
    position: 'absolute',
    bottom: -18,
    alignSelf: 'center',
    zIndex: 10,
  },
  badgeText: {
    fontSize: 42,
    fontFamily: fonts.displayExtra,
    fontWeight: '900',
    color: '#434965',
    textShadowColor: '#FFFFFF',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },

  cardOuterClean: {
    width: 210,
    height: 210,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: spacing.md,
  },

  datePill: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: radius.pill,
    marginTop: 22,
    marginBottom: spacing.md,
  },
  dateText: {
    ...typography.small,
    fontSize: 13,
    fontWeight: '600',
  },

  descriptionText: {
    ...typography.heading,
    fontFamily: fonts.displayExtra,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
    textAlign: 'center',
    maxWidth: 280,
    marginBottom: 28,
  },

  subStatusContainer: {
    alignItems: 'center',
    marginBottom: 32,
    gap: 8,
  },
  subPill: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  subPillText: {
    ...typography.small,
    fontSize: 13,
    fontWeight: '600',
  },
  subDetailText: {
    ...typography.body,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },

  progressContainer: {
    width: 260,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  nextTargetText: {
    ...typography.small,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  progressTrack: {
    width: '100%',
    height: 18,
    borderRadius: radius.pill,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressFillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  closeButton: {
    width: 260,
    height: 48,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  closeButtonText: {
    ...typography.heading,
    fontSize: 16,
    fontWeight: '700',
  },
});
