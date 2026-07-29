/**
 * Overlays.tsx — what appears when a level ends.
 *
 * Purpose:      Tell the player what happened and what they can do next, without
 *               hiding the board they just played.
 * Responsibilities:
 *               - `WinOverlay`  — cleared, with hearts left and a Next action.
 *               - `FailOverlay` — out of hearts, with the honest explanation.
 *               - `ConfirmDialog` — the restart confirmation.
 * Notes:        The fail copy matters more than it looks. Because a blocked tap
 *               changes nothing and no tap order can trap you, a failed level is
 *               *always* failed with a still-winnable board sitting behind the
 *               overlay. Saying so turns "the game cheated me" into "I misread
 *               that", which is the difference between a player retrying and a
 *               player uninstalling.
 */

import { memo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { MIN_TOUCH_TARGET, type Palette, radius, spacing, typography } from '@theme';

interface ActionProps {
  palette: Palette;
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}

function Action({ palette, label, onPress, primary = false, disabled = false }: ActionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        {
          backgroundColor: primary ? palette.accent : palette.surfaceRaised,
          borderColor: primary ? palette.accent : palette.border,
          opacity: disabled ? 0.45 : 1,
        },
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text
        style={[styles.actionLabel, { color: primary ? palette.textOnAccent : palette.text }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Sheet({
  palette,
  children,
  visible,
}: {
  palette: Palette;
  children: React.ReactNode;
  visible: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.scrim}>
        <View
          style={[styles.sheet, { backgroundColor: palette.surface, borderColor: palette.border }]}
        >
          {children}
        </View>
      </View>
    </Modal>
  );
}

export interface WinOverlayProps {
  palette: Palette;
  visible: boolean;
  levelName: string;
  heartsLeft: number;
  maxHearts: number;
  mistakes: number;
  /** Consecutive perfect reads including this one. Shown only once it is a run. */
  perfectStreak?: number;
  /** Undefined on the last level, which turns Next into Level select. */
  onNext: (() => void) | undefined;
  onReplay: () => void;
  onLevels: () => void;
}

export const WinOverlay = memo(function WinOverlay({
  palette,
  visible,
  levelName,
  heartsLeft,
  maxHearts,
  mistakes,
  perfectStreak = 0,
  onNext,
  onReplay,
  onLevels,
}: WinOverlayProps) {
  const perfect = mistakes === 0;
  // Only once it is genuinely a run. Announcing "streak: 1" on every clean level
  // cheapens the thing it is meant to reward.
  const showStreak = perfect && perfectStreak >= 2;

  return (
    <Sheet palette={palette} visible={visible}>
      <Text style={[styles.eyebrow, { color: palette.textFaint }]}>CLEARED</Text>
      <Text style={[styles.title, { color: palette.text }]}>{levelName}</Text>

      <View style={styles.hearts}>
        {Array.from({ length: maxHearts }, (_, i) => (
          <Text
            key={i}
            style={[styles.heart, { color: i < heartsLeft ? palette.heart : palette.heartSpent }]}
          >
            ♥
          </Text>
        ))}
      </View>

      <Text style={[styles.body, { color: palette.textMuted }]}>
        {perfect
          ? 'A clean read — not a single wrong tap.'
          : `${mistakes} wrong tap${mistakes === 1 ? '' : 's'}. Clear it without any to read it perfectly.`}
      </Text>

      {showStreak ? (
        <View style={[styles.streak, { borderColor: palette.success }]}>
          <Text style={[styles.streakText, { color: palette.success }]}>
            {perfectStreak} perfect in a row
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Action palette={palette} label="Replay" onPress={onReplay} />
        {onNext ? (
          <Action palette={palette} label="Next" onPress={onNext} primary />
        ) : (
          <Action palette={palette} label="Levels" onPress={onLevels} primary />
        )}
      </View>
      {onNext ? (
        <Pressable accessibilityRole="button" onPress={onLevels} style={styles.textLink}>
          <Text style={[styles.textLinkLabel, { color: palette.textMuted }]}>All levels</Text>
        </Pressable>
      ) : null}
    </Sheet>
  );
});

export interface FailOverlayProps {
  palette: Palette;
  visible: boolean;
  onRetry: () => void;
  onLevels: () => void;
}

export const FailOverlay = memo(function FailOverlay({
  palette,
  visible,
  onRetry,
  onLevels,
}: FailOverlayProps) {
  return (
    <Sheet palette={palette} visible={visible}>
      <Text style={[styles.eyebrow, { color: palette.textFaint }]}>OUT OF HEARTS</Text>
      <Text style={[styles.title, { color: palette.text }]}>Not quite</Text>

      <Text style={[styles.body, { color: palette.textMuted }]}>
        The board behind this is still perfectly winnable — nothing you tapped ever broke it. Five
        arrows just weren&apos;t where you thought they were.
      </Text>
      <Text style={[styles.bodySmall, { color: palette.textFaint }]}>
        Trace each arrowhead straight out to the edge before you tap. If anything crosses that line,
        it can&apos;t leave yet.
      </Text>

      <View style={styles.actions}>
        <Action palette={palette} label="Levels" onPress={onLevels} />
        <Action palette={palette} label="Try again" onPress={onRetry} primary />
      </View>
    </Sheet>
  );
});

export interface ConfirmDialogProps {
  palette: Palette;
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog = memo(function ConfirmDialog({
  palette,
  visible,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Sheet palette={palette} visible={visible}>
      <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
      <Text style={[styles.body, { color: palette.textMuted }]}>{message}</Text>
      <View style={styles.actions}>
        <Action palette={palette} label="Cancel" onPress={onCancel} />
        <Action palette={palette} label={confirmLabel} onPress={onConfirm} primary />
      </View>
    </Sheet>
  );
});

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.xl,
    alignItems: 'center',
  },
  eyebrow: { ...typography.tiny, letterSpacing: 1.4 },
  title: { ...typography.title, marginTop: 2, textAlign: 'center' },
  hearts: { flexDirection: 'row', gap: 4, marginTop: spacing.md },
  heart: { fontSize: 24 },
  body: {
    ...typography.body,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 21,
  },
  bodySmall: {
    ...typography.small,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  streak: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  streakText: { ...typography.small, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl, alignSelf: 'stretch' },
  action: {
    flexGrow: 1,
    flexBasis: 0,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
  },
  actionLabel: { ...typography.body, fontWeight: '700' },
  pressed: { opacity: 0.6 },
  textLink: { marginTop: spacing.md, padding: spacing.sm },
  textLinkLabel: { ...typography.small, fontWeight: '600' },
});
