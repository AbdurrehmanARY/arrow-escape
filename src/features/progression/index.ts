/**
 * src/features/progression/index.ts — the feature's public surface.
 *
 * Purpose:      Give `app/stats.tsx` one import for the lifetime-record screen.
 * Notes:        The feature is named `progression`, not `stats`, on purpose. A
 *               layer called after the route that mounts it describes where a file
 *               is; this one describes what the player is looking at, which is the
 *               question the screen actually answers.
 */

export { RecordScreen } from './screens/RecordScreen';
