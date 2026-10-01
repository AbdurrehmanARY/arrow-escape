/**
 * hooks/useBoardGestures.ts — pinch, pan and tap, wired to the camera.
 *
 * Purpose:      Own every gesture the board answers, and the tap-to-arrow
 *               resolution behind them.
 * Responsibilities:
 *               - Define the pinch, pan and tap recognisers.
 *               - Compose them (a tap races the simultaneous pinch/pan pair, or is
 *                 dropped entirely when the board is disabled).
 *               - Resolve a screen point to an arrow, for both press feedback and
 *                 the completed tap.
 * Notes:        **Every `runOnJS` in this file is on a gesture edge**, never on
 *               `onUpdate`. That is what keeps a pan from costing a React render per
 *               frame: `onStart`/`onEnd`/`onBegin`/`onFinalize` cross the thread
 *               boundary, `onUpdate` writes shared values and nothing else.
 *
 *               This file is the one piece of the board whose wiring is not covered
 *               by a test — a Skia canvas exposes no element tree and Jest cannot
 *               drive gestures through it. `docs/PROJECT_MEMORY.md` records that gap
 *               rather than glossing over it, and `hitTesting.test.ts` covers the
 *               coordinate conversion these four lines depend on. It was moved here
 *               verbatim from `SkiaBoard.tsx`; nothing about the wiring changed.
 */

import { useCallback, useMemo } from 'react';
import { Gesture, type ComposedGesture } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue, withDecay, type SharedValue } from 'react-native-reanimated';

import { EMPTY, type Board, type BoardState } from '@game';

import { clampScale, clampTranslation, translationBounds } from '../camera';
import { arrowAtBoardPoint, toBoardPoint } from '../hitTest';

/** Shared with the tap gesture, exactly as before — see `BoardViewport`. */
export const PAN_SLOP = 14;

/** Cap on fling speed, so a fast flick on a huge board stays controllable. */
const MAX_FLING_VELOCITY = 3000;

/** Everything the board's gestures need to read the board and move the camera. */
export interface UseBoardGesturesArgs {
  readonly board: Board;
  readonly state: BoardState;
  readonly cellSize: number;
  readonly originX: number;
  readonly originY: number;
  readonly width: number;
  readonly height: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly maxZoom: number;
  /** Indices already threading out; a tap on one of these is ignored. */
  readonly departingSet: ReadonlySet<number>;
  readonly disabled: boolean;
  readonly fit: number;
  readonly scale: SharedValue<number>;
  readonly savedScale: SharedValue<number>;
  readonly translateX: SharedValue<number>;
  readonly translateY: SharedValue<number>;
  readonly savedX: SharedValue<number>;
  readonly savedY: SharedValue<number>;
  readonly isPinching: SharedValue<boolean>;
  readonly isIntroAnimating: SharedValue<boolean>;
  readonly onPressArrow?: ((arrowIndex: number) => void) | undefined;
  readonly onTapArrow: (arrowIndex: number) => void;
  readonly onTapEmpty?: (() => void) | undefined;
}

/** The composed gesture, plus the shared value press feedback reads. */
export interface BoardGestures {
  readonly gesture: ComposedGesture;
  /**
   * Which arrow is under a finger, or `EMPTY`.
   *
   * Written on the UI thread from the tap gesture and read by `PressOverlay`, so
   * acknowledging a touch costs one extra draw and no React render of the board.
   */
  readonly pressedArrow: SharedValue<number>;
}

/**
 * Build the board's gestures.
 *
 * The camera shared values are taken as arguments rather than created here, so the
 * gestures and the `<Group>` transform write to and read the same identities.
 */
export function useBoardGestures({
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
  isIntroAnimating,
  onPressArrow,
  onTapArrow,
  onTapEmpty,
}: UseBoardGesturesArgs): BoardGestures {
  /**
   * Which arrow is under a finger, or `EMPTY`.
   *
   * Written on the UI thread from the tap gesture and read by `PressOverlay`, so
   * acknowledging a touch costs one extra draw and no React render of the board.
   */
  const pressedArrow = useSharedValue(EMPTY);

  const markPressed = useCallback(
    (bx: number, by: number) => {
      const index = arrowAtBoardPoint(state, board, bx, by, cellSize, originX, originY);
      pressedArrow.value = index;
      if (index !== EMPTY) onPressArrow?.(index);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared value is stable
    [state, board, cellSize, originX, originY, onPressArrow],
  );

  const handleTap = useCallback(
    (bx: number, by: number) => {
      const index = arrowAtBoardPoint(state, board, bx, by, cellSize, originX, originY);
      if (index !== EMPTY) {
        if (departingSet.has(index)) return;
        onTapArrow(index);
      } else {
        onTapEmpty?.();
      }
    },
    [state, board, cellSize, originX, originY, onTapArrow, onTapEmpty, departingSet],
  );

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          'worklet';
          // eslint-disable-next-line react-hooks/immutability -- stable shared value
          isPinching.value = true;
          // eslint-disable-next-line react-hooks/immutability -- stable shared value
          savedScale.value = scale.value;
        })
        .onUpdate((event) => {
          'worklet';
          const next = clampScale(savedScale.value * event.scale, fit, maxZoom);
          const focalX = event.focalX - viewportWidth / 2;
          const focalY = event.focalY - viewportHeight / 2;
          const old = scale.value;

          // Keep the point between the fingers still.
          const px = (focalX - translateX.value) / old;
          const py = (focalY - translateY.value) / old;
          // eslint-disable-next-line react-hooks/immutability -- stable shared value
          scale.value = next;
          // eslint-disable-next-line react-hooks/immutability -- stable shared value
          translateX.value = clampTranslation(focalX - px * next, width, viewportWidth, next);
          // eslint-disable-next-line react-hooks/immutability -- stable shared value
          translateY.value = clampTranslation(focalY - py * next, height, viewportHeight, next);
        })
        .onFinalize(() => {
          'worklet';
          // eslint-disable-next-line react-hooks/immutability -- stable shared value
          isPinching.value = false;
          // eslint-disable-next-line react-hooks/immutability -- stable shared value
          savedX.value = translateX.value;
          // eslint-disable-next-line react-hooks/immutability -- stable shared value
          savedY.value = translateY.value;
        }),
    [
      fit,
      maxZoom,
      width,
      height,
      viewportWidth,
      viewportHeight,
      scale,
      savedScale,
      translateX,
      translateY,
      savedX,
      savedY,
      isPinching,
    ],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .averageTouches(true)
        .minDistance(PAN_SLOP)
        .activeOffsetX([-PAN_SLOP, PAN_SLOP])
        .activeOffsetY([-PAN_SLOP, PAN_SLOP])
        .onStart(() => {
          'worklet';
          // eslint-disable-next-line react-hooks/immutability -- stable shared value
          savedX.value = translateX.value;
          // eslint-disable-next-line react-hooks/immutability -- stable shared value
          savedY.value = translateY.value;
        })
        .onUpdate((event) => {
          'worklet';
          if (isPinching.value) return;
          // eslint-disable-next-line react-hooks/immutability -- stable shared value
          translateX.value = clampTranslation(
            savedX.value + event.translationX,
            width,
            viewportWidth,
            scale.value,
          );
          // eslint-disable-next-line react-hooks/immutability -- stable shared value
          translateY.value = clampTranslation(
            savedY.value + event.translationY,
            height,
            viewportHeight,
            scale.value,
          );
        })
        .onEnd((event) => {
          'worklet';
          if (isPinching.value) return;
          const [minX, maxX] = translationBounds(width, viewportWidth, scale.value);
          const [minY, maxY] = translationBounds(height, viewportHeight, scale.value);
          const vx = Math.max(-MAX_FLING_VELOCITY, Math.min(MAX_FLING_VELOCITY, event.velocityX));
          const vy = Math.max(-MAX_FLING_VELOCITY, Math.min(MAX_FLING_VELOCITY, event.velocityY));
          // eslint-disable-next-line react-hooks/immutability -- stable shared value
          translateX.value = withDecay({ velocity: vx, deceleration: 0.996, clamp: [minX, maxX] });
          // eslint-disable-next-line react-hooks/immutability -- stable shared value
          translateY.value = withDecay({ velocity: vy, deceleration: 0.996, clamp: [minY, maxY] });
        }),
    [
      width,
      height,
      viewportWidth,
      viewportHeight,
      scale,
      translateX,
      translateY,
      savedX,
      savedY,
      isPinching,
    ],
  );

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .maxDistance(PAN_SLOP)
        .maxDuration(900)
        .onBegin((event) => {
          'worklet';
          if (isIntroAnimating.value) return;
          const point = toBoardPoint(
            event.x,
            event.y,
            viewportWidth,
            viewportHeight,
            width,
            height,
            translateX.value,
            translateY.value,
            scale.value,
          );
          runOnJS(markPressed)(point.x, point.y);
        })
        // Fires however the gesture ends — tapped, cancelled, or stolen by the pan.
        // Anything less than "always" leaves an arrow stuck looking pressed.
        .onFinalize(() => {
          'worklet';
          // eslint-disable-next-line react-hooks/immutability -- stable shared value
          pressedArrow.value = EMPTY;
        })
        .onEnd((event, success) => {
          'worklet';
          if (!success || isIntroAnimating.value) return;
          const point = toBoardPoint(
            event.x,
            event.y,
            viewportWidth,
            viewportHeight,
            width,
            height,
            translateX.value,
            translateY.value,
            scale.value,
          );
          runOnJS(handleTap)(point.x, point.y);
        }),
    [
      viewportWidth,
      viewportHeight,
      width,
      height,
      translateX,
      translateY,
      scale,
      handleTap,
      markPressed,
      pressedArrow,
      isIntroAnimating,
    ],
  );

  const gesture = useMemo(
    () => (disabled ? Gesture.Simultaneous(pinch, pan) : Gesture.Race(tap, Gesture.Simultaneous(pinch, pan))),
    [disabled, tap, pinch, pan],
  );

  return { gesture, pressedArrow };
}
