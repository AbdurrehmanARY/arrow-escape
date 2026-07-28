/**
 * index.ts — the public face of the rules engine.
 *
 * Purpose:      One import path for everything outside `game/`. Screens, the
 *               reducer, and the off-device tooling all import from `@game`, so
 *               internal files can be split or renamed without a wide refactor.
 * Notes:        Nothing above this layer should ever import a `game/` file
 *               directly. If something is not re-exported here, it is internal.
 */

export * from './types';
export * from './board';
export * from './rules';
export * from './solver';
export * from './hints';
export * from './ascii';
