/**
 * camera.ts — the maths behind pan and zoom.
 *
 * Purpose:      Decide how far a board may be moved and how far it may be zoomed.
 * Responsibilities:
 *               - `clampTranslation` — keep the board reachable.
 *               - `fitScale` / `clampScale` — the zoom range.
 *               - `focalTranslation` — keep the focal point stationary during pinch.
 *               - `translationBounds` — clamp targets for `withDecay`.
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
 * The closest a player may ever get, as an absolute scale.
 *
 * `maxZoom` is expressed relative to fit-to-screen, which is the right unit for a
 * board that nearly fits: three and a half times a full view is plenty. It is the
 * wrong unit for a board that does not fit at all. A 60x60 level fits at about
 * 0.23, so a purely relative ceiling of 3.5x tops out at 0.8 — the player could
 * never reach the size the cells were designed at, on precisely the boards where
 * reading a single arrowhead matters most.
 *
 * So the ceiling is whichever is larger: the relative allowance, or this. At 1:1 a
 * cell is drawn at its intended size, and a little beyond that is useful for
 * picking apart a knot.
 */
const MIN_MAX_SCALE = 1.75;

/**
 * Hold a scale inside the usable range.
 *
 * The floor is fit-to-screen: zooming out past it would only add empty margin and
 * shrink the board inside it, which is never what someone wants. The ceiling is
 * `maxZoom` times fit, but never less than `MIN_MAX_SCALE`.
 */
export function clampScale(value: number, fit: number, maxZoom: number): number {
  'worklet';
  const ceiling = Math.max(fit * maxZoom, MIN_MAX_SCALE);
  return Math.min(ceiling, Math.max(fit, value));
}

/**
 * Adjust translation so the focal point stays stationary while scale changes.
 *
 * During a pinch, the point between the player's fingers should stay in the same
 * place on screen. Without this correction, zooming drifts toward or away from
 * the board centre, which makes it impossible to zoom into a specific corner.
 *
 * `focalOffset` is the distance from the viewport centre to the focal point,
 * i.e. `focalScreenPos - viewportSize / 2`. `oldTranslate` and `oldScale` are the
 * values before this frame's pinch update.
 */
export function focalTranslation(
  focalOffset: number,
  oldTranslate: number,
  oldScale: number,
  newScale: number,
): number {
  'worklet';
  // The content point under the focal position:
  //   contentPoint = (focalOffset - oldTranslate) / oldScale
  // After scaling, to keep that point at the same screen position:
  //   focalOffset = contentPoint * newScale + newTranslate
  //   newTranslate = focalOffset - contentPoint * newScale
  const contentPoint = (focalOffset - oldTranslate) / oldScale;
  return focalOffset - contentPoint * newScale;
}

/**
 * Translation bounds for one axis, used as the `clamp` argument for `withDecay`.
 *
 * Returns `[min, max]`. When the board is smaller than the viewport both are 0,
 * pinning it to centre. When larger, the board may pan exactly to its edge.
 */
export function translationBounds(
  contentSize: number,
  viewportSize: number,
  scale: number,
): [number, number] {
  'worklet';
  const scaled = contentSize * scale;
  if (scaled <= viewportSize) return [0, 0];
  const limit = (scaled - viewportSize) / 2;
  return [-limit, limit];
}
