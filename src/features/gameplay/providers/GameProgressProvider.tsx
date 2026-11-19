/**
 * GameProgressProvider.tsx — React context provider for game progress management.
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
  hearts: number;
}

export function GameProgressProvider({ children, levelId, mode, initialBoard, hearts }: GameProgressProviderProps) {
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
    if (state.session.status !== 'playing') return;

    // Extract escaped arrow IDs from state
    const escapedArrowIds: string[] = [];
    const remainingArrowIds: string[] = [];
    const chargedArrowIds: string[] = [];
    
    // Build escaped/remaining arrays from state
    state.session.state.alive.forEach((alive, index) => {
      if (alive === 0) {
        escapedArrowIds.push(String(index));
      } else {
        remainingArrowIds.push(String(index));
      }
    });
    
    state.session.chargedArrows.forEach(idx => {
      chargedArrowIds.push(String(idx));
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
  }, [gameState, levelId, mode]);

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
      const saved = await loadInProgress(mode, levelId);
      if (saved && validateSavedGame(saved, { id: levelId, ...saved.originalBoard })) {
        const restoredState = reconstructBoardState(saved);
        // Dispatch restore action
        dispatch({ type: 'restoreInProgress', ...saved });
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

  return (
    <GameProgressContext.Provider value={{
      gameState,
      dispatch,
      saveProgress,
      saveProgressImmediate,
      restoreProgress: async () => false,
      clearProgress: async () => {},
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