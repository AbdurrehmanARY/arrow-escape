/**
 * app/(tabs)/challenge/rewards.tsx — route for earned challenge rewards.
 *
 * Purpose:      Give the trophy case the `/challenge/rewards` URL.
 * Responsibilities:
 *               - Nothing beyond handing the router the screen.
 * Notes:        **Routes stay thin.** The screen lives in
 *               `src/features/achievements/screens/`, because this route is
 *               plumbing; putting a page's UI here would make it unreachable from
 *               anywhere that is not the router, and untestable without one.
 */

import { ChallengeRewardsScreen } from '@features/achievements';

export default ChallengeRewardsScreen;
