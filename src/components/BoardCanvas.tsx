/**
 * BoardCanvas.tsx — the board surface and everything on it.
 *
 * Purpose:      Draw the grid the player reads against, and the arrows on top.
 * Responsibilities:
 *               - Size cells to the space available.
 *               - Render the board's background pattern per `BoardStyle`.
 *               - Render one `ArrowSnake` per live arrow.
 * Notes:        The grid pattern is not decoration. Without it, a board of loose
 *               ropes has no visible structure and the player cannot tell whether
 *               two lines are in the same column — which is exactly the judgement
 *               the game asks them to make. The dots are a playing aid.
 *
 *               One SVG root for the whole board, so the entire thing is a single
 *               native view no matter how many arrows are on it.
 */

import { memo, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, G, Line, Rect } from 'react-native-svg';

import { colOf, EMPTY, rowOf, type Board, type BoardState } from '@game';
import type { ArrowStyle, BoardStyle, Palette } from '@theme';

import { ArrowSnake, type ArrowVisualState } from './ArrowSnake';
import { fitCellSize } from './arrowGeometry';

export interface BoardCanvasProps {
  board: Board;
  state: BoardState;
  /** Space the board may occupy, in dp. The board is square-fitted inside it. */
  maxWidth: number;
  maxHeight: number;
  palette: Palette;
  arrowStyle: ArrowStyle;
  boardStyle: BoardStyle;
  /** Arrows to draw in the "clear run" colour, for assist mode. */
  safeArrows?: readonly number[];
  /** The arrow that just failed to move, flashed until the player moves on. */
  blockedArrow?: number | undefined;
  /** The arrow that blocked it, so the player can see the cause. */
  blockerArrow?: number | undefined;
  onTapArrow: (arrowIndex: number) => void;
}

function BoardCanvasInner({
  board,
  state,
  maxWidth,
  maxHeight,
  palette,
  arrowStyle,
  boardStyle,
  safeArrows,
  blockedArrow,
  blockerArrow,
  onTapArrow,
}: BoardCanvasProps) {
  const { rows, cols } = board;
  const pad = boardStyle.padCells;

  // Fit the grid — plus its padding ring — into the space available, keeping
  // cells square so a wide board and a tall one look like the same game.
  const cellSize = useMemo(
    () => fitCellSize(rows, cols, pad, maxWidth, maxHeight),
    [cols, rows, maxWidth, maxHeight, pad],
  );

  const width = cellSize * (cols + pad * 2);
  const height = cellSize * (rows + pad * 2);
  const originX = cellSize * pad;
  const originY = cellSize * pad;

  const pattern = useMemo(() => {
    const nodes: React.ReactElement[] = [];
    const lineWidth = Math.max(0.5, cellSize * boardStyle.lineRatio);

    switch (boardStyle.pattern) {
      case 'dots': {
        const r = Math.max(1, cellSize * boardStyle.dotRatio);
        for (let row = 0; row < rows; row += 1) {
          for (let col = 0; col < cols; col += 1) {
            nodes.push(
              <Circle
                key={`d${row}-${col}`}
                cx={originX + col * cellSize + cellSize / 2}
                cy={originY + row * cellSize + cellSize / 2}
                r={r}
                fill={palette.pattern}
              />,
            );
          }
        }
        break;
      }

      case 'lines': {
        for (let col = 0; col <= cols; col += 1) {
          const x = originX + col * cellSize;
          nodes.push(
            <Line
              key={`v${col}`}
              x1={x}
              y1={originY}
              x2={x}
              y2={originY + rows * cellSize}
              stroke={palette.pattern}
              strokeWidth={lineWidth}
            />,
          );
        }
        for (let row = 0; row <= rows; row += 1) {
          const y = originY + row * cellSize;
          nodes.push(
            <Line
              key={`h${row}`}
              x1={originX}
              y1={y}
              x2={originX + cols * cellSize}
              y2={y}
              stroke={palette.pattern}
              strokeWidth={lineWidth}
            />,
          );
        }
        break;
      }

      case 'crosses': {
        const arm = cellSize * 0.09;
        for (let row = 0; row <= rows; row += 1) {
          for (let col = 0; col <= cols; col += 1) {
            const x = originX + col * cellSize;
            const y = originY + row * cellSize;
            nodes.push(
              <Line
                key={`cx${row}-${col}`}
                x1={x - arm}
                y1={y}
                x2={x + arm}
                y2={y}
                stroke={palette.pattern}
                strokeWidth={lineWidth}
                strokeLinecap="round"
              />,
              <Line
                key={`cy${row}-${col}`}
                x1={x}
                y1={y - arm}
                x2={x}
                y2={y + arm}
                stroke={palette.pattern}
                strokeWidth={lineWidth}
                strokeLinecap="round"
              />,
            );
          }
        }
        break;
      }

      case 'checker': {
        for (let row = 0; row < rows; row += 1) {
          for (let col = 0; col < cols; col += 1) {
            if ((row + col) % 2 === 1) continue;
            nodes.push(
              <Rect
                key={`k${row}-${col}`}
                x={originX + col * cellSize}
                y={originY + row * cellSize}
                width={cellSize}
                height={cellSize}
                fill={palette.pattern}
                opacity={0.35}
              />,
            );
          }
        }
        break;
      }

      case 'none':
      default:
        break;
    }

    return nodes;
  }, [boardStyle, cellSize, cols, rows, originX, originY, palette.pattern]);

  const liveArrows = useMemo(() => {
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
    <View style={{ width, height }}>
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
        <G>{pattern}</G>
        {liveArrows.map((index) => (
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
          />
        ))}
      </Svg>

      {/*
        Touch targets, one per occupied cell, laid over the drawing.

        Real views rather than SVG `onPress`, because hit-testing a transparent
        stroke is inconsistent across platforms — and a full-cell target is the
        better tap anyway: any part of a snake selects the whole snake, so a thin
        arrow is no harder to hit than a fat one.
      */}
      {liveArrows.map((index) =>
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
