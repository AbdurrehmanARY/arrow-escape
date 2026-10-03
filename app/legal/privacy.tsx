/**
 * app/legal/privacy.tsx — route for the Privacy Policy.
 *
 * Purpose:      Give the policy a URL (`/legal/privacy`) so it can be linked to and
 *               deep-linked into.
 * Responsibilities:
 *               - Nothing beyond handing the router the screen.
 * Notes:        **Routes stay thin.** The screen and its text live in
 *               `src/features/settings/screens/`, because this route is plumbing;
 *               putting a page's content here would make it unreachable from
 *               anywhere that is not the router, and untestable.
 */

import { PrivacyPolicyScreen } from '@features/settings';

export default PrivacyPolicyScreen;