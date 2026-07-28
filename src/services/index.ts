/**
 * services/index.ts — the public surface of the I/O layer.
 *
 * Everything here touches the outside world — disk, audio hardware, the ad
 * network — and everything here is written to fail quietly, because none of it is
 * ever a good reason to interrupt a puzzle.
 */

export * from './storage';
export * from './audioAssets';
export * from './audio';
export * from './ads';
