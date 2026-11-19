/**
 * gameProgressService.ts — orchestrates game progress saving and restoration.
 *
 * Coordinates between inProgressManager, gameReducer, and the UI layer.
 */

import { loadInProgress, clearInProgress, reconstructBoardState, validateSavedGame, saveInProgress } from './inProgressManager';
import { type BoardState } from '@game';

interface GameProgressService {
  saveProgress(levelId: number, mode: 'classic' | 'monthly', state: any): Promise<void>;
  saveProgressImmediate(): Promise<void>;
  restoreProgress(levelId: number, mode: 'classic' | 'monthly'): Promise<any>;
  clearProgress(levelId: number, mode: 'classic' | 'monthly'): Promise<void>;
  registerSaveTrigger(trigger: () => Promise<void>): void;
}

let saveTriggers: (() => Promise<void>)[] = [];

class GameProgressServiceImpl implements GameProgressService {
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly SAVE_DEBOUNCE_MS = 500;

  async saveProgress(levelId: number, mode: 'classic' | 'monthly', state: any): Promise<void> {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveProgressImmediate();
    }, this.SAVE_DEBOUNCE_MS);
  }

  async saveProgressImmediate(): Promise<void> {
    // This will be called with the actual state from the reducer
    // Implementation depends on access to game state
  }

  async restoreProgress(levelId: number, mode: 'classic' | 'monthly'): Promise<any> {
    const saved = await loadInProgress(mode, levelId);
    if (!saved) return null;
    
    // Validate saved data against current level
    // Note: currentLevel needs to be passed or retrieved
    return null;
  }

  async clearProgress(levelId: number, mode: 'classic' | 'monthly'): Promise<void> {
    await clearInProgress(mode, levelId);
  }

  registerSaveTrigger(trigger: () => Promise<void>): void {
    saveTriggers.push(trigger);
  }
}

export const gameProgressService = new GameProgressServiceImpl();