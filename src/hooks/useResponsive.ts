/**
 * useResponsive.ts — Centralized responsive layout hook.
 *
 * Responsibilities:
 * - Exposes active screen dimensions, orientation, safe area insets, and breakpoints.
 * - Supports all mobile screen sizes cleanly (360dp, 375dp, 390dp, 412dp, 430dp, etc.).
 * - Provides max content width bounds for tablets/large displays.
 */

import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '@theme';

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const isSmallPhone = width < 360;
  const isPhone = width < 600;
  const isTablet = width >= 600;
  const isShortPhone = height < 700;

  // Max content container width for large screens / tablets
  const maxContentWidth = Math.min(width, 600);

  // Responsive gutter (horizontal margin)
  const gutter = isSmallPhone ? spacing.md : isTablet ? spacing.xl : spacing.lg;

  // Available layout area after safe-area insets
  const availableWidth = Math.min(width, maxContentWidth);
  const availableHeight = Math.max(200, height - insets.top - insets.bottom);

  // Aspect ratio of the viewport
  const aspectRatio = height / width;

  return {
    width,
    height,
    insets,
    isSmallPhone,
    isPhone,
    isTablet,
    isShortPhone,
    maxContentWidth,
    gutter,
    availableWidth,
    availableHeight,
    aspectRatio,
  };
}

