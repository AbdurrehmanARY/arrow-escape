/**
 * Pressable.tsx — a press that feels like something.
 *
 * Purpose:      One spring-backed press behaviour, so every control in the app
 *               responds the same way instead of each screen inventing its own
 *               opacity fade.
 * Responsibilities:
 *               - `Springy`   — the press wrapper.
 *               - `useGlow`   — theme-coloured elevation, as a style object.
 * Notes:        **This replaces `pressed && { opacity: 0.6 }`**, which was the
 *               pattern in nine files. Opacity says "something happened"; a scale
 *               says "you pushed a thing". On a game that is nothing but tapping,
 *               that difference is most of how the interface feels.
 *
 *               The animation runs entirely on the UI thread. That matters more
 *               here than in most apps: Skia is already drawing up to 180 arrows,
 *               and a press that had to cross the bridge would contend with the
 *               one thing this project has spent the most effort protecting.
 *
 *               `hitSlop` defaults to expanding the target to `MIN_TOUCH_TARGET`
 *               rather than the visible box, because the honest fix for a small
 *               control is a bigger *touch* area, not a bigger drawing.
 *
 *               It lives in `shared/primitives/` because it is one: a wrapper
 *               around a platform control that knows nothing about this game. No
 *               feature owns it — every feature's buttons want the same press — so
 *               a feature that owned it would have to be imported by all the
 *               others, which is the coupling this migration exists to remove.
 *               Its only layer dependency is `@theme`, for the parts of the press
 *               that are a shape rather than a colour (`glow`), so it depends on
 *               nothing above it. See ARCHITECTURE.md section 10.
 *
 *               This file needed no inversion to get here, which is worth
 *               recording: `useGlow` already takes its colour as an argument and
 *               `Springy` takes no colour at all. The palette was never read from
 *               a store here, so moving it did not have to change a single call
 *               site. That is the same shape as the decision taken for `Screen` in
 *               FEATURE_MIGRATION.md section 9.3 — the difference is that this
 *               file had already been written that way.
 */

import { type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { glow, PRESS_SCALE, PRESS_SPRING } from '@theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface SpringyProps extends Omit<PressableProps, 'style' | 'children'> {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Turn the scale off for a control where movement would be wrong. */
  animate?: boolean;
}

/**
 * A `Pressable` that shrinks slightly under a finger and springs back.
 *
 * Drop-in: it takes the same props, so adopting it in a screen is changing the
 * import and nothing else. Disabled controls do not animate, because a dead
 * button that still moves is worse than one that does nothing at all — it says
 * the tap registered.
 */
export function Springy({ children, style, animate = true, disabled, ...rest }: SpringyProps) {
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 - pressed.value * (1 - PRESS_SCALE) },
    ],
  }));

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(event) => {
        if (animate && !disabled) {
           
          pressed.value = withSpring(1, PRESS_SPRING);
        }
        rest.onPressIn?.(event);
      }}
      onPressOut={(event) => {
         
        pressed.value = withSpring(0, PRESS_SPRING);
        rest.onPressOut?.(event);
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}

/**
 * Elevation in the active theme's accent.
 *
 * Returned as a plain style object rather than a component, so it composes into
 * whatever a screen is already building. The colour is passed in rather than read
 * from a theme here, because this layer has no opinion about which theme is on —
 * see `glow` in `@theme` for why the three levels are colourless.
 */
export function useGlow(color: string, level: keyof typeof glow = 'rest'): ViewStyle {
  const { shadowOpacity, shadowRadius, elevation } = glow[level];
  return {
    shadowColor: color,
    shadowOpacity,
    shadowRadius,
    shadowOffset: { width: 0, height: 0 },
    elevation,
  };
}
