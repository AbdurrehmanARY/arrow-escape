/**
 * app/(tabs)/challenge/[day].tsx — route for one day's challenge.
 *
 * Purpose:      Give a single challenge the `/challenge/YYYY-MM-DD` URL, so a
 *               day's result is a deep link and can be shared and returned to.
 * Responsibilities:
 *               - Read the `[day]` route parameter.
 *               - Forward it to `ChallengeDayScreen` and mount nothing else.
 * Notes:        **Routes stay thin, but they still own the URL.** Reading a
 *               route parameter is routing; deciding what a malformed one means is
 *               not. `ChallengeDayScreen` parses the day and renders the
 *               "no challenge here" state, so that a bad shared link produces an
 *               explanation rather than a crash somewhere deeper.
 */

import { useLocalSearchParams } from 'expo-router';

import { ChallengeDayScreen } from '@features/achievements';

export default function ChallengeDayRoute() {
  const { day } = useLocalSearchParams<{ day: string }>();

  return <ChallengeDayScreen day={day} />;
}
