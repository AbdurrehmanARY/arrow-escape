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

const LEVEL_LEGEND_ACTIVE: ImageSourcePropType = require('../../assets/challenge/level_legend_active.jpg');
const LEVEL_LEGEND_INACTIVE: ImageSourcePropType = require('../../assets/challenge/level_legend_inactive.jpg');
const PERFECT_PLAY_ACTIVE: ImageSourcePropType = require('../../assets/challenge/perfect_play_active.jpg');
const PERFECT_PLAY_INACTIVE: ImageSourcePropType = require('../../assets/challenge/perfect_play_inactive.jpg');
const UNSTOPPABLE_ACTIVE: ImageSourcePropType = require('../../assets/challenge/unstoppable_active.jpg');
const UNSTOPPABLE_INACTIVE: ImageSourcePropType = require('../../assets/challenge/unstoppable_inactive.jpg');
const LEAGUE_CLIMBER_ACTIVE: ImageSourcePropType = require('../../assets/challenge/league_climber_active.jpg');
const LEAGUE_CLIMBER_INACTIVE: ImageSourcePropType = require('../../assets/challenge/league_climber_inactive.jpg');
const LEAGUE_FIGHTER_ACTIVE: ImageSourcePropType = require('../../assets/challenge/league_fighter_active.jpg');
const LEAGUE_FIGHTER_INACTIVE: ImageSourcePropType = require('../../assets/challenge/league_fighter_inactive.jpg');
const FLAME_ACTIVE: ImageSourcePropType = require('../../assets/challenge/flame_active.jpg');
const FLAME_INACTIVE: ImageSourcePropType = require('../../assets/challenge/flame_inactive.jpg');
const CROWN_ACTIVE: ImageSourcePropType = require('../../assets/challenge/crown_active.jpg');
const CROWN_INACTIVE: ImageSourcePropType = require('../../assets/challenge/crown_inactive.jpg');
const ARROW_ACTIVE: ImageSourcePropType = require('../../assets/challenge/arrow_active.jpg');
const ARROW_INACTIVE: ImageSourcePropType = require('../../assets/challenge/arrow_inactive.jpg');

export interface CalculatedRewardItem {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly current: number;
  readonly requirement: number;
  readonly active: boolean;
  readonly activeImage: ImageSourcePropType;
  readonly inactiveImage: ImageSourcePropType;
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
    {
      id: 'level-legend',
      title: 'Level Legend',
      description: 'Clear 100 campaign levels to earn Level Legend.',
      current: clearedLevels,
      requirement: 100,
      active: clearedLevels >= 100,
      activeImage: LEVEL_LEGEND_ACTIVE,
      inactiveImage: LEVEL_LEGEND_INACTIVE,
      image: clearedLevels >= 100 ? LEVEL_LEGEND_ACTIVE : LEVEL_LEGEND_INACTIVE,
      route: '/challenge/info/level-legend',
      unit: 'Cleared',
      displayValue: clearedLevels >= 100 ? 'Unlocked' : `${clearedLevels}/100 Cleared`,
      statusText: clearedLevels >= 100 ? 'Unlocked' : 'In Progress',
    },
    {
      id: 'perfect-play',
      title: 'Perfect Play',
      description: 'Achieve a flawless victory without mistakes.',
      current: stats.perfect,
      requirement: 1,
      active: stats.perfect >= 1,
      activeImage: PERFECT_PLAY_ACTIVE,
      inactiveImage: PERFECT_PLAY_INACTIVE,
      image: stats.perfect >= 1 ? PERFECT_PLAY_ACTIVE : PERFECT_PLAY_INACTIVE,
      route: '/challenge/info/perfect-play',
      unit: 'Flawless',
      displayValue: stats.perfect >= 1 ? 'Unlocked' : `${stats.perfect}/1 Flawless`,
      statusText: stats.perfect >= 1 ? 'Unlocked' : 'In Progress',
    },
    {
      id: 'unstoppable',
      title: 'Unstoppable',
      description: 'Achieve a 5-win streak.',
      current: stats.highestWinStreak,
      requirement: 5,
      active: stats.highestWinStreak >= 5,
      activeImage: UNSTOPPABLE_ACTIVE,
      inactiveImage: UNSTOPPABLE_INACTIVE,
      image: stats.highestWinStreak >= 5 ? UNSTOPPABLE_ACTIVE : UNSTOPPABLE_INACTIVE,
      route: '/challenge/info/unstoppable',
      unit: 'Streak',
      displayValue: stats.highestWinStreak >= 5 ? 'Unlocked' : `${stats.highestWinStreak}/5 Streak`,
      statusText: stats.highestWinStreak >= 5 ? 'Unlocked' : 'In Progress',
    },
    {
      id: 'league-climber',
      title: 'League Climber',
      description: 'Earn 500 league points in a single week.',
      current: thisWeekArrows,
      requirement: 500,
      active: thisWeekArrows >= 500,
      activeImage: LEAGUE_CLIMBER_ACTIVE,
      inactiveImage: LEAGUE_CLIMBER_INACTIVE,
      image: thisWeekArrows >= 500 ? LEAGUE_CLIMBER_ACTIVE : LEAGUE_CLIMBER_INACTIVE,
      route: '/challenge/info/league-climber',
      unit: 'Pts',
      displayValue: thisWeekArrows >= 500 ? 'Unlocked' : `${thisWeekArrows}/500 Pts`,
      statusText: thisWeekArrows >= 500 ? 'Unlocked' : 'In Progress',
    },
    {
      id: 'league-fighter',
      title: 'League Fighter',
      description: 'Participate in 10 league battles.',
      current: leagueCounted.length,
      requirement: 10,
      active: leagueCounted.length >= 10,
      activeImage: LEAGUE_FIGHTER_ACTIVE,
      inactiveImage: LEAGUE_FIGHTER_INACTIVE,
      image: leagueCounted.length >= 10 ? LEAGUE_FIGHTER_ACTIVE : LEAGUE_FIGHTER_INACTIVE,
      route: '/challenge/info/league-fighter',
      unit: 'Battles',
      displayValue: leagueCounted.length >= 10 ? 'Unlocked' : `${leagueCounted.length}/10 Battles`,
      statusText: leagueCounted.length >= 10 ? 'Unlocked' : 'In Progress',
    },
    {
      id: 'longest-streak',
      title: 'Longest Streak',
      description: 'Maintain a 7-day challenge streak.',
      current: stats.longestStreak,
      requirement: 7,
      active: stats.longestStreak >= 7,
      activeImage: FLAME_ACTIVE,
      inactiveImage: FLAME_INACTIVE,
      image: stats.longestStreak >= 7 ? FLAME_ACTIVE : FLAME_INACTIVE,
      route: '/challenge/info/longest-streak',
      unit: 'Days',
      displayValue: stats.longestStreak >= 7 ? 'Unlocked' : `${stats.longestStreak}/7 Days`,
      statusText: stats.longestStreak >= 7 ? 'Unlocked' : 'In Progress',
    },
    {
      id: 'highest-win-streak',
      title: 'Highest Win Streak',
      description: 'Achieve a 10-win streak.',
      current: stats.highestWinStreak,
      requirement: 10,
      active: stats.highestWinStreak >= 10,
      activeImage: CROWN_ACTIVE,
      inactiveImage: CROWN_INACTIVE,
      image: stats.highestWinStreak >= 10 ? CROWN_ACTIVE : CROWN_INACTIVE,
      route: '/challenge/info/highest-win-streak',
      unit: 'Wins',
      displayValue: stats.highestWinStreak >= 10 ? 'Unlocked' : `${stats.highestWinStreak}/10 Wins`,
      statusText: stats.highestWinStreak >= 10 ? 'Unlocked' : 'In Progress',
    },
    {
      id: 'most-wins',
      title: 'Most Wins',
      description: 'Win 30 total daily challenges.',
      current: stats.won,
      requirement: 30,
      active: stats.won >= 30,
      activeImage: ARROW_ACTIVE,
      inactiveImage: ARROW_INACTIVE,
      image: stats.won >= 30 ? ARROW_ACTIVE : ARROW_INACTIVE,
      route: '/challenge/info/most-wins',
      unit: 'Total',
      displayValue: stats.won >= 30 ? 'Unlocked' : `${stats.won}/30 Total`,
      statusText: stats.won >= 30 ? 'Unlocked' : 'In Progress',
    },
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
