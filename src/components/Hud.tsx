/**
 * Hud.tsx — the chrome around the board.
 *
 * Purpose:      Level identity, hearts, and progress, laid out so none of it
 *               competes with the board.
 * Responsibilities:
 *               - `Hud`        — the top bar: pause, level, tier, hearts, progress.
 *               - `PillButton` — the shared button shape used below the board.
 * Notes:        Every colour comes from the active palette, so the HUD reskins
 *               with the board rather than needing its own theme pass.
 *
 *               This is **one row plus a bar**, and keeping it to that is the
 *               point. The play screen previously carried a second row of chrome
 *               above this one holding a back button, a settings button and a hint
 *               count — three tap targets on a screen whose only verb is "tap an
 *               arrow", none of them wanted mid-move. They live in `PauseMenu` now.
 */

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MIN_TOUCH_TARGET, type Palette, radius, spacing, typography } from '@theme';

export interface HudProps {
  palette: Palette;
  levelName: string;
  levelNumber: number;
  /** Human-readable tier, e.g. "Tricky". The label is only useful if it is shown. */
  tierLabel: string;
  heartsLeft: number;
  maxHearts: number;
  arrowsLeft: number;
  arrowsTotal: number;
  onPause: () => void;
}

/**
 * The top bar: pause, level identity, hearts, and how much board is left.
 *
 * Hearts are drawn as filled and spent rather than as a count, because "three
 * left" has to be readable in peripheral vision while the player is concentrating
 * on the board. A number would need reading; a row of shapes does not.
 *
 * The progress bar earns its two pixels on the big boards. A 60x60 level takes a
 * hundred taps and most of it is off-screen at any moment, so "am I nearly done"
 * became a question the screen could not answer — the arrows-left count alone
 * tells you nothing without knowing what you started with.
 */
function HudInner({
  palette,
  levelName,
  levelNumber,
  tierLabel,
  heartsLeft,
  maxHearts,
  arrowsLeft,
  arrowsTotal,
  onPause,
}: HudProps) {
  const cleared = Math.max(0, arrowsTotal - arrowsLeft);
  const progress = arrowsTotal === 0 ? 0 : cleared / arrowsTotal;

  return (
    <View style={styles.hud}>
      <View style={styles.hudRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pause"
          onPress={onPause}
          style={({ pressed }) => [
            styles.pause,
            { backgroundColor: palette.surfaceRaised, borderColor: palette.border },
            pressed && styles.pillPressed,
          ]}
        >
          <Text style={[styles.pauseGlyph, { color: palette.textMuted }]}>❙❙</Text>
        </Pressable>

        <View style={styles.identity}>
          <Text style={[styles.levelLabel, { color: palette.textFaint }]} numberOfLines={1}>
            LEVEL {levelNumber} · {tierLabel.toUpperCase()}
          </Text>
          <Text style={[styles.levelName, { color: palette.text }]} numberOfLines={1}>
            {levelName}
          </Text>
        </View>

        <View
          style={styles.hearts}
          accessibilityLabel={`${heartsLeft} of ${maxHearts} hearts left`}
        >
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

      <View
        style={styles.progressRow}
        accessibilityLabel={`${cleared} of ${arrowsTotal} arrows off the board`}
      >
        <View style={[styles.track, { backgroundColor: palette.border }]}>
          <View
            style={[
              styles.fill,
              { backgroundColor: palette.accent, width: `${Math.round(progress * 100)}%` },
            ]}
          />
        </View>
        <Text style={[styles.progressLabel, { color: palette.textFaint }]}>
          {cleared}/{arrowsTotal}
        </Text>
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
  hud: { marginBottom: spacing.md },
  hudRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },

  pause: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
  },
  pauseGlyph: { fontSize: 13, letterSpacing: -1 },

  // Takes the slack so a long level name truncates instead of shoving the hearts
  // off the edge. The hearts are the thing that must never move.
  identity: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  levelLabel: { ...typography.tiny, letterSpacing: 1.1 },
  levelName: { ...typography.title, marginTop: 1 },

  hearts: { flexDirection: 'row', gap: 3, flexShrink: 0 },
  heart: { fontSize: 19 },

  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  track: { flexGrow: 1, height: 3, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: 3, borderRadius: radius.pill },
  progressLabel: { ...typography.tiny, fontVariant: ['tabular-nums'] },

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
