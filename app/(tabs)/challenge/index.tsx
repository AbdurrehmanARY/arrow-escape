/**
 * app/(tabs)/challenge/index.tsx — route for Challenge Mode.
 *
 * Purpose:      Give today's challenge the `/challenge` URL.
 * Responsibilities:
 *               - Nothing beyond handing the router the screen.
 * Notes:        **Routes stay thin.** The screen lives in
 *               `src/features/achievements/screens/`, because this route is
 *               plumbing; putting a page's UI here would make it unreachable from
 *               anywhere that is not the router, and untestable without one.
 */

import { ChallengeScreen } from '@features/achievements';

export default ChallengeScreen;
