/**
 * hitTest.ts — turning a touch into an arrow.
 *
 * Purpose:      Undo the camera transform and decide which snake a tap meant.
 * Responsibilities:
 *               - `toBoardPoint`      — viewport coordinates to board coordinates.
 *               - `arrowAtBoardPoint` — board coordinates to an arrow index.
 * Notes:        **Pure TypeScript, and deliberately free of Skia and React.** Two
 *               reasons, and the second is the load-bearing one.
 *
 *               The obvious reason is the project's own rule: maths that can be
 *               decided without a platform belongs in a layer that has none.
 *
 *               The real reason is that a Skia canvas cannot be asserted on. It
 *               draws pixels and answers no questions, so anything left inside the
 *               renderer becomes untestable the moment it moves there — and this is
 *               the most dangerous code in the migration. Under SVG the tap surface
 *               sat *inside* the transformed view, so a touch arrived already in
 *               board coordinates and there was no conversion to get wrong. A Skia
 *               matrix does not move the view, so that inversion is now done by
 *               hand. Getting it wrong does not crash and does not look broken; it
 *               selects the arrow *next to* the one the player aimed at, costs a
 *               heart, and reads as the game cheating.
 *
 *               Both previous touch bugs in this project were found by a player
 *               rather than a test. This file exists so the third one is not.
 */

import { EMPTY, type Board, type BoardState } from '@game';

/**
 * How far outside an arrow a tap may land and still select it, in cells.
 *
 * Unchanged from the SVG renderer so tap feel is identical. Slightly under a cell:
 * a miss by less than half a cell almost certainly meant the snake it is nearest
 * to, and on a large board that is the difference between the game feeling
 * responsive and feeling broken. Much beyond one cell and it starts selecting
 * arrows the player was not aiming at, which costs them a heart.
 */
export const TAP_TOLERANCE_CELLS = 0.85;

/** A point in either coordinate space. Plain data, so this file needs no Skia. */
export interface XY {
  readonly x: number;
  readonly y: number;
}

/**
 * Convert a touch in viewport coordinates into board-canvas coordinates.
 *
 * The camera draws the board scaled about its own centre and then offset, so
 * undoing it is: take the touch relative to the viewport centre, remove the
 * translation, divide out the scale, and put it back relative to the content
 * centre. Marked as a worklet so the gesture can call it on the UI thread without
 * a hop to JS.
 */
export function toBoardPoint(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
  contentWidth: number,
  contentHeight: number,
  translateX: number,
  translateY: number,
  scale: number,
): XY {
  'worklet';
  return {
    x: (x - viewportWidth / 2 - translateX) / scale + contentWidth / 2,
    y: (y - viewportHeight / 2 - translateY) / scale + contentHeight / 2,
  };
}

/**
 * Which arrow a board-space point selects, or `EMPTY`.
 *
 * The exact cell first, then a widening search of its neighbours. That second part
 * is the whole reason this is a function rather than one division: on a large board
 * a cell is a few dp across, and demanding a hit inside the exact cell means a tap
 * that visually lands on a snake does nothing. It never selects an arrow further
 * than `TAP_TOLERANCE_CELLS` away, so a tap on genuinely empty board still does
 * nothing — which matters, because a wrong tap costs a heart.
 */
export function arrowAtBoardPoint(
  state: BoardState,
  board: Board,
  bx: number,
  by: number,
  cellSize: number,
  originX: number,
  originY: number,
): number {
  const { rows, cols } = board;
  const col = Math.floor((bx - originX) / cellSize);
  const row = Math.floor((by - originY) / cellSize);

  const occupantAt = (r: number, c: number): number => {
    if (r < 0 || r >= rows || c < 0 || c >= cols) return EMPTY;
    const owner = state.occupancy[r * cols + c] ?? EMPTY;
    return owner !== EMPTY && state.alive[owner] === 1 ? owner : EMPTY;
  };

  const direct = occupantAt(row, col);
  if (direct !== EMPTY) return direct;

  // Nearest occupied cell centre within tolerance. Distance is measured to the
  // centre so that of two equally close snakes the player gets the one their finger
  // is actually over.
  const reach = Math.ceil(TAP_TOLERANCE_CELLS);
  let best = EMPTY;
  let bestDistance = (TAP_TOLERANCE_CELLS * cellSize) ** 2;

  for (let dr = -reach; dr <= reach; dr += 1) {
    for (let dc = -reach; dc <= reach; dc += 1) {
      const owner = occupantAt(row + dr, col + dc);
      if (owner === EMPTY) continue;
      const cx = originX + (col + dc + 0.5) * cellSize;
      const cy = originY + (row + dr + 0.5) * cellSize;
      const distance = (bx - cx) ** 2 + (by - cy) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = owner;
      }
    }
  }

  return best;
}
