/**
 * GameProgressProvider.tsx -- React context provider for game progress management.
 *
 * Integrates with the game reducer and handles automatic save/restore.
 */

import React, { createContext, useContext, useEffect, useCallback, useRef } from 'react';
import { useReducer } from 'react';
import { gameReducer, initGameState } from '@state';
import { loadInProgress, clearInProgress, reconstructBoardState, validateSavedGame, saveInProgress } from '@services/inProgressManager';
import { type GameState } from '@state';
import { type BoardState } from '@game';
import { AppState, AppStateStatus } from 'react-native';

interface GameProgressContextValue {
  gameState: GameState;
  dispatch: React.Dispatch<any>;
  saveProgress: () => Promise<void>;
  saveProgressImmediate: () => Promise<void>;
  restoreProgress: (levelId: number) => Promise<boolean>;
  clearProgress: () => Promise<void>;
}

const GameProgressContext = createContext<GameProgressContextValue | null>(null);

interface GameProgressProviderProps {
  children: React.ReactNode;
  levelId: number;
  mode: 'classic' | 'monthly';
  initialBoard: any;
  built: any;
  hearts: number;
}

export function GameProgressProvider({ children, levelId, mode, initialBoard, built, hearts }: GameProgressProviderProps) {
  const [gameState, dispatch] = useReducer(gameReducer, initGameState(initialBoard, hearts));
  const sessionStartRef = useRef(Date.now());
  const statusRef = useRef(gameState.session.status);

  // Keep status ref updated
  useEffect(() => {
    statusRef.current = gameState.session.status;
  }, [gameState.session.status]);

  // Auto-save with debounce
  const doSaveProgress = useCallback(async () => {
    const state = gameState;
    if (state.session.status !== 'playing') {
      return;
    }

    // Extract escaped arrow IDs from state
    const escapedArrowIds: string[] = [];
    const remainingArrowIds: string[] = [];
    const chargedArrowIds: string[] = [];
    
    // Build escaped/remaining arrays from state - use authored IDs, not indices
    state.session.state.alive.forEach((alive, index) => {
      const arrowId = built?.value.board.arrows[index]?.id;
      if (arrowId) {
        if (alive === 0) {
          escapedArrowIds.push(arrowId);
        } else {
          remainingArrowIds.push(arrowId);
        }
      }
    });

    // Save charged arrows using authored IDs
    state.session.chargedArrows.forEach(idx => {
      const arrowId = built?.value.board.arrows[idx]?.id;
      if (arrowId) {
        chargedArrowIds.push(arrowId);
      }
    });

    const stateToSave = {
      originalBoard: initialBoard, // Use the original level definition
      escapedArrowIds,
      remainingArrowIds,
      heartsLeft: state.session.heartsLeft,
      mistakes: state.session.mistakes,
      chargedArrowIds,
      status: (state.session.status === 'playing' ? 'in_progress' : state.session.status) as 'in_progress' | 'completed' | 'failed' | 'stuck',
      elapsedTime: Date.now() - sessionStartRef.current,
    };

    // Save to MMKV via inProgressManager
    await saveInProgress(levelId, mode, stateToSave);
  }, [gameState, levelId, mode, built]);

  // Debounced save
  const saveProgress = useCallback(async () => {
    await doSaveProgress();
  }, [doSaveProgress]);

  const saveProgressImmediate = useCallback(async () => {
    await doSaveProgress();
  }, [doSaveProgress]);

  // Load in-progress on mount
  useEffect(() => {
    const loadProgress = async () => {
      const saved = await loadInProgress(mode, levelId)
      if (saved && validateSavedGame(saved, { id: levelId, ...saved.originalBoard })) {
        // Dispatch restore action with proper payload
        dispatch({ 
          type: 'restoreInProgress', 
          initialBoard: saved.originalBoard,
          escapedArrowIds: saved.escapedArrowIds,
          remainingArrowIds: saved.remainingArrowIds,
          heartsLeft: saved.heartsLeft,
          mistakes: saved.mistakes,
          chargedArrowIds: saved.chargedArrowIds,
          status: saved.status,
          elapsedTime: saved.elapsedTime,
        });
      }
    };
    loadProgress();
  }, [levelId, mode]);

  // Save on background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        if (statusRef.current === 'playing') {
          await doSaveProgress();
        }
      }
    });
    return () => subscription.remove();
  }, []);

  // Restore progress for a specific level (used for manual restore)
  const restoreProgress = useCallback(async (targetLevelId: number) => {
    const saved = await loadInProgress(mode, targetLevelId);
    if (saved && validateSavedGame(saved, { id: targetLevelId, ...saved.originalBoard })) {
      dispatch({ 
        type: 'restoreInProgress', 
        initialBoard: saved.originalBoard,
        escapedArrowIds: saved.escapedArrowIds,
        remainingArrowIds: saved.remainingArrowIds,
        heartsLeft: saved.heartsLeft,
        mistakes: saved.mistakes,
        chargedArrowIds: saved.chargedArrowIds,
        status: saved.status,
        elapsedTime: saved.elapsedTime,
      });
      return true;
    }
    return false;
  }, [mode, dispatch]);

  // Clear in-progress progress for current level
  const clearProgress = useCallback(async () => {
    await clearInProgress(mode, levelId);
  }, [mode, levelId]);

  return (
    <GameProgressContext.Provider value={{
      gameState,
      dispatch,
      saveProgress,
      saveProgressImmediate,
      restoreProgress,
      clearProgress,
    }}>
      {children}
    </GameProgressContext.Provider>
  );
}

export function useGameProgress() {
  const context = useContext(GameProgressContext);
  if (!context) throw new Error('useGameProgress must be used within GameProgressProvider');
  return context;
}
