/**
 * app/(tabs)/index.tsx — route for the Home tab.
 *
 * Purpose:      Give Home the `/` URL and the tab-bar entry the layout expects.
 * Responsibilities:
 *               - Nothing beyond handing the router the screen.
 * Notes:        **Routes stay thin.** The screen lives in
 *               `src/features/home/screens/`, because this route is plumbing;
 *               putting a page's UI here would make it unreachable from anywhere
 *               that is not the router, and untestable without one.
 */

import { HomeScreen } from '@features/home';

export default HomeScreen;
