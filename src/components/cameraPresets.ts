/**
 * cameraPresets.ts — difficulty-aware initial zoom.
 *
 * Purpose:      Decide how much of a puzzle a player sees when they first enter a
 *               level. Easy levels show everything; hard levels demand exploration.
 * Responsibilities:
 *               - `initialScaleForTier` — a starting zoom from the difficulty tier.
 * Notes:        This is not a camera module. It does not know about gestures or
 *               animation. It is a pure function from level metadata to a number,
 *               so it can be tested and tuned without touching anything visual.
 *
 *               The zoom floor is always `fitScale`, enforced by `BoardViewport`.
 *               What this function returns is a *request*; the viewport clamps it.
 *
 *               The exploration tiers start zoomed in so the player sees only a
 *               portion of the board. On a phone, a 50x50 board at fitScale shows
 *               cells of 6–7dp — unreadable. Starting at a larger scale shows a
 *               readable section and makes the puzzle feel genuinely massive,
 *               which is the whole point of having large boards.
 */

import type { DifficultyTier } from '@game/codec';

/**
 * How much zoom is applied at the start of a level, by tier group.
 *
 * Three bands, because only three behaviours are distinguishable to a player:
 *
 * - **Fit everything:** tutorial through tricky. The whole puzzle is visible.
 *   The player focuses on reading, not navigating.
 *
 * - **Snug fit:** hard. The board fits but with less breathing room. A slight
 *   zoom in signals that puzzles are getting bigger without requiring panning.
 *
 * - **Exploration mode:** superHard through nightmare. Only part of the board is
 *   visible. The player must pan and zoom to inspect the full puzzle. This is the
 *   camera behaviour that makes late-game levels feel genuinely massive.
 */

/** Tiers that fit the entire puzzle on screen. */
const FIT_TIERS: ReadonlySet<DifficultyTier> = new Set([
  'tutorial',
  'easy',
  'casual',
  'medium',
  'tricky',
]);

/** Tiers with a slightly tighter fit — board visible but snug. */
const SNUG_TIERS: ReadonlySet<DifficultyTier> = new Set([
  'hard',
]);

// Everything not in the two sets above is exploration mode.

/**
 * Compute the initial scale for a level based on its difficulty tier.
 *
 * @param tier     The level's difficulty tier.
 * @param fitScale The scale at which the full board is visible. This is the
 *                 minimum — returning it means "show everything".
 * @returns A scale value. Will be clamped by `BoardViewport` to its legal range.
 */
/**
 * Smallest an arrow cell may appear on glass, in dp.
 *
 * Distinct from `MIN_CELL_SIZE`, which is how big a cell is *drawn* in board
 * space. This is how big it ends up *on screen* after the initial zoom, and the
 * two are only the same at scale 1.
 *
 * It exists because "fit the whole board" and "be readable" are not compatible
 * on a large board, and fitting was silently winning. A 23x25 Casual level
 * fitted to a phone renders roughly 12dp cells — an arrowhead at that size is a
 * smudge, and the tier is supposed to be *easy*.
 *
 * The trade is explicit: below this, the board stops fully fitting and becomes
 * pannable. That is the right way round. A board you must pan is mildly annoying;
 * a board you cannot read is not playable.
 */
const READABLE_CELL_DP = 22;

export function initialScaleForTier(
  tier: DifficultyTier,
  fitScale: number,
  /**
   * Board-space size of one cell. Optional so existing callers and tests keep
   * working — without it, the readability floor simply does not apply.
   */
  cellSize?: number,
): number {
  // The floor applies to every tier, including the ones that would rather fit.
  // A Casual board is not made easier by being too small to read.
  const readableFloor =
    cellSize && cellSize > 0 ? READABLE_CELL_DP / cellSize : 0;

  if (FIT_TIERS.has(tier)) {
    // Full board visible, unless that would make the cells unreadable.
    return Math.max(fitScale, readableFloor);
  }

  if (SNUG_TIERS.has(tier)) {
    // Slightly zoomed in — the board still fits but the margins are tighter.
    // On a board that already fills the screen this is subtle; on a small board
    // it does nothing because the viewport clamps at fitScale.
    return Math.max(fitScale * 1.2, readableFloor);
  }

  // Exploration mode. Start zoomed in enough that the player sees a readable
  // section of the board. The multiplier is relative to fitScale, so on a large
  // board (fitScale ~0.25) this gives ~0.75 — roughly a third of the board visible.
  // On a board that already nearly fits (fitScale ~0.9) the effect is minimal,
  // which is correct — a 12x12 "super hard" board does not need exploration.
  //
  // The floor of 0.9 prevents the initial view from being absurdly zoomed in
  // on very large boards where fitScale is tiny.
  return Math.max(fitScale * 3.0, 0.9);
}
