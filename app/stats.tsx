/**
 * app/stats.tsx — route for the lifetime record screen.
 *
 * Purpose:      Give the player's lifetime record the `/stats` URL.
 * Responsibilities:
 *               - Nothing beyond handing the router the screen.
 * Notes:        **Routes stay thin.** The screen lives in
 *               `src/features/progression/screens/`, because this route is
 *               plumbing; putting a page's UI here would make it unreachable from
 *               anywhere that is not the router, and untestable without one.
 */

import { RecordScreen } from '@features/progression';

export default RecordScreen;
