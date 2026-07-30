/**
 * theme/themes.ts â€” the theme registry.
 *
 * Purpose:      Every look the game ships, as data.
 * Responsibilities:
 *               - Palettes.
 *               - The `THEMES` list and lookup helpers.
 * Notes:        To add a theme, add an entry here. Nothing else changes â€” the
 *               renderer is driven entirely by these values. If a look you want
 *               is not expressible, add a field to `ArrowStyle`/`BoardStyle` and
 *               teach the renderer that one field; never branch on `theme.id`.
 *
 *               Themes are cosmetic with one exception, called out in each
 *               description: `colorful` genuinely makes levels easier, because
 *               telling arrows apart is the skill the game tests.
 */

import type { ArrowStyle, BoardStyle, Palette, Theme } from './types';

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

/**
 * The standard arrow: solid triangle head, rope-like rounded body, soft shadow.
 *
 * Slimmer than it was. A fat body reads well on an eight-cell board and turns a
 * dense one into a solid mass — and the boards are far bigger now, so the gap
 * *between* two snakes is what tells you they are two snakes. Thinning the stroke
 * widens every one of those gaps without touching the layout.
 *
 * The head is deliberately **not** thinned in proportion. It is the only part that
 * says which way the arrow goes, and a head no wider than its body stops reading
 * as a point at all; keeping it broad against a slimmer body actually makes the
 * direction easier to see than before.
 */
const classicArrow: ArrowStyle = {
  head: 'triangle',
  tail: 'round',
  join: 'round',
  strokeRatio: 0.24,
  headTipRatio: 0.46,
  headHalfWidthRatio: 0.3,
  headLengthRatio: 0.42,
  shadow: true,
  shadowOffsetRatio: 0.05,
  highlight: false,
  eyes: false,
  colorful: false,
};

/** A dotted grid, the default board: shows the cells without competing with them. */
const dottedBoard: BoardStyle = {
  pattern: 'dots',
  dotRatio: 0.058,
  lineRatio: 0.02,
  cornerRadius: 20,
  padCells: 0.5,
};

/**
 * Group colours, from the Okabe–Ito colour-blind-safe set.
 *
 * These are the only colours in the game that carry information, so they are
 * chosen to stay distinguishable under deuteranopia and protanopia rather than to
 * look pretty. The gate glyph repeats the same information as a shape, because a
 * palette alone is never an accessibility answer.
 *
 * Two variants only — light and dark — rather than one per theme. A theme is free
 * to override them, but nothing gains from six near-identical sets of five
 * colours, and each new set is another chance to ship an indistinguishable pair.
 */
const LIGHT_GROUP_COLORS = ['#D55E00', '#0072B2', '#009E73', '#CC79A7', '#8C6D1F'] as const;
const DARK_GROUP_COLORS = ['#F0894B', '#56B4E9', '#4FCB8B', '#E58FC2', '#E6C34A'] as const;

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

const paperPalette: Palette = {
  wall: '#B9B1A0',
  groupColors: LIGHT_GROUP_COLORS,
  scheme: 'light',
  background: '#EEEBE4',
  board: '#F6F4EE',
  boardBorder: '#E0DBCD',
  pattern: '#D2CCBD',

  arrow: '#3B3630',
  arrowShadow: 'rgba(59, 54, 48, 0.18)',
  arrowHighlight: 'rgba(255, 255, 255, 0.18)',
  arrowBlocked: '#C8453F',
  arrowBlocker: '#D98324',
  arrowSafe: '#2E9E63',

  surface: '#F7F5F0',
  surfaceRaised: '#FFFFFF',
  border: '#DED8CA',

  text: '#2B2723',
  textMuted: '#6E675E',
  textFaint: '#9A9386',
  textOnAccent: '#FFFFFF',

  accent: '#2F7FE0',
  accentMuted: '#DCEAFB',
  success: '#2E9E63',
  successMuted: '#DDF1E6',
  danger: '#C8453F',
  dangerMuted: '#FADFDE',
  heart: '#D5423C',
  heartSpent: '#D9D3C6',
};

const midnightPalette: Palette = {
  wall: '#39415F',
  groupColors: DARK_GROUP_COLORS,
  scheme: 'dark',
  background: '#0E1120',
  board: '#161A2C',
  boardBorder: '#242B44',
  pattern: '#2C3350',

  arrow: '#E6EAF5',
  arrowShadow: 'rgba(0, 0, 0, 0.45)',
  arrowHighlight: 'rgba(255, 255, 255, 0.22)',
  arrowBlocked: '#F0716B',
  arrowBlocker: '#EFA94A',
  arrowSafe: '#4FCB8B',

  surface: '#1A1F33',
  surfaceRaised: '#232A42',
  border: '#2F3752',

  text: '#EDF1F9',
  textMuted: '#98A2BC',
  textFaint: '#6A7492',
  textOnAccent: '#FFFFFF',

  accent: '#4E8FF0',
  accentMuted: '#22375E',
  success: '#4FCB8B',
  successMuted: '#1B3B2C',
  danger: '#F0716B',
  dangerMuted: '#3B2028',
  heart: '#F0555A',
  heartSpent: '#323A54',
};

const noodlePalette: Palette = {
  ...midnightPalette,
  board: '#12162A',
  boardBorder: '#232B48',
  pattern: '#252D4A',
  arrow: '#7FD8C4',
  arrowShadow: 'rgba(0, 0, 0, 0.5)',
  arrowHighlight: 'rgba(255, 255, 255, 0.3)',
  arrowVariants: [
    '#7FB4F5',
    '#F5A97F',
    '#9CE0B0',
    '#C4A2F0',
    '#7FD8E0',
    '#F5D77F',
    '#F09FB8',
    '#A8E88C',
  ],
};

const boldPalette: Palette = {
  wall: '#8A6B00',
  groupColors: LIGHT_GROUP_COLORS,
  scheme: 'light',
  background: '#F5C518',
  board: '#F7CF34',
  boardBorder: '#E0B300',
  pattern: '#DCAF10',

  arrow: '#1E1E1E',
  arrowShadow: 'rgba(0, 0, 0, 0.28)',
  arrowHighlight: 'rgba(255, 255, 255, 0.14)',
  arrowBlocked: '#D62828',
  arrowBlocker: '#8B4000',
  arrowSafe: '#0B6E4F',

  surface: '#FBE28A',
  surfaceRaised: '#FDF0C0',
  border: '#DCAF10',

  text: '#1E1E1E',
  textMuted: '#4A4218',
  textFaint: '#7A6E28',
  textOnAccent: '#FFFFFF',

  accent: '#1E1E1E',
  accentMuted: '#FBE28A',
  success: '#0B6E4F',
  successMuted: '#CDEBDD',
  danger: '#D62828',
  dangerMuted: '#FAD9D9',
  heart: '#D62828',
  heartSpent: '#DCAF10',
};

const blueprintPalette: Palette = {
  wall: '#27689A',
  groupColors: DARK_GROUP_COLORS,
  scheme: 'dark',
  background: '#0A2A43',
  board: '#0D3453',
  boardBorder: '#1B5580',
  pattern: '#1E5C87',

  arrow: '#8FE3FF',
  arrowShadow: 'rgba(0, 0, 0, 0.35)',
  arrowHighlight: 'rgba(255, 255, 255, 0.25)',
  arrowBlocked: '#FF7B7B',
  arrowBlocker: '#FFC46B',
  arrowSafe: '#6BFFB0',

  surface: '#0F3E60',
  surfaceRaised: '#154D75',
  border: '#1F5F8E',

  text: '#E4F6FF',
  textMuted: '#93C4E0',
  textFaint: '#6497B8',
  textOnAccent: '#062032',

  accent: '#4FC3F7',
  accentMuted: '#12466B',
  success: '#6BFFB0',
  successMuted: '#0E4436',
  danger: '#FF7B7B',
  dangerMuted: '#4A2029',
  heart: '#FF6B81',
  heartSpent: '#1C567F',
};

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

export const THEMES: readonly Theme[] = [
  {
    id: 'paper',
    name: 'Paper',
    description: 'Warm paper, charcoal arrows, dotted grid. The default look.',
    palette: paperPalette,
    arrow: classicArrow,
    board: dottedBoard,
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'The same design inverted â€” deep navy with bone-white arrows.',
    palette: midnightPalette,
    arrow: classicArrow,
    board: dottedBoard,
  },
  {
    id: 'noodles',
    name: 'Noodles',
    description:
      'Chunky rounded noodles with eyes, each a different colour. Easier to read, so levels play softer.',
    palette: noodlePalette,
    arrow: {
      ...classicArrow,
      // Still the chunkiest theme — that is its whole character — but it moved down
      // with the rest, because on a 60x60 board the old weight left no daylight
      // between neighbouring noodles at all.
      head: 'rounded',
      tail: 'round',
      strokeRatio: 0.34,
      headTipRatio: 0.42,
      headHalfWidthRatio: 0.3,
      headLengthRatio: 0.34,
      highlight: true,
      eyes: true,
      colorful: true,
    },
    board: { ...dottedBoard, pattern: 'none', cornerRadius: 24 },
  },
  {
    id: 'bold',
    name: 'Bold',
    description: 'Heavy black arrows on a flat yellow field. No grid, maximum contrast.',
    palette: boldPalette,
    arrow: {
      ...classicArrow,
      head: 'triangle',
      tail: 'flat',
      join: 'miter',
      strokeRatio: 0.22,
      headHalfWidthRatio: 0.34,
      shadow: false,
    },
    board: { ...dottedBoard, pattern: 'none', cornerRadius: 14, padCells: 0.4 },
  },
  {
    id: 'blueprint',
    name: 'Blueprint',
    description: 'Drafting-table blue with a ruled grid and thin chevron arrowheads.',
    palette: blueprintPalette,
    arrow: {
      ...classicArrow,
      head: 'chevron',
      tail: 'square',
      strokeRatio: 0.16,
      headTipRatio: 0.46,
      headHalfWidthRatio: 0.28,
      headLengthRatio: 0.36,
      shadow: false,
    },
    board: { ...dottedBoard, pattern: 'lines', lineRatio: 0.018, cornerRadius: 10 },
  },
  {
    id: 'graphite',
    name: 'Graphite',
    description: 'Slim pencil-tipped arrows on graph paper. The most "puzzle book" of the set.',
    palette: {
      ...paperPalette,
      background: '#F2F1ED',
      board: '#FBFAF7',
      boardBorder: '#DDDAD2',
      pattern: '#D8DBE4',
      arrow: '#2E3440',
      arrowShadow: 'rgba(46, 52, 64, 0.12)',
    },
    arrow: {
      ...classicArrow,
      head: 'pencil',
      tail: 'flat',
      strokeRatio: 0.17,
      headTipRatio: 0.5,
      headHalfWidthRatio: 0.23,
      headLengthRatio: 0.5,
      shadow: false,
    },
    board: { ...dottedBoard, pattern: 'crosses', lineRatio: 0.022, cornerRadius: 8 },
  },
] as const;

/** The theme a fresh install starts on. */
export const DEFAULT_THEME_ID = 'paper';

/** Look up a theme by id, falling back to the default if the id is unknown. */
export function themeById(id: string): Theme {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0]!;
}

/** The default theme. */
export const defaultTheme: Theme = themeById(DEFAULT_THEME_ID);
