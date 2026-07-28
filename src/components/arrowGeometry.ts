/**
 * arrowGeometry.ts — where every part of an arrow is drawn.
 *
 * Purpose:      Turn a snake's body cells plus an `ArrowStyle` into plain
 *               coordinates. No React, no SVG elements — just numbers.
 * Responsibilities:
 *               - `buildArrowGeometry` — body polyline, arrowhead, eye positions.
 *               - Small formatting helpers for SVG attributes.
 * Notes:        Pure on purpose. It keeps the drawing maths unit-testable, and it
 *               means the off-device theme preview renders from the exact same
 *               code the app does — so a preview cannot quietly disagree with
 *               what ships.
 */

import { colOf, rowOf, type Board } from '@game';
import type { ArrowStyle } from '@theme';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface ArrowGeometry {
  /** Body centres, tail first. Drawing tail-to-head puts the head decoration on top. */
  readonly body: readonly Point[];
  /** Point of the arrowhead. */
  readonly tip: Point;
  /** Centre of the arrowhead's base, where it meets the body. */
  readonly baseCentre: Point;
  /** The arrowhead's two shoulders. */
  readonly baseLeft: Point;
  readonly baseRight: Point;
  /** Unit vector the head points along, in screen coordinates. */
  readonly forward: Point;
  /** Unit vector across the head. */
  readonly across: Point;
  /** Body thickness in dp. */
  readonly stroke: number;
  /** Eye centres, when the style asks for them. */
  readonly eyes: readonly Point[];
  /** Pupil centres, matching `eyes` by index. */
  readonly pupils: readonly Point[];
  readonly eyeRadius: number;
}

/** Centre point of a cell, in board-canvas coordinates. */
export function cellCentre(
  cell: number,
  cols: number,
  cellSize: number,
  originX: number,
  originY: number,
): Point {
  return {
    x: originX + colOf(cell, cols) * cellSize + cellSize / 2,
    y: originY + rowOf(cell, cols) * cellSize + cellSize / 2,
  };
}

/** `"x,y x,y ..."` for an SVG `points` attribute. */
export const toPointsAttr = (points: readonly Point[]): string =>
  points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

/** Shift every point by `dx`/`dy`. Used for the shadow and highlight passes. */
export const offsetPoints = (points: readonly Point[], dx: number, dy: number): Point[] =>
  points.map((p) => ({ x: p.x + dx, y: p.y + dy }));

/**
 * Work out every coordinate needed to draw one arrow.
 *
 * All measurements come from `style` as ratios of a cell, so an arrow looks
 * identical on a cramped 10x10 board and a roomy 4x4 one.
 */
export function buildArrowGeometry(
  board: Board,
  arrowIndex: number,
  cellSize: number,
  originX: number,
  originY: number,
  style: ArrowStyle,
): ArrowGeometry {
  const arrow = board.arrows[arrowIndex]!;
  const { cols } = board;

  const body = arrow.body
    .map((cell) => cellCentre(cell, cols, cellSize, originX, originY))
    .reverse();
  const head = body[body.length - 1]!;

  // `dr` is a row delta, which is +y on screen; `dc` is +x.
  const forward: Point = { x: arrow.dc, y: arrow.dr };
  const across: Point = { x: -forward.y, y: forward.x };

  const tip: Point = {
    x: head.x + forward.x * cellSize * style.headTipRatio,
    y: head.y + forward.y * cellSize * style.headTipRatio,
  };
  const baseCentre: Point = {
    x: tip.x - forward.x * cellSize * style.headLengthRatio,
    y: tip.y - forward.y * cellSize * style.headLengthRatio,
  };
  const halfWidth = cellSize * style.headHalfWidthRatio;

  const baseLeft: Point = {
    x: baseCentre.x + across.x * halfWidth,
    y: baseCentre.y + across.y * halfWidth,
  };
  const baseRight: Point = {
    x: baseCentre.x - across.x * halfWidth,
    y: baseCentre.y - across.y * halfWidth,
  };

  const eyeRadius = cellSize * 0.085;
  const eyes: Point[] = [];
  const pupils: Point[] = [];

  if (style.eyes) {
    const spread = cellSize * 0.13;
    const back = cellSize * style.headLengthRatio * 0.55 + cellSize * 0.06;
    const cx = tip.x - forward.x * back;
    const cy = tip.y - forward.y * back;

    for (const side of [1, -1]) {
      const ex = cx + across.x * spread * side;
      const ey = cy + across.y * spread * side;
      eyes.push({ x: ex, y: ey });
      pupils.push({
        x: ex + forward.x * eyeRadius * 0.35,
        y: ey + forward.y * eyeRadius * 0.35,
      });
    }
  }

  return {
    body,
    tip,
    baseCentre,
    baseLeft,
    baseRight,
    forward,
    across,
    stroke: cellSize * style.strokeRatio,
    eyes,
    pupils,
    eyeRadius,
  };
}

/**
 * SVG path for a `rounded` arrowhead: a dome curving from each shoulder to the
 * tip. Friendlier than a triangle, and it gives the eyes something to sit on.
 */
export function roundedHeadPath(geometry: ArrowGeometry, cellSize: number): string {
  const { baseLeft, baseRight, tip, forward } = geometry;
  const pull = cellSize * 0.3;
  const c1 = { x: baseLeft.x + forward.x * pull, y: baseLeft.y + forward.y * pull };
  const c2 = { x: baseRight.x + forward.x * pull, y: baseRight.y + forward.y * pull };

  return (
    `M ${baseLeft.x.toFixed(2)} ${baseLeft.y.toFixed(2)} ` +
    `Q ${c1.x.toFixed(2)} ${c1.y.toFixed(2)} ${tip.x.toFixed(2)} ${tip.y.toFixed(2)} ` +
    `Q ${c2.x.toFixed(2)} ${c2.y.toFixed(2)} ${baseRight.x.toFixed(2)} ${baseRight.y.toFixed(2)} Z`
  );
}

/** Cell size that fits a board plus its padding ring into the space available. */
export function fitCellSize(
  rows: number,
  cols: number,
  padCells: number,
  maxWidth: number,
  maxHeight: number,
): number {
  return Math.floor(
    Math.min(maxWidth / (cols + padCells * 2), maxHeight / (rows + padCells * 2)),
  );
}

export interface BoardLayout {
  readonly cellSize: number;
  readonly width: number;
  readonly height: number;
  readonly originX: number;
  readonly originY: number;
  /** True when the board is larger than the space it was given. */
  readonly oversized: boolean;
}

/**
 * Work out how big to draw a board.
 *
 * The `minCellSize` floor is what makes oversized levels playable rather than
 * merely visible. Fitting a 27x30 board to a phone would give roughly 12dp cells
 * — too small to read a head, and far too small to tap reliably. Instead the
 * board is drawn at a usable size and allowed to overflow, and `BoardViewport`
 * gives the player pan and zoom to reach the rest of it.
 *
 * Shared by the board and by whatever sizes its viewport, so there is one answer
 * to "how big is this board" rather than two that can disagree.
 */
export function computeBoardLayout(
  rows: number,
  cols: number,
  padCells: number,
  maxWidth: number,
  maxHeight: number,
  minCellSize: number,
): BoardLayout {
  const fitted = fitCellSize(rows, cols, padCells, maxWidth, maxHeight);
  const cellSize = Math.max(minCellSize, fitted);
  const width = cellSize * (cols + padCells * 2);
  const height = cellSize * (rows + padCells * 2);

  return {
    cellSize,
    width,
    height,
    originX: cellSize * padCells,
    originY: cellSize * padCells,
    oversized: width > maxWidth + 0.5 || height > maxHeight + 0.5,
  };
}
