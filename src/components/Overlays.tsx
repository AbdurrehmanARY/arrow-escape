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

import { Springy, useGlow } from './Pressable';
import { useSheetSound, withClick } from './sound';

interface ActionProps {
  palette: Palette;
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}

function Action({ palette, label, onPress, primary = false, disabled = false }: ActionProps) {
  // Only the primary action carries elevation. Two glowing buttons side by side
  // is two primary actions, which is none.
  const elevation = useGlow(palette.accent, 'primary');

  return (
    <Springy
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={withClick(onPress)}
      style={[
        styles.action,
        {
          backgroundColor: primary ? palette.accent : palette.surfaceRaised,
          borderColor: primary ? palette.accent : palette.border,
          opacity: disabled ? 0.45 : 1,
        },
        primary && !disabled && elevation,
      ]}
    >
      <Text style={[styles.actionLabel, { color: primary ? palette.textOnAccent : palette.text }]}>
        {label}
      </Text>
    </Springy>
  );
}

function Sheet({
  palette,
  children,
  visible,
  sound = false,
}: {
  palette: Palette;
  children: React.ReactNode;
  visible: boolean;
  /**
   * Announce this sheet with `popupOpen` / `popupClose`.
   *
   * Off by default, because most sheets here already have a voice: the win sheet
   * arrives behind `levelComplete` and the fail sheet behind `outOfHearts`. Only
   * the sheets with nothing of their own to say — the confirmations — turn it on.
   */
  sound?: boolean;
}) {
  useSheetSound(visible, sound);

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
  /**
   * Whether the board left behind can still be cleared.
   */
  stillWinnable: boolean;
  /** Arrows remaining on board when failed. Used to detect Near-Miss state (<= 2). */
  remainingArrows?: number;
  onRetry: () => void;
  onLevels: () => void;
  /** Callback to watch a rewarded ad and recover +2 extra hearts. */
  onNearMiss?: () => void;
}

export const FailOverlay = memo(function FailOverlay({
  palette,
  visible,
  stillWinnable,
  remainingArrows,
  onRetry,
  onLevels,
  onNearMiss,
}: FailOverlayProps) {
  const isNearMiss = remainingArrows !== undefined && remainingArrows > 0 && remainingArrows <= 2;

  return (
    <Sheet palette={palette} visible={visible}>
      <Text style={[styles.eyebrow, { color: isNearMiss ? palette.accent : palette.textFaint }]}>
        {isNearMiss ? 'NEAR MISS — SO CLOSE!' : 'OUT OF HEARTS'}
      </Text>
      <Text style={[styles.title, { color: palette.text }]}>
        {isNearMiss ? `${remainingArrows} Arrow${remainingArrows === 1 ? '' : 's'} Left!` : 'Not quite'}
      </Text>

      <Text style={[styles.body, { color: palette.textMuted }]}>
        {isNearMiss
          ? 'You were just one step away from clearing this level! Get +2 extra hearts to finish it right now.'
          : stillWinnable
          ? 'The board behind this is still perfectly winnable — nothing you tapped ever broke it. Five arrows just weren’t where you thought they were.'
          : 'Five wrong reads, and a gate closed on something that still needed to get out. Both are fixable from the start.'}
      </Text>

      {isNearMiss && onNearMiss ? (
        <View style={{ marginTop: spacing.md, width: '100%' }}>
          <Action
            palette={palette}
            label="+2 Hearts (Watch Ad)"
            onPress={onNearMiss}
            primary
          />
        </View>
      ) : null}

      <View style={styles.actions}>
        <Action palette={palette} label="Levels" onPress={onLevels} />
        <Action palette={palette} label="Try again" onPress={onRetry} primary={!isNearMiss} />
      </View>
    </Sheet>
  );
});

export interface StuckOverlayProps {
  palette: Palette;
  visible: boolean;
  /** True when arrows can still be tapped but the level is already lost. */
  quietly: boolean;
  onRetry: () => void;
  onLevels: () => void;
}

/**
 * Shown when a shutter has sealed on an arrow that still needed the way through.
 *
 * A separate overlay rather than a variant of `FailOverlay` because the player has
 * lost for a completely different reason and, crucially, still has hearts in hand.
 * Showing them a spent-hearts screen would teach them the wrong lesson about what
 * went wrong — and the lesson is the only thing this screen is for.
 */
export const StuckOverlay = memo(function StuckOverlay({
  palette,
  visible,
  quietly,
  onRetry,
  onLevels,
}: StuckOverlayProps) {
  return (
    <Sheet palette={palette} visible={visible}>
      <Text style={[styles.eyebrow, { color: palette.textFaint }]}>THE WAY OUT CLOSED</Text>
      <Text style={[styles.title, { color: palette.text }]}>Wrong order</Text>

      <Text style={[styles.body, { color: palette.textMuted }]}>
        {quietly
          ? 'You can still tap things, but this board can no longer be cleared — the last arrow of a colour left, and the gate it was holding open shut behind it.'
          : 'The last arrow of a colour left the board, and the gate it was holding open shut behind it. Nothing left can reach an edge.'}
      </Text>
      <Text style={[styles.bodySmall, { color: palette.textFaint }]}>
        On boards with gates, send anything that needs to cross a gate out{' '}
        <Text style={{ fontStyle: 'italic' }}>before</Text> you clear the colour holding it open.
        Your hearts are untouched — this one is order, not aim.
      </Text>

      <View style={styles.actions}>
        <Action palette={palette} label="Levels" onPress={onLevels} />
        <Action palette={palette} label="Start over" onPress={onRetry} primary />
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
    <Sheet palette={palette} visible={visible} sound>
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
  textLink: { marginTop: spacing.md, padding: spacing.sm },
  textLinkLabel: { ...typography.small, fontWeight: '600' },
});
