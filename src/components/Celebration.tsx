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

import { playSfx } from '@services/audio';
import { typography, type Palette } from '@theme';

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

/**
 * How long after the burst starts the sound plays.
 *
 * Not zero. Pieces stagger their launch by up to 16% of the run, so the burst is
 * at its widest a moment after `active` flips — and a firework heard before it is
 * seen reads as a mistimed sound rather than as the same event.
 */
const SOUND_DELAY_MS = 140;

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
    const r1 = (((Math.sin(i * 12.9898) * 43758.5453) % 1) + 1) % 1;
    const r2 = (((Math.sin(i * 78.233) * 12345.6789) % 1) + 1) % 1;
    const r3 = (((Math.sin(i * 39.425) * 24634.6345) % 1) + 1) % 1;

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

    // Reduced motion silences this too, and that is the point rather than an
    // oversight: with no confetti on screen the sound describes something that is
    // not happening.
    const timer = setTimeout(() => playSfx('fireworks'), SOUND_DELAY_MS);
    return () => clearTimeout(timer);
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
      <Banner progress={progress} palette={palette} perfect={perfect} />
    </View>
  );
}

/**
 * "Congratulations!", popping in and easing out.
 *
 * Driven from the same shared value as the confetti, so it cannot drift out of
 * step with the burst and costs no second animation to schedule.
 *
 * It leaves well before the win overlay arrives. Two pieces of celebration on
 * screen at once would be one too many, and the point of this one is to mark the
 * moment the board empties — which is over by the time the overlay is due.
 */
function Banner({
  progress,
  palette,
  perfect,
}: {
  progress: SharedValue<number>;
  palette: Palette;
  perfect: boolean;
}) {
  const style = useAnimatedStyle(() => {
    const t = progress.value;

    // Overshoot and settle, then fade. A pop that only grows reads as a dialog
    // arriving; the small overshoot is what makes it feel like a reaction.
    const rise = Math.min(1, t / 0.22);
    const overshoot = 1 + 0.18 * Math.sin(Math.PI * Math.min(1, t / 0.44));
    const scale = 0.6 + 0.4 * rise * overshoot;

    const fade = t < 0.55 ? 1 : Math.max(0, 1 - (t - 0.55) / 0.35);

    return {
      opacity: rise * fade,
      transform: [{ scale }, { translateY: (1 - rise) * 18 }],
    };
  });

  return (
    <Animated.View style={[styles.banner, style]}>
      <Animated.Text
        style={[styles.bannerText, { color: perfect ? palette.success : palette.text }]}
      >
        {perfect ? 'Perfect!' : 'Congratulations!'}
      </Animated.Text>
    </Animated.View>
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

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '34%',
    alignItems: 'center',
  },
  bannerText: {
    ...typography.display,
    letterSpacing: -0.5,
    // Read against confetti of any colour, on any of the six themes, without
    // needing a panel behind it — a card would turn a beat into an interruption.
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
});

export const Celebration = memo(CelebrationInner);
