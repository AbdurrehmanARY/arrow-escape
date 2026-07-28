/**
 * BoardViewport.tsx — pinch, pan, and the camera that keeps them honest.
 *
 * Purpose:      Let a board far larger than the screen be inspected and played
 *               without ever losing it off the edge.
 * Responsibilities:
 *               - Pinch to zoom and drag to pan, on the UI thread.
 *               - Clamp scale and translation so the board cannot be lost.
 *               - Double-tap to snap between fit-to-screen and a working zoom.
 * Notes:        Extreme levels reach 27x30, which is roughly four screens of
 *               board. Zoom is not a convenience there — reading a head at the
 *               far corner and tracing its ray across the board is the puzzle.
 *
 *               **Touch stays exact at every zoom level for free.** The board's
 *               per-cell touch targets live *inside* the transformed view, so the
 *               same matrix that scales the pixels scales the hit areas. Nothing
 *               here converts coordinates by hand, which is where this kind of
 *               feature usually goes wrong.
 *
 *               Clamping happens on the worklet thread during the gesture, not
 *               after it. Correcting afterwards produces a visible snap-back;
 *               correcting live means the board simply refuses to go too far.
 */

import { type ReactNode, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

export interface BoardViewportProps {
  /** Natural, unscaled size of the board content. */
  contentWidth: number;
  contentHeight: number;
  /** Space available on screen. */
  viewportWidth: number;
  viewportHeight: number;
  /** How far in the player may zoom, relative to fit-to-screen. */
  maxZoom?: number;
  /** Called when the gesture state settles, so the HUD can show the zoom level. */
  onZoomChange?: (scale: number) => void;
  children: ReactNode;
}

/** Zoom applied by a double-tap when the board is currently fitted. */
const DOUBLE_TAP_ZOOM = 2.2;

export function BoardViewport({
  contentWidth,
  contentHeight,
  viewportWidth,
  viewportHeight,
  maxZoom = 3.5,
  onZoomChange,
  children,
}: BoardViewportProps) {
  /**
   * Scale at which the whole board is visible. This is the floor: zooming out
   * past it would only add empty space and lose the board in the middle of it.
   */
  const fitScale = useMemo(() => {
    if (contentWidth <= 0 || contentHeight <= 0) return 1;
    return Math.min(viewportWidth / contentWidth, viewportHeight / contentHeight, 1);
  }, [contentWidth, contentHeight, viewportWidth, viewportHeight]);

  const scale = useSharedValue(fitScale);
  const savedScale = useSharedValue(fitScale);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  const report = useCallback(
    (value: number) => {
      onZoomChange?.(value);
    },
    [onZoomChange],
  );

  /**
   * How far the board may be dragged at a given scale.
   *
   * When the scaled board is smaller than the viewport it is centred and cannot
   * move at all; when it is larger, it may move exactly as far as its overhang.
   * That is what stops a player flicking the board into empty space and having to
   * hunt for it.
   */
  const clamp = useCallback(
    (value: number, contentSize: number, viewportSize: number, atScale: number) => {
      'worklet';
      const scaled = contentSize * atScale;
      if (scaled <= viewportSize) return 0;
      const limit = (scaled - viewportSize) / 2;
      return Math.min(limit, Math.max(-limit, value));
    },
    [],
  );

  const pinch = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
    })
    .onUpdate((event) => {
      const next = Math.min(fitScale * maxZoom, Math.max(fitScale, savedScale.value * event.scale));
      scale.value = next;
      // Re-clamp as we zoom: shrinking the board can leave the current pan
      // outside the new limits, which would show a band of empty space.
      translateX.value = clamp(translateX.value, contentWidth, viewportWidth, next);
      translateY.value = clamp(translateY.value, contentHeight, viewportHeight, next);
    })
    .onEnd(() => {
      runOnJS(report)(scale.value / fitScale);
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onStart(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    })
    .onUpdate((event) => {
      translateX.value = clamp(
        savedX.value + event.translationX,
        contentWidth,
        viewportWidth,
        scale.value,
      );
      translateY.value = clamp(
        savedY.value + event.translationY,
        contentHeight,
        viewportHeight,
        scale.value,
      );
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    // Give up quickly if the second tap does not arrive, so a normal tap on an
    // arrow is not delayed waiting to see whether it becomes a double.
    .maxDelay(220)
    .onEnd(() => {
      const fitted = scale.value <= fitScale * 1.05;
      const next = fitted ? fitScale * DOUBLE_TAP_ZOOM : fitScale;

      scale.value = withTiming(next, { duration: 200 });
      translateX.value = withTiming(clamp(translateX.value, contentWidth, viewportWidth, next), {
        duration: 200,
      });
      translateY.value = withTiming(clamp(translateY.value, contentHeight, viewportHeight, next), {
        duration: 200,
      });
      runOnJS(report)(next / fitScale);
    });

  // Pinch and pan run together so a two-finger gesture can do both at once.
  // The double-tap is exclusive to it, and both yield to a plain tap on an arrow.
  const gesture = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.viewport, { width: viewportWidth, height: viewportHeight }]}>
        <Animated.View style={[styles.content, animatedStyle]}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  viewport: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  content: { alignItems: 'center', justifyContent: 'center' },
});
