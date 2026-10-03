/**
 * app/(tabs)/settings.tsx — route for the Settings tab.
 *
 * Purpose:      Give preferences the `/settings` URL.
 * Responsibilities:
 *               - Nothing beyond handing the router the screen.
 * Notes:        **Routes stay thin.** The screen lives in
 *               `src/features/settings/screens/`, alongside the theme-assets hook
 *               and the legal documents that already lived here — this feature is
 *               "things the player configures", not "the settings tab".
 */

import { SettingsScreen } from '@features/settings';

export default SettingsScreen;
