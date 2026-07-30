/**
 * BoardCanvas.tsx — the board surface and everything on it.
 *
 * Purpose:      Draw the grid the player reads against, and the arrows on top, at
 *               any size from 8x8 up to 60x60.
 * Responsibilities:
 *               - Render the background pattern per `BoardStyle`.
 *               - Render one `ArrowSnake` per arrow, including any mid-exit.
 *               - Turn a tap anywhere on the board into the arrow it meant.
 * Notes:        The grid pattern is not decoration. Without visible cell
 *               structure the player cannot tell whether two ropes share a
 *               column, which is exactly the judgement the game asks for.
 *
 *               **Nothing here scales with cell count.** A 60x60 board is 3,600
 *               cells, and the two things that used to be drawn per cell — the grid
 *               and the touch targets — are now one tiled `<Pattern>` and one tap
 *               surface respectively. That is the difference between a handful of
 *               nodes and several thousand.
 *
 *               **Touch is arithmetic, not a view.** See `arrowAtPoint`. Besides
 *               costing nothing, it avoids mixing React Native's touch system with
 *               gesture-handler's, which is a combination that silently drops
 *               presses whenever a gesture claims the touch.
 *
 *               Sizing is decided by the caller via `computeBoardLayout`, because
 *               an oversized board and the viewport that scrolls it have to agree
 *               on exactly one answer.
 */

import { memo, useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Line, Pattern, Rect } from 'react-native-svg';

import { colOf, EMPTY, isGateOpen, NO_GROUP, rowOf, type Board, type BoardState } from '@game';
import type { ArrowStyle, BoardStyle, Palette } from '@theme';

import { ArrowSnake, type ArrowVisualState } from './ArrowSnake';
import { PAN_SLOP } from './BoardViewport';

/**
 * How far outside an arrow a tap may land and still select it, in cells.
 *
 * Slightly under a cell: a tap that misses by less than half a cell almost
 * certainly meant the snake it is nearest to, and on a large board that is the
 * difference between the game feeling responsive and feeling broken. Much beyond
 * one cell and it starts selecting arrows the player was not aiming at, which
 * costs them a heart.
 */
const TAP_TOLERANCE_CELLS = 0.85;

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
  /**
   * Arrows currently animating off the board.
   *
   * A list rather than a single index, because a player may tap the next arrow
   * before the last one has finished leaving — and now that the exit animation is
   * deliberately unhurried, they usually will. Refusing those taps is the same
   * failure as dropping them.
   */
  departingArrows?: readonly number[];
  onDepartComplete?: (arrowIndex: number) => void;
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
  departingArrows,
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
            <Line
              x1={0}
              y1={0}
              x2={cellSize}
              y2={0}
              stroke={palette.pattern}
              strokeWidth={lineWidth}
            />
            <Line
              x1={0}
              y1={0}
              x2={0}
              y2={cellSize}
              stroke={palette.pattern}
              strokeWidth={lineWidth}
            />
          </G>
        );
      case 'crosses': {
        const arm = cellSize * 0.09;
        return (
          <G>
            <Line
              x1={-arm}
              y1={0}
              x2={arm}
              y2={0}
              stroke={palette.pattern}
              strokeWidth={lineWidth}
              strokeLinecap="round"
            />
            <Line
              x1={0}
              y1={-arm}
              x2={0}
              y2={arm}
              stroke={palette.pattern}
              strokeWidth={lineWidth}
              strokeLinecap="round"
            />
          </G>
        );
      }
      case 'checker':
        return (
          <Rect
            x={0}
            y={0}
            width={cellSize / 2}
            height={cellSize / 2}
            fill={palette.pattern}
            opacity={0.35}
          />
        );
      case 'none':
      default:
        return null;
    }
  }, [boardStyle, cellSize, palette.pattern]);

  // A departing arrow is already gone from `state`, but must keep drawing until
  // its animation finishes. Its exit ray is clear by definition, so its geometry
  // needs no state at all.
  const drawnArrows = useMemo(() => {
    const indices: number[] = [];
    for (let i = 0; i < board.arrows.length; i += 1) {
      if (state.alive[i] === 1 || departingArrows?.includes(i)) indices.push(i);
    }
    return indices;
  }, [board.arrows.length, state, departingArrows]);

  /**
   * Which arrow, if any, a tap at this point selects.
   *
   * The exact cell first, then a widening search of its neighbours. That second
   * part is the whole reason this is a function rather than one division: on a
   * large board a cell is a few dp across, and demanding a hit inside the exact
   * cell means a tap that visually lands on a snake does nothing. Since the only
   * verb in this game is "tap an arrow", a near-miss should select what the player
   * obviously meant, not nothing.
   *
   * It never selects an arrow further than `TAP_TOLERANCE_CELLS` away, so a tap on
   * genuinely empty board still does nothing — which matters, because tapping the
   * wrong arrow costs a heart and a too-eager hit test would spend it for you.
   */
  const arrowAtPoint = useCallback(
    (x: number, y: number, cells: readonly number[]): number => {
      'worklet';
      const col = Math.floor((x - originX) / cellSize);
      const row = Math.floor((y - originY) / cellSize);

      const occupantAt = (r: number, c: number): number => {
        'worklet';
        if (r < 0 || r >= rows || c < 0 || c >= cols) return EMPTY;
        return cells[r * cols + c] ?? EMPTY;
      };

      const direct = occupantAt(row, col);
      if (direct !== EMPTY) return direct;

      // Nearest occupied cell centre within tolerance. Distance is measured to the
      // centre so that of two equally-close snakes the player gets the one their
      // finger is actually over.
      const reach = Math.ceil(TAP_TOLERANCE_CELLS);
      let best = EMPTY;
      let bestDistance = (TAP_TOLERANCE_CELLS * cellSize) ** 2;

      for (let dr = -reach; dr <= reach; dr += 1) {
        for (let dc = -reach; dc <= reach; dc += 1) {
          const owner = occupantAt(row + dr, col + dc);
          if (owner === EMPTY) continue;
          const cx = originX + (col + dc + 0.5) * cellSize;
          const cy = originY + (row + dr + 0.5) * cellSize;
          const distance = (x - cx) ** 2 + (y - cy) ** 2;
          if (distance < bestDistance) {
            bestDistance = distance;
            best = owner;
          }
        }
      }

      return best;
    },
    [rows, cols, cellSize, originX, originY],
  );

  /**
   * Which arrow is currently under a finger, for press feedback.
   *
   * Written on the UI thread and read inside each snake's animated style, so
   * highlighting costs no React render at all. On a hundred-snake board a
   * `useState` here would re-render the entire board twice per tap — to show that
   * a tap was received, which is the one thing that must never cost frames.
   */
  const pressedArrow = useSharedValue(EMPTY);

  /**
   * Occupancy, in a form a worklet can read.
   *
   * `BoardState.occupancy` is an `Int32Array`, which does not cross to the UI
   * thread, so this is a plain-array copy kept in step with it. Copying a few
   * thousand integers once per tap is nothing next to what it buys: the hit test
   * runs entirely on the UI thread, so an arrow lights up under the finger even
   * while the JS thread is busy resolving the previous move.
   *
   * A cell holds `EMPTY` the moment its arrow leaves, so this needs no separate
   * liveness check.
   */
  const occupancy = useSharedValue<number[]>([]);
  useEffect(() => {
    occupancy.value = Array.from(state.occupancy);
    // `occupancy` is a stable shared value; listing it would make this a hook
    // argument that the effect then mutates, which the compiler rightly rejects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  /**
   * The board's tap gesture.
   *
   * `maxDistance` matches the viewport's pan threshold on purpose: if the tap
   * allowed less travel than the pan requires, a finger that moved somewhere
   * between the two would be neither a tap nor a pan, and the touch would silently
   * do nothing. `maxDuration` is generous because a considered tap on a puzzle
   * board is a slower thing than a tap on a button.
   */
  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDistance(PAN_SLOP)
        .maxDuration(900)
        .onBegin((event) => {
          'worklet';
          pressedArrow.value = arrowAtPoint(event.x, event.y, occupancy.value);
        })
        .onEnd((event, success) => {
          'worklet';
          if (!success) return;
          const index = arrowAtPoint(event.x, event.y, occupancy.value);
          if (index !== EMPTY) runOnJS(onTapArrow)(index);
        })
        // Fires however the gesture ends — tapped, cancelled, or stolen by the pan.
        // Anything less than "always" leaves an arrow stuck looking pressed.
        .onFinalize(() => {
          'worklet';
          pressedArrow.value = EMPTY;
        }),
    // The two shared values are stable and deliberately absent: listing them would
    // make them hook arguments that the worklets then write to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [arrowAtPoint, onTapArrow],
  );

  /**
   * Walls and gates, drawn under the arrows.
   *
   * Unlike the grid pattern these cannot be a tiled fill — each one is at a
   * specific place — but there are only ever a handful per board, so a node each
   * is the right trade. The list is rebuilt when gate state changes, which is
   * exactly when a gate needs to change how it looks.
   */
  const obstacles = useMemo(() => {
    if (!board.hasObstacles) return null;

    const nodes: React.ReactNode[] = [];
    const inset = cellSize * 0.08;
    const size = cellSize - inset * 2;

    for (let cell = 0; cell < board.cellCount; cell += 1) {
      const isWall = board.walls[cell] === 1;
      const group = board.gateGroup[cell] ?? NO_GROUP;
      if (!isWall && group === NO_GROUP) continue;

      const x = originX + colOf(cell, cols) * cellSize + inset;
      const y = originY + rowOf(cell, cols) * cellSize + inset;

      if (isWall) {
        nodes.push(
          <Rect
            key={`w${cell}`}
            x={x}
            y={y}
            width={size}
            height={size}
            rx={cellSize * 0.16}
            fill={palette.wall}
          />,
        );
        continue;
      }

      const color = palette.groupColors[group % palette.groupColors.length]!;
      const open = isGateOpen(board, state, cell);

      // Open and shut have to be unmistakable at a glance, because a misread gate
      // costs a heart or — on a shutter board — the level. Shut is a filled block
      // with a bar across it; open is the same outline left hollow.
      nodes.push(
        <G key={`g${cell}`} opacity={open ? 0.45 : 1}>
          <Rect
            x={x}
            y={y}
            width={size}
            height={size}
            rx={cellSize * 0.16}
            fill={open ? 'none' : color}
            stroke={color}
            strokeWidth={Math.max(1, cellSize * 0.07)}
            {...(open ? { strokeDasharray: `${cellSize * 0.14} ${cellSize * 0.1}` } : {})}
          />
          {open ? null : (
            <Line
              x1={x + size * 0.22}
              y1={y + size / 2}
              x2={x + size * 0.78}
              y2={y + size / 2}
              stroke={palette.board}
              strokeWidth={Math.max(1.5, cellSize * 0.1)}
              strokeLinecap="round"
            />
          )}
        </G>,
      );
    }

    return nodes;
  }, [board, state, cellSize, cols, originX, originY, palette]);

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

        {obstacles}

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
            departing={departingArrows?.includes(index) ?? false}
            {...(onDepartComplete ? { onDepartComplete: () => onDepartComplete(index) } : {})}
            shakeNonce={index === blockedArrow ? shakeNonce : 0}
            pressedArrow={pressedArrow}
            reducedMotion={reducedMotion}
          />
        ))}
      </Svg>

      {/*
        One tap surface for the whole board, rather than a view per occupied cell.

        The per-cell version had two problems that both got worse as boards grew.
        It was a `Pressable` — React Native's touch system — living inside a
        gesture-handler `GestureDetector`, and the two do not negotiate: whenever
        the pan claimed the touch, the press was cancelled with no press event, so
        taps went missing. And a 60x60 board at this density is well over a
        thousand views whose only job is to be tapped.

        One gesture-handler `Tap` fixes both. It arbitrates with the pan and pinch
        properly, and it costs one view no matter how big the board gets. Hit
        testing is arithmetic instead — see `arrowAtPoint`, which is also where
        near-misses are forgiven.

        It sits inside whatever transform the viewport applies, so the tap's local
        coordinates are already board coordinates and stay exact at every zoom
        level for free.
      */}
      {disabled ? null : (
        <GestureDetector gesture={tapGesture}>
          <View style={StyleSheet.absoluteFill} />
        </GestureDetector>
      )}

      {/*
        Screen-reader handles, one per arrow rather than one per cell.

        `pointerEvents="none"` is load-bearing: these must never take part in touch
        handling. Mixing React Native's touch system with gesture-handler is what
        made taps unreliable in the first place, and reintroducing it for
        accessibility would trade a problem everyone has for a benefit few can use.
        `onAccessibilityTap` is delivered by the accessibility service directly, so
        it still works from an assistive gesture.

        This will not make the game playable with a screen reader — it is a puzzle
        about visually tracing a line through a tangle — but naming the arrows and
        their directions is meaningfully better than an unlabelled canvas.
      */}
      {disabled
        ? null
        : drawnArrows.map((index) => {
            const arrow = board.arrows[index]!;
            const head = arrow.body[0]!;
            return (
              <View
                key={`a11y-${arrow.id}`}
                accessible
                accessibilityRole="button"
                accessibilityLabel={`Arrow ${arrow.id}, ${arrow.body.length} cells, pointing ${arrow.dir}`}
                onAccessibilityTap={() => onTapArrow(index)}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: originX + colOf(head, cols) * cellSize,
                  top: originY + rowOf(head, cols) * cellSize,
                  width: cellSize,
                  height: cellSize,
                }}
              />
            );
          })}
    </View>
  );
}

/** Small helper so callers can mark a cell as occupied without importing EMPTY. */
export const isOccupied = (state: BoardState, cell: number): boolean =>
  (state.occupancy[cell] ?? EMPTY) !== EMPTY;

export const BoardCanvas = memo(BoardCanvasInner);
