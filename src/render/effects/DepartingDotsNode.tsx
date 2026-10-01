/**
 * components/DepartingDotsNode.tsx — grid dots that fade in behind a leaving arrow.
 *
 * Purpose:      Mark the trail an arrow left by fading the pattern dots under it.
 * Responsibilities:
 *               - Animate one shared value 0 to 1 over a fixed 380ms.
 *               - Draw a fixed set of circles at that shared opacity.
 * Notes:        Extracted verbatim from `SkiaBoard.tsx`. The dots are decoration,
 *               not state: nothing reads them, and one node covers every dot for the
 *               arrow, so a board full of arrows never multiplies this cost.
 */

import { useEffect } from 'react';
import { Circle, Group } from '@shopify/react-native-skia';
import { Easing, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';

/**
 * Animated grid dots that scale and fade in smoothly as an arrow escapes/departs.
 */
export function DepartingDotsNode({
  points,
  radius,
  color,
}: {
  points: readonly { x: number; y: number }[];
  radius: number;
  color: string;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: 380,
      easing: Easing.out(Easing.quad),
    });
  }, [progress]);

  const opacity = useDerivedValue(() => progress.value);

  return (
    <Group opacity={opacity}>
      {points.map((pt, i) => (
        <Circle key={i} cx={pt.x} cy={pt.y} r={radius} color={color} />
      ))}
    </Group>
  );
}
