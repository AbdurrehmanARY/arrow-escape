/**
 * app/(tabs)/challenge/history.tsx — route for challenge history.
 *
 * Purpose:      Give the attempt log the `/challenge/history` URL.
 * Responsibilities:
 *               - Nothing beyond handing the router the screen.
 * Notes:        **Routes stay thin.** The screen lives in
 *               `src/features/achievements/screens/`, because this route is
 *               plumbing; putting a page's UI here would make it unreachable from
 *               anywhere that is not the router, and untestable without one.
 */

import { ChallengeHistoryScreen } from '@features/achievements';

export default ChallengeHistoryScreen;
