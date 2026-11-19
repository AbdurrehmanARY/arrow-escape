/**
 * useOTAUpdates.ts -- Hook for checking and applying Expo OTA updates.
 *
 * Provides a simple interface for checking update availability,
 * downloading updates, and reloading the app with the new version.
 */

import { useEffect, useState, useCallback } from 'react';
import * as Updates from 'expo-updates';

interface OTAUpdateState {
  updateAvailable: boolean;
  isChecking: boolean;
  isDownloading: boolean;
  downloadProgress: number;
  error: string | null;
}

interface OTAUpdateActions {
  checkForUpdate: () => Promise<void>;
  fetchUpdate: () => Promise<void>;
  reloadApp: () => Promise<void>;
  dismissUpdate: () => void;
}

interface UpdateEvent {
  type: string;
  progress?: number;
}

export function useOTAUpdates(): OTAUpdateState & OTAUpdateActions {
  const [state, setState] = useState<OTAUpdateState>({
    updateAvailable: false,
    isChecking: false,
    isDownloading: false,
    downloadProgress: 0,
    error: null,
  });

  const checkForUpdate = useCallback(async () => {
    setState(prev => ({ ...prev, isChecking: true, error: null }));
    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        setState(prev => ({ ...prev, updateAvailable: true, isChecking: false }));
      } else {
        setState(prev => ({ ...prev, updateAvailable: false, isChecking: false }));
      }
    } catch (e) {
      setState(prev => ({ ...prev, isChecking: false, error: 'Failed to check for updates' }));
      console.warn('[OTA] Check failed:', e);
    }
  }, []);

  const fetchUpdate = useCallback(async () => {
    setState(prev => ({ ...prev, isDownloading: true, downloadProgress: 0, error: null }));
    try {
      // Listen for download progress (API may not exist in all versions)
      let subscription: { remove: () => void } | null = null;
      const updatesWithListener = Updates as any;
      if (typeof updatesWithListener.addListener === 'function') {
        subscription = updatesWithListener.addListener((update: any) => {
          const eventType = (Updates as any).UpdateEvent?.DOWNLOAD_PROGRESS ?? 'DOWNLOAD_PROGRESS';
          if (update.type === eventType) {
            setState(prev => ({ ...prev, downloadProgress: update.progress ?? 0 }));
          }
        });
      }

      await Updates.fetchUpdateAsync();
      subscription?.remove();
      setState(prev => ({ ...prev, isDownloading: false, downloadProgress: 1, updateAvailable: true }));
    } catch (e) {
      setState(prev => ({ ...prev, isDownloading: false, error: 'Failed to download update' }));
      console.error('[OTA] Fetch failed:', e);
    }
  }, []);

  const reloadApp = useCallback(async () => {
    try {
      await Updates.reloadAsync();
    } catch (e) {
      console.error('[OTA] Reload failed:', e);
    }
  }, []);

  const dismissUpdate = useCallback(() => {
    setState(prev => ({ ...prev, updateAvailable: false }));
  }, []);

  // Auto-check on mount (optional - can be removed if using checkUpdateOnAppStart)
  useEffect(() => {
    checkForUpdate();
  }, [checkForUpdate]);

  return { ...state, checkForUpdate, fetchUpdate, reloadApp, dismissUpdate };
}
