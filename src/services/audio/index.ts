/**
 * audio/index.ts — the public surface of the audio service.
 *
 * Purpose:      One import path for every sound the game plays, so screens say
 *               `@services/audio` and never reach for the asset registry or the
 *               fade ramp directly.
 * Responsibilities:
 *               - Re-export the player surface (`playSfx`, `playMusic`, settings).
 * Notes:        **Phase 14 moved three files into this folder** — `audio.ts`,
 *               `audioAssets.ts` and `audioFades.ts`. They were three cohesive
 *               files already, and this is deliberately *only* a folder around
 *               them: nothing was merged and nothing was invented. There is no
 *               `music.ts` or `sfx.ts` here, and adding one would be churn —
 *               music is two functions in `audio.ts` and sfx is a name union.
 *
 *               `audioAssets` is NOT re-exported. It is the private wiring that
 *               says which sound files exist, and callers need only the `SfxName`
 *               vocabulary, which `audio` re-exports. `audioFades` is likewise
 *               internal: the ramp is driven by `audio`, not by callers.
 */

export * from './audio';
