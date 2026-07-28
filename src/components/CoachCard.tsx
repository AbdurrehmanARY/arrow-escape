/**
 * CoachCard.tsx — a single sentence of first-run guidance.
 *
 * Purpose:      Teach the one rule a player cannot infer by watching, once, then
 *               get out of the way permanently.
 * Notes::       Sits *below* the board, never over it. A modal here would be
 *               actively counterproductive: the whole point is to explain what you
 *               are looking at, so covering it up defeats the card.
 *
 *               One sentence, one button, no queue, no "step 1 of 4". Each card
 *               fires from the situation it explains rather than being front-
 *               loaded, so it arrives when it is already relevant.
 */

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MIN_TOUCH_TARGET, type Palette, radius, spacing, typography } from '@theme';

export interface CoachCardProps {
  palette: Palette;
  /** Short heading — what just happened, or what to do. */
  title: string;
  /** One or two sentences. Longer than that and it has become a text wall. */
  body: string;
  /** Dismiss label. Phrase it as the player's own words, not the app's. */
  dismissLabel?: string;
  onDismiss: () => void;
}

export const CoachCard = memo(function CoachCard({
  palette,
  title,
  body,
  dismissLabel = 'Got it',
  onDismiss,
}: CoachCardProps) {
  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.card,
        { backgroundColor: palette.accentMuted, borderColor: palette.accent },
      ]}
    >
      <View style={styles.text}>
        <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
        <Text style={[styles.body, { color: palette.textMuted }]}>{body}</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={dismissLabel}
        onPress={onDismiss}
        style={({ pressed }) => [
          styles.dismiss,
          { backgroundColor: palette.accent },
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.dismissLabel, { color: palette.textOnAccent }]}>{dismissLabel}</Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  text: { gap: 2 },
  title: { ...typography.body, fontWeight: '700' },
  body: { ...typography.small, lineHeight: 19 },
  dismiss: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissLabel: { ...typography.body, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
