/**
 * app/(tabs)/challenge/_layout.tsx — a stack inside the Challenge tab.
 *
 * Purpose:      Let the sub-screens — a day's detail, history, rewards, statistics
 *               — push over the calendar while the tab bar stays put.
 * Notes:        Without this the sub-routes would each become their own tab, which
 *               is why the group needs a layout of its own rather than inheriting
 *               the tab navigator directly.
 */

import { Stack } from 'expo-router';

export default function ChallengeLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: 'transparent' },
      }}
    />
  );
}
