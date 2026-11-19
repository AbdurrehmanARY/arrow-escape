/**
 * inProgressManager.ts - manages in-progress game state persistence using MMKV.
 */

import { mmkvStorage } from './mmkvStorage';
import { type BoardState } from '@game';

export interface SavedGameProgress {
  schemaVersion: number;
  levelId: number;
  boardId: string;
  mode: 'classic' | 'monthly';
  challengeId?: string;
  originalBoard: {
    rows: number;
    cols: number;
    arrows: any[];
    gates: any[];
    walls: number[];
    hearts: number;
  };
  escapedArrowIds: string[];
  remainingArrowIds: string[];
  heartsLeft: number;
  mistakes: number;
  chargedArrowIds: string[];
  status: 'in_progress' | 'completed' | 'failed' | 'stuck';
  elapsedTime: number;
  lastSavedAt: number;
  saveCount: number;
}

const MMKV_KEYS = {
  inProgress: (mode: 'classic' | 'monthly', id: number | string) => 'inprogress:' + mode + ':' + id,
  progress: 'progress',
  settings: 'settings',
  hints: 'hints',
  challenges: 'challenges',
  onboarding: 'onboarding',
  streak: 'streak',
  league: 'league',
} as const;

const CURRENT_SCHEMA_VERSION = 1;

async function getItem(key: string): Promise<string | null> {
  const { mmkvStorage } = require('./mmkvStorage');
  return mmkvStorage.getItem(key);
}

async function setItem(key: string, value: string): Promise<void> {
  const { mmkvStorage } = require('./mmkvStorage');
  await mmkvStorage.setItem(key, value);
}

async function removeItem(key: string): Promise<void> {
  const { mmkvStorage } = require('./mmkvStorage');
  await mmkvStorage.removeItem(key);
}

/** Save in-progress game state */
export async function saveInProgress(
  levelId: number,
  mode: 'classic' | 'monthly',
  state: {
    originalBoard: { rows: number; cols: number; arrows: any[]; gates: any[]; walls: number[]; hearts: number };
    escapedArrowIds: string[];
    remainingArrowIds: string[];
    heartsLeft: number;
    mistakes: number;
    chargedArrowIds: string[];
    status: 'in_progress' | 'completed' | 'failed' | 'stuck';
    elapsedTime: number;
  }
): Promise<void> {
  const key = MMKV_KEYS.inProgress(mode, levelId);
  const boardId = computeBoardHash(state.originalBoard);
  
  const saved: any = {
    schemaVersion: 1,
    levelId,
    boardId,
    mode,
    originalBoard: state.originalBoard,
    escapedArrowIds: state.escapedArrowIds,
    remainingArrowIds: state.remainingArrowIds,
    heartsLeft: state.heartsLeft,
    mistakes: state.mistakes,
    chargedArrowIds: state.chargedArrowIds,
    status: state.status,
    elapsedTime: state.elapsedTime,
    lastSavedAt: Date.now(),
    saveCount: 0,
  };
  
  await saveInProgressRaw(key, saved);
}

async function saveInProgressRaw(key: string, data: any): Promise<void> {
  const { mmkvStorage } = require('./mmkvStorage');
  await mmkvStorage.setItem(key, JSON.stringify({ version: 1, data, timestamp: Date.now() }));
}

export async function loadInProgress(mode: 'classic' | 'monthly', id: number | string): Promise<any | null> {
  const key = MMKV_KEYS.inProgress(mode, id);
  const { mmkvStorage } = require('./mmkvStorage');
  const raw = await mmkvStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw).data;
  } catch {
    return null;
  }
}

export async function clearInProgress(mode: 'classic' | 'monthly', id: number | string): Promise<void> {
  const key = MMKV_KEYS.inProgress(mode, id);
  const { mmkvStorage } = require('./mmkvStorage');
  await mmkvStorage.removeItem(key);
}

/** Compute a hash of the level definition for validation */
export function computeBoardHash(level: { rows: number; cols: number; arrows: any[]; gates: any[]; walls: number[]; hearts: number }): string {
  const str = JSON.stringify({
    rows: level.rows,
    cols: level.cols,
    arrows: level.arrows.map(a => ({ id: a.id, body: a.body, direction: a.direction, group: a.group })),
    gates: level.gates,
    walls: level.walls,
    hearts: level.hearts,
  });
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

/** Reconstruct BoardState from saved progress */
export function reconstructBoardState(saved: { originalBoard: any; escapedArrowIds: string[]; remainingArrowIds: string[] }): any {
  const { buildBoard, createInitialState, indexOfArrow } = require('@game');
  const board = buildBoard(saved.originalBoard);
  const initialState = createInitialState(board);
  
  const alive = new Uint8Array(initialState.alive);
  for (const arrowId of saved.escapedArrowIds) {
    const index = indexOfArrow(board, arrowId);
    if (index >= 0) alive[index] = 0;
  }

  const occupancy = Int32Array.from(initialState.occupancy);
  for (const arrowId of saved.escapedArrowIds) {
    const index = indexOfArrow(board, arrowId);
    if (index >= 0) {
      for (const cell of board.arrows[index].body) {
        if (occupancy[cell] === index) occupancy[cell] = -1;
      }
    }
  }

  const groupsLeft = Int32Array.from(initialState.groupsLeft);
  for (const arrowId of saved.escapedArrowIds) {
    const index = indexOfArrow(board, arrowId);
    if (index >= 0 && index < board.arrows.length) {
      const arrow = board.arrows[index]!;
      const group = arrow.group;
      if (group !== -1 && group < groupsLeft.length) {
        const current = groupsLeft[group] ?? 0;
        groupsLeft[group] = Math.max(0, current - 1);
      }
    }
  }

  return {
    alive,
    occupancy,
    remaining: saved.remainingArrowIds.length,
    groupsLeft,
  };
}

/** Validate saved game against current level */
export function validateSavedGame(saved: any, currentLevel: any): boolean {
  if (!saved || saved.schemaVersion > 1) return false;
  if (saved.boardId !== computeBoardHash(currentLevel)) return false;
  if (saved.levelId !== currentLevel.id) return false;
  if (!saved.originalBoard || !saved.escapedArrowIds) return false;
  if (saved.escapedArrowIds.length + saved.remainingArrowIds.length !== saved.originalBoard.arrows.length) return false;
  return true;
}
