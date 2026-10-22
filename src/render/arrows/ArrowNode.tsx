/**
 * components/ArrowNode.tsx — one arrow that is doing something.
 *
 * Purpose:      Render and animate a single arrow: leaving, recoiling from a
 *               blocked tap, or vibrating because it was hinted.
 * Responsibilities:
 *               - Own that arrow's release, recoil and hint animations.
 *               - Trim the body with a sliding window and translate the head by the
 *                 same distance, so the two never come apart.
 * Notes:        **Every animation here is a shared value read inside a derived
 *               value**, so all of it runs on the UI thread and none of it re-renders
 *               React. That is why this file owns four shared values and almost no
 *               JS-thread state: `isCollidedColor` is the single exception, and it
 *               changes once per collision, not once per frame.
 *
 *               There is one `ArrowNode` per *moving* arrow, never one per arrow on
 *               the board — see the note in `SkiaBoard.tsx`. Extracted verbatim from
 *               that file; no logic changed when it moved.
 */

import { useEffect, useRef, useState } from 'react';
import { Group, Path } from '@shopify/react-native-skia';
import {
  Easing,
  runOnJS,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import type { Palette } from '@theme';

import type { ArrowPaths } from '../skiaScene';
import { MS_PER_CELL, releaseDurationMs } from '../timings';

/**
 * The one easing curve every arrow movement uses — exit, and both halves of the
 * blocked-tap recoil.
 *
 * It is a constant rather than being repeated at each call site because escape and
 * recoil are required to move at the same velocity (decision 134): the recoil's
 * duration is derived from the exit's, so a curve that drifts at one call site
 * desynchronises the two and the collision no longer reads as the same object being
 * stopped.
 *
 * **Why this shape.** The control points put the end-point velocity at exactly
 * 1.00x average and the peak at 1.19x. The previous curve,
 * `bezier(0.3, 0.02, 0.55, 1)`, was annotated "must not decelerate" but measured
 * 0.00x at the end: it crawled to a dead stop in the last 10% of its duration, so
 * the arrow visibly hesitated just before vanishing — the exact artifact the
 * comment claimed to prevent, and one that showed up differently on every refresh
 * rate. A 1.00x finish leaves the board at full speed, which is what "leaving" has
 * to look like, and the lower 1.19x peak means fewer pixels move per frame on slow
 * devices. The gentle 0.20x start is kept: it is what makes the snake read as
 * shooting out rather than sliding.
 */
export const SHARED_ARROW_EASING = Easing.bezier(0.25, 0.05, 0.5, 0.5);

/**
 * One arrow that is doing something: leaving, recoiling, or being pointed at.
 *
 * Every animation is a shared value read inside a derived value, so all of it runs
 * on the UI thread and none of it re-renders React.
 */
export function ArrowNode({
  paths,
  color,
  stroke,
  forward,
  cellSize,
  departing,
  hinted,
  shakeNonce,
  freeCells = 0,
  onCollisionHit,
  reducedMotion,
  index,
  onDepartComplete,
  palette,
}: {
  paths: ArrowPaths;
  color: string;
  stroke: number;
  forward: { x: number; y: number };
  cellSize: number;
  departing: boolean;
  hinted: boolean;
  shakeNonce: number;
  freeCells?: number | undefined;
  onCollisionHit?: ((arrowIndex: number) => void) | undefined;
  reducedMotion: boolean;
  index: number;
  onDepartComplete?: ((arrowIndex: number) => void) | undefined;
  palette: Palette;
}) {
  const progress = useSharedValue(0);
  const shake = useSharedValue(0);
  const glow = useSharedValue(0);
  const pulse = useSharedValue(1);

  const [isCollidedColor, setIsCollidedColor] = useState(false);
  const lastHandledShakeNonce = useRef(0);
  const exitStarted = useRef(false);

  // ---- Release -------------------------------------------------------------
  useEffect(() => {
    if (!departing) {
      // Re-arm: this component is keyed by arrow id and can be reused after a
      // restart, so the latch must clear when the arrow is no longer leaving.
      exitStarted.current = false;
      return;
    }
    // Already threading out. A re-render must never restart it.
    if (exitStarted.current) return;
    exitStarted.current = true;

    let reported = false;
    const finish = (): void => {
      if (reported) return;
      reported = true;
      onDepartComplete?.(index);
    };

    if (reducedMotion) {
      progress.value = 1;
      finish();
      return;
    }

    progress.value = 0;
    progress.value = withTiming(
      1,
      {
        duration: releaseDurationMs(paths.travelCells),
        // Must not decelerate: easing out reads as "arriving", and this arrow is
        // leaving. A snake that slows to a halt as it vanishes looks stuck.
        // `SHARED_ARROW_EASING` is measured to finish at 1.00x average speed, so
        // the board is left at full velocity. See its doc comment for the numbers.
        easing: SHARED_ARROW_EASING,
      },
      (done) => {
        'worklet';
        if (done) runOnJS(finish)();
      },
    );
  }, [departing, reducedMotion, paths.travelCells, progress, index, onDepartComplete]);

  // ---- Blocked Collision Sequence ------------------------------------------
  useEffect(() => {
    if (shakeNonce === 0 || shakeNonce === lastHandledShakeNonce.current) return;
    lastHandledShakeNonce.current = shakeNonce;

    if (reducedMotion) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsCollidedColor(true);
      if (onCollisionHit) onCollisionHit(index);
      const timer = setTimeout(() => setIsCollidedColor(false), 250);
      return () => clearTimeout(timer);
    }

    // Move forward up to the blocker cell (freeCells) or nudge into adjacent blocker (0.25)
    const targetDisplacement = Math.max(freeCells, 0.25);
    // Velocity matching: use the exact same cell velocity (ms per cell) as departure movement
    const departureDuration = releaseDurationMs(paths.travelCells);
    const msPerCell = paths.travelCells > 0 ? departureDuration / paths.travelCells : MS_PER_CELL;
    const animDuration = Math.max(70, Math.round(targetDisplacement * msPerCell));

    setIsCollidedColor(false);

    shake.value = withSequence(
      // Step 1: Move forward smoothly using the exact same movement curve & velocity physics as departure
      withTiming(
        targetDisplacement,
        { duration: animDuration, easing: SHARED_ARROW_EASING },
        (doneAtImpact) => {
          'worklet';
          if (doneAtImpact) {
            if (onCollisionHit) {
              runOnJS(onCollisionHit)(index);
            }
            runOnJS(setIsCollidedColor)(true);
          }
        },
      ),
      // Step 2: Stop at collision point, then return smoothly using the exact same movement curve & velocity physics
      withTiming(
        0,
        { duration: animDuration, easing: SHARED_ARROW_EASING },
        (doneReturn) => {
          'worklet';
          if (doneReturn) {
            runOnJS(setIsCollidedColor)(false);
          }
        },
      ),
    );
  }, [shakeNonce, freeCells, reducedMotion, shake, index, onCollisionHit, paths.travelCells]);

  // ---- Hint minor vibration -------------------------------------------------
  useEffect(() => {
    if (!hinted) {
      return;
    }

    glow.value = 0;
    pulse.value = 1;

    if (reducedMotion) return;

    // eslint-disable-next-line react-hooks/immutability
    shake.value = withRepeat(
      withSequence(
        withTiming(0.2, { duration: 50, easing: Easing.out(Easing.quad) }),
        withTiming(-0.2, { duration: 50 }),
        withTiming(0.15, { duration: 50 }),
        withTiming(-0.15, { duration: 50 }),
      ),
      6,
      false,
    );
  }, [hinted, reducedMotion, glow, pulse, shake]);

  const activeColor = isCollidedColor ? palette.arrowBlocked : color;

  // Combine release progress (0..1) with collision recoil offset (in cells / travelCells).
  const totalProgress = useDerivedValue(() => {
    const travel = paths.travelCells > 0 ? paths.travelCells : 1;
    const recoilOffset = shake.value / travel;
    return Math.max(0, Math.min(1, progress.value + recoilOffset));
  });

  // The trim window: a slice exactly one body long sliding from tail to off-board.
  // Advances at the exact rate totalProgress moves, keeping the stroke head
  // locked to the arrowhead sprite at every frame.
  const startAt = useDerivedValue(() =>
    Math.min(1, Math.max(0, totalProgress.value)),
  );
  const endAt = useDerivedValue(() =>
    Math.min(1, Math.max(0, totalProgress.value + paths.bodyFraction)),
  );

  /**
   * How far the head has advanced, in dp.
   *
   * The same distance the trim window has travelled: `totalProgress` runs 0..1 over the
   * body plus the exit ray, and `travelCells * cellSize` is that whole distance in
   * dp. Multiplying by the arrow's forward unit vector turns it into a translation.
   */
  const headTransform = useDerivedValue(() => {
    const advance = totalProgress.value * paths.travelCells * cellSize;
    return [
      { translateX: forward.x * advance },
      { translateY: forward.y * advance },
    ];
  });

  return (
    <Group>

      <Path
        path={paths.body}
        start={startAt}
        end={endAt}
        style="stroke"
        strokeWidth={stroke}
        strokeCap="round"
        strokeJoin="round"
        color={activeColor}
      />

      {/*
        The head travels with the body, and must have its own transform to do it.
      */}
      {paths.head ? (
        <Group transform={headTransform}>
          <Path path={paths.head} style="fill" color={activeColor} />
        </Group>
      ) : null}
    </Group>
  );
}
