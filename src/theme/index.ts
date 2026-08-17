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
  /** Section breaks and the bottom of a long scroll. */
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

/**
 * The type scale.
 *
 * Sizes and line heights come from the Kinetic Neon spec; the names are the ones
 * this codebase already used, so no screen had to be rewritten to adopt them.
 * Line height is set explicitly on every style — leaving it implicit is how a
 * dense settings screen ends up with rows of different heights on two devices.
 */
/**
 * The two families, by role.
 *
 * Sora carries anything that should feel like a game — headings, scores, level
 * numbers. Inter carries anything that should be *read* — settings labels, rules
 * copy, leaderboard rows. Mixing them is the point: a settings screen set in a
 * display face is hard to read, and a score set in a UI face is forgettable.
 *
 * `fontWeight` is deliberately still declared alongside `fontFamily`. The family
 * name already encodes the weight, so the two must agree — but Android will
 * synthesise a fake bold from a regular file if only the weight is given, and
 * leaving it out entirely makes the fallback (when the fonts fail to load) render
 * uniformly light.
 */
export const fonts = {
  displaySemi: 'Sora_600SemiBold',
  displayBold: 'Sora_700Bold',
  displayExtra: 'Sora_800ExtraBold',
  bodyRegular: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
} as const;

export const typography = {
  display: {
    fontFamily: fonts.displayExtra,
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  title: {
    fontFamily: fonts.displayBold,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  heading: {
    fontFamily: fonts.displaySemi,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '600',
  },
  /*
    Body styles deliberately carry no `fontFamily`.

    In React Native each weight of a custom font is a *separate family*, so
    `fontWeight` cannot pick between them — a screen that does
    `{...typography.body, fontWeight: '700'}` would keep Inter Regular and either
    render un-bold (iOS) or get an ugly synthesised bold (Android). There are 69
    such overrides in this app, almost all on body and small.

    Rather than break them or rewrite all 69 at once, these keep the system font
    and the display styles above take Sora, where the weight is fixed and the
    override sites are few. Use `fonts.*` explicitly when a body style genuinely
    needs Inter at a known weight — `bodyStrong` below is the common case.
  */
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  small: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  tiny: { fontSize: 12, lineHeight: 16, fontWeight: '500', letterSpacing: 0.12 },

  /** Inter at a weight that actually exists, for labels that must read as strong. */
  bodyStrong: {
    fontFamily: fonts.bodySemi,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
  },
} as const;

/**
 * Anything that shows a number that *changes in place*.
 *
 * Proportional digits are different widths, so a score ticking 1→2 shifts every
 * character after it. Tabular figures are all one width, which is the difference
 * between a HUD that updates and a HUD that twitches.
 */
export const tabularNums: { fontVariant: ('tabular-nums')[] } = {
  fontVariant: ['tabular-nums'],
};

/**
 * Elevation, as glow rather than drop shadow.
 *
 * A dark interface has nothing for a black shadow to fall on, so depth is carried
 * by coloured light instead. Three levels only: resting, active, and the one
 * primary action on a screen.
 *
 * `color` is deliberately not baked in — each level is applied with the *active
 * theme's* accent, so the same three levels work on Paper as on Kinetic Neon.
 * On iOS these are real shadows; on Android `elevation` is the only lever, which
 * is why both are set.
 */
export const glow = {
  rest: { shadowOpacity: 0.15, shadowRadius: 12, elevation: 2 },
  active: { shadowOpacity: 0.3, shadowRadius: 20, elevation: 6 },
  primary: { shadowOpacity: 0.45, shadowRadius: 32, elevation: 10 },
} as const;

/** Spring used for press feedback everywhere. Physical, not decorative. */
export const PRESS_SPRING = { damping: 15, stiffness: 180, mass: 0.6 } as const;
/** Overshoot spring, for moments that should feel like a reward. */
export const CELEBRATE_SPRING = { damping: 10, stiffness: 120, mass: 0.8 } as const;
/** How far a pressed control shrinks. Small enough to feel, not to move layout. */
export const PRESS_SCALE = 0.96;

/** Minimum touch target, in dp. Below this, taps start getting missed. */
export const MIN_TOUCH_TARGET = 44;
