/**
 * components/PressOverlay.tsx — dims whichever arrow is under the finger.
 *
 * Purpose:      Give press feedback without re-recording the static picture.
 * Responsibilities:
 *               - Watch one shared value for the pressed arrow index.
 *               - Draw that one arrow's body at partial alpha over the board.
 * Notes:        **This is deliberately an overlay, not a change to the picture**
 *               (decision 102). A touch-down fires on every gesture, including the
 *               start of a pan, so pulling the touched arrow out of the recorded
 *               `Picture` would mean re-recording every arrow on the board — up to
 *               180 — on every single touch. Painting the board colour over the
 *               arrow costs one extra draw and no re-record.
 *
 *               The shared value is written on the UI thread by the tap gesture.
 *               `useAnimatedReaction` pulls it across to JS only when it actually
 *               changes, so a pan costs two React updates rather than one per frame.
 *               That is the whole reason this component holds `useState` at all.
 */

import { useState } from 'react';
import { Path } from '@shopify/react-native-skia';
import { runOnJS, useAnimatedReaction, type SharedValue } from 'react-native-reanimated';

import { EMPTY } from '@game';

import type { Scene } from '../scene';
import type { ArrowPaths } from '../skiaScene';

/**
 * Dims whichever arrow is under the finger.
 *
 * One node for the whole board rather than one per arrow: it reads a single shared
 * value and redraws only the path that value points at. When nothing is pressed it
 * draws nothing.
 */
export function PressOverlay({
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
