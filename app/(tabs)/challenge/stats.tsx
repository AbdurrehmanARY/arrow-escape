/**
 * app/(tabs)/challenge/stats.tsx — route for challenge statistics.
 *
 * Purpose:      Give the aggregate challenge numbers their `/challenge/stats` URL.
 * Responsibilities:
 *               - Nothing beyond handing the router the screen.
 * Notes:        **Routes stay thin.** The screen lives in
 *               `src/features/achievements/screens/`, because this route is
 *               plumbing; putting a page's UI here would make it unreachable from
 *               anywhere that is not the router, and untestable without one.
 */

import { ChallengeStatsScreen } from '@features/achievements';

export default ChallengeStatsScreen;
