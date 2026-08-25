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

/** Minimum interval between haptic triggers in ms to prevent duplicates. */
const DEBOUNCE_MS = 120;

let lastCollisionHapticTime = 0;
let lastHintHapticTime = 0;

/**
 * Trigger a short, crisp physical vibration for an arrow collision.
 *
 * Called at the exact moment an arrow hits a blocker during forward movement.
 * Debounced per-collision event to prevent rapid-tap spamming.
 */
export function triggerCollisionHaptic(enabled = true): void {
  if (!enabled) return;

  const now = Date.now();
  if (now - lastCollisionHapticTime < DEBOUNCE_MS) return;
  lastCollisionHapticTime = now;

  try {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {
      // Fallback to standard Vibration API if Haptics engine is unavailable
      Vibration.vibrate(40);
    });
  } catch {
    try {
      Vibration.vibrate(40);
    } catch {
      // Ignore vibration failures gracefully on unsupported hardware
    }
  }
}

/**
 * Trigger a short physical vibration when a hint is activated.
 *
 * Fires once when the player spends/activates a hint.
 */
export function triggerHintHaptic(enabled = true): void {
  if (!enabled) return;

  const now = Date.now();
  if (now - lastHintHapticTime < DEBOUNCE_MS) return;
  lastHintHapticTime = now;

  try {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
      Vibration.vibrate(60);
    });
  } catch {
    try {
      Vibration.vibrate(60);
    } catch {
      // Ignore failures
    }
  }
}
