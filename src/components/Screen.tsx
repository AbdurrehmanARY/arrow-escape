/**
 * Screen.tsx — the theme seam and screen chrome that still reach out of this layer.
 *
 * Purpose:      Hold the three exports that cannot move to `shared/` yet, because each
 *               reaches up: `useTheme` reads `themeId` from `@state`, and
 *               `ScreenHeader`/`IconButton` reach `./sound` → `@services/audio`. Both
 *               seams close when audio becomes a feature in Phase 9.
 * Responsibilities:
 *               - `useTheme`     — the active theme, from settings.
 *               - `ScreenHeader` — the header every non-game screen wears.
 *               - `IconButton`   — the small square button used in headers.
 * Notes:        `Screen` (the page frame) moved to `src/shared/components/Screen.tsx`
 *               in Phase 2c-2. It only ever needed the palette, so it now takes that as
 *               a required prop instead of calling `useTheme()` — which is exactly what
 *               lets a `shared/` file stop importing `@state`. The `@components` barrel
 *               re-exports it from its new home, so consumers keep importing `Screen`
 *               from `@components` unchanged (the same shim `Pressable` uses).
 */

import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSettingsStore } from '@state';
import { MIN_TOUCH_TARGET, type Palette, radius, spacing, themeById, typography } from '@theme';

import { Springy, useGlow } from '@shared/primitives/Pressable';
import { withClick } from './sound';

/** The active theme, resolved from the player's saved preference. */
export function useTheme() {
  const themeId = useSettingsStore((state) => state.themeId);
  return themeById(themeId);
}

export interface ScreenHeaderProps {
  palette: Palette;
  title: string;
  /** One line under the title. Omitted rather than left blank when there is none. */
  subtitle?: string;
  /** Back action. Omit for a screen with nothing behind it. */
  onBack?: () => void;
  backLabel?: string;
  /** Anything that belongs on the right — usually one `IconButton`. */
  right?: ReactNode;
}

/**
 * The header every non-game screen wears.
 *
 * Three screens had written this out by hand, each with its own copy of the same
 * `headerSpacer: { width: 44 }` hack to keep the title optically centred against
 * the back button. Three copies of a magic number is three chances for one of them
 * to drift, and it had already produced three slightly different vertical rhythms.
 *
 * The centring is done properly here: both flanks reserve the same width, so the
 * title is centred against the *layout* rather than against whatever happens to be
 * in the right-hand slot.
 */
export function ScreenHeader({
  palette,
  title,
  subtitle,
  onBack,
  backLabel = 'Back',
  right,
}: ScreenHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.flank}>
        {onBack ? (
          <IconButton palette={palette} glyph="←" label={backLabel} onPress={onBack} />
        ) : null}
      </View>

      <View style={styles.headerCentre}>
        <Text style={[styles.headerTitle, { color: palette.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle === undefined ? null : (
          <Text style={[styles.headerSubtitle, { color: palette.textFaint }]} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>

      <View style={[styles.flank, styles.flankEnd]}>{right}</View>
    </View>
  );
}

export interface IconButtonProps {
  palette: Palette;
  glyph: string;
  label: string;
  onPress: () => void;
  active?: boolean;
}

/** A square icon button. `label` is for screen readers, not shown. */
export function IconButton({ palette, glyph, label, onPress, active = false }: IconButtonProps) {
  const elevation = useGlow(palette.accent, 'active');

  return (
    <Springy
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={withClick(onPress)}
      // The visible square is already MIN_TOUCH_TARGET, so the slop is insurance
      // against a header that ever gets tighter rather than a fix for one today.
      hitSlop={8}
      style={[
        styles.icon,
        {
          backgroundColor: active ? palette.accentMuted : palette.surfaceRaised,
          borderColor: active ? palette.accent : palette.border,
        },
        active && elevation,
      ]}
    >
      <Text style={[styles.iconGlyph, { color: active ? palette.text : palette.textMuted }]}>
        {glyph}
      </Text>
    </Springy>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    minHeight: MIN_TOUCH_TARGET,
  },
  // Equal, fixed-width flanks so the title sits centred on the screen rather than
  // on whatever the right-hand slot happens to contain.
  flank: { width: MIN_TOUCH_TARGET, flexShrink: 0 },
  flankEnd: { alignItems: 'flex-end' },
  headerCentre: { flexGrow: 1, flexShrink: 1, minWidth: 0, alignItems: 'center' },
  headerTitle: { ...typography.title },
  headerSubtitle: { ...typography.small, marginTop: 1 },
  icon: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
  },
  iconGlyph: { ...typography.heading, fontSize: 18 },
});
