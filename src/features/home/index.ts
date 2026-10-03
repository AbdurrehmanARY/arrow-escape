/**
 * src/features/home/index.ts — the feature's public surface.
 *
 * Purpose:      Let `app/(tabs)/index.tsx` name Home without knowing where the
 *               screen lives, so the route tree can be read as a list of URLs and
 *               the feature can be read as a list of things the player can do.
 * Notes:        Home owns no hooks yet. `useCurrentShield` — which it reads — is
 *               still in `src/hooks/`, because Collection and Settings read it
 *               too and it cannot live in any one of those three features.
 */

export { HomeScreen } from './screens/HomeScreen';
