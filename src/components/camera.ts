/**
 * camera.ts — the maths behind pan and zoom.
 *
 * Purpose:      Decide how far a board may be moved and how far it may be zoomed.
 * Responsibilities:
 *               - `clampTranslation` — keep the board reachable.
 *               - `fitScale` / `clampScale` — the zoom range.
 * Notes:        Pure, and separate from the component, for two reasons. It is the
 *               part that is easy to get subtly wrong — an off-by-one in the
 *               overhang lets a player flick a 27x30 board into empty space and
 *               lose it — and it is the part that runs as a worklet, where a
 *               debugger is not much help.
 *
 *               Every function here is a worklet so it can be called from the UI
 *               thread during a gesture. Clamping *during* the gesture is what
 *               makes the board feel like it has edges; clamping afterwards
 *               produces a visible snap-back.
 */

/**
 * How far the content may be offset from centre on one axis.
 *
 * When the scaled content is smaller than the viewport it is centred and cannot
 * move at all — otherwise a small board could be dragged off into blank space.
 * When it is larger, it may move exactly as far as its overhang, so the edge of
 * the board always stops at the edge of the screen.
 */
export function clampTranslation(
  value: number,
  contentSize: number,
  viewportSize: number,
  scale: number,
): number {
  'worklet';
  const scaled = contentSize * scale;
  if (scaled <= viewportSize) return 0;
  const limit = (scaled - viewportSize) / 2;
  return Math.min(limit, Math.max(-limit, value));
}

/**
 * The scale at which the whole board is visible.
 *
 * Capped at 1 so a small board is never blown up to fill the screen: cells have a
 * designed size, and a 8x8 level stretched to fill a tablet looks like a mistake.
 */
export function fitScale(
  contentWidth: number,
  contentHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): number {
  'worklet';
  if (contentWidth <= 0 || contentHeight <= 0) return 1;
  return Math.min(viewportWidth / contentWidth, viewportHeight / contentHeight, 1);
}

/**
 * Hold a scale inside the usable range.
 *
 * The floor is fit-to-screen: zooming out past it would only add empty margin and
 * shrink the board inside it, which is never what someone wants.
 */
export function clampScale(value: number, fit: number, maxZoom: number): number {
  'worklet';
  return Math.min(fit * maxZoom, Math.max(fit, value));
}
