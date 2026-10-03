/**
 * src/features/league/index.ts — the feature's public surface.
 *
 * Purpose:      Give `app/(tabs)/leagues.tsx` one import for the whole weekly
 *               competition feature, screen and board hook together.
 * Responsibilities:
 *               - Re-export the Leagues screen and its board hook.
 * Notes:        `useLeagueBoard` is exported because it is genuinely reusable —
 *               it reads the league, challenge and auth stores and knows nothing
 *               about the screen's layout. That is the line this barrel tries to
 *               keep: the hook is a fact about the week, the screen is a fact
 *               about the phone.
 *
 *               The hook reads `useCurrentShield` through `@hooks`, and that is a
 *               sanctioned edge rather than a clean one — see
 *               SANCTIONED_FEATURE_IMPORTS in tools/check-architecture.ts for why
 *               the shield cannot move into either of its two candidate features.
 */

export { LeaguesScreen } from './screens/LeaguesScreen';
export { NEUTRAL_AVATAR, useLeagueBoard } from './hooks/useLeagueBoard';
