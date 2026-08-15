/**
 * challenge/index.ts — the public face of Challenge Mode's domain layer.
 *
 * Everything here is pure: dates in, levels and numbers out. No React, no storage,
 * no network. The store and the screens sit above it, and a future server sits
 * beside it computing the same answers from the same rules.
 */

export * from './rewards';
export * from './schedule';
export * from './stats';
export * from './types';
