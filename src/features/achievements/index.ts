/**
 * src/features/achievements/index.ts — the feature's public surface.
 *
 * Purpose:      Give the six challenge and collection routes one import each,
 *               instead of reaching into `screens/` for a particular file.
 * Responsibilities:
 *               - Re-export every screen a route in `app/(tabs)/challenge/` and
 *                 `app/(tabs)/collection.tsx` mounts.
 *               - Re-export `formatDuration`, which four of those screens format
 *                 times with and which would otherwise be duplicated per screen.
 * Notes:        **`formatDuration` is public because it is a formatting rule, not
 *               screen state.** A win streak shown as `0:04` on one page and
 *               `4s` on another is the kind of drift this barrel exists to make
 *               impossible — it lives in `ChallengeScreen` today only because that
 *               is where it was written, and the import is what keeps it shared.
 *
 *               The nine `info/*.tsx` routes are NOT re-exported here. They are
 *               already one-line wrappers around `@components`'s `AwardInfoPage`,
 *               they carry no challenge logic of their own, and pulling the shared
 *               page into this feature is a separate move with its own risk.
 */

export { CollectionScreen } from './screens/CollectionScreen';
export {
  ChallengeScreen,
  formatDuration,
} from './screens/ChallengeScreen';
export {
  ChallengeDayScreen,
  type ChallengeDayScreenProps,
} from './screens/ChallengeDayScreen';
export { ChallengeHistoryScreen } from './screens/ChallengeHistoryScreen';
export { ChallengeRewardsScreen } from './screens/ChallengeRewardsScreen';
export { ChallengeStatsScreen } from './screens/ChallengeStatsScreen';
