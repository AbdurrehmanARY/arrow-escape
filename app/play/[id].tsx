/**
 * app/play/[id].tsx -- route wiring for the game screen.
 *
 * Purpose:      Give `/play/:id` a URL and nothing else. The screen itself lives
 *               in `features/gameplay`, so that every rule about playing a level
 *               is in one place instead of split between a route file and a
 *               feature folder.
 * Responsibilities:
 *               - Read the `[id]` and `?challenge=` route parameters.
 *               - Forward them to `PlayScreen` wrapped in `GameProgressProvider`
 *               for automatic progress persistence.
 * Notes:        **The parameters are forwarded raw, unvalidated and unclamped.**
 *               `PlayScreen` owns what "level 0" and "level 99999" mean, because
 *               that is a domain decision: a route that clamped the number would
 *               make the screen untestable for the exact cases its clamp exists to
 *               handle, and would hide a malformed deep link behind a level the
 *               player did not ask for.
 */

import { useLocalSearchParams } from 'expo-router';

import { PlayScreen } from '@features/gameplay';
import { GameProgressProvider } from '@features/gameplay';
import { levelById } from '@data';
import { buildLevel } from '@game';

export default function PlayRoute() {
  const { id, challenge } = useLocalSearchParams<{ id: string; challenge?: string }>();
  const levelId = Math.max(1, Math.min(600, Number(id) || 1)); // LEVEL_COUNT = 600
  const level = levelById(levelId);
  const built = level ? buildLevel(level) : undefined;
  const initialBoard = built?.ok ? built.value.initial : undefined;
  const isChallenge = !!challenge;
  const mode = isChallenge ? 'monthly' : 'classic';
  const hearts = 3;

  return (
    <GameProgressProvider
      levelId={levelId}
      mode={mode}
      initialBoard={initialBoard}
      hearts={hearts}
    >
      <PlayScreen levelId={id} challengeDay={challenge} />
    </GameProgressProvider>
  );
}
