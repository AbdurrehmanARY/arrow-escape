/**
 * app/play/[id].tsx — route wiring for the game screen.
 *
 * Purpose:      Give `/play/:id` a URL and nothing else. The screen itself lives
 *               in `features/gameplay`, so that every rule about playing a level
 *               is in one place instead of split between a route file and a
 *               feature folder.
 * Responsibilities:
 *               - Read the `[id]` and `?challenge=` route parameters.
 *               - Forward them to `PlayScreen` and mount nothing else.
 * Notes:        **The parameters are forwarded raw, unvalidated and unclamped.**
 *               `PlayScreen` owns what "level 0" and "level 99999" mean, because
 *               that is a domain decision: a route that clamped the number would
 *               make the screen untestable for the exact cases its clamp exists to
 *               handle, and would hide a malformed deep link behind a level the
 *               player did not ask for.
 *
 *               This file is intentionally free of `StyleSheet`, stores, theme and
 *               service imports. If one appears here, it is UI or logic that has
 *               escaped its feature — put it there instead of growing this route.
 */

import { useLocalSearchParams } from 'expo-router';

import { PlayScreen } from '@features/gameplay';

export default function PlayRoute() {
  const { id, challenge } = useLocalSearchParams<{ id: string; challenge?: string }>();

  return <PlayScreen levelId={id} challengeDay={challenge} />;
}
