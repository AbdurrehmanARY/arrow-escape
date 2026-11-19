import { Platform } from 'react-native';

export interface ReviewSupportResult {
  /** Whether the device supports in-app review. */
  supported: boolean;
  /** Reason if not supported (for debugging/logging). */
  reason?: string;
}

/** Check if the device supports in-app review. */
export function checkReviewSupport(): ReviewSupportResult {
  if (Platform.OS !== 'android') {
    return { supported: false, reason: 'Android only' };
  }
  return { supported: true };
}

/** Check if user is eligible for review prompt. */
export const DEFAULT_REVIEW_ELIGIBILITY = {
  minLevelsCompleted: 3,
  minSecondsPlayed: 30 * 60,
  cooldownMs: 30 * 24 * 60 * 60 * 1000,
};

/** Check if user is eligible for review prompt based on progress data. */
export function shouldRequestReview(records: Record<string, { timesCleared?: number }>): boolean {
  // Count completed levels
  const levelsCompleted = Object.values(records).filter(r => (r.timesCleared ?? 0) > 0).length;
  
  // Check minimum levels completed
  if (levelsCompleted < DEFAULT_REVIEW_ELIGIBILITY.minLevelsCompleted) {
    return false;
  }
  
  // Check cooldown
  try {
    const lastRequested = localStorage.getItem('review:lastRequested');
    if (lastRequested) {
      const lastTime = parseInt(lastRequested, 10);
      const now = Date.now();
      if (now - lastTime < DEFAULT_REVIEW_ELIGIBILITY.cooldownMs) {
        return false;
      }
    }
  } catch {
    // Ignore storage errors
  }
  
  return true;
}

/** Record that a review was requested (starts cooldown). */
export function markReviewRequested(): void {
  try {
    localStorage.setItem('review:lastRequested', String(Date.now()));
  } catch {
    // Ignore storage errors
  }
}

/** Result of a review request call. */
export interface ReviewRequestResult {
  /** Whether the review was requested. */
  requested: boolean;
  /** Whether the review was successfully displayed to the user. */
  displayed: boolean;
  /** Message if the request could not be made. */
  message?: string;
}

/** Request a native app store review from the player. */
export async function requestReview(): Promise<ReviewRequestResult> {
  if (Platform.OS !== 'android') {
    return { requested: false, displayed: false, message: 'Android only' };
  }

  try {
    const module = await import('expo-store-review');
    
    const isAvailable = await module.isAvailableAsync();
    if (!isAvailable) {
      return { requested: false, displayed: false, message: 'Review not available on this device' };
    }
    
    await module.requestReview();
    markReviewRequested();
    return { requested: true, displayed: true };
  } catch (error) {
    console.warn('[review] Native review failed:', error);
    return { requested: false, displayed: false, message: error instanceof Error ? error.message : 'Review failed' };
  }
}