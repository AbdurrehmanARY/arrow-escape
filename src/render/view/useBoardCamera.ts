/**
 * hooks/useBoardCamera.ts — the camera, as UI-thread state.
 *
 * Purpose:      Own every shared value that decides what part of the board is
 *               visible, and the three animations that move it.
 * Responsibilities:
 *               - Create the eight camera shared values, once, at hook call time.
 *               - Play the level-start intro zoom.
 *               - Snap back to fit on `fitNonce`.
 *               - Bring a board point into view on `focusNonce`, for the hint camera.
 *               - Produce the Skia transform the `<Group>` is drawn through.
 * Notes:        **Every value here is created on the UI thread and never
 *               re-created.** That is the reason this is a hook returning shared
 *               values rather than a component: a caller must be able to hold the same
 *               identity across renders, because the gestures in `useBoardGestures`
 *               write to them from worklets.
 *
 *               `transform` scales about the content's centre rather than its origin,
 *               so zoom feels like it happens *to* the board rather than dragging it
 *               out of the corner. The camera stays a matrix inside the canvas
 *               (decision 101) — nothing here re-lays-out or re-rasterises a view.
 */

import { useCallback, useEffect, useMemo } from 'react';
import type { Transforms3d } from '@shopify/react-native-skia';
import {
  Easing,
  runOnJS,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type DerivedValue,
  type SharedValue,
} from 'react-native-reanimated';

import type { Board } from '@game';

import { clampScale, clampTranslation, fitScale } from '../camera';

/** Everything `useBoardCamera` needs to know about the board it is framing. */
export interface UseBoardCameraArgs {
  readonly width: number;
  readonly height: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly maxZoom: number;
  readonly initialScale: number | undefined;
  /** Changes whenever the level changes; this is what re-arms the intro zoom. */
  readonly board: Board;
  readonly fitNonce: number;
  readonly focusX: number;
  readonly focusY: number;
  readonly focusNonce: number;
  readonly onFocusComplete?: (() => void) | undefined;
}

/** The camera's shared values and the transform they drive. */
export interface BoardCamera {
  readonly fit: number;
  readonly scale: SharedValue<number>;
  readonly savedScale: SharedValue<number>;
  readonly translateX: SharedValue<number>;
  readonly translateY: SharedValue<number>;
  readonly savedX: SharedValue<number>;
  readonly savedY: SharedValue<number>;
  readonly isPinching: SharedValue<boolean>;
  readonly isIntroAnimating: SharedValue<boolean>;
  readonly transform: DerivedValue<Transforms3d>;
}

/**
 * Create the board camera.
 *
 * The shared values are returned by identity and written by `useBoardGestures` from
 * worklets, so nothing here may recreate them — see the note in the file header.
 */
export function useBoardCamera({
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
}: UseBoardCameraArgs): BoardCamera {
  const fit = useMemo(
    () => fitScale(width, height, viewportWidth, viewportHeight),
    [width, height, viewportWidth, viewportHeight],
  );
  const start = initialScale !== undefined ? clampScale(initialScale, fit, maxZoom) : fit;

  const scale = useSharedValue(fit);
  const savedScale = useSharedValue(start);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const isPinching = useSharedValue(false);
  const isIntroAnimating = useSharedValue(true);

  // ---- Level Start Introductory Zoom Animation -----------------------------
  // At the start of every level, the board begins fully zoomed OUT (fitScale)
  // so the entire board is visible, settles briefly, and then slowly zooms IN
  // to the target gameplay scale while blocking touches.
  const targetScale = start;

  useEffect(() => {
    scale.value = fit;
    translateX.value = 0;
    translateY.value = 0;
    savedScale.value = fit;
    savedX.value = 0;
    savedY.value = 0;
    isIntroAnimating.value = true;

    const timer = setTimeout(() => {
      scale.value = withTiming(
        targetScale,
        { duration: 400, easing: Easing.out(Easing.cubic) },
        (done) => {
          'worklet';
          if (done) {
            isIntroAnimating.value = false;
            savedScale.value = targetScale;
          }
        },
      );
    }, 50);

    return () => clearTimeout(timer);
  }, [board, targetScale, fit, scale, translateX, translateY, savedScale, savedX, savedY, isIntroAnimating]);

  /**
   * The camera, as a Skia transform.
   *
   * Scaling about the content's centre rather than its origin, so zoom feels like
   * it happens to the board rather than dragging it out of the corner.
   */
  const transform = useDerivedValue<Transforms3d>(() => [
    { translateX: viewportWidth / 2 + translateX.value },
    { translateY: viewportHeight / 2 + translateY.value },
    { scale: scale.value },
    { translateX: -width / 2 },
    { translateY: -height / 2 },
  ]);

  const notifyFocusDone = useCallback(() => onFocusComplete?.(), [onFocusComplete]);

  /** Snap back to fit-to-screen. */
  useEffect(() => {
    if (fitNonce === 0) return;
    const timing = { duration: 220 };
    // eslint-disable-next-line react-hooks/immutability -- stable shared value
    scale.value = withTiming(fit, timing);
    // eslint-disable-next-line react-hooks/immutability -- stable shared value
    translateX.value = withTiming(0, timing);
    // eslint-disable-next-line react-hooks/immutability -- stable shared value
    translateY.value = withTiming(0, timing);
  }, [fitNonce, fit, scale, translateX, translateY]);

  /**
   * Bring a board point into view, for the hint camera.
   *
   * Preserves the current zoom: the player's chosen scale is information about what
   * they were looking at, and yanking it away to frame a hint is disorienting.
   */
  useEffect(() => {
    if (focusNonce === 0) return;
    const current = scale.value;
    const targetX = clampTranslation(
      -(focusX - width / 2) * current,
      width,
      viewportWidth,
      current,
    );
    const targetY = clampTranslation(
      -(focusY - height / 2) * current,
      height,
      viewportHeight,
      current,
    );
    const timing = { duration: 500, easing: Easing.out(Easing.cubic) };
    // eslint-disable-next-line react-hooks/immutability -- stable shared value
    translateX.value = withTiming(targetX, timing);
    // eslint-disable-next-line react-hooks/immutability -- stable shared value
    translateY.value = withTiming(targetY, timing, (done) => {
      'worklet';
      if (done) runOnJS(notifyFocusDone)();
    });
  }, [
    focusNonce,
    focusX,
    focusY,
    width,
    height,
    viewportWidth,
    viewportHeight,
    scale,
    translateX,
    translateY,
    notifyFocusDone,
  ]);

  return {
    fit,
    scale,
    savedScale,
    translateX,
    translateY,
    savedX,
    savedY,
    isPinching,
    isIntroAnimating,
    transform,
  };
}
