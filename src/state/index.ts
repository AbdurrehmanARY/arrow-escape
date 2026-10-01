/**
 * state/index.ts — the public surface of the state layer.
 *
 * Screens import from `@state`; nothing reaches into a store file directly.
 *
 * Every store is exported. A store that is missing from this barrel is a store
 * the public surface lies about, and the only escape is a deep import that
 * contradicts this file.
 */

export * from './gameReducer';
export * from './progressStore';
export * from './settingsStore';
export * from './hintStore';
export * from './onboardingStore';
export * from './challengeStore';
export * from './authStore';
export * from './leagueStore';
export * from './streakStore';
export * from './energyStore';
