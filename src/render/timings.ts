/**
 * timings.ts — how long the board's animations take.
 *
 * Purpose:      Keep animation durations in one pure module, so the renderer can
 *               read them without pulling in a drawing library.
 * Notes:        Pure numbers and one function, deliberately. These used to live in
 *               `ArrowSnake.tsx`, which imports `react-native-svg` — so anything
 *               that wanted a duration had to import a renderer. Under Skia that
 *               would mean importing native bindings Jest cannot load, which is how
 *               a timing constant ends up making a test suite unrunnable.
 */

/**
 * How long a snake takes to cross one cell, and the bounds that keeps sane.
 *
 * A **constant duration was the single worst thing about the movement**, and it is
 * not obvious until the numbers are written down. How far a snake travels is its
 * body plus its whole exit ray, so on a 60x60 board one arrow may cover four cells
 * and another eighty-eight. Giving both the same duration makes the first crawl and
 * the second blur across the screen at twenty times the speed — the same tap
 * looking like two different mechanics depending on where the arrow happened to
 * sit. That reads as "abrupt" precisely because it is inconsistent, not because it
 * is fast.
 *
 * Duration therefore tracks distance. The floor stops a one-cell hop from being a
 * flicker; the ceiling stops a full-width exit on the biggest board from becoming a
 * three-second wait. Between them, speed varies by about three times rather than
 * twenty.
 */
const MS_PER_CELL = 30;
const MIN_RELEASE_MS = 300;
const MAX_RELEASE_MS = 1000;

/** How long the lurch-and-recoil of a blocked tap takes. */
export const SHAKE_MS = 260;

/** How long this arrow's exit should take, from how far it has to go. */
export function releaseDurationMs(travelCells: number): number {
  return Math.max(MIN_RELEASE_MS, Math.min(MAX_RELEASE_MS, Math.round(travelCells * MS_PER_CELL)));
}
