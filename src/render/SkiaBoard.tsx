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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Canvas, Group, Path, Picture } from '@shopify/react-native-skia';
import {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withDecay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { EMPTY, type Board, type BoardState } from '@game';
import type { ArrowStyle, BoardStyle, Palette } from '@theme';

import { clampScale, clampTranslation, fitScale, translationBounds } from '../components/camera';
import { arrowAtBoardPoint, toBoardPoint } from './hitTest';
import { buildScene, splitScene, type Scene } from './scene';
import { buildAllArrowPaths, recordStatic, type ArrowPaths } from './skiaScene';
import { releaseDurationMs, SHAKE_MS } from './timings';

/** Shared with the tap gesture, exactly as before — see `BoardViewport`. */
export const PAN_SLOP = 14;

/** Cap on fling speed, so a fast flick on a huge board stays controllable. */
const MAX_FLING_VELOCITY = 3000;

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
  const fit = useMemo(
    () => fitScale(width, height, viewportWidth, viewportHeight),
    [width, height, viewportWidth, viewportHeight],
  );
  const start = initialScale !== undefined ? clampScale(initialScale, fit, maxZoom) : fit;

  const scale = useSharedValue(start);
  const savedScale = useSharedValue(start);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const isPinching = useSharedValue(false);

  /**
   * Which arrow is under a finger, or `EMPTY`.
   *
   * Written on the UI thread from the tap gesture and read by `PressOverlay`, so
   * acknowledging a touch costs one extra draw and no React render of the board.
   */
  const pressedArrow = useSharedValue(EMPTY);

  /**
   * The camera, as a Skia transform.
   *
   * Scaling about the content's centre rather than its origin, so zoom feels like
   * it happens to the board rather than dragging it out of the corner.
   */
  const transform = useDerivedValue(() => [
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
      if (index !== EMPTY) onTapArrow(index);
      else onTapEmpty?.();
    },
    [state, board, cellSize, originX, originY, onTapArrow, onTapEmpty],
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
          if (!success) return;
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
    ],
  );

  const gesture = useMemo(
    () => (disabled ? Gesture.Simultaneous(pinch, pan) : Gesture.Race(tap, Gesture.Simultaneous(pinch, pan))),
    [disabled, tap, pinch, pan],
  );

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.viewport, { width: viewportWidth, height: viewportHeight }]}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Group transform={transform}>
            {/* Everything at rest: one draw call. */}
            <Picture picture={picture} />

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

/**
 * One arrow that is doing something: leaving, recoiling, or being pointed at.
 *
 * Every animation is a shared value read inside a derived value, so all of it runs
 * on the UI thread and none of it re-renders React.
 */
function ArrowNode({
  paths,
  color,
  stroke,
  forward,
  cellSize,
  departing,
  hinted,
  shakeNonce,
  reducedMotion,
  index,
  onDepartComplete,
}: {
  paths: ArrowPaths;
  color: string;
  stroke: number;
  forward: { x: number; y: number };
  cellSize: number;
  departing: boolean;
  hinted: boolean;
  shakeNonce: number;
  reducedMotion: boolean;
  index: number;
  onDepartComplete?: (arrowIndex: number) => void;
}) {
  const progress = useSharedValue(0);
  const shake = useSharedValue(0);
  const glow = useSharedValue(0);
  const pulse = useSharedValue(1);

  /**
   * Whether this arrow's exit has already begun.
   *
   * The fix for "tap three arrows quickly and one escapes twice", and the guard has
   * to be about *starting*, not about finishing. The effect below re-runs whenever
   * any of its dependencies change, and tapping quickly re-renders the board
   * repeatedly while an arrow is still in flight. Each re-run reset `progress` to 0
   * and started a fresh `withTiming`, so the snake visibly threaded out, snapped
   * back to its start, and threaded out again.
   *
   * The reducer was never fooled — its `departed` case already ignores an arrow it
   * is not tracking — so this was always a rendering artefact rather than a
   * gameplay one. It still had to be fixed at the source: an exit is a
   * once-per-departure event, so it is latched.
   *
   * A ref rather than state, because it must not itself cause a render.
   */
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
        easing: Easing.bezier(0.3, 0.02, 0.55, 1),
      },
      (done) => {
        'worklet';
        if (done) runOnJS(finish)();
      },
    );
  }, [departing, reducedMotion, paths.travelCells, progress, index, onDepartComplete]);

  // ---- Blocked shake -------------------------------------------------------
  useEffect(() => {
    if (shakeNonce === 0 || reducedMotion) return;
    // A forward lurch and recoil reads as "tried to go, could not" far better than
    // a sideways wobble, which says nothing about direction.
     
    shake.value = withSequence(
      withTiming(1, { duration: SHAKE_MS * 0.28, easing: Easing.out(Easing.quad) }),
      withTiming(-0.4, { duration: SHAKE_MS * 0.32 }),
      withTiming(0, { duration: SHAKE_MS * 0.4, easing: Easing.elastic(1.4) }),
    );
  }, [shakeNonce, reducedMotion, shake]);

  // ---- Hint glow and pulse -------------------------------------------------
  useEffect(() => {
    if (!hinted) {
       
      glow.value = withTiming(0, { duration: 200 });
       
      pulse.value = 1;
      return;
    }
     
    glow.value = withTiming(1, { duration: 400 });
    if (reducedMotion) return;

    /*
      A short shiver the moment the hint lands, then the slow pulse.

      The camera has just travelled to this arrow, so the player is looking at a
      board that stopped moving — and on a dense board a colour change alone is
      easy to miss among fifty other snakes. A brief physical twitch says "here"
      in a way a tint does not, and it is over in a quarter of a second so it
      never competes with the steady pulse that follows.

      Deliberately smaller than the blocked recoil: that one is a failure and
      should feel like one; this is an invitation.
    */
    // eslint-disable-next-line react-hooks/immutability -- stable shared value
    shake.value = withSequence(
      withTiming(0.35, { duration: 90, easing: Easing.out(Easing.quad) }),
      withTiming(-0.22, { duration: 90 }),
      withTiming(0, { duration: 140, easing: Easing.elastic(1.6) }),
    );

    pulse.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [hinted, reducedMotion, glow, pulse, shake]);

  // The trim window: a slice exactly one body long sliding from tail to off-board.
  const startAt = useDerivedValue(() =>
    Math.min(1, progress.value * (1 + paths.bodyFraction)),
  );
  const endAt = useDerivedValue(() =>
    Math.min(1, progress.value * (1 + paths.bodyFraction) + paths.bodyFraction),
  );

  // Shake and hint pulse, as one transform on the arrow's own group.
  const nodeTransform = useDerivedValue(() => {
    const nudge = shake.value * cellSize * 0.16;
    return [
      { translateX: forward.x * nudge },
      { translateY: forward.y * nudge },
      { scale: pulse.value },
    ];
  });

  const glowOpacity = useDerivedValue(() => glow.value * 0.55);

  /**
   * How far the head has advanced, in dp.
   *
   * The same distance the trim window has travelled: `progress` runs 0..1 over the
   * body plus the exit ray, and `travelCells * cellSize` is that whole distance in
   * dp. Multiplying by the arrow's forward unit vector turns it into a translation.
   */
  const headTransform = useDerivedValue(() => {
    const advance = progress.value * paths.travelCells * cellSize;
    return [
      { translateX: forward.x * advance },
      { translateY: forward.y * advance },
    ];
  });

  return (
    <Group transform={nodeTransform}>
      {hinted ? (
        <Path
          path={paths.body}
          start={startAt}
          end={endAt}
          style="stroke"
          strokeWidth={stroke * 3.5}
          strokeCap="round"
          strokeJoin="round"
          color={color}
          opacity={glowOpacity}
        />
      ) : null}

      <Path
        path={paths.body}
        start={startAt}
        end={endAt}
        style="stroke"
        strokeWidth={stroke}
        strokeCap="round"
        strokeJoin="round"
        color={color}
      />

      {/*
        The head travels with the body, and must have its own transform to do it.

        The body is drawn by *trimming* its path, so the visible window slides along
        geometry that never moves. The head is a separate filled shape sitting at the
        arrow's resting position, so trimming does nothing to it — left alone it stays
        behind while the body threads out from under it, which is the desync that was
        reported. It is translated along the same forward vector by the same distance
        the trim window has advanced, so the two stay locked together.
      */}
      {paths.head ? (
        <Group transform={headTransform}>
          <Path path={paths.head} style="fill" color={color} />
        </Group>
      ) : null}
    </Group>
  );
}

/**
 * Dims whichever arrow is under the finger.
 *
 * One node for the whole board rather than one per arrow: it reads a single shared
 * value and redraws only the path that value points at. When nothing is pressed it
 * draws nothing.
 */
function PressOverlay({
  paths,
  pressed,
  color,
  scene,
}: {
  paths: Map<number, ArrowPaths>;
  pressed: SharedValue<number>;
  color: string;
  scene: Scene;
}) {
  const [index, setIndex] = useState(EMPTY);

  // The shared value is written on the UI thread; this pulls it across only when it
  // actually changes, so a pan costs two updates rather than one per frame.
  useAnimatedReaction(
    () => pressed.value,
    (next, previous) => {
      if (next !== previous) runOnJS(setIndex)(next);
    },
    [pressed],
  );

  if (index === EMPTY) return null;
  const arrowPaths = paths.get(index);
  const draw = scene.arrows.find((a) => a.index === index);
  if (!arrowPaths || !draw) return null;

  return (
    <Path
      path={arrowPaths.body}
      start={0}
      end={arrowPaths.bodyFraction}
      style="stroke"
      strokeWidth={draw.stroke}
      strokeCap="round"
      strokeJoin="round"
      color={color}
      opacity={0.45}
    />
  );
}

const styles = StyleSheet.create({
  viewport: { overflow: 'hidden' },
});
