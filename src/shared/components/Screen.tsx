/**
 * shared/components/Screen.tsx — the page frame every screen wears.
 *
 * Purpose:      Give every screen the same ground colour, safe-area insets, and
 *               status-bar treatment, so adding a screen is not an opportunity to
 *               get those three things subtly wrong.
 * Responsibilities:
 *               - `Screen` — the page frame: background, status bar, safe-area
 *                 padding, optional vertical scroll, standard gutter.
 * Notes:        Moved here from `src/components/Screen.tsx` in Phase 2c-2. It used to
 *               call `useTheme()` to learn the active palette, but `useTheme` reads
 *               `themeId` from `@state/` — and a `shared/` file must never reach into a
 *               feature's store (`FORBIDDEN_SHARED` bans `state`, correctly: a shared
 *               component reading a feature's zustand store is a feature wearing a
 *               disguise). The frame only ever needed the palette, so it now takes it
 *               as a required prop. Every call site already calls `useTheme()` and has
 *               `palette` in scope, so the move is zero new hook calls — and `tsc`'s
 *               required-prop rule keeps the site list compiler-enforced.
 */

import type { ReactNode } from 'react';
import { ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type Palette, spacing } from '@theme';

export interface ScreenProps {
  children: ReactNode;
  /** The active theme's palette. Required — `shared/` cannot read it from `@state`. */
  palette: Palette;
  /** Wrap the content in a ScrollView. Off for the game screen, which must not scroll. */
  scroll?: boolean;
  /** Extra horizontal padding. Defaults to the standard gutter. */
  padded?: boolean;
}

/**
 * The page frame: ground colour, status bar, safe-area padding, optional scroll.
 *
 * Takes `palette` as a prop rather than reading it, so this file stays free of `@state`
 * and can live under `shared/`.
 */
export function Screen({ children, palette, scroll = false, padded = true }: ScreenProps) {
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
        <ScrollView
          contentContainerStyle={[styles.containerMax, padding]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.body, styles.containerMax, padding]}>{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
  containerMax: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
});
