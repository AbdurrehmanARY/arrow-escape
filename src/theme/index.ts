/**
 * theme/index.ts — design tokens.
 *
 * Purpose:      One place for colour, spacing, radius, and type scale, so screens
 *               never hardcode a hex value and a restyle stays a one-file change.
 * Notes:        Values follow GDD §10: quiet, high-contrast, generous spacing.
 *               Arrow colour is a *secondary* cue only — direction is always
 *               carried by the glyph's rotation, so the game stays readable for
 *               colour-blind players.
 */

export const colors = {
  background: '#11141b',
  surface: '#1a1f2b',
  surfaceRaised: '#232a39',
  border: '#2f3849',

  text: '#eef2f9',
  textMuted: '#98a3b8',
  textFaint: '#647084',

  accent: '#5b8dee',
  accentMuted: '#2c3f63',

  success: '#3fbf87',
  successMuted: '#1c3d31',
  danger: '#e2606a',
  dangerMuted: '#42222a',
  warning: '#e0a33f',

  boardCell: '#1e2430',
  boardCellEmpty: '#171c26',
  arrow: '#dfe6f2',
  arrowSafe: '#3fbf87',
  arrowTrap: '#e2606a',
} as const;

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
  pill: 999,
} as const;

export const typography = {
  title: { fontSize: 24, fontWeight: '700' },
  heading: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 15, fontWeight: '400' },
  small: { fontSize: 13, fontWeight: '400' },
  mono: { fontSize: 13, fontWeight: '500' },
} as const;

/** Minimum touch target, in dp. Below this, taps start getting missed. */
export const MIN_TOUCH_TARGET = 44;
