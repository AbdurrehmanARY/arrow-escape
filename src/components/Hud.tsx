/**
 * Hud.tsx — Header bar above the arrow board matching the custom screenshot design.
 *
 * Header contains EXACTLY 4 items:
 * 1. Circular Back button (<)
 * 2. Circular Restart button (↻)
 * 3. Middle: Tier Label + 3 Hearts centered
 * 4. Blue Pill Hint button (📹 Hint)
 */

import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { MIN_TOUCH_TARGET, type Palette, radius, spacing, typography } from '@theme';

import { Springy, useGlow } from './Pressable';
import { withClick } from './sound';

export interface HudProps {
  palette: Palette;
  tierLabel: string;
  heartsLeft: number;
  maxHearts?: number;
  onBack: () => void;
  onRestart: () => void;
  onHint: () => void;
  earning?: boolean;
}

function HudInner({
  palette,
  tierLabel,
  heartsLeft,
  maxHearts = 3,
  onBack,
  onRestart,
  onHint,
  earning = false,
}: HudProps) {
  return (
    <View style={styles.hudHeader}>
      {/* ---- Left Controls: Back & Restart -------------------------------- */}
      <View style={styles.leftGroup}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={withClick(onBack)}
          style={({ pressed }) => [
            styles.circleBtn,
            { backgroundColor: palette.accentMuted },
            pressed && styles.pressed,
          ]}
          hitSlop={8}
        >
          <FontAwesome name="chevron-left" size={16} color={palette.accent} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Restart"
          onPress={withClick(onRestart)}
          style={({ pressed }) => [
            styles.circleBtn,
            { backgroundColor: palette.accentMuted },
            pressed && styles.pressed,
          ]}
          hitSlop={8}
        >
          <FontAwesome name="undo" size={16} color={palette.accent} />
        </Pressable>
      </View>

      {/* ---- Middle: Tier Name + 3 Hearts -------------------------------- */}
      <View style={styles.centerGroup}>
        <Text style={[styles.tierTitle, { color: palette.accent }]} numberOfLines={1}>
          {tierLabel}
        </Text>

        <View
          style={styles.heartsRow}
          accessibilityLabel={`${heartsLeft} of ${maxHearts} hearts left`}
        >
          {Array.from({ length: maxHearts }, (_, i) => (
            <Text
              key={i}
              style={[
                styles.heart,
                { color: i < heartsLeft ? palette.heart : palette.heartSpent },
              ]}
            >
              ♥
            </Text>
          ))}
        </View>
      </View>

      {/* ---- Right: Hint Pill Button -------------------------------------- */}
      <Springy
        accessibilityRole="button"
        accessibilityLabel="Hint"
        onPress={withClick(onHint)}
        style={[styles.hintPill, { backgroundColor: palette.accent }]}
      >
        <FontAwesome name="video-camera" size={14} color={palette.textOnAccent} />
        <Text style={[styles.hintText, { color: palette.textOnAccent }]}>
          {earning ? 'Loading…' : 'Hint'}
        </Text>
      </Springy>
    </View>
  );
}

export interface PillButtonProps {
  palette: Palette;
  label: string;
  onPress: () => void;
  primary?: boolean;
  active?: boolean;
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

  const elevation = useGlow(palette.accent, primary ? 'primary' : 'rest');

  return (
    <Springy
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={withClick(onPress)}
      style={[
        styles.pill,
        { backgroundColor: background, borderColor },
        (primary || active) && elevation,
      ]}
    >
      {icon ? <Text style={[styles.pillIcon, { color }]}>{icon}</Text> : null}
      <Text style={[styles.pillLabel, { color }]}>{label}</Text>
    </Springy>
  );
});

export const Hud = memo(HudInner);

const styles = StyleSheet.create({
  hudHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.xs,
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  circleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  centerGroup: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierTitle: {
    ...typography.body,
    fontWeight: '800',
    fontSize: 16,
    marginBottom: 1,
  },
  heartsRow: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  heart: {
    fontSize: 18,
  },
  hintPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  hintText: {
    ...typography.body,
    fontWeight: '800',
    fontSize: 15,
  },

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
  pillIcon: { fontSize: 15 },
  pillLabel: { ...typography.body, fontWeight: '700' },
});
