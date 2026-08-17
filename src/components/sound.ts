/**
 * sound.ts — the glue between a tap and a sound.
 *
 * Purpose:      Let a button make a noise without every button in the app having
 *               to remember to.
 * Responsibilities:
 *               - `withClick`     — wrap a press handler so it clicks first.
 *               - `useSheetSound` — play open/close as a modal comes and goes.
 * Notes:        These exist so the wiring lives in the **shared primitives**
 *               (`PillButton`, `IconButton`, `Action`) rather than at sixty call
 *               sites. A screen that uses the standard button gets the standard
 *               sound; a screen that rolls its own Pressable opts in explicitly.
 *               The alternative — a `playSfx` next to every `onPress` — is a rule
 *               nobody can enforce and every new screen would quietly break.
 *
 *               **Sound is fired before the handler, not after.** A handler that
 *               navigates can unmount the caller mid-call, and a sound queued after
 *               it may never be reached. Firing first also matches what the ear
 *               expects: the click belongs to the finger, not to the outcome.
 *
 *               Nothing here checks whether audio is enabled. `playSfx` is already
 *               a no-op when effects are muted or the asset is missing, and
 *               duplicating that decision is how the two get out of step.
 */

import { useEffect, useRef } from 'react';

import { playSfx, type SfxName } from '@services/audio';

/**
 * Wrap a press handler so it plays a sound.
 *
 * Returns a new function every call, which is deliberate and harmless: it is used
 * *inside* a component's render to build the `onPress` it hands to `Pressable`, so
 * it never becomes a prop that could defeat a `memo` on something else.
 *
 * `handler` is optional so a disabled or absent action still gets a valid callback
 * rather than needing a conditional at the call site.
 */
export function withClick<A extends unknown[]>(
  handler: ((...args: A) => void) | undefined,
  name: SfxName = 'buttonClick',
): (...args: A) => void {
  return (...args: A) => {
    playSfx(name);
    handler?.(...args);
  };
}

/**
 * Play `popupOpen` and `popupClose` as `visible` changes.
 *
 * Keyed on the *transition*, never on the value, so a re-render while a sheet is
 * open does not re-fire it — and a sheet that mounts already visible stays silent,
 * because arriving on a screen is not the same event as a dialog opening.
 *
 * `enabled` exists for the overlays that already have a voice of their own: the win
 * and fail sheets are announced by `levelComplete` and `outOfHearts`, and a generic
 * popup sound underneath those is clutter dressed as polish.
 */
export function useSheetSound(visible: boolean, enabled = true): void {
  const previous = useRef(visible);

  useEffect(() => {
    if (previous.current === visible) return;
    previous.current = visible;
    if (!enabled) return;
    playSfx(visible ? 'popupOpen' : 'popupClose');
  }, [visible, enabled]);
}
