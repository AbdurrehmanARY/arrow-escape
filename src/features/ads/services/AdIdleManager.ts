/**
 * AdIdleManager.ts — manages idle-time advertisement preloading.
 *
 * Uses AppState to detect when the app is in the foreground but idle,
 * and triggers ad cache replenishment during those periods.
 */

import { AppState, AppStateStatus, NativeEventSubscription } from 'react-native';
import { adPreloadManager } from './AdPreloadManager';

export class AdIdleManager {
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private isIdle = false;
  private appStateListener: NativeEventSubscription | null = null;
  private enabled = true;

  constructor() {
    this.startMonitoring();
  }

  /** Start monitoring app state for idle periods */
  startMonitoring(): void {
    if (this.appStateListener) return;
    this.appStateListener = AppState.addEventListener('change', this.handleAppStateChange);
  }

  /** Stop monitoring app state */
  stopMonitoring(): void {
    if (this.appStateListener) {
      this.appStateListener.remove();
      this.appStateListener = null;
    }
    this.stopIdleTimer();
  }

  /** Enable/disable idle preloading */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stopIdleTimer();
  }

  /** Check if currently idle */
  isIdleNow(): boolean {
    return this.isIdle;
  }

  private handleAppStateChange = (nextState: AppStateStatus) => {
    if (nextState === 'active') {
      this.startIdleTimer();
    } else {
      this.stopIdleTimer();
    }
  };

  private startIdleTimer(): void {
    if (!this.enabled) return;
    this.stopIdleTimer();
    this.idleTimer = setTimeout(() => {
      this.isIdle = true;
      this.triggerIdlePreload();
    }, 30000); // 30 seconds idle
  };

  private stopIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
      this.isIdle = false;
    }
  }

  private triggerIdlePreload(): void {
    if (!this.enabled) return;
    adPreloadManager.replenishCache();
  }
}

export const adIdleManager = new AdIdleManager();