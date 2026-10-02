/**
 * useThemeAssets.ts — the reactive seam between the theme registry and settings.
 *
 * Purpose:      Give components and screens the artwork bundle for the player's
 *               currently selected theme, and keep the dependency pointing the
 *               right way.
 * Responsibilities:
 *               - Subscribe to `themeId` (settings store) and re-resolve the
 *                 asset bundle for that theme on every change.
 * Notes:        **This hook lives in `features/settings/hooks/`, not in `theme/`
 *               and not in `shared/hooks/`.** It exists only to subscribe to
 *               `themeId` — the pure registry `getThemeAssets` stays in `theme/`.
 *
 *               - `theme/` cannot do the subscription itself: it is forbidden
 *                 from importing `@state` (FORBIDDEN['theme'] includes 'state'),
 *                 which is exactly the inversion this file was extracted from.
 *               - it cannot live in `shared/` either: FORBIDDEN_SHARED includes
 *                 'state', and the `hooks/` barrel is being dissolved anyway.
 *               - it cannot live in any feature that merely *consumes* `themeId`
 *                 (e.g. an achievements feature later on): features may not
 *                 import features, so only `features/settings` — the owner of
 *                 `themeId` — can own this subscription while remaining
 *                 importable everywhere it is needed (app routes today, features
 *                 such as achievements once they exist).
 *               - a feature-local barrel (`features/settings`) is REQUIRED, not
 *                 optional. The rules do not add 'features' to
 *                 DEEP_IMPORT_ALLOWED (only shared/infrastructure are exempt,
 *                 because they are sub-rooted and barrel-less), so a deep
 *                 `@features/settings/hooks/*` import from outside the feature
 *                 is a violation. Callers import `@features/settings` instead.
 */

import { useSettingsStore } from '@state';
import { getThemeAssets, type ThemeVisualAssets } from '@theme';

/** The artwork bundle for the player's currently selected theme. */
export function useThemeAssets(): ThemeVisualAssets {
  const themeId = useSettingsStore((state) => state.themeId);
  return getThemeAssets(themeId);
}