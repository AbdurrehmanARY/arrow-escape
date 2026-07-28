/**
 * BoardCanvas.tsx — the board surface and everything on it.
 *
 * Purpose:      Draw the grid the player reads against, and the arrows on top, at
 *               any size from 8x8 up to 27x30.
 * Responsibilities:
 *               - Render the background pattern per `BoardStyle`.
 *               - Render one `ArrowSnake` per arrow, including one mid-exit.
 *               - Lay out the per-cell touch targets.
 * Notes:        The grid pattern is not decoration. Without visible cell
 *               structure the player cannot tell whether two ropes share a
 *               column, which is exactly the judgement the game asks for.
 *
 *               **The pattern is one tiled fill, not one node per cell.** A 27x30
 *               board is 810 cells; drawing that as 810 `<Circle>` elements costs
 *               more than every arrow on the board put together, and it scales
 *               with board size precisely where performance matters most. An SVG
 *               `<Pattern>` draws the same thing in three nodes regardless.
 *
 *               Sizing is decided by the caller via `computeBoardLayout`, because
 *               an oversized board and the viewport that scrolls it have to agree
 *               on exactly one answer.
 */

import { memo, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, Pattern, Rect } from 'react-native-svg';

import { colOf, EMPTY, rowOf, type Board, type BoardState } from '@game';
import type { ArrowStyle, BoardStyle, Palette } from '@theme';

import { ArrowSnake, type ArrowVisualState } from './ArrowSnake';

export interface BoardCanvasProps {
  board: Board;
  state: BoardState;
  /** From `computeBoardLayout`, so the viewport and the board agree on size. */
  cellSize: number;
  width: number;
  height: number;
  originX: number;
  originY: number;
  palette: Palette;
  arrowStyle: ArrowStyle;
  boardStyle: BoardStyle;
  safeArrows?: readonly number[];
  blockedArrow?: number | undefined;
  blockerArrow?: number | undefined;
  shakeNonce?: number;
  departingArrow?: number | undefined;
  onDepartComplete?: () => void;
  reducedMotion?: boolean;
  onTapArrow: (arrowIndex: number) => void;
  disabled?: boolean;
}

/** Unique enough per board; there is only ever one board on screen. */
const PATTERN_ID = 'boardGrid';

function BoardCanvasInner({
  board,
  state,
  cellSize,
  width,
  height,
  originX,
  originY,
  palette,
  arrowStyle,
  boardStyle,
  safeArrows,
  blockedArrow,
  blockerArrow,
  shakeNonce = 0,
  departingArrow,
  onDepartComplete,
  reducedMotion = false,
  onTapArrow,
  disabled = false,
}: BoardCanvasProps) {
  const { rows, cols } = board;

  /**
   * One tile of the grid pattern, repeated across the playfield.
   *
   * Every variant draws inside a single cell-sized tile, so the node count is
   * constant no matter how big the board gets.
   */
  const patternTile = useMemo(() => {
    const lineWidth = Math.max(0.5, cellSize * boardStyle.lineRatio);

    switch (boardStyle.pattern) {
      case 'dots':
        return (
          <Circle
            cx={cellSize / 2}
            cy={cellSize / 2}
            r={Math.max(1, cellSize * boardStyle.dotRatio)}
            fill={palette.pattern}
          />
        );
      case 'lines':
        return (
          <G>
            <Line x1={0} y1={0} x2={cellSize} y2={0} stroke={palette.pattern} strokeWidth={lineWidth} />
            <Line x1={0} y1={0} x2={0} y2={cellSize} stroke={palette.pattern} strokeWidth={lineWidth} />
          </G>
        );
      case 'crosses': {
        const arm = cellSize * 0.09;
        return (
          <G>
            <Line x1={-arm} y1={0} x2={arm} y2={0} stroke={palette.pattern} strokeWidth={lineWidth} strokeLinecap="round" />
            <Line x1={0} y1={-arm} x2={0} y2={arm} stroke={palette.pattern} strokeWidth={lineWidth} strokeLinecap="round" />
          </G>
        );
      }
      case 'checker':
        return (
          <Rect x={0} y={0} width={cellSize / 2} height={cellSize / 2} fill={palette.pattern} opacity={0.35} />
        );
      case 'none':
      default:
        return null;
    }
  }, [boardStyle, cellSize, palette.pattern]);

  // The departing arrow is already gone from `state`, but must keep drawing until
  // its animation finishes. Its exit ray is clear by definition, so its geometry
  // needs no state at all.
  const drawnArrows = useMemo(() => {
    const indices: number[] = [];
    for (let i = 0; i < board.arrows.length; i += 1) {
      if (state.alive[i] === 1 || i === departingArrow) indices.push(i);
    }
    return indices;
  }, [board.arrows.length, state, departingArrow]);

  const tappableArrows = useMemo(() => {
    const indices: number[] = [];
    for (let i = 0; i < board.arrows.length; i += 1) {
      if (state.alive[i] === 1) indices.push(i);
    }
    return indices;
  }, [board.arrows.length, state]);

  const visualFor = (index: number): ArrowVisualState => {
    if (index === blockedArrow) return 'blocked';
    if (index === blockerArrow) return 'blocker';
    if (safeArrows?.includes(index)) return 'safe';
    return 'normal';
  };

  return (
    <View style={{ width, height, borderRadius: boardStyle.cornerRadius, overflow: 'hidden' }}>
      <Svg width={width} height={height}>
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          rx={boardStyle.cornerRadius}
          fill={palette.board}
          stroke={palette.boardBorder}
          strokeWidth={palette.boardBorder === 'transparent' ? 0 : 1}
        />

        {patternTile ? (
          <>
            <Defs>
              <Pattern
                id={PATTERN_ID}
                x={originX}
                y={originY}
                width={cellSize}
                height={cellSize}
                patternUnits="userSpaceOnUse"
              >
                {patternTile}
              </Pattern>
            </Defs>
            <Rect
              x={originX}
              y={originY}
              width={cols * cellSize}
              height={rows * cellSize}
              fill={`url(#${PATTERN_ID})`}
            />
          </>
        ) : null}

        {drawnArrows.map((index) => (
          <ArrowSnake
            key={board.arrows[index]!.id}
            board={board}
            arrowIndex={index}
            cellSize={cellSize}
            originX={originX}
            originY={originY}
            style={arrowStyle}
            palette={palette}
            visual={visualFor(index)}
            departing={index === departingArrow}
            {...(index === departingArrow && onDepartComplete ? { onDepartComplete } : {})}
            shakeNonce={index === blockedArrow ? shakeNonce : 0}
            reducedMotion={reducedMotion}
          />
        ))}
      </Svg>

      {/*
        Touch targets, one per occupied cell, laid over the drawing.

        Real views rather than SVG `onPress`, because hit-testing a transparent
        stroke is inconsistent across platforms — and a full-cell target is the
        better tap anyway: any part of a snake selects the whole snake.

        These sit inside whatever transform the viewport applies, so they scale
        with the board and stay accurate at every zoom level for free.
      */}
      {!disabled &&
        tappableArrows.map((index) =>
          board.arrows[index]!.body.map((cell) => (
            <Pressable
              key={`${index}-${cell}`}
              accessibilityRole="button"
              accessibilityLabel={`Arrow ${board.arrows[index]!.id}, pointing ${board.arrows[index]!.dir}`}
              onPress={() => onTapArrow(index)}
              style={{
                position: 'absolute',
                left: originX + colOf(cell, cols) * cellSize,
                top: originY + rowOf(cell, cols) * cellSize,
                width: cellSize,
                height: cellSize,
              }}
            />
          )),
        )}
    </View>
  );
}

/** Small helper so callers can mark a cell as occupied without importing EMPTY. */
export const isOccupied = (state: BoardState, cell: number): boolean =>
  (state.occupancy[cell] ?? EMPTY) !== EMPTY;

export const BoardCanvas = memo(BoardCanvasInner);
