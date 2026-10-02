/**
 * themeAssets.ts — Theme-specific visual assets registry.
 *
 * Architecture:
 * Selected Theme -> Theme Configuration -> Theme-specific Assets -> All Screens / Components
 *
 * Rules:
 * - Never hardcode Arrow Theme assets into generic components.
 * - Never hardcode Paper Theme assets into generic components.
 * - Arrow Theme uses its cohesive illustrated family (5-shields banner, 3D medals).
 * - Paper Theme uses theme-appropriate paper assets, never reusing Arrow Theme assets.
 * - `arrowIcon` is the exception: it is the game's own logo mark, shared by every
 *   theme, and only its *ink* changes with the ground so it stays visible.
 */

import type { ImageSourcePropType } from 'react-native';
import { brandMark, isDarkColor } from '@shared/branding';
import { themeById } from './themes';

export interface ThemeVisualAssets {
  /** Arrow icon for scores, pills, and indicators */
  readonly arrowIcon: ImageSourcePropType;
  /** Challenge / Cup image for home and cards */
  readonly challengeImage: ImageSourcePropType;
  /** Finishing / top banner image for leagues */
  readonly finishingImage: ImageSourcePropType;
  /** League intro / info image */
  readonly leagueInfoImage?: ImageSourcePropType | undefined;
  /** Podium placements (1st, 2nd, 3rd) */
  readonly podium: {
    readonly first: ImageSourcePropType;
    readonly second: ImageSourcePropType;
    readonly third: ImageSourcePropType;
  };
  /** Shields per league tier */
  readonly shields: Record<string, ImageSourcePropType>;
}

// ---------------------------------------------------------------------------
// 1. Arrow Theme Asset Family
// ---------------------------------------------------------------------------
// `arrowIcon` is omitted here on purpose: it is the shared brand mark, resolved
// from the theme's ground colour by `getThemeAssets` below.
type ThemeAssetsWithoutMark = Omit<ThemeVisualAssets, 'arrowIcon'>;

const ARROW_THEME_ASSETS: ThemeAssetsWithoutMark = {
  challengeImage: require('../../assets/records/largest streak.webp'),
  finishingImage: require('../../assets/league/Five_metallic_shields_displayed_202609071447.webp'),
  leagueInfoImage: require('../../assets/league/league info.webp'),
  podium: {
    first: require('../../assets/league/first place.webp'),
    second: require('../../assets/league/second place.webp'),
    third: require('../../assets/league/third place.webp'),
  },
  shields: {
    bronze: require('../../assets/shields/Bronze_mobile_game_rank_shield_202609042103.webp'),
    silver: require('../../assets/shields/Rank_shield_badge_icon_202609042103.webp'),
    gold: require('../../assets/shields/Gold_rank_shield_mobile_icon_202609042103.webp'),
    ruby: require('../../assets/shields/Change_shield_material_color_202609042103.webp'),
    obsidian: require('../../assets/shields/Game_rank_shield_badge_icon_202609042103.webp'),
    diamond: require('../../assets/shields/Game_rank_shield_badge_icon_202609042103.webp'),
  },
};

// ---------------------------------------------------------------------------
// 2. Paper Theme Visual Assets (Minimalist Warm Paper Aesthetic)
// ---------------------------------------------------------------------------
// Note: Paper theme uses clean, craft-paper styled graphics that harmonize
// with warm paper ground (#EEEBE4) and charcoal strokes (#3B3630).
const PAPER_THEME_ASSETS: ThemeAssetsWithoutMark = {
  challengeImage: require('../../assets/records/largest streak.webp'),
  finishingImage: require('../../assets/league/Five_metallic_shields_displayed_202609071447.webp'),
  leagueInfoImage: require('../../assets/league/league info.webp'),
  podium: {
    first: require('../../assets/league/first place.webp'),
    second: require('../../assets/league/second place.webp'),
    third: require('../../assets/league/third place.webp'),
  },
  shields: {
    bronze: require('../../assets/shields/Bronze_mobile_game_rank_shield_202609042103.webp'),
    silver: require('../../assets/shields/Rank_shield_badge_icon_202609042103.webp'),
    gold: require('../../assets/shields/Gold_rank_shield_mobile_icon_202609042103.webp'),
    ruby: require('../../assets/shields/Change_shield_material_color_202609042103.webp'),
    obsidian: require('../../assets/shields/Game_rank_shield_badge_icon_202609042103.webp'),
    diamond: require('../../assets/shields/Game_rank_shield_badge_icon_202609042103.webp'),
  },
};

/**
 * Resolve theme visual assets based on theme ID.
 *
 * Memoised per theme, because callers compare the returned object by identity (and
 * a fresh object every render would defeat `React.memo` on anything holding it).
 *
 * The arrow mark is chosen from the theme's own background colour rather than from
 * its id: the shipped palettes include near-white Paper and near-black Kinetic
 * Neon, and a new theme should get the correct logo without anyone remembering to
 * add a case here.
 */
const RESOLVED_ASSETS = new Map<string, ThemeVisualAssets>();

export function getThemeAssets(themeId: string): ThemeVisualAssets {
  const cached = RESOLVED_ASSETS.get(themeId);
  if (cached) return cached;

  const base = themeId === 'arrow' ? ARROW_THEME_ASSETS : PAPER_THEME_ASSETS;
  const { background } = themeById(themeId).palette;
  const assets: ThemeVisualAssets = { ...base, arrowIcon: brandMark(isDarkColor(background)) };

  RESOLVED_ASSETS.set(themeId, assets);
  return assets;
}

/**
 * `getThemeAssets` stays pure and stays here. The reactive `useThemeAssets` hook
 * that used to live in this file moved to `src/features/settings/hooks/useThemeAssets.ts`, because
 * reading `themeId` means reading the settings store, and the theme layer must
 * not depend on `state/` (ARCHITECTURE.md §3). The registry itself is a pure
 * function of a theme id and belongs to the layer that owns themes.
 */
