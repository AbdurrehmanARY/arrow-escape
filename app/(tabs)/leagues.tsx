/**
 * app/(tabs)/leagues.tsx — route for the Leagues tab.
 *
 * Purpose:      Give the weekly competition the `/leagues` URL.
 * Responsibilities:
 *               - Nothing beyond handing the router the screen.
 * Notes:        **Routes stay thin.** The screen and `useLeagueBoard` live in
 *               `src/features/league/`, because this route is plumbing; putting a
 *               page's UI here would make it unreachable from anywhere that is not
 *               the router, and untestable without one.
 */

import { LeaguesScreen } from '@features/league';

export default LeaguesScreen;
