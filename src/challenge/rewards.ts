/**
 * rewards.ts — Single source of truth for Record Awards & Badges.
 *
 * Purpose:      Centralise calculation logic, thresholds, active/inactive images,
 *               progress metrics, and display strings for all 8 Record Awards so that
 *               the Challenge page and all Reward Info pages display identical,
 *               synchronized data derived deterministically from Zustand stores.
 */

import { useMemo } from 'react';
import type { ImageSourcePropType } from 'react-native';

import { today } from './schedule';
import type { ChallengeStats } from './types';
import { statsOf, useChallengeStore } from '../state/challengeStore';
import { arrowsThisWeek, useLeagueStore } from '../state/leagueStore';
import { useProgressStore } from '../state/progressStore';

const LEVEL_LEGEND_ACTIVE: ImageSourcePropType = require('../../assets/awards/level_legend_active.webp');
const LEVEL_LEGEND_INACTIVE: ImageSourcePropType = require('../../assets/awards/level_legend_unactive.webp');
const LEVEL_LEGEND_LOCKED: ImageSourcePropType = require('../../assets/awards/level_legend_locked.webp');

const PERFECT_PLAY_ACTIVE: ImageSourcePropType = require('../../assets/awards/perfect_play_active.webp');
const PERFECT_PLAY_INACTIVE: ImageSourcePropType = require('../../assets/awards/perfect play unactive.webp');
const PERFECT_PLAY_LOCKED: ImageSourcePropType = require('../../assets/awards/perfect_play_locked.webp');

const UNSTOPPABLE_ACTIVE: ImageSourcePropType = require('../../assets/awards/unstoppable_active.webp');
const UNSTOPPABLE_INACTIVE: ImageSourcePropType = require('../../assets/awards/unstoppable_locked.webp');
const UNSTOPPABLE_LOCKED: ImageSourcePropType = require('../../assets/awards/unstoppable_locked.webp');

const LEAGUE_CLIMBER_ACTIVE: ImageSourcePropType = require('../../assets/awards/league_climber_active.webp');
const LEAGUE_CLIMBER_INACTIVE: ImageSourcePropType = require('../../assets/awards/league_climber_inactive.webp');
const LEAGUE_CLIMBER_LOCKED: ImageSourcePropType = require('../../assets/awards/league_climber_locked.webp');

const LEAGUE_FIGHTER_ACTIVE: ImageSourcePropType = require('../../assets/awards/league_fighter_active.webp');
const LEAGUE_FIGHTER_INACTIVE: ImageSourcePropType = require('../../assets/awards/league_fighter_inactive.webp');
const LEAGUE_FIGHTER_LOCKED: ImageSourcePropType = require('../../assets/awards/league_fighter_locked.webp');

const FLAME_ACTIVE: ImageSourcePropType = require('../../assets/records/largest streak.webp');
const FLAME_INACTIVE: ImageSourcePropType = require('../../assets/records/largest streak_inactive.webp');
const FLAME_LOCKED: ImageSourcePropType = require('../../assets/records/largest streak_locked.webp');

const CROWN_ACTIVE: ImageSourcePropType = require('../../assets/records/highest_win_streak.webp');
const CROWN_INACTIVE: ImageSourcePropType = require('../../assets/records/highest_win_streak-inactive.webp');
const CROWN_LOCKED: ImageSourcePropType = require('../../assets/records/highest_win_streak_locked.webp');

const ARROW_ACTIVE: ImageSourcePropType = require('../../assets/records/most_win.webp');
const ARROW_INACTIVE: ImageSourcePropType = require('../../assets/records/most_win_inative.webp');
const ARROW_LOCKED: ImageSourcePropType = require('../../assets/records/most_win_locked.webp');

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
}): CalculatedRewardItem {
  const { id, title, description, current, requirement, activeImage, inactiveImage, lockedImage, route, unit } = args;
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
  };
}

export function calculateAllRewards(inputs: {
  progressRecords: Record<string, { timesCleared: number }>;
  challengeRecords: Record<string, any>;
  leagueWeeks: Record<string, any>;
  leagueCounted: readonly number[];
  nowMs?: number;
}): Record<string, CalculatedRewardItem> {
  const { progressRecords, challengeRecords, leagueWeeks, leagueCounted, nowMs = Date.now() } = inputs;
  const day = today();
  const stats = statsOf({ records: challengeRecords }, day);

  const clearedLevels = Object.values(progressRecords).filter((r) => r.timesCleared > 0).length;
  const thisWeekArrows = arrowsThisWeek({ weeks: leagueWeeks }, nowMs);

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

export function useCalculatedRewards(): Record<string, CalculatedRewardItem> {
  const progressRecords = useProgressStore((state) => state.records);
  const challengeRecords = useChallengeStore((state) => state.records);
  const leagueWeeks = useLeagueStore((state) => state.weeks);
  const leagueCounted = useLeagueStore((state) => state.counted);

  return useMemo(() => {
    return calculateAllRewards({
      progressRecords,
      challengeRecords,
      leagueWeeks,
      leagueCounted,
    });
  }, [progressRecords, challengeRecords, leagueWeeks, leagueCounted]);
}

export function useRewardBadge(id: string): CalculatedRewardItem | undefined {
  const rewards = useCalculatedRewards();
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
