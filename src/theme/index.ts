/**
 * theme/index.ts — the public surface of the theme layer.
 *
 * Purpose:      One import path for skins and layout tokens.
 * Responsibilities:
 *               - Re-export the theme types and registry.
 *               - Own the layout scale (spacing, radius, type), which is *not*
 *                 themeable — a theme changes how the game looks, not how the
 *                 interface is proportioned.
 * Notes:        Screens import from `@theme`; nothing imports `themes.ts` or
 *               `types.ts` directly.
 */

export * from './types';
export * from './themes';

/** 4pt spacing scale. Large tap targets are a GDD accessibility requirement. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 30, fontWeight: '800' },
  title: { fontSize: 22, fontWeight: '700' },
  heading: { fontSize: 16, fontWeight: '700' },
  body: { fontSize: 15, fontWeight: '500' },
  small: { fontSize: 13, fontWeight: '500' },
  tiny: { fontSize: 11, fontWeight: '600' },
} as const;

/** Minimum touch target, in dp. Below this, taps start getting missed. */
export const MIN_TOUCH_TARGET = 44;
