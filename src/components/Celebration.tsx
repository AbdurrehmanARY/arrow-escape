/**
 * Celebration.tsx — the burst when a level falls.
 *
 * Purpose:      Mark the moment the last arrow leaves, and make a clean read feel
 *               different from a scraped win.
 * Responsibilities:
 *               - A physical confetti burst, driven by one shared value.
 *               - Two intensities: a normal clear, and a perfect read.
 * Notes:        Every particle is animated from a *single* shared value rather
 *               than one each. Sixty independent timings would mean sixty
 *               animations to schedule and tear down; one progress value read by
 *               sixty derived styles is one animation, and each particle's path is
 *               pure arithmetic on constants fixed at spawn.
 *
 *               The motion is real projectile motion — launch angle, initial
 *               speed, gravity — because linear fades read as a screensaver.
 *               Pieces slow at the top of their arc and accelerate away, which is
 *               what makes it feel like something happened rather than something
 *               being played back.
 *
 *               Never interactive (`pointerEvents="none"`) and never blocking: the
 *               GDD asks for a brief, tasteful beat, not a lockout, so the player
 *               can tap straight through it.
 *
 *               Honours Reduced motion by rendering nothing at all. A confetti
 *               burst is exactly the kind of thing that setting exists for.
 */

import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import type { Palette } from '@theme';

export type CelebrationIntensity = 'normal' | 'perfect';

export interface CelebrationProps {
  /**
   * Flip to true to fire.
   *
   * Replaying a level takes this false and true again, which re-triggers the
   * burst on its own — so there is no separate "play again" signal to keep in
   * step with this one.
   */
  active: boolean;
  intensity?: CelebrationIntensity;
  palette: Palette;
  reducedMotion?: boolean;
}

/** How long a piece stays on screen. Long enough to read, short enough not to wait. */
const DURATION_MS = 1600;

interface Piece {
  /** Launch direction, radians, measured from straight up. */
  angle: number;
  speed: number;
  size: number;
  color: string;
  spin: number;
  /** Fraction of the burst each piece waits before launching. */
  delay: number;
  /** Rectangles read as paper; circles read as sparks. A mix of both. */
  round: boolean;
  drift: number;
}

/**
 * Build the burst.
 *
 * Deterministic per render via an index-seeded generator rather than
 * `Math.random`, so a piece keeps its identity across re-renders and does not
 * visibly jump when the parent updates mid-flight.
 */
function buildPieces(count: number, palette: Palette, perfect: boolean): Piece[] {
  const colors = perfect
    ? [palette.heart, palette.success, palette.accent, '#F2C14E', '#F0F0F0']
    : [palette.accent, palette.success, palette.textMuted, palette.heart];

  const pieces: Piece[] = [];
  for (let i = 0; i < count; i += 1) {
    // Cheap deterministic hash — good enough for scatter, and stable per index.
    const r1 = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
    const r2 = ((Math.sin(i * 78.233) * 12345.6789) % 1 + 1) % 1;
    const r3 = ((Math.sin(i * 39.425) * 24634.6345) % 1 + 1) % 1;

    // Spread across the upper half, so everything launches upward and outward.
    const spread = perfect ? 2.5 : 2.1;
    pieces.push({
      angle: (r1 - 0.5) * spread,
      speed: 520 + r2 * (perfect ? 620 : 460),
      size: 7 + r3 * (perfect ? 9 : 7),
      color: colors[i % colors.length]!,
      spin: (r1 - 0.5) * 12,
      delay: r3 * 0.16,
      round: i % 3 === 0,
      drift: (r2 - 0.5) * 160,
    });
  }
  return pieces;
}

function CelebrationInner({
  active,
  intensity = 'normal',
  palette,
  reducedMotion = false,
}: CelebrationProps) {
  const { width, height } = useWindowDimensions();
  const progress = useSharedValue(0);

  const perfect = intensity === 'perfect';
  const pieces = useMemo(
    () => buildPieces(perfect ? 64 : 40, palette, perfect),
    [palette, perfect],
  );

  useEffect(() => {
    if (!active || reducedMotion) return;
    progress.value = 0;
    progress.value = withTiming(1, { duration: DURATION_MS, easing: Easing.linear });
  }, [active, reducedMotion, progress]);

  if (!active || reducedMotion) return null;

  // Launched from just below centre, so the arc peaks around the middle of the
  // screen rather than off the top.
  const originX = width / 2;
  const originY = height * 0.58;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((piece, index) => (
        <Particle
          key={index}
          piece={piece}
          progress={progress}
          originX={originX}
          originY={originY}
        />
      ))}
    </View>
  );
}

function Particle({
  piece,
  progress,
  originX,
  originY,
}: {
  piece: Piece;
  progress: SharedValue<number>;
  originX: number;
  originY: number;
}) {
  const style = useAnimatedStyle(() => {
    // Each piece runs its own clock inside the shared one, so the burst staggers
    // instead of moving as a single sheet.
    const local = Math.max(0, (progress.value - piece.delay) / (1 - piece.delay));
    if (local <= 0) return { opacity: 0, transform: [{ translateX: 0 }, { translateY: 0 }] };

    const t = local * 1.6; // seconds of simulated flight
    const vx = Math.sin(piece.angle) * piece.speed;
    const vy = -Math.cos(piece.angle) * piece.speed;
    const gravity = 900;

    const x = vx * t + piece.drift * t * t;
    const y = vy * t + 0.5 * gravity * t * t;

    // Hold full opacity until the arc is well past its peak, then fade — fading
    // from the start makes the burst look weak at the moment it should land.
    const opacity = local < 0.68 ? 1 : Math.max(0, 1 - (local - 0.68) / 0.32);

    return {
      opacity,
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${piece.spin * local * 360}deg` },
        { scale: 1 - local * 0.25 },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: originX,
          top: originY,
          width: piece.size,
          height: piece.round ? piece.size : piece.size * 1.7,
          borderRadius: piece.round ? piece.size / 2 : 2,
          backgroundColor: piece.color,
        },
        style,
      ]}
    />
  );
}

export const Celebration = memo(CelebrationInner);
