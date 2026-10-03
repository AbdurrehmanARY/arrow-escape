/**
 * hooks/index.ts — the public surface of the orchestration layer.
 *
 * Purpose:      One import path for the hooks that wire game behaviour together,
 *               so screens do not reach into `src/hooks/` file by file.
 * Notes:        **These are hooks, not helpers, and not a second game engine.**
 *               A hook may sequence calls into `game/`, `state/` and `services/`,
 *               but the rules live in `game/` alone. If a hook starts deciding
 *               whether a tap is legal, it is a rule that has escaped the layer
 *               that is tested for it.
 *
 *               **This barrel is almost empty on purpose, and that is the
 *               plan.** Four of its five hooks have moved into the feature that is
 *               their only caller — `useArrowTap`, `useBoardViewport` and
 *               `useHintFlow` now sit in `features/gameplay/hooks/`, and
 *               `useLeagueBoard` in `features/league/hooks/` — because a hook with
 *               exactly one consumer is not shared behaviour, it is part of that
 *               consumer. What is left is `useCurrentShield`, and it is still here
 *               for the same reason it has always been: Home, Collection and
 *               Settings all read it, so it belongs to no single feature, and the
 *               layer that cannot read a store (`shared/`) or be read by one
 *               (`state/`, which it would cycle with) is the only place it can sit
 *               until those stores have an owner of their own.
 *
 *               `useResponsive` is deliberately NOT exported. It has no callers —
 *               the screens read `useWindowDimensions` directly — and keeping an
 *               unused hook in the public surface would imply it is part of the
 *               vocabulary. See ARCHITECTURE_FINAL.md for the full audit.
 */

export * from './useCurrentShield';
export * from '@features/settings';

