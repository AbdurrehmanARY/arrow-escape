/**
 * Hud.tsx — the chrome around the board.
 *
 * Purpose:      Level identity, hearts, and the actions a player reaches for
 *               mid-level, laid out so none of it competes with the board.
 * Responsibilities:
 *               - `Hud`         — the top bar: level chip, hearts, arrows left.
 *               - `ActionBar`   — the bottom row of buttons.
 *               - `PillButton`  — the shared button shape.
 * Notes:        Every colour comes from the active palette, so the HUD reskins
 *               with the board rather than needing its own theme pass.
 */

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MIN_TOUCH_TARGET, type Palette, radius, spacing, typography } from '@theme';

export interface HudProps {
  palette: Palette;
  levelName: string;
  levelNumber: number;
  heartsLeft: number;
  maxHearts: number;
  arrowsLeft: number;
}

/**
 * The top bar.
 *
 * Hearts are drawn as filled and spent rather than as a count, because "three
 * left" has to be readable in peripheral vision while the player is concentrating
 * on the board. A number would need reading; a row of shapes does not.
 */
function HudInner({
  palette,
  levelName,
  levelNumber,
  heartsLeft,
  maxHearts,
  arrowsLeft,
}: HudProps) {
  return (
    <View style={styles.hud}>
      <View>
        <Text style={[styles.levelLabel, { color: palette.textFaint }]}>LEVEL {levelNumber}</Text>
        <Text style={[styles.levelName, { color: palette.text }]}>{levelName}</Text>
      </View>

      <View style={styles.hudRight}>
        <View style={[styles.counter, { backgroundColor: palette.surfaceRaised, borderColor: palette.border }]}>
          <Text style={[styles.counterValue, { color: palette.text }]}>{arrowsLeft}</Text>
          <Text style={[styles.counterLabel, { color: palette.textFaint }]}>left</Text>
        </View>

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
      </View>
    </View>
  );
}

export interface PillButtonProps {
  palette: Palette;
  label: string;
  onPress: () => void;
  /** Renders in the accent colour — for the one action you most want tapped. */
  primary?: boolean;
  /** Renders as "currently on" — for toggles. */
  active?: boolean;
  /** Small leading glyph. */
  icon?: string;
}

export const PillButton = memo(function PillButton({
  palette,
  label,
  onPress,
  primary = false,
  active = false,
  icon,
}: PillButtonProps) {
  const background = primary
    ? palette.accent
    : active
      ? palette.accentMuted
      : palette.surfaceRaised;
  const borderColor = primary || active ? palette.accent : palette.border;
  const color = primary ? palette.textOnAccent : active ? palette.text : palette.textMuted;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: background, borderColor },
        pressed && styles.pillPressed,
      ]}
    >
      {icon ? <Text style={[styles.pillIcon, { color }]}>{icon}</Text> : null}
      <Text style={[styles.pillLabel, { color }]}>{label}</Text>
    </Pressable>
  );
});

export const Hud = memo(HudInner);

const styles = StyleSheet.create({
  hud: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  levelLabel: { ...typography.tiny, letterSpacing: 1.2 },
  levelName: { ...typography.title, marginTop: 1 },

  hudRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },

  counter: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  counterValue: { ...typography.heading },
  counterLabel: { ...typography.tiny },

  hearts: { flexDirection: 'row', gap: 3 },
  heart: { fontSize: 19 },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    flexGrow: 1,
    flexBasis: 0,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  pillPressed: { opacity: 0.6 },
  pillIcon: { fontSize: 15 },
  pillLabel: { ...typography.body, fontWeight: '700' },
});
