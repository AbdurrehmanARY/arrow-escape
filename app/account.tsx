/**
 * app/account.tsx — route for the account screen.
 *
 * Purpose:      Give connecting and signing out the `/account` URL.
 * Responsibilities:
 *               - Nothing beyond handing the router the screen.
 * Notes:        **Routes stay thin.** The screen lives in
 *               `src/features/account/screens/`, because this route is plumbing;
 *               putting a page's UI here would make it unreachable from anywhere
 *               that is not the router, and untestable without one.
 */

import { AccountScreen } from '@features/account';

export default AccountScreen;
