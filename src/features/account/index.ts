/**
 * src/features/account/index.ts — the feature's public surface.
 *
 * Purpose:      Give `app/account.tsx` a single import for connecting, signing out
 *               and seeing which account is connected.
 * Notes:        The account screen is the one route that is *not* in the tab bar,
 *               so it is the only place where "a URL exists" and "a tab exists"
 *               come apart. Keeping the screen in a feature rather than inline in
 *               the route makes that difference visible instead of incidental.
 */

export { AccountScreen } from './screens/AccountScreen';
