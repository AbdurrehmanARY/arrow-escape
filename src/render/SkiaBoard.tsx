/**
 * SkiaBoard.tsx — the whole playfield, drawn on one canvas.
 *
 * Purpose:      Replace the SVG board with a Skia scene whose cost is measured in
 *               pixels rather than in nodes.
 * Responsibilities:
 *               - Draw the static board as a single recorded picture.
 *               - Draw only the arrows actually moving this frame, individually.
 *               - Own the camera matrix, driven entirely from the UI thread.
 *               - Resolve a tap back to an arrow.
 * Notes:        **There is no component per arrow, by design.** Everything at rest
 *               is one `<Picture>`; the one or two arrows in motion get a `<Path>`
 *               each. That exploits a property the rules guarantee: a tap removes
 *               one snake, so only a handful can ever be animating at once. It is
 *               the same observation that originally argued *against* Skia, and it
 *               is what now makes Skia cheap.
 *
 *               **The camera lives inside the canvas.** Under SVG the transform sat
 *               on an `Animated.View` wrapping the board, which meant the platform
 *               had to move a view the size of the whole level — up to 1456x1352dp,
 *               past what a hardware layer can hold. Here it is a matrix on a
 *               `<Group>`, applied by Skia as it draws. Nothing is re-laid-out and
 *               nothing is re-rasterised; the same picture is replayed through a
 *               different transform.
 *
 *               **Hit testing had to change and is the riskiest part of this file.**
 *               Previously the tap surface sat *inside* the transformed view, so a
 *               touch arrived already in board coordinates. A Skia matrix does not
 *               move the view, so the inverse transform is applied by hand in
 *               `toBoardPoint`. Getting this wrong costs the player hearts, which is
 *               why it is one small pure function with the maths written out.
 */

import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { Canvas, Group, Picture } from '@shopify/react-native-skia';

import type { Board, BoardState } from '@game';
import type { ArrowStyle, BoardStyle, Palette } from '@theme';

import { ArrowNode } from './arrows/ArrowNode';
import { DepartingDotsNode } from './effects/DepartingDotsNode';
import { PressOverlay } from './effects/PressOverlay';
import { useBoardCamera } from './view/useBoardCamera';
import { useBoardGestures } from './gestures/useBoardGestures';
import { buildScene, splitScene, type Scene } from './scene';
import { buildAllArrowPaths, recordStatic } from './skiaScene';

/**
 * Shared with the tap gesture, exactly as before — see `BoardViewport`.
 *
 * Both this and the fling cap now live with the gestures that use them, and are
 * re-exported here so the module's public surface is unchanged.
 */
export { PAN_SLOP } from './gestures/useBoardGestures';

export interface SkiaBoardProps {
  board: Board;
  state: BoardState;
  cellSize: number;
  width: number;
  height: number;
  originX: number;
  originY: number;
  viewportWidth: number;
  viewportHeight: number;
  palette: Palette;
  arrowStyle: ArrowStyle;
  boardStyle: BoardStyle;
  maxZoom?: number;
  initialScale?: number;
  safeArrows?: readonly number[];
  /** Standing collision marks — every pair the player has misjudged this attempt. */
  blockedArrows?: readonly number[];
  blockerArrows?: readonly number[];
  /**
   * The one arrow to recoil right now, paired with `shakeNonce`.
   *
   * Separate from `blockedArrows` because the two answer different questions: this
   * is "what just happened", those are "what has happened". Only the newest
   * collision shakes; every collision stays coloured.
   */
  shakeArrow?: number | undefined;
  hintedArrow?: number | undefined;
  departingArrows?: readonly number[];
  onDepartComplete?: (arrowIndex: number) => void;
  /** Bump to animate the camera back to fit-to-screen. */
  fitNonce?: number;
  /** Board-canvas point to bring into view; bump `focusNonce` to run it. */
  focusX?: number;
  focusY?: number;
  focusNonce?: number;
  onFocusComplete?: () => void;
  /** Free cells before blocker for blocked arrow collision distance. */
  freeCells?: number | undefined;
  /** Callback fired at the exact collision point of a blocked tap animation. */
  onCollisionHit?: ((arrowIndex: number) => void) | undefined;
  /** Bumped on every failed tap, re-triggering the blocked arrow's recoil. */
  shakeNonce?: number;
  reducedMotion?: boolean;
  onTapArrow: (arrowIndex: number) => void;
  /**
   * A finger has gone down on an arrow — before it is known whether the gesture
   * will become a tap, a pan, or nothing at all.
   *
   * Reported separately from `onTapArrow` so the screen can answer the *touch*
   * rather than the outcome. It fires exactly when the arrow starts drawing
   * pressed, so feedback and appearance cannot disagree.
   */
  onPressArrow?: (arrowIndex: number) => void;
  /** A completed tap that landed on no arrow — empty board, or a gap in one. */
  onTapEmpty?: () => void;
  disabled?: boolean;
}

export function SkiaBoard({
  board,
  state,
  cellSize,
  width,
  height,
  originX,
  originY,
  viewportWidth,
  viewportHeight,
  palette,
  arrowStyle,
  boardStyle,
  maxZoom = 3.5,
  initialScale,
  safeArrows,
  blockedArrows,
  blockerArrows,
  shakeArrow,
  hintedArrow,
  departingArrows,
  onDepartComplete,
  fitNonce = 0,
  focusX = 0,
  focusY = 0,
  focusNonce = 0,
  onFocusComplete,
  shakeNonce = 0,
  freeCells = 0,
  onCollisionHit,
  reducedMotion = false,
  onTapArrow,
  onPressArrow,
  onTapEmpty,
  disabled = false,
}: SkiaBoardProps) {
  // ---- Scene ---------------------------------------------------------------
  // Rebuilt when the board, the highlights or the layout change. Never per frame.
  const scene: Scene = useMemo(
    () =>
      buildScene({
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
        ...(departingArrows ? { departing: departingArrows } : {}),
        ...(blockedArrows ? { blockedArrows } : {}),
        ...(blockerArrows ? { blockerArrows } : {}),
        hintedArrow,
        ...(safeArrows ? { safeArrows } : {}),
      }),
    [
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
      departingArrows,
      blockedArrows,
      blockerArrows,
      hintedArrow,
      safeArrows,
    ],
  );

  // Paths are geometry only, so they survive every change except a layout change.
  const paths = useMemo(() => buildAllArrowPaths(scene), [scene]);

  /**
   * Arrows that cannot live in the static picture this frame.
   *
   * Only what genuinely *moves*: mid-exit, recoiling from the tap that just
   * failed, or hinted. Everything else is recorded once and replayed as a single
   * draw.
   *
   * The standing collision marks are deliberately **not** here. They change colour
   * and nothing else, and `buildScene` has already assigned that colour — so they
   * are baked into the picture and cost nothing per frame. Pulling them out would
   * mean up to ten permanently individual arrows for a purely static difference.
   *
   * Also deliberately not including the arrow under the player's finger. Press
   * feedback fires on every touch-down, including the start of a pan, and pulling an
   * arrow out of the picture means re-recording all 180. It is drawn as an overlay
   * instead — see `pressedArrow` below.
   */
  const moving = useMemo(() => {
    const set = new Set<number>(departingArrows ?? []);
    if (shakeArrow !== undefined) set.add(shakeArrow);
    if (hintedArrow !== undefined) set.add(hintedArrow);
    return set;
  }, [departingArrows, shakeArrow, hintedArrow]);

  const split = useMemo(() => splitScene(scene, moving), [scene, moving]);
  const departingSet = useMemo(() => new Set(departingArrows ?? []), [departingArrows]);

  // The one draw call that replaces ~1,600 SVG nodes.
  const picture = useMemo(
    () => recordStatic(scene, paths, split.static, arrowStyle, palette),
    [scene, paths, split.static, arrowStyle, palette],
  );

  // ---- Camera --------------------------------------------------------------
  // Every shared value the camera owns, plus the transform it draws through.
  // Created once by the hook and destructured here so the gesture definitions and
  // the `<Group>` keep writing to and reading the exact same identities.
  const {
    fit,
    scale,
    savedScale,
    translateX,
    translateY,
    savedX,
    savedY,
    isPinching,
    transform,
  } = useBoardCamera({
    width,
    height,
    viewportWidth,
    viewportHeight,
    maxZoom,
    initialScale,
    board,
    fitNonce,
    focusX,
    focusY,
    focusNonce,
    onFocusComplete,
  });

  /**
   * The board's gestures, and the shared value press feedback reads.
   *
   * The camera values are passed in rather than created here, so the recognisers and
   * the `<Group>` transform below write to and read the same identities.
   */
  const { gesture, pressedArrow } = useBoardGestures({
    board,
    state,
    cellSize,
    originX,
    originY,
    width,
    height,
    viewportWidth,
    viewportHeight,
    maxZoom,
    departingSet,
    disabled,
    fit,
    scale,
    savedScale,
    translateX,
    translateY,
    savedX,
    savedY,
    isPinching,
    onPressArrow,
    onTapArrow,
    onTapEmpty,
  });

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.viewport, { width: viewportWidth, height: viewportHeight }]}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Group transform={transform}>
            {/* Everything at rest: one draw call. */}
            <Picture picture={picture} />

            {/* Smooth animated grid dots appearing as arrows depart */}
            {scene.patternKind === 'dots' &&
              departingArrows?.map((index) => {
                const arrow = board.arrows[index];
                if (!arrow) return null;
                const points = arrow.body.map((cell) => {
                  const col = cell % board.cols;
                  const row = Math.floor(cell / board.cols);
                  return {
                    x: originX + col * cellSize + cellSize / 2,
                    y: originY + row * cellSize + cellSize / 2,
                  };
                });
                return (
                  <DepartingDotsNode
                    key={`dots-${index}`}
                    points={points}
                    radius={scene.patternRadius}
                    color={palette.pattern}
                  />
                );
              })}

            {/*
              The handful of arrows that are moving or individually highlighted.
              One node each, and never more than a few, because the rules only ever
              put a couple of snakes in motion at once.
            */}
            {split.animated.map((draw) => {
              const arrowPaths = paths.get(draw.index);
              if (!arrowPaths) return null;
              return (
                <ArrowNode
                  key={draw.id}
                  paths={arrowPaths}
                  color={draw.color}
                  stroke={draw.stroke}
                  forward={draw.forward}
                  cellSize={cellSize}
                  departing={departingSet.has(draw.index)}
                  hinted={draw.index === hintedArrow}
                  shakeNonce={draw.index === shakeArrow ? shakeNonce : 0}
                  freeCells={draw.index === shakeArrow ? freeCells : 0}
                  {...(onCollisionHit ? { onCollisionHit } : {})}
                  palette={palette}
                  reducedMotion={reducedMotion}
                  // Index and callback passed separately, never combined into a
                  // closure here. `onDone={() => onDepartComplete(index)}` is a
                  // fresh identity on every render, and `ArrowNode`'s release
                  // effect depends on it — so every re-render while an arrow was
                  // leaving restarted its animation and could report it departed a
                  // second time. Tapping quickly made that likely, and the arrow
                  // escaped twice.
                  index={draw.index}
                  {...(onDepartComplete ? { onDepartComplete } : {})}
                />
              );
            })}

            {/*
              Press feedback, drawn *over* the board rather than pulled out of it.

              A touch-down fires on every gesture, including the start of a pan.
              Removing the arrow from the picture to dim it would mean re-recording
              all 180 on every touch — the exact per-touch cost this architecture
              exists to remove. Painting the board colour over the arrow at partial
              alpha dims it toward the background for one extra draw call and no
              re-record.
            */}
            <PressOverlay
              paths={paths}
              pressed={pressedArrow}
              color={palette.board}
              scene={scene}
            />
          </Group>
        </Canvas>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  viewport: { overflow: 'hidden' },
});