/**
 * useThemeAssets.ts — the reactive seam between the theme registry and settings.
 *
 * Purpose:      Give components and screens the current theme's artwork, and keep
 *               the dependency pointing the right way.
 * Responsibilities:
 *               - Subscribe to `themeId` and re-resolve the asset bundle.
 * Notes:        **This hook lives in `hooks/`, not in `theme/`, and that is the
 *               whole point of it.** It was previously defined inside
 *               `theme/themeAssets.ts`, where reaching the theme id meant
 *               importing the settings store — so `theme/` imported `state/`,
 *               a layer inversion the architecture rules forbid. The registry
 *               `getThemeAssets` is pure and stays in `theme/`; only the
 *               subscription needs the store, and `hooks/` is the layer whose
 *               job is exactly that.
 */

import { useSettingsStore } from '@state';
import { getThemeAssets, type ThemeVisualAssets } from '@theme';

/** The artwork bundle for the player's currently selected theme. */
export function useThemeAssets(): ThemeVisualAssets {
  const themeId = useSettingsStore((state) => state.themeId);
  return getThemeAssets(themeId);
}