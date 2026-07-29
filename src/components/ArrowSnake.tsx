/**
 * ArrowSnake.tsx — draws one arrow, and animates it leaving.
 *
 * Purpose:      Turn a snake's body cells into a rope with a head that points
 *               somewhere, and make its exit read as *threading out* rather than
 *               sliding or fading.
 * Responsibilities:
 *               - Paint body, shadow, highlight, head, eyes — all per `ArrowStyle`.
 *               - The release animation and the blocked shake.
 * Notes:        The release is a dash-window trick. The drawn path is the body
 *               *plus* the straight ray it exits along, and a dash exactly one
 *               body-length long slides forward over it. The head leads, every
 *               segment follows through cells the head has already cleared, and
 *               the tail whips out last — which is the actual physical behaviour
 *               the rules describe, not an approximation of it.
 *
 *               Worklet-driven, so it runs on the UI thread and does not stutter
 *               when the JS thread is busy resolving the next tap.
 */

import { memo, useEffect } from 'react';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedProps,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Circle, G, Path, Polygon, Polyline } from 'react-native-svg';

import { exitPath, NO_GROUP, type Board } from '@game';
import type { ArrowStyle, Palette } from '@theme';

import {
  buildArrowGeometry,
  offsetPoints,
  roundedHeadPath,
  toPointsAttr,
  type Point,
} from './arrowGeometry';

const AnimatedPolyline = Animated.createAnimatedComponent(Polyline);
const AnimatedG = Animated.createAnimatedComponent(G);

/** Which visual state an arrow is in. Only ever driven by gameplay, never identity. */
export type ArrowVisualState = 'normal' | 'blocked' | 'blocker' | 'safe';

/** How long a snake takes to thread off the board. */
export const RELEASE_MS = 340;
/** How long the lurch-and-recoil of a blocked tap takes. */
export const SHAKE_MS = 260;

export interface ArrowSnakeProps {
  board: Board;
  arrowIndex: number;
  cellSize: number;
  originX: number;
  originY: number;
  style: ArrowStyle;
  palette: Palette;
  visual: ArrowVisualState;
  /** True while this arrow is leaving the board. */
  departing?: boolean;
  /** Called once the release animation has finished. */
  onDepartComplete?: () => void;
  /** Changes on every failed tap of this arrow, re-triggering the shake. */
  shakeNonce?: number;
  /** Swap animation for instant state changes (Settings → Reduced motion). */
  reducedMotion?: boolean;
}

const LINE_CAP: Record<ArrowStyle['tail'], 'round' | 'butt' | 'square'> = {
  round: 'round',
  flat: 'butt',
  square: 'square',
  tapered: 'round',
};

/**
 * What colour to draw an arrow.
 *
 * The precedence is the interesting part. Gameplay state wins over everything —
 * a blocked arrow must read as blocked whatever else is true of it. Below that,
 * a **colour group beats the theme**, because a group colour is not decoration:
 * it is the only thing linking an arrow to the gate it controls, and a theme that
 * quietly overrode it would make the level unreadable rather than merely
 * different-looking. `colorful` variants come last, since they mean nothing.
 */
function colorFor(
  visual: ArrowVisualState,
  arrowIndex: number,
  group: number,
  style: ArrowStyle,
  palette: Palette,
): string {
  if (visual === 'blocked') return palette.arrowBlocked;
  if (visual === 'blocker') return palette.arrowBlocker;
  if (visual === 'safe') return palette.arrowSafe;

  if (group !== NO_GROUP && palette.groupColors.length > 0) {
    return palette.groupColors[group % palette.groupColors.length]!;
  }

  const variants = palette.arrowVariants;
  if (style.colorful && variants && variants.length > 0) {
    return variants[arrowIndex % variants.length]!;
  }
  return palette.arrow;
}

function ArrowSnakeInner({
  board,
  arrowIndex,
  cellSize,
  originX,
  originY,
  style,
  palette,
  visual,
  departing = false,
  onDepartComplete,
  shakeNonce = 0,
  reducedMotion = false,
}: ArrowSnakeProps) {
  const geometry = buildArrowGeometry(board, arrowIndex, cellSize, originX, originY, style);
  const { body, tip, baseLeft, baseRight, stroke, forward } = geometry;

  const color = colorFor(visual, arrowIndex, board.arrows[arrowIndex]!.group, style, palette);
  const cap = LINE_CAP[style.tail];

  // Body length: every segment is one cell, so this is just the segment count.
  const bodyLength = (body.length - 1) * cellSize;
  // Ray length: how far the head must travel to be fully clear of the board.
  // Purely geometric — the ray is clear by definition when an arrow may leave.
  const rayLength = (exitPath(board, arrowIndex).length + 1) * cellSize;
  const travel = bodyLength + rayLength;

  // The path the snake threads along: its own body, then straight out.
  const head = body[body.length - 1]!;
  const exitPoint: Point = {
    x: head.x + forward.x * rayLength,
    y: head.y + forward.y * rayLength,
  };
  const fullPath = toPointsAttr([...body, exitPoint]);

  const progress = useSharedValue(0);
  const shake = useSharedValue(0);

  useEffect(() => {
    if (!departing) return;

    const finish = () => onDepartComplete?.();
    if (reducedMotion) {
      progress.value = 1;
      finish();
      return;
    }

    progress.value = 0;
    progress.value = withTiming(
      1,
      { duration: RELEASE_MS, easing: Easing.in(Easing.cubic) },
      (done) => {
        if (done) runOnJS(finish)();
      },
    );
  }, [departing, reducedMotion, onDepartComplete, progress]);

  useEffect(() => {
    if (shakeNonce === 0 || reducedMotion) return;
    // A forward lurch and recoil: it reads as "tried to go, could not" far better
    // than a sideways wobble, which says nothing about direction.
    shake.value = withSequence(
      withTiming(1, { duration: SHAKE_MS * 0.28, easing: Easing.out(Easing.quad) }),
      withTiming(-0.4, { duration: SHAKE_MS * 0.32 }),
      withTiming(0, { duration: SHAKE_MS * 0.4, easing: Easing.elastic(1.4) }),
    );
  }, [shakeNonce, reducedMotion, shake]);

  const bodyProps = useAnimatedProps(() => ({
    strokeDashoffset: -progress.value * travel,
  }));

  const groupProps = useAnimatedProps(() => {
    const nudge = shake.value * cellSize * 0.16;
    const dx = forward.x * nudge;
    const dy = forward.y * nudge;
    return { transform: `translate(${dx}, ${dy})` };
  });

  const headProps = useAnimatedProps(() => {
    const dx = forward.x * progress.value * travel;
    const dy = forward.y * progress.value * travel;
    return { transform: `translate(${dx}, ${dy})` };
  });

  // A dash exactly one body long, with a gap longer than the whole path so only
  // that single dash is ever visible as it slides forward.
  const dashArray = `${bodyLength},${travel + bodyLength + cellSize}`;

  const renderHead = () => {
    switch (style.head) {
      case 'none':
        return null;
      case 'chevron':
        return (
          <Polyline
            points={toPointsAttr([baseLeft, tip, baseRight])}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      case 'rounded':
        return <Path d={roundedHeadPath(geometry, cellSize)} fill={color} />;
      case 'pencil':
      case 'triangle':
      default:
        return <Polygon points={toPointsAttr([tip, baseLeft, baseRight])} fill={color} />;
    }
  };

  return (
    <AnimatedG animatedProps={groupProps}>
      {style.shadow ? (
        <AnimatedPolyline
          points={fullPath}
          fill="none"
          stroke={palette.arrowShadow}
          strokeWidth={stroke}
          strokeLinecap={cap}
          strokeLinejoin={style.join}
          strokeDasharray={dashArray}
          animatedProps={bodyProps}
          // Shadow rides a touch lower than the rope it belongs to.
          transform={`translate(0, ${cellSize * style.shadowOffsetRatio})`}
        />
      ) : null}

      <AnimatedPolyline
        points={fullPath}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap={cap}
        strokeLinejoin={style.join}
        strokeDasharray={dashArray}
        animatedProps={bodyProps}
      />

      {style.highlight ? (
        <AnimatedPolyline
          points={toPointsAttr(offsetPoints([...body, exitPoint], 0, -stroke * 0.18))}
          fill="none"
          stroke={palette.arrowHighlight}
          strokeWidth={stroke * 0.24}
          strokeLinecap="round"
          strokeLinejoin={style.join}
          strokeDasharray={dashArray}
          animatedProps={bodyProps}
        />
      ) : null}

      <AnimatedG animatedProps={headProps}>
        {renderHead()}
        {style.eyes && geometry.eyes.length > 0 ? (
          <G>
            {geometry.eyes.map((eye, i) => (
              <Circle key={`e${i}`} cx={eye.x} cy={eye.y} r={geometry.eyeRadius} fill="#FFFFFF" />
            ))}
            {geometry.pupils.map((pupil, i) => (
              <Circle
                key={`p${i}`}
                cx={pupil.x}
                cy={pupil.y}
                r={geometry.eyeRadius * 0.45}
                fill="#1A1A1A"
              />
            ))}
          </G>
        ) : null}
      </AnimatedG>
    </AnimatedG>
  );
}

/**
 * Memoised because a board redraws on every tap, but only the tapped arrow and
 * its blocker actually change. On a dense level that is 20+ untouched snakes.
 */
export const ArrowSnake = memo(ArrowSnakeInner);
