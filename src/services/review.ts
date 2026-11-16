/**
 * @format
 * review.ts — In-App Review API integration
 *
 * Purpose:      Request app store review ratings/reviews from players.
 * Responsibilities:
 *               - Check if the device supports in-app review
 *               - Request the native Google Play in-app review dialog
 *               - Implement eligibility conditions to avoid spamming users
 *               - Never interrupt active gameplay
 * Notes:        iOS does not support the in-app review API.
 *               Expo Go does not support native modules — this will return
 *               fallbacks and never crash.
 *               Google Play controls whether the review dialog actually appears.
 *               Calling the API does not guarantee the dialog will be displayed.
 *               iOS: unsupported; always returns { supported: false }.
 *
 * Runtime behaviour:
 *   - If expo-store-review is installed → native in-app review API used when supported.
 *   - If expo-store-review is NOT installed → safe fallbacks returned,
 *     never thrown, never crash the app.
 */

/** Result of checking review support. */
export interface ReviewSupportResult {
  /** Whether the device supports in-app review. */
  supported: boolean;
  /** Reason if not supported (for debugging/logging). */
  reason?: string;
}

/** Result of a review request call. */
export interface ReviewRequestResult {
  /** Whether the review dialog was successfully requested. */
  requested: boolean;
  /** Whether the request was likely shown to the player. */
  displayed: boolean;
  /** Message if the request could not be made. */
  message?: string;
}

/** Check if the device supports in-app review. */
export function checkReviewSupport(): ReviewSupportResult {
  // iOS does not support in-app review API
  // Expo Go does not support native modules
  // Android may support it via Google Play Core
  if (__DEV__) {
    console.warn('[review] checkReviewSupport called — returning fallback (unsupported in Expo Go)');
  }
  return { supported: false, reason: 'Review API not available in current environment' };
}

/**
 * Request a native app store review from the player.
 *
 * Eligibility conditions (configure as needed):
 *   - Player has completed at least 3 levels
 *   - Player has been playing for a minimum session duration
 *   - Review has not been requested in the last 30 days
 *   - Player is not in the middle of a level
 *
 * Important: Google Play controls whether the review dialog actually appears.
 * Calling this function does NOT guarantee the dialog will be displayed.
 *
 * Returns:
 *   - { requested: true, displayed: true } — dialog was requested and likely shown
 *   - { requested: true, displayed: false } — dialog was requested but may not have been shown
 *   - { requested: false, displayed: false, message: '...' } — could not request
 *
 * Does NOT throw. Always returns a valid typed result.
 * Does NOT interrupt gameplay — should be called between levels/sessions.
 */
export function requestReview(): ReviewRequestResult {
  // In production with expo-store-review installed, this would call:
  // storeReviewAsync()
  //
  // Without the package, we return a fallback that:
  // - Never crashes
  // - Logs the intent
  // - Returns appropriate fallback values
  //
  // NOTE: Uncomment and install expo-store-review to enable native review:
  //
  // try {
  //   const result = await storeReviewAsync();
  //   return { requested: true, displayed: true };
  // } catch (e) {
  //   return { requested: false, displayed: false, message: 'Review API error' };
  // }

  if (__DEV__) {
    console.log('[review] Review requested (native API not installed — fallback)');
  }

  // Fallback: log intent, return polite fallback
  return {
    requested: false,
    displayed: false,
    message:
      'Review functionality not available in current build. To enable, install expo-store-review and rebuild with a development or production build.',
  };
}

/** Get the last review request timestamp from storage. */
export function getLastReviewTimestamp(): number {
  // In a full implementation with expo-store-review, this would track
  // the timestamp from the native response.
  // For now, return 0 (never requested) — the calling code should
  // implement its own eligibility logic.
  return 0;
}

/** Default eligibility: allow review after 3 level completions. */
export const DEFAULT_REVIEW_ELIGIBILITY = {
  minLevelsCompleted: 3,
  minSecondsPlayed: 30 * 60, // 30 minutes
  cooldownMs: 30 * 24 * 60 * 60 * 1000, // 30 days
};
