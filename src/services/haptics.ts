/**
 * haptics.ts — Haptic & Device Vibration Service.
 *
 * Purpose:      Deliver crisp, non-blocking physical vibration feedback for game
 *               events (arrow collisions, hint activations) on physical devices.
 * Responsibilities:
 *               - Trigger collision vibration at the exact impact moment.
 *               - Trigger hint activation vibration.
 *               - Enforce per-event debouncing so rapid taps do not produce duplicate
 *                 vibrations or audio/haptic desynchronization.
 *               - Provide safe fallbacks when running in Expo Go, web, or on devices
 *                 without haptic hardware.
 */

import { Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { SfxName } from './audio/audioAssets';

/** Minimum interval between haptic triggers in ms to prevent duplicates. */
const DEBOUNCE_MS = 60;
let lastHapticTime = 0;

/**
 * Whether haptics should fire.
 *
 * Purpose:      Callers that already know the player's setting pass it in. This
 *               function exists only so an explicit `false` is honoured.
 * Notes:        **This service must not read the settings store.** It used to,
 *               which meant `services/` imported `state/` — a layer inversion
 *               that made the dependency graph point upward, and a cycle the
 *               moment anything in `state/` wanted a haptic. Every call site
 *               already had the value in hand, so the fallback was dead weight
 *               with a real architectural cost. Undefined now means "yes",
 *               which is the behaviour the try/catch used to fall back to.
 */
function isHapticsEnabled(enabled?: boolean): boolean {
  return enabled ?? true;
}

/**
 * Trigger physical haptic vibration for UI and game events.
 */
export function triggerHaptic(
  type: 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error',
  enabled?: boolean,
): void {
  if (!isHapticsEnabled(enabled)) return;

  const now = Date.now();
  if (now - lastHapticTime < DEBOUNCE_MS) return;
  lastHapticTime = now;

  try {
    switch (type) {
      case 'selection':
        void Haptics.selectionAsync().catch(() => Vibration.vibrate(15));
        break;
      case 'light':
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => Vibration.vibrate(20));
        break;
      case 'medium':
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => Vibration.vibrate(35));
        break;
      case 'heavy':
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => Vibration.vibrate(50));
        break;
      case 'success':
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => Vibration.vibrate([0, 30, 40, 50]));
        break;
      case 'warning':
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => Vibration.vibrate(60));
        break;
      case 'error':
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => Vibration.vibrate([0, 50, 50, 100]));
        break;
    }
  } catch {
    try {
      Vibration.vibrate(30);
    } catch {
      // Ignore vibration failures gracefully on unsupported hardware
    }
  }
}

/**
 * Trigger appropriate haptic pattern corresponding to an SFX event.
 */
export function triggerHapticForSfx(name: SfxName, enabled?: boolean): void {
  if (!isHapticsEnabled(enabled)) return;

  switch (name) {
    case 'buttonClick':
    case 'toggle':
    case 'popupOpen':
    case 'popupClose':
      triggerHaptic('selection', enabled);
      break;
    case 'arrowPickup':
    case 'undo':
    case 'hintUsed':
      triggerHaptic('light', enabled);
      break;
    case 'arrowRelease':
    case 'correctMove':
    case 'pause':
    case 'resume':
    case 'levelRestart':
      triggerHaptic('medium', enabled);
      break;
    case 'collision':
    case 'wrongMove':
      triggerHaptic('heavy', enabled);
      break;
    case 'heartLost':
    case 'lastHeartWarning':
      triggerHaptic('warning', enabled);
      break;
    case 'levelComplete':
    case 'starCollect':
    case 'achievement':
    case 'rewardCollected':
    case 'difficultyUnlocked':
      triggerHaptic('success', enabled);
      break;
    case 'outOfHearts':
    case 'gameOver':
      triggerHaptic('error', enabled);
      break;
    default:
      triggerHaptic('light', enabled);
      break;
  }
}

/**
 * Trigger a physical vibration for an arrow collision.
 */
export function triggerCollisionHaptic(enabled = true): void {
  triggerHaptic('heavy', enabled);
}

/**
 * Trigger a physical vibration when a hint is activated.
 */
export function triggerHintHaptic(enabled = true): void {
  triggerHaptic('light', enabled);
}

