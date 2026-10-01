/**
 * audioFades.ts — the music volume ramp.
 *
 * Purpose:      Move a voice from wherever its volume is to a target, in steps, so
 *               that no single step is audible as a step.
 * Responsibilities:
 *               - Own `FADE_MS` and `FADE_STEP_MS`.
 *               - Own the interval that drives the ramp, and the slot a new fade
 *                 writes over so it can cancel the one already in flight.
 *               - Own `clamp01`, which the ramp needs and which the volume
 *                 helpers in `audio.ts` also use. It lives here rather than there
 *                 because `audio.ts` imports this file: keeping it on this side is
 *                 what stops the two from importing each other.
 * Notes:        **The ramp is open loop** — defect A-4 in `implementation.md`. It
 *               advances a fixed `delta` per `setInterval(FADE_STEP_MS)` instead
 *               of measuring elapsed time, so a busy JS thread stretches the
 *               600ms fade past 600ms. That is recorded as debt and deliberately
 *               *not* fixed: this is an extraction, and changing the timing while
 *               moving the code would make the move impossible to verify.
 *
 *               Exactly two things changed on the way out of `audio.ts`, and only
 *               two: the parameter widened from `MusicVoice` to `FadableVoice`, so
 *               this file need not import the type back out of its own caller, and
 *               `clamp01` travelled with it. Every number, branch and timer is
 *               what it was.
 */

import type { AudioPlayer } from 'expo-audio';

/** How long a fade takes, and how often the ramp is stepped. */
const FADE_MS = 600;
const FADE_STEP_MS = 40;

/** Keep a value inside the range a volume is allowed to occupy. */
export const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/**
 * The part of a voice the ramp touches.
 *
 * Structural rather than `MusicVoice`, and on purpose: the ramp needs a volume
 * and a timer slot and nothing else, so it has no reason to know which track is
 * playing. That is what keeps this file free of any import from `audio.ts`, which
 * imports *it*.
 */
export interface FadableVoice {
  /** Timer driving the current fade, so a new fade can cancel it. */
  fade?: ReturnType<typeof setInterval> | undefined;
  /** Only `volume` is ever read or written; the rest of the player is the caller's. */
  readonly player: Pick<AudioPlayer, 'volume'>;
}

/** Ramp a voice to a target volume, then optionally dispose of it. */
export function fadeTo(voice: FadableVoice, target: number, onDone?: () => void): void {
  if (voice.fade) clearInterval(voice.fade);

  let current: number;
  try {
    current = voice.player.volume;
  } catch {
    current = target;
  }

  const steps = Math.max(1, Math.round(FADE_MS / FADE_STEP_MS));
  const delta = (target - current) / steps;
  let remaining = steps;

  voice.fade = setInterval(() => {
    remaining -= 1;
    current = remaining <= 0 ? target : current + delta;
    try {
      voice.player.volume = clamp01(current);
    } catch {
      remaining = 0;
    }
    if (remaining <= 0) {
      if (voice.fade) clearInterval(voice.fade);
      voice.fade = undefined;
      onDone?.();
    }
  }, FADE_STEP_MS);
}
