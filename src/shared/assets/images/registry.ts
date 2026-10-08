/**
 * shared/assets/images/registry.ts — every image the app renders, declared once.
 *
 * Purpose:      Give each image a single authoritative entry — where its file is,
 *               what it is called, what it means — so no feature reaches into
 *               `assets/` with its own `require()` path.
 * Responsibilities:
 *               - Hold `IMAGES`, the flat catalogue of every runtime image.
 *               - Hold the domain groups (`BRAND_IMAGES`, `RECORD_IMAGES`,
 *                 `AWARD_IMAGES`, `TROPHY_IMAGES`, `THEME_IMAGES`) the screens
 *                 and the theme registry are composed from.
 * Notes:        **Why this exists.** Before it, the same asset was reached for
 *               from five files with five hand-written `require()` depths —
 *               96 of them across `shared/branding`, `theme/themeAssets`,
 *               `challenge/rewards`, `challenge/monthlyTrophies` and
 *               `challenge/rewardArt`. `require()` is invisible to
 *               `tools/check-architecture.ts` (its regex only matches `import
 *               … from`), so it was the one import surface the layer rules
 *               never audited, and one wrong depth fails only at bundle time on
 *               a device — `tsc` cannot catch it, because `require()` returns
 *               `any`. Collapsing them into one file makes the whole surface one
 *               path that can be checked in one place.
 *
 * Notes:        **Nothing here is generated, and nothing here may alter the
 *               artwork.** The bitmaps under `assets/` are referenced verbatim —
 *               same file, same name, same bytes. This registry deliberately
 *               does *not* normalise the inconsistent filenames
 *               (`perfect play unactive.webp`, `most_win_inative.webp`,
 *               `aprail.webp`, `level_legend_active .webp` with its trailing
 *               space). Renaming them would be a change to the shipped art's own
 *               identity, and the brief is explicit that image content stays
 *               untouched. The registry is what lets a later rename happen in
 *               *one* place instead of five.
 *
 * Notes:        Build-time images live elsewhere: `icon.png`,
 *               `android-icon-{foreground,background,monochrome}.png`,
 *               `splash-icon(-dark).png` and `favicon.png` are consumed by
 *               `app.json` / the Expo config plugin, never by code, so they must
 *               not enter a runtime registry. Audio is out of scope —
 *               `src/services/audio/audioAssets.ts` keeps its own 34 requires.
 *
 *               `rewardArt.ts`, which pointed at PNG versions of these files
 *               that never existed, was deleted rather than migrated here.
 */

import type { ImageSourcePropType } from 'react-native';

/**
 * One image, with the metadata a screen needs to show it well.
 *
 * `source` is a Metro `require()`, so every entry resolves at bundle time. The
 * descriptive fields exist so callers stop inventing their own captions and
 * accessibility labels: an image whose purpose is written down in one place is
 * an image that gets labelled the same way on every screen.
 */
export interface ImageAsset {
  /** Stable, semantic, dot-namespaced identity. Never derived from a filename. */
  readonly key: string;
  /** The Metro-resolved bitmap. */
  readonly source: ImageSourcePropType;
  /** Human name of the artwork, for logs, tools and docs. */
  readonly name: string;
  /** What this image depicts and where it is shown. */
  readonly description: string;
  /** What to announce to a screen reader, where the image is not purely decorative. */
  readonly accessibilityLabel?: string;
  /**
   * Width ÷ height, where a layout needs it to reserve space before the image
   * decodes. Optional on purpose: most of these sit in a fixed box with
   * `resizeMode="contain"`, and stating a ratio nobody reads would be noise.
   */
  readonly aspectRatio?: number;
}

/** Build an entry: the required four, plus room for the optional two. */
function image(
  key: string,
  name: string,
  description: string,
  source: ImageSourcePropType,
  extra?: Omit<ImageAsset, 'key' | 'name' | 'description' | 'source'>,
): ImageAsset {
  return { key, name, description, source, ...extra };
}

// ---------------------------------------------------------------------------
// Brand — the game's own logo. Owned by `shared/branding`; declared here so
// that *every* image still has exactly one entry.
// ---------------------------------------------------------------------------

export const BRAND_IMAGES = {
  /** Glyph alone, charcoal ink, for light grounds. */
  markDark: image(
    'brand.markDark',
    'Arrow mark (dark ink)',
    'The arrow glyph alone in charcoal, for light grounds. The in-app mark.',
    require('../../../../assets/brand/arrow-mark.png'),
    { accessibilityLabel: 'Arrow Puzzle' },
  ),
  /** Glyph alone, bone ink, for dark grounds. */
  markLight: image(
    'brand.markLight',
    'Arrow mark (light ink)',
    'The arrow glyph alone in bone white, for dark grounds. The in-app mark.',
    require('../../../../assets/brand/arrow-mark-light.png'),
    { accessibilityLabel: 'Arrow Puzzle' },
  ),
  /** Mark plus name, charcoal ink, for light grounds. */
  wordmarkDark: image(
    'brand.wordmarkDark',
    'Arrow Puzzle wordmark (dark ink)',
    'The arrow mark locked up with the game name, in charcoal, for light grounds.',
    require('../../../../assets/brand/wordmark-dark.png'),
    { accessibilityLabel: 'Arrow Puzzle' },
  ),
  /** Mark plus name, bone ink, for dark grounds. */
  wordmarkLight: image(
    'brand.wordmarkLight',
    'Arrow Puzzle wordmark (light ink)',
    'The arrow mark locked up with the game name, in bone white, for dark grounds.',
    require('../../../../assets/brand/wordmark-light.png'),
    { accessibilityLabel: 'Arrow Puzzle' },
  ),
} as const;

// ---------------------------------------------------------------------------
// Records — the three record badges and their two non-earned states.
// `largestStreak` doubles as the theme layer's challenge banner: one file, two
// consumers, which is exactly the sharing this registry exists to make legal.
// ---------------------------------------------------------------------------

export const RECORD_IMAGES = {
  largestStreak: image(
    'records.largestStreak',
    'Largest streak',
    'The flame record badge, earned state. Also serves as the challenge banner art.',
    require('../../../../assets/records/largest streak.webp'),
  ),
  largestStreakInactive: image(
    'records.largestStreakInactive',
    'Largest streak (in progress)',
    'The flame record badge with partial progress toward the record.',
    require('../../../../assets/records/largest streak_inactive.webp'),
  ),
  largestStreakLocked: image(
    'records.largestStreakLocked',
    'Largest streak (locked)',
    'The flame record badge with the record not yet set.',
    require('../../../../assets/records/largest streak_locked.webp'),
  ),
  highestWinStreak: image(
    'records.highestWinStreak',
    'Highest win streak',
    'The crown record badge, earned state.',
    require('../../../../assets/records/highest_win_streak.webp'),
  ),
  highestWinStreakInactive: image(
    'records.highestWinStreakInactive',
    'Highest win streak (in progress)',
    'The crown record badge with partial progress toward the record.',
    require('../../../../assets/records/highest_win_streak-inactive.webp'),
  ),
  highestWinStreakLocked: image(
    'records.highestWinStreakLocked',
    'Highest win streak (locked)',
    'The crown record badge with the record not yet set.',
    require('../../../../assets/records/highest_win_streak_locked.webp'),
  ),
  mostWins: image(
    'records.mostWins',
    'Most wins',
    'The arrow record badge for total daily challenge wins, earned state.',
    require('../../../../assets/records/most_win.webp'),
  ),
  mostWinsInactive: image(
    'records.mostWinsInactive',
    'Most wins (in progress)',
    'The arrow record badge with partial progress toward the record.',
    require('../../../../assets/records/most_win_inative.webp'),
  ),
  mostWinsLocked: image(
    'records.mostWinsLocked',
    'Most wins (locked)',
    'The arrow record badge with no wins counted yet.',
    require('../../../../assets/records/most_win_locked.webp'),
  ),
} as const;

// ---------------------------------------------------------------------------
// Awards — five award families, each with active / inactive / locked art.
// ---------------------------------------------------------------------------

export const AWARD_IMAGES = {
  levelLegendActive: image(
    'awards.levelLegendActive',
    'Level Legend (unlocked)',
    'Level Legend award, unlocked. Given for clearing campaign levels.',
    require('../../../../assets/awards/level_legend_active.webp'),
  ),
  levelLegendInactive: image(
    'awards.levelLegendInactive',
    'Level Legend (in progress)',
    'Level Legend award, campaign levels part-cleared.',
    require('../../../../assets/awards/level_legend_unactive.webp'),
  ),
  levelLegendLocked: image(
    'awards.levelLegendLocked',
    'Level Legend (locked)',
    'Level Legend award before any campaign level is cleared.',
    require('../../../../assets/awards/level_legend_locked.webp'),
  ),
  perfectPlayActive: image(
    'awards.perfectPlayActive',
    'Perfect Play (unlocked)',
    'Perfect Play award, unlocked. Given for a flawless challenge win.',
    require('../../../../assets/awards/perfect_play_active.webp'),
  ),
  perfectPlayInactive: image(
    'awards.perfectPlayInactive',
    'Perfect Play (in progress)',
    'Perfect Play award with at least one flawless win but not the target.',
    require('../../../../assets/awards/perfect play unactive.webp'),
  ),
  perfectPlayLocked: image(
    'awards.perfectPlayLocked',
    'Perfect Play (locked)',
    'Perfect Play award before any flawless win.',
    require('../../../../assets/awards/perfect_play_locked.webp'),
  ),
  unstoppableActive: image(
    'awards.unstoppableActive',
    'Unstoppable (unlocked)',
    'Unstoppable award, unlocked. Given for fifty flawless challenge wins.',
    require('../../../../assets/awards/unstoppable_active.webp'),
  ),
  unstoppableInactive: image(
    'awards.unstoppableInactive',
    'Unstoppable (in progress)',
    'Unstoppable award part-earned. Shares the locked bitmap: the shipped art set has one alternate for this family.',
    require('../../../../assets/awards/unstoppable_locked.webp'),
  ),
  unstoppableLocked: image(
    'awards.unstoppableLocked',
    'Unstoppable (locked)',
    'Unstoppable award before the target is met.',
    require('../../../../assets/awards/unstoppable_locked.webp'),
  ),
  leagueClimberActive: image(
    'awards.leagueClimberActive',
    'League Climber (unlocked)',
    'League Climber award, unlocked.',
    require('../../../../assets/awards/league_climber_active.webp'),
  ),
  leagueClimberInactive: image(
    'awards.leagueClimberInactive',
    'League Climber (in progress)',
    'League Climber award part-earned.',
    require('../../../../assets/awards/league_climber_inactive.webp'),
  ),
  leagueClimberLocked: image(
    'awards.leagueClimberLocked',
    'League Climber (locked)',
    'League Climber award before the target is met.',
    require('../../../../assets/awards/league_climber_locked.webp'),
  ),
  leagueFighterActive: image(
    'awards.leagueFighterActive',
    'League Fighter (unlocked)',
    'League Fighter award, unlocked.',
    require('../../../../assets/awards/league_fighter_active.webp'),
  ),
  leagueFighterInactive: image(
    'awards.leagueFighterInactive',
    'League Fighter (in progress)',
    'League Fighter award part-earned.',
    require('../../../../assets/awards/league_fighter_inactive.webp'),
  ),
  leagueFighterLocked: image(
    'awards.leagueFighterLocked',
    'League Fighter (locked)',
    'League Fighter award before the target is met.',
    require('../../../../assets/awards/league_fighter_locked.webp'),
  ),
} as const;

// ---------------------------------------------------------------------------
// Monthly trophies — twelve months, each with an earned and a locked state.
// Filenames do not match the month keys (`fab` for February, `aprail` for
// April, a generated UUID-ish name for April's lock). Kept verbatim; see the
// file header on why this registry does not normalise shipped filenames.
// ---------------------------------------------------------------------------

export const TROPHY_IMAGES = {
  janEarned: image('trophy.janEarned', 'January trophy', 'January championship trophy, earned.', require('../../../../assets/monthly trophies/jan.webp')),
  janLocked: image('trophy.janLocked', 'January trophy (locked)', 'January championship trophy, locked.', require('../../../../assets/monthly trophies/jan lock.webp')),
  febEarned: image('trophy.febEarned', 'February trophy', 'February championship trophy, earned.', require('../../../../assets/monthly trophies/fab.webp')),
  febLocked: image('trophy.febLocked', 'February trophy (locked)', 'February championship trophy, locked.', require('../../../../assets/monthly trophies/fab lock.webp')),
  marEarned: image('trophy.marEarned', 'March trophy', 'March championship trophy, earned.', require('../../../../assets/monthly trophies/march.webp')),
  marLocked: image('trophy.marLocked', 'March trophy (locked)', 'March championship trophy, locked.', require('../../../../assets/monthly trophies/march lock.webp')),
  aprEarned: image('trophy.aprEarned', 'April trophy', 'April championship trophy, earned.', require('../../../../assets/monthly trophies/aprail.webp')),
  aprLocked: image('trophy.aprLocked', 'April trophy (locked)', 'April championship trophy, locked.', require('../../../../assets/monthly trophies/Locked_championship_cup_on_base_202609042146.webp')),
  mayEarned: image('trophy.mayEarned', 'May trophy', 'May championship trophy, earned.', require('../../../../assets/monthly trophies/may.webp')),
  mayLocked: image('trophy.mayLocked', 'May trophy (locked)', 'May championship trophy, locked.', require('../../../../assets/monthly trophies/may lock.webp')),
  junEarned: image('trophy.junEarned', 'June trophy', 'June championship trophy, earned.', require('../../../../assets/monthly trophies/june.webp')),
  junLocked: image('trophy.junLocked', 'June trophy (locked)', 'June championship trophy, locked.', require('../../../../assets/monthly trophies/june lock.webp')),
  julEarned: image('trophy.julEarned', 'July trophy', 'July championship trophy, earned.', require('../../../../assets/monthly trophies/july.webp')),
  julLocked: image('trophy.julLocked', 'July trophy (locked)', 'July championship trophy, locked.', require('../../../../assets/monthly trophies/july lock.webp')),
  augEarned: image('trophy.augEarned', 'August trophy', 'August championship trophy, earned.', require('../../../../assets/monthly trophies/august.webp')),
  augLocked: image('trophy.augLocked', 'August trophy (locked)', 'August championship trophy, locked.', require('../../../../assets/monthly trophies/august lock.webp')),
  sepEarned: image('trophy.sepEarned', 'September trophy', 'September championship trophy, earned.', require('../../../../assets/monthly trophies/sep.webp')),
  sepLocked: image('trophy.sepLocked', 'September trophy (locked)', 'September championship trophy, locked.', require('../../../../assets/monthly trophies/sep lock.webp')),
  octEarned: image('trophy.octEarned', 'October trophy', 'October championship trophy, earned.', require('../../../../assets/monthly trophies/oct.webp')),
  octLocked: image('trophy.octLocked', 'October trophy (locked)', 'October championship trophy, locked.', require('../../../../assets/monthly trophies/oct lock.webp')),
  novEarned: image('trophy.novEarned', 'November trophy', 'November championship trophy, earned.', require('../../../../assets/monthly trophies/nov.webp')),
  novLocked: image('trophy.novLocked', 'November trophy (locked)', 'November championship trophy, locked.', require('../../../../assets/monthly trophies/nov lock.webp')),
  decEarned: image('trophy.decEarned', 'December trophy', 'December championship trophy, earned.', require('../../../../assets/monthly trophies/dec.webp')),
  decLocked: image('trophy.decLocked', 'December trophy (locked)', 'December championship trophy, locked.', require('../../../../assets/monthly trophies/dec lock.webp')),
} as const;

// ---------------------------------------------------------------------------
// Theme — the art that resolves per theme.
// ---------------------------------------------------------------------------

export const THEME_IMAGES = {
  /** Challenge / Cup image for Home and cards. Shares the records flame bitmap. */
  challengeBanner: image(
    'theme.challengeBanner',
    'Challenge banner',
    'The challenge banner art shown on Home and the challenge cards.',
    require('../../../../assets/records/largest streak.webp'),
  ),
  leagueBanner: image(
    'theme.leagueBanner',
    'Leagues banner',
    'The finishing / top banner shown on the Leagues screen.',
    require('../../../../assets/league/Five_metallic_shields_displayed_202609071447.webp'),
  ),
  leagueIntro: image(
    'theme.leagueIntro',
    'Leagues intro',
    'The illustration shown when the leagues are first introduced.',
    require('../../../../assets/league/league info.webp'),
  ),
  podiumFirst: image(
    'theme.podiumFirst',
    'First place',
    'The gold podium placement medal.',
    require('../../../../assets/league/first place.webp'),
  ),
  podiumSecond: image(
    'theme.podiumSecond',
    'Second place',
    'The silver podium placement medal.',
    require('../../../../assets/league/second place.webp'),
  ),
  podiumThird: image(
    'theme.podiumThird',
    'Third place',
    'The bronze podium placement medal.',
    require('../../../../assets/league/third place.webp'),
  ),
} as const;

/**
 * The rank shield per league tier, keyed by league id.
 *
 * Six ids, five bitmaps: `obsidian` and `diamond` ship the same artwork, which
 * is recorded as a duplicate exception rather than papered over here — one key
 * per tier keeps `themeAssets.shields[id]` a total lookup.
 */
export const SHIELD_IMAGES = {
  bronze: image('shield.bronze', 'Bronze shield', 'The Bronze league rank shield.', require('../../../../assets/shields/Bronze_mobile_game_rank_shield_202609042103.webp')),
  silver: image('shield.silver', 'Silver shield', 'The Silver league rank shield.', require('../../../../assets/shields/Rank_shield_badge_icon_202609042103.webp')),
  gold: image('shield.gold', 'Gold shield', 'The Gold league rank shield.', require('../../../../assets/shields/Gold_rank_shield_mobile_icon_202609042103.webp')),
  ruby: image('shield.ruby', 'Ruby shield', 'The Ruby league rank shield.', require('../../../../assets/shields/Change_shield_material_color_202609042103.webp')),
  obsidian: image('shield.obsidian', 'Obsidian shield', 'The Obsidian league rank shield.', require('../../../../assets/shields/Game_rank_shield_badge_icon_202609042103.webp')),
  diamond: image('shield.diamond', 'Diamond shield', 'The Diamond league rank shield.', require('../../../../assets/shields/Game_rank_shield_badge_icon_202609042103.webp')),
} as const;

// ---------------------------------------------------------------------------
// The catalogue. Flat, keyed by the same dot-namespaced strings above, so a
// tool can enumerate every image the app ships without importing the domain
// groups it is split into for human readability.
// ---------------------------------------------------------------------------

export const IMAGES = {
  ...BRAND_IMAGES,
  ...RECORD_IMAGES,
  ...AWARD_IMAGES,
  ...TROPHY_IMAGES,
  ...THEME_IMAGES,
  ...SHIELD_IMAGES,
} as const;

/** Every image in the registry, in declaration order. */
export const ALL_IMAGES: readonly ImageAsset[] = Object.values(IMAGES);

/**
 * Look an image up by its stable key.
 *
 * Returns `undefined` rather than throwing: a missing badge should degrade to
 * no picture, not take the screen down with it. Domain functions in this
 * codebase are total, and this is the registry's own attempt at the same rule.
 */
export function imageByKey(key: string): ImageAsset | undefined {
  return ALL_IMAGES.find((asset) => asset.key === key);
}
