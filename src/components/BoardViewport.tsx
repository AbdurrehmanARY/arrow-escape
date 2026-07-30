/**
 * BoardViewport.tsx — pinch, pan, and the camera that keeps them honest.
 *
 * Purpose:      Let a board far larger than the screen be inspected and played
 *               without ever losing it off the edge.
 * Responsibilities:
 *               - Pinch to zoom and drag to pan, on the UI thread.
 *               - Clamp scale and translation so the board cannot be lost.
 *               - Snap back to fit on request.
 * Notes:        Extreme levels reach 27x30, which is roughly four screens of
 *               board. Zoom is not a convenience there — reading a head at the
 *               far corner and tracing its ray across the board is the puzzle.
 *
 *               **Touch stays exact at every zoom level for free.** The board's
 *               tap surface lives *inside* the transformed view, so the same matrix
 *               that scales the pixels scales the hit area, and the tap's local
 *               coordinates are already board coordinates. Nothing here converts
 *               coordinates by hand, which is where this kind of feature usually
 *               goes wrong.
 *
 *               **The pan gesture must not activate on a stationary finger.** See
 *               `PAN_SLOP`. Without an activation threshold this component quietly
 *               ate taps, because gesture-handler cancels whatever is underneath
 *               the moment a pan claims the touch.
 *
 *               Clamping happens on the worklet thread during the gesture, not
 *               after it. Correcting afterwards produces a visible snap-back;
 *               correcting live means the board simply refuses to go too far.
 *
 *               There is deliberately **no double-tap gesture**. The board is
 *               covered edge to edge in tap targets, and a double-tap is
 *               indistinguishable from two deliberate taps on an arrow — which,
 *               since a wrong tap costs a heart, was charging two hearts for one
 *               gesture. Fit-to-screen is a button instead.
 */

import { type ReactNode, useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { clampScale, clampTranslation, fitScale as computeFitScale } from './camera';

/**
 * How far a finger may travel and still count as a tap rather than a drag, in dp.
 *
 * Shared with the board's tap gesture so the two agree on where the boundary is.
 * If the tap allowed less than the pan, there would be a band of movement that is
 * neither — a touch that does nothing at all, which reads as the game ignoring you.
 */
export const PAN_SLOP = 14;

export interface BoardViewportProps {
  /** Natural, unscaled size of the board content. */
  contentWidth: number;
  contentHeight: number;
  /** Space available on screen. */
  viewportWidth: number;
  viewportHeight: number;
  /** How far in the player may zoom, relative to fit-to-screen. */
  maxZoom?: number;
  /** Bump this to animate the board back to fit-to-screen. */
  fitNonce?: number;
  /** Called when the gesture state settles, so the HUD can show the zoom level. */
  onZoomChange?: (scale: number) => void;
  children: ReactNode;
}

export function BoardViewport({
  contentWidth,
  contentHeight,
  viewportWidth,
  viewportHeight,
  maxZoom = 3.5,
  fitNonce = 0,
  onZoomChange,
  children,
}: BoardViewportProps) {
  /**
   * Scale at which the whole board is visible. This is the floor: zooming out
   * past it would only add empty space and lose the board in the middle of it.
   */
  const fitScale = useMemo(
    () => computeFitScale(contentWidth, contentHeight, viewportWidth, viewportHeight),
    [contentWidth, contentHeight, viewportWidth, viewportHeight],
  );

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

  const pinch = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
    })
    .onUpdate((event) => {
      const next = clampScale(savedScale.value * event.scale, fitScale, maxZoom);
      scale.value = next;
      // Re-clamp as we zoom: shrinking the board can leave the current pan
      // outside the new limits, which would show a band of empty space.
      translateX.value = clampTranslation(translateX.value, contentWidth, viewportWidth, next);
      translateY.value = clampTranslation(translateY.value, contentHeight, viewportHeight, next);
    })
    .onEnd(() => {
      runOnJS(report)(scale.value / fitScale);
    });

  /**
   * Drag to pan — but only after the finger has genuinely moved.
   *
   * The thresholds are the important part, and their absence was a real bug. A
   * `Pan` with no activation offset claims the touch on the *first pixel* of
   * movement, and gesture-handler then cancels whatever was underneath. Every real
   * tap drifts a pixel or two, so the board was swallowing taps and the player had
   * to tap again — on a game where a tap is the only verb, that is close to fatal.
   *
   * `PAN_SLOP` is the distance a finger may wander and still be a tap. Big enough
   * to survive a thumb roll on a phone, small enough that a deliberate drag starts
   * without feeling stuck.
   */
  const pan = Gesture.Pan()
    .averageTouches(true)
    .minDistance(PAN_SLOP)
    .activeOffsetX([-PAN_SLOP, PAN_SLOP])
    .activeOffsetY([-PAN_SLOP, PAN_SLOP])
    .onStart(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    })
    .onUpdate((event) => {
      translateX.value = clampTranslation(
        savedX.value + event.translationX,
        contentWidth,
        viewportWidth,
        scale.value,
      );
      translateY.value = clampTranslation(
        savedY.value + event.translationY,
        contentHeight,
        viewportHeight,
        scale.value,
      );
    });

  /**
   * Snap back to fit-to-screen.
   *
   * Driven by a prop rather than a double-tap. A double-tap on a board that is
   * wall-to-wall tap targets cannot be told apart from two deliberate taps on an
   * arrow — and since a wrong tap costs a heart, that ambiguity was charging
   * players two hearts for a single gesture. A button is unambiguous, and more
   * discoverable than a hidden gesture besides.
   */
  useEffect(() => {
    if (fitNonce === 0) return;
    scale.value = withTiming(fitScale, { duration: 220 });
    translateX.value = withTiming(0, { duration: 220 });
    translateY.value = withTiming(0, { duration: 220 });
    report(1);
  }, [fitNonce, fitScale, scale, translateX, translateY, report]);

  // Pinch and pan run together so a two-finger gesture does both at once. Neither
  // is a tap, so neither can be confused with tapping an arrow.
  const gesture = Gesture.Simultaneous(pinch, pan);

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
