/**
 * app/(tabs)/collection.tsx — route for the Collection tab.
 *
 * Purpose:      Give records, awards and trophies the `/collection` URL.
 * Responsibilities:
 *               - Nothing beyond handing the router the screen.
 * Notes:        **Routes stay thin.** The screen lives in
 *               `src/features/achievements/screens/`, because this route is
 *               plumbing; putting a page's UI here would make it unreachable from
 *               anywhere that is not the router, and untestable without one.
 */

import { CollectionScreen } from '@features/achievements';

export default CollectionScreen;
