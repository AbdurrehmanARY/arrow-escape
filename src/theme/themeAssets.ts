/**
 * themeAssets.ts — Theme-specific visual assets registry.
 *
 * Architecture:
 * Selected Theme -> Theme Configuration -> Theme-specific Assets -> All Screens / Components
 *
 * Rules:
 * - Never hardcode Arrow Theme assets into generic components.
 * - Never hardcode Paper Theme assets into generic components.
 * - Never reach into `assets/` from here. Every bitmap comes from
 *   `@shared/assets/images`, which is the single place that knows where a file
 *   lives — this module only decides *which* of them a theme gets.
 * - `arrowIcon` is the exception: it is the game's own logo mark, shared by every
 *   theme, and only its *ink* changes with the ground so it stays visible.
 *
 * Notes:        Both theme families used to be declared separately, with twelve
 *               `require()`s each — twenty-four in total. They pointed at the
 *               same files, byte for byte, so the "Paper uses paper assets, never
 *               Arrow assets" note above them was not true of this file. They
 *               are one shared table now. **If Paper ever gets its own art, give
 *               it its own table here**; until then, a second table would be a
 *               comment lying about the code. The real difference between
 *               families remains `arrowIcon`, which is chosen from the theme's
 *               ground colour and so needs no family at all.
 *
 * Notes:        `getThemeAssets` stays pure and stays here. The reactive
 *               `useThemeAssets` hook lives in `src/features/settings/hooks/useThemeAssets.ts`,
 *               because reading `themeId` means reading the settings store, and
 *               the theme layer must not depend on `state/` (ARCHITECTURE.md §3).
 */

import type { ImageSourcePropType } from 'react-native';

import { SHIELD_IMAGES, THEME_IMAGES } from '@shared/assets/images';
import { brandMarkFor } from '@shared/branding';

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

// `arrowIcon` is omitted from the shared table on purpose: it is the brand mark,
// resolved from the theme's ground colour by `getThemeAssets` below.
type ThemeAssetsWithoutMark = Omit<ThemeVisualAssets, 'arrowIcon'>;

/** The rank shield every theme resolves through the same six league ids. */
const SHIELDS: Record<string, ImageSourcePropType> = {
  bronze: SHIELD_IMAGES.bronze.source,
  silver: SHIELD_IMAGES.silver.source,
  gold: SHIELD_IMAGES.gold.source,
  ruby: SHIELD_IMAGES.ruby.source,
  obsidian: SHIELD_IMAGES.obsidian.source,
  diamond: SHIELD_IMAGES.diamond.source,
};

const SHARED_THEME_ASSETS: ThemeAssetsWithoutMark = {
  challengeImage: THEME_IMAGES.challengeBanner.source,
  finishingImage: THEME_IMAGES.leagueBanner.source,
  leagueInfoImage: THEME_IMAGES.leagueIntro.source,
  podium: {
    first: THEME_IMAGES.podiumFirst.source,
    second: THEME_IMAGES.podiumSecond.source,
    third: THEME_IMAGES.podiumThird.source,
  },
  shields: SHIELDS,
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

  const { background } = themeById(themeId).palette;
  const assets: ThemeVisualAssets = { ...SHARED_THEME_ASSETS, arrowIcon: brandMarkFor(background) };

  RESOLVED_ASSETS.set(themeId, assets);
  return assets;
}
