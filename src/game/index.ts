/**
 * index.ts — the public face of the rules engine.
 *
 * Purpose:      One import path for everything outside `game/`. Screens, the
 *               reducer, and the off-device tooling all import from `@game`, so
 *               internal files can be split or renamed without a wide refactor.
 * Notes:        Nothing above this layer should ever import a `game/` file
 *               directly. If something is not re-exported here, it is internal.
 *               `diagnostics` is deliberately NOT re-exported — it is a developer
 *               smoke test for Hermes and must never be pulled into a production
 *               screen by accident. `@game/diagnostics` in a test is the one
 *               sanctioned deep import in the repo.
 */

export * from './types';
export * from './board';
export * from './rules';
export * from './solver';
export * from './hints';
export * from './ascii';
// `codec` lives here so the 13 consumers of `@game/codec` can import the tier
// vocabulary and the on-disk format from one place. It is a type-and-function
// surface only and pulls in nothing.
export * from './codec';
