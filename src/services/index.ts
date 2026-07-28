/**
 * services/index.ts — the public surface of the I/O layer.
 *
 * Everything here touches the outside world — disk, audio hardware, the ad
 * network — and everything here is written to fail quietly, because none of it is
 * ever a good reason to interrupt a puzzle.
 *
 * `audioAssets` is deliberately not re-exported: it is the private wiring that
 * says which sound files exist, and `audio` already surfaces the one type
 * callers need from it.
 */

export * from './storage';
export * from './audio';
export * from './ads';
