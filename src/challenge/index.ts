/**
 * challenge/index.ts — the public face of Challenge Mode's domain layer.
 *
 * Everything here is pure: dates in, levels and numbers out. No React, no storage,
 * no network. The store and the screens sit above it, and a future server sits
 * beside it computing the same answers from the same rules.
 *
 * `monthlyTrophies` is exported here rather than reached for by path. It was
 * omitted, which left `MonthlyTrophyBadge` importing `@challenge/monthlyTrophies`
 * directly — a barrel that omits a module forces its consumers to break the rule
 * it exists to enforce. A layer with no complete public surface has no surface
 * at all.
 */

export * from './rewards';
export * from './schedule';
export * from './stats';
export * from './types';
export * from './monthlyTrophies';
