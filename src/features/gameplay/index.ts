/**
 * src/features/gameplay/index.ts — the feature's public surface.
 *
 * Purpose:      Give `app/` one import per feature instead of a path into its
 *               internals, so a screen can be moved or renamed inside the feature
 *               without touching a route, and so the architecture checker has a
 *               single edge to police rather than twenty.
 * Responsibilities:
 *               - Re-export the screens a route is allowed to mount.
 * Notes:        **`PlayScreenProps` is exported on purpose.** `app/play/[id].tsx`
 *               reads the route parameters and forwards them, and the type is the
 *               contract between the two — if the screen adds a required prop the
 *               wrapper should stop compiling, not silently pass `undefined`.
 *
 *               The engine facade (`./engine`) is deliberately NOT re-exported
 *               here. It is the pure engine's public surface and nothing else, and
 *               `tools/` already imports `@game` directly; re-exporting it from
 *               the feature would put a second door in front of the same room.
 */

export { PlayScreen, type PlayScreenProps } from './screens/PlayScreen';
