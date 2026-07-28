/**
 * theme/types.ts — what a theme is allowed to change.
 *
 * Purpose:      Describe a skin as *data*, so adding one is adding an entry to a
 *               registry rather than editing the renderer.
 * Responsibilities:
 *               - `Palette`    — colour.
 *               - `ArrowStyle` — the shape and finish of an arrow.
 *               - `BoardStyle` — the surface arrows sit on.
 *               - `Theme`      — one named combination of the three.
 * Notes:        The renderer reads these and draws accordingly; it never branches
 *               on a theme *name*. That is the whole contract. If a future theme
 *               needs something the renderer cannot express, the fix is a new
 *               field here plus one branch in the renderer — never a special case
 *               keyed on which theme is active.
 *
 *               Pure data. No React, no imports.
 */

/** How the pointed end of an arrow is drawn. */
export type ArrowHeadShape =
  /** Classic solid triangle. Reads clearly at any size. */
  | 'triangle'
  /** Long narrow triangle, like a sharpened pencil. */
  | 'pencil'
  /** An open "V" stroked in the same weight as the body. */
  | 'chevron'
  /** Rounded dome that comes to a soft point — the friendly, noodle-ish look. */
  | 'rounded'
  /** No head at all; the body just ends in its cap. */
  | 'none';

/** How the blunt end of an arrow is finished. */
export type ArrowTailShape = 'round' | 'flat' | 'square' | 'tapered';

/** The pattern drawn on the board behind the arrows. */
export type BoardPattern =
  /** A dot at the centre of every cell. Shows the grid without competing with it. */
  | 'dots'
  /** Thin lines on the cell boundaries. */
  | 'lines'
  /** A small plus at every cell corner — graph-paper feel. */
  | 'crosses'
  /** Alternating cell tint. */
  | 'checker'
  /** Nothing. */
  | 'none';

export interface Palette {
  /** Page behind everything. */
  background: string;
  /** The board panel itself. */
  board: string;
  /** The board's border, or `'transparent'` for none. */
  boardBorder: string;
  /** Grid pattern colour. */
  pattern: string;

  /** The arrows. One colour for all of them, unless `ArrowStyle.colorful`. */
  arrow: string;
  /** Soft shadow under an arrow. */
  arrowShadow: string;
  /** Glossy highlight along an arrow's back, when `ArrowStyle.highlight`. */
  arrowHighlight: string;
  /** An arrow the player just tried to move but could not. */
  arrowBlocked: string;
  /** The arrow that did the blocking, so the player learns why. */
  arrowBlocker: string;
  /** Assist mode: this arrow genuinely has a clear run. */
  arrowSafe: string;
  /**
   * Optional per-arrow colours, used only when `ArrowStyle.colorful` is on.
   *
   * Off by default and off in every "real" theme, because telling snakes apart
   * is the game. A colourful theme is an accessibility/casual option, and it
   * makes levels markedly easier — themes that use it should say so.
   */
  arrowVariants?: readonly string[];

  surface: string;
  surfaceRaised: string;
  border: string;

  text: string;
  textMuted: string;
  textFaint: string;
  /** Text sitting on an accent-filled chip. */
  textOnAccent: string;

  accent: string;
  accentMuted: string;
  success: string;
  successMuted: string;
  danger: string;
  dangerMuted: string;
  heart: string;
  heartSpent: string;

  /** `'light'` or `'dark'`, so the status bar and system chrome can match. */
  scheme: 'light' | 'dark';
}

/**
 * The shape and finish of an arrow. Every value is a ratio of one cell, so a
 * theme looks identical on a 4x4 board and a 10x10 one.
 */
export interface ArrowStyle {
  head: ArrowHeadShape;
  tail: ArrowTailShape;
  /** How body corners are mitred. `round` is what makes a snake look like rope. */
  join: 'round' | 'miter' | 'bevel';

  /** Body thickness. */
  strokeRatio: number;
  /** How far the arrowhead's tip reaches past the head cell's centre. */
  headTipRatio: number;
  /** Half-width of the arrowhead. Wider than the stroke so it reads as a point. */
  headHalfWidthRatio: number;
  /** Distance from tip back to the arrowhead's base. */
  headLengthRatio: number;

  /** Drop a soft shadow beneath each arrow. */
  shadow: boolean;
  shadowOffsetRatio: number;
  /** Draw a lighter line along the arrow's back for a glossy, moulded look. */
  highlight: boolean;
  /** Give the head a pair of eyes. Purely charm; never conveys information. */
  eyes: boolean;
  /** Colour each arrow differently. Makes levels much easier — see `arrowVariants`. */
  colorful: boolean;
}

/** The surface the arrows sit on. */
export interface BoardStyle {
  pattern: BoardPattern;
  /** Grid dot radius, as a ratio of one cell. Ignored unless `pattern` is `dots`. */
  dotRatio: number;
  /** Stroke width of `lines` / `crosses` patterns, as a ratio of one cell. */
  lineRatio: number;
  /** Corner radius of the board panel, in dp. */
  cornerRadius: number;
  /** Blank cells of padding around the arrows, so nothing touches the edge. */
  padCells: number;
}

/** One named, complete look. */
export interface Theme {
  /** Stable key; this is what gets persisted in settings. */
  id: string;
  /** Shown in the theme picker. */
  name: string;
  /** One line explaining the look, and any gameplay effect it has. */
  description: string;
  palette: Palette;
  arrow: ArrowStyle;
  board: BoardStyle;
}
