/**
 * Screen.tsx — shared screen chrome.
 *
 * Purpose:      Give every screen the same ground colour, safe-area insets, and
 *               status-bar treatment, so adding a screen is not an opportunity to
 *               get those three things subtly wrong.
 * Responsibilities:
 *               - `Screen`     — the page frame.
 *               - `useTheme`   — the active theme, from settings.
 *               - `IconButton` — the small square button used in headers.
 */

import type { ReactNode } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSettingsStore } from '@state/settingsStore';
import { MIN_TOUCH_TARGET, type Palette, radius, spacing, themeById, typography } from '@theme';

/** The active theme, resolved from the player's saved preference. */
export function useTheme() {
  const themeId = useSettingsStore((state) => state.themeId);
  return themeById(themeId);
}

export interface ScreenProps {
  children: ReactNode;
  /** Wrap the content in a ScrollView. Off for the game screen, which must not scroll. */
  scroll?: boolean;
  /** Extra horizontal padding. Defaults to the standard gutter. */
  padded?: boolean;
}

export function Screen({ children, scroll = false, padded = true }: ScreenProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();

  const padding = {
    paddingTop: insets.top + spacing.md,
    paddingBottom: insets.bottom + spacing.lg,
    paddingHorizontal: padded ? spacing.lg : 0,
  };

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <StatusBar
        barStyle={palette.scheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={palette.background}
      />
      {scroll ? (
        <ScrollView contentContainerStyle={padding} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.body, padding]}>{children}</View>
      )}
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.icon,
        {
          backgroundColor: active ? palette.accentMuted : palette.surfaceRaised,
          borderColor: active ? palette.accent : palette.border,
        },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.iconGlyph, { color: active ? palette.text : palette.textMuted }]}>
        {glyph}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
  pressed: { opacity: 0.6 },
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
