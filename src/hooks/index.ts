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
 *               `useResponsive` is deliberately NOT exported. It has no callers —
 *               the screens read `useWindowDimensions` directly — and keeping an
 *               unused hook in the public surface would imply it is part of the
 *               vocabulary. See ARCHITECTURE_FINAL.md for the full audit.
 */

export * from './useArrowTap';
export * from './useBoardViewport';
export * from './useHintFlow';
export * from './useLeagueBoard';
export * from '@features/settings';
