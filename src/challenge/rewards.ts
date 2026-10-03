/**
 * rewards.ts — Single source of truth for Record Awards & Badges.
 *
 * Purpose:      Centralise calculation logic, thresholds, active/inactive images,
 *               progress metrics, and display strings for the Record Awards and the
 *               shield award, so that the Challenge, Collection and Reward Info
 *               surfaces all display identical, synchronized data derived
 *               deterministically from Zustand stores.
 * Notes:        **The shield is the ninth item and the fifth award.** It is unlike
 *               the other eight in that it is not a *counter*: a player either
 *               holds a league shield this week or does not. `current` is therefore
 *               0 or 1 against a requirement of 1, which is what makes the item
 *               both "Unlocked" and "Locked" — and never "In progress" — without a
 *               second kind of award state.
 *
 *               Its artwork cannot be baked here, because which shield it is
 *               depends on the player's league, so the item carries the league id
 *               in `shieldId` and resolves the bitmap through the shared image
 *               registry (`SHIELD_IMAGES`). That registry is the same table
 *               `useThemeAssets()` builds `shields` from, so the award is
 *               theme-correct while `challenge/` still needs no edge into `state/`
 *               (the theme's home) or `hooks/` (which would be a cycle).
 */

import { useMemo } from 'react';
import type { ImageSourcePropType } from 'react-native';

import { AWARD_IMAGES, RECORD_IMAGES, SHIELD_IMAGES, imageByKey } from '@shared/assets/images';

import { today } from './schedule';
import type { ChallengeStats } from './types';
import { statsOf, useChallengeStore } from '../state/challengeStore';
import { arrowsThisWeek, useLeagueStore } from '../state/leagueStore';
import { useProgressStore } from '../state/progressStore';

// The art comes from the shared image registry rather than from `require()`s
// spread through this file. `require()` is invisible to `tools/check-architecture.ts`
// and returns `any`, so twenty-four of them was twenty-four paths `tsc` could
// not check and the layer rules could not see. The registry is also what makes
// the locked/inactive/active triple legible: three named entries instead of
// three string literals a reader has to diff to tell apart.
const LEVEL_LEGEND_ACTIVE: ImageSourcePropType = AWARD_IMAGES.levelLegendActive.source;
const LEVEL_LEGEND_INACTIVE: ImageSourcePropType = AWARD_IMAGES.levelLegendInactive.source;
const LEVEL_LEGEND_LOCKED: ImageSourcePropType = AWARD_IMAGES.levelLegendLocked.source;

const PERFECT_PLAY_ACTIVE: ImageSourcePropType = AWARD_IMAGES.perfectPlayActive.source;
const PERFECT_PLAY_INACTIVE: ImageSourcePropType = AWARD_IMAGES.perfectPlayInactive.source;
const PERFECT_PLAY_LOCKED: ImageSourcePropType = AWARD_IMAGES.perfectPlayLocked.source;

const UNSTOPPABLE_ACTIVE: ImageSourcePropType = AWARD_IMAGES.unstoppableActive.source;
const UNSTOPPABLE_INACTIVE: ImageSourcePropType = AWARD_IMAGES.unstoppableInactive.source;
const UNSTOPPABLE_LOCKED: ImageSourcePropType = AWARD_IMAGES.unstoppableLocked.source;

const LEAGUE_CLIMBER_ACTIVE: ImageSourcePropType = AWARD_IMAGES.leagueClimberActive.source;
const LEAGUE_CLIMBER_INACTIVE: ImageSourcePropType = AWARD_IMAGES.leagueClimberInactive.source;
const LEAGUE_CLIMBER_LOCKED: ImageSourcePropType = AWARD_IMAGES.leagueClimberLocked.source;

const LEAGUE_FIGHTER_ACTIVE: ImageSourcePropType = AWARD_IMAGES.leagueFighterActive.source;
const LEAGUE_FIGHTER_INACTIVE: ImageSourcePropType = AWARD_IMAGES.leagueFighterInactive.source;
const LEAGUE_FIGHTER_LOCKED: ImageSourcePropType = AWARD_IMAGES.leagueFighterLocked.source;

const FLAME_ACTIVE: ImageSourcePropType = RECORD_IMAGES.largestStreak.source;
const FLAME_INACTIVE: ImageSourcePropType = RECORD_IMAGES.largestStreakInactive.source;
const FLAME_LOCKED: ImageSourcePropType = RECORD_IMAGES.largestStreakLocked.source;

const CROWN_ACTIVE: ImageSourcePropType = RECORD_IMAGES.highestWinStreak.source;
const CROWN_INACTIVE: ImageSourcePropType = RECORD_IMAGES.highestWinStreakInactive.source;
const CROWN_LOCKED: ImageSourcePropType = RECORD_IMAGES.highestWinStreakLocked.source;

const ARROW_ACTIVE: ImageSourcePropType = RECORD_IMAGES.mostWins.source;
const ARROW_INACTIVE: ImageSourcePropType = RECORD_IMAGES.mostWinsInactive.source;
const ARROW_LOCKED: ImageSourcePropType = RECORD_IMAGES.mostWinsLocked.source;

/**
 * The floor of the shield ladder.
 *
 * Six leagues ship one shield each, but only five are distinct bitmaps
 * (`obsidian` and `diamond` share art) and there is no "not holding one" asset at
 * all. Bronze is the honest stand-in for both: it is the lowest tier, so a player
 * with no shield sees the bottom of the ladder rather than a broken image — the
 * same fallback Home has always used for its league emblem.
 */
const SHIELD_FALLBACK: ImageSourcePropType = SHIELD_IMAGES.bronze.source;

/**
 * The shield bitmap for a league id, or `undefined` if the id is not a tier.
 *
 * `imageByKey` rather than `SHIELD_IMAGES[id]`, because the id arrives as a
 * `string` from outside this layer and the registry's keys are narrow literals.
 * Narrowing by lookup keeps the function total: an unknown id yields no picture
 * rather than a type assertion that claims otherwise.
 */
function shieldArtFor(shieldId: string | undefined): ImageSourcePropType | undefined {
  if (shieldId === undefined) return undefined;
  return imageByKey(`shield.${shieldId}`)?.source;
}

export type AwardState = 'active' | 'inactive' | 'locked';

export interface CalculatedRewardItem {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly current: number;
  readonly requirement: number;
  readonly active: boolean;
  readonly state: AwardState;
  readonly activeImage: ImageSourcePropType;
  readonly inactiveImage: ImageSourcePropType;
  readonly lockedImage: ImageSourcePropType;
  readonly image: ImageSourcePropType;
  readonly route: string;
  readonly displayValue: string;
  readonly statusText: string;
  readonly unit: string;
  /**
   * The league whose shield this award draws, when the award is the shield.
   *
   * Optional and absent on every other award: only the shield's artwork depends
   * on *who the player is*, so only it needs to hand a surface something to
   * resolve through `useThemeAssets()`. `image` is already the correct bitmap
   * today; this is what lets a surface re-resolve it against the active theme.
   */
  readonly shieldId?: string | undefined;
}

export type RewardMetric = 'won' | 'streak' | 'perfect';

export interface RewardDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly metric: RewardMetric;
  readonly threshold: number;
  readonly glyph: string;
}

export const REWARDS: readonly RewardDefinition[] = [
  { id: 'first-win', name: 'Level Legend', description: 'Clear campaign levels', metric: 'won', threshold: 1, glyph: '★' },
  { id: 'perfect-1', name: 'Perfect Play', description: 'Flawless victory without mistakes', metric: 'perfect', threshold: 1, glyph: '🎯' },
  { id: 'streak-3', name: 'League Climber', description: '3-day challenge streak', metric: 'streak', threshold: 3, glyph: '🛡️' },
  { id: 'perfect-50', name: 'Unstoppable', description: '50 flawless challenge wins', metric: 'perfect', threshold: 50, glyph: '💀' },
  { id: 'streak-7', name: 'League Fighter', description: '7-day challenge streak', metric: 'streak', threshold: 7, glyph: '🥊' },
  { id: 'won-100', name: 'League Winners', description: '100 daily challenge wins', metric: 'won', threshold: 100, glyph: '🏆' },
];

export interface RewardProgress {
  readonly definition: RewardDefinition;
  readonly earned: boolean;
  readonly current: number;
  readonly fraction: number;
}

function resolveRewardItem(args: {
  id: string;
  title: string;
  description: string;
  current: number;
  requirement: number;
  activeImage: ImageSourcePropType;
  inactiveImage: ImageSourcePropType;
  lockedImage: ImageSourcePropType;
  route: string;
  unit: string;
  shieldId?: string | undefined;
}): CalculatedRewardItem {
  const {
    id,
    title,
    description,
    current,
    requirement,
    activeImage,
    inactiveImage,
    lockedImage,
    route,
    unit,
    shieldId,
  } = args;
  const active = current >= requirement;
  const state: AwardState = active ? 'active' : current > 0 ? 'inactive' : 'locked';
  const image = state === 'active' ? activeImage : state === 'inactive' ? inactiveImage : lockedImage;
  const displayValue = active ? 'Unlocked' : `${current}/${requirement} ${unit}`;
  const statusText = active ? 'Unlocked' : state === 'inactive' ? 'In Progress' : 'Locked';

  return {
    id,
    title,
    description,
    current,
    requirement,
    active,
    state,
    activeImage,
    inactiveImage,
    lockedImage,
    image,
    route,
    displayValue,
    statusText,
    unit,
    shieldId,
  };
}

export function calculateAllRewards(inputs: {
  progressRecords: Record<string, { timesCleared: number }>;
  challengeRecords: Record<string, any>;
  leagueWeeks: Record<string, any>;
  leagueCounted: readonly number[];
  nowMs?: number;
  /**
   * The league whose shield the player holds, from `useCurrentShield`.
   *
   * Passed in rather than derived here, because deriving it needs
   * `arrowsFor` + `leagueForArrows` from `@league` — a second copy of the very
   * chain `useCurrentShield` exists to own, and the one §6 of the cleanup plan
   * was written to delete. The *existence* test does not need it: `leagueWeeks`
   * and `nowMs` are already here, so an empty `shieldId` still produces the
   * locked award and the bronze fallback rather than a guess at a tier.
   */
  shieldId?: string;
}): Record<string, CalculatedRewardItem> {
  const { progressRecords, challengeRecords, leagueWeeks, leagueCounted, nowMs = Date.now(), shieldId } = inputs;
  const day = today();
  const stats = statsOf({ records: challengeRecords }, day);

  const clearedLevels = Object.values(progressRecords).filter((r) => r.timesCleared > 0).length;
  const thisWeekArrows = arrowsThisWeek({ weeks: leagueWeeks }, nowMs);
  const holdsShield = thisWeekArrows > 0;
  const shieldArt = shieldArtFor(shieldId) ?? SHIELD_FALLBACK;

  const list: CalculatedRewardItem[] = [
    resolveRewardItem({
      id: 'level-legend',
      title: 'Level Legend',
      description: 'Clear 100 campaign levels to earn Level Legend.',
      current: clearedLevels,
      requirement: 100,
      activeImage: LEVEL_LEGEND_ACTIVE,
      inactiveImage: LEVEL_LEGEND_INACTIVE,
      lockedImage: LEVEL_LEGEND_LOCKED,
      route: '/challenge/info/level-legend',
      unit: 'Cleared',
    }),
    resolveRewardItem({
      id: 'perfect-play',
      title: 'Perfect Play',
      description: 'Achieve a flawless victory without mistakes.',
      current: stats.perfect,
      requirement: 1,
      activeImage: PERFECT_PLAY_ACTIVE,
      inactiveImage: PERFECT_PLAY_INACTIVE,
      lockedImage: PERFECT_PLAY_LOCKED,
      route: '/challenge/info/perfect-play',
      unit: 'Flawless',
    }),
    resolveRewardItem({
      id: 'unstoppable',
      title: 'Unstoppable',
      description: 'Achieve a 5-win streak.',
      current: stats.highestWinStreak,
      requirement: 5,
      activeImage: UNSTOPPABLE_ACTIVE,
      inactiveImage: UNSTOPPABLE_INACTIVE,
      lockedImage: UNSTOPPABLE_LOCKED,
      route: '/challenge/info/unstoppable',
      unit: 'Streak',
    }),
    resolveRewardItem({
      id: 'league-climber',
      title: 'League Climber',
      description: 'Earn 500 league points in a single week.',
      current: thisWeekArrows,
      requirement: 500,
      activeImage: LEAGUE_CLIMBER_ACTIVE,
      inactiveImage: LEAGUE_CLIMBER_INACTIVE,
      lockedImage: LEAGUE_CLIMBER_LOCKED,
      route: '/challenge/info/league-climber',
      unit: 'Pts',
    }),
    resolveRewardItem({
      id: 'league-fighter',
      title: 'League Fighter',
      description: 'Participate in 10 league battles.',
      current: leagueCounted.length,
      requirement: 10,
      activeImage: LEAGUE_FIGHTER_ACTIVE,
      inactiveImage: LEAGUE_FIGHTER_INACTIVE,
      lockedImage: LEAGUE_FIGHTER_LOCKED,
      route: '/challenge/info/league-fighter',
      unit: 'Battles',
    }),
    resolveRewardItem({
      id: 'shield',
      title: 'League Shield',
      description: 'Hold a league shield at the end of the week.',
      current: holdsShield ? 1 : 0,
      requirement: 1,
      activeImage: shieldArt,
      inactiveImage: shieldArt,
      lockedImage: shieldArt,
      route: '/challenge/info/shield',
      unit: 'Shield',
      shieldId,
    }),
    resolveRewardItem({
      id: 'longest-streak',
      title: 'Longest Streak',
      description: 'Maintain a 7-day challenge streak.',
      current: stats.longestStreak,
      requirement: 7,
      activeImage: FLAME_ACTIVE,
      inactiveImage: FLAME_INACTIVE,
      lockedImage: FLAME_LOCKED,
      route: '/challenge/info/longest-streak',
      unit: 'Days',
    }),
    resolveRewardItem({
      id: 'highest-win-streak',
      title: 'Highest Win Streak',
      description: 'Achieve a 10-win streak.',
      current: stats.highestWinStreak,
      requirement: 10,
      activeImage: CROWN_ACTIVE,
      inactiveImage: CROWN_INACTIVE,
      lockedImage: CROWN_LOCKED,
      route: '/challenge/info/highest-win-streak',
      unit: 'Wins',
    }),
    resolveRewardItem({
      id: 'most-wins',
      title: 'Most Wins',
      description: 'Win 30 total daily challenges.',
      current: stats.won,
      requirement: 30,
      activeImage: ARROW_ACTIVE,
      inactiveImage: ARROW_INACTIVE,
      lockedImage: ARROW_LOCKED,
      route: '/challenge/info/most-wins',
      unit: 'Total',
    }),
  ];

  const map: Record<string, CalculatedRewardItem> = {};
  for (const item of list) {
    map[item.id] = item;
  }
  return map;
}

/**
 * The live reward map, for surfaces that draw more than one award.
 *
 * `shieldId` is optional because only the shield award's artwork depends on it,
 * and the shield itself lives in `useCurrentShield` (a `hooks/` concern). A screen
 * that already knows the player's league passes `shieldId` so the tile draws the
 * right tier; a screen that does not still gets a correct bronze fallback.
 *
 * `nowMs` exists because `calculateAllRewards` resolves the *week* the shield is
 * counted against, and letting it default to its own `Date.now()` would give a
 * caller two different answers on the same screen: `useCurrentShield(nowMs)` at
 * the mount instant, and this hook at whatever time the memo happened to run. A
 * player who leaves Collection open across Monday rollover would see the shield
 * award flip to Locked while the tile beside it still draws last week's tier.
 * The instant belongs to the caller, for the same reason it is a parameter.
 *
 *               The options here accept `| undefined` while `calculateAllRewards`
 *               below does not, and the gap is deliberate. Every caller reaches
 *               these options from `useCurrentShield(...).shield?.id`, so "no
 *               shield yet" is a normal, expected value of a field that is
 *               otherwise always present — the option type should say so rather
 *               than force five call sites to write a conditional spread. The
 *               domain function is the other way round: it is a pure `Result`
 *               producer with no notion of a screen, so it takes the key absent
 *               and lets its own default speak. This hook is the adapter between
 *               the two, and its job is to drop the keys that carry nothing.
 */
export function useCalculatedRewards(
  options?: { readonly shieldId?: string | undefined; readonly nowMs?: number | undefined },
): Record<string, CalculatedRewardItem> {
  const progressRecords = useProgressStore((state) => state.records);
  const challengeRecords = useChallengeStore((state) => state.records);
  const leagueWeeks = useLeagueStore((state) => state.weeks);
  const leagueCounted = useLeagueStore((state) => state.counted);
  const shieldId = options?.shieldId;
  const nowMs = options?.nowMs;

  return useMemo(() => {
    return calculateAllRewards({
      progressRecords,
      challengeRecords,
      leagueWeeks,
      leagueCounted,
      // Spread rather than pass straight through. This project compiles with
      // `exactOptionalPropertyTypes`, where `shieldId?: string` means "a string, or
      // the key absent" — passing `shieldId: undefined` is a type error even though
      // the default reads exactly the same at runtime. A conditional spread omits the
      // key when the caller has nothing to say, which is the case the default covers.
      ...(shieldId !== undefined ? { shieldId } : {}),
      ...(nowMs !== undefined ? { nowMs } : {}),
    });
  }, [progressRecords, challengeRecords, leagueWeeks, leagueCounted, shieldId, nowMs]);
}

/** One award by id, or `undefined` when the id is not an award. */
export function useRewardBadge(
  id: string,
  options?: { readonly shieldId?: string | undefined; readonly nowMs?: number | undefined },
): CalculatedRewardItem | undefined {
  const rewards = useCalculatedRewards(options);
  return rewards[id];
}

/** Legacy support functions for stats and overview counts */
export function rewardProgress(stats: ChallengeStats): readonly RewardProgress[] {
  return REWARDS.map((definition) => {
    const value =
      definition.metric === 'won'
        ? stats.won
        : definition.metric === 'streak'
          ? stats.longestStreak
          : stats.perfect;
    const current = Math.min(value, definition.threshold);
    return {
      definition,
      earned: value >= definition.threshold,
      current,
      fraction: definition.threshold === 0 ? 1 : current / definition.threshold,
    };
  });
}

export function earnedCount(stats: ChallengeStats): number {
  return rewardProgress(stats).filter((reward) => reward.earned).length;
}

export function nextReward(stats: ChallengeStats): RewardProgress | undefined {
  const remaining = rewardProgress(stats).filter((reward) => !reward.earned);
  if (remaining.length === 0) return undefined;
  return remaining.reduce((best, reward) => (reward.fraction > best.fraction ? reward : best));
}
