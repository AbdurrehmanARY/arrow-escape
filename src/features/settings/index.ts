/**
 * features/settings/index.ts — the public surface of the settings feature.
 *
 * Purpose:      Re-export the hooks this feature owns so callers import
 *               `@features/settings` (a single, stable surface) instead of
 *               reaching into the feature's sub-folders.
 * Notes:        A barrel is *required* here, not a convenience. The rules do not
 *               exempt 'features' from the barrel rule (DEEP_IMPORT_ALLOWED holds
 *               only game/services/shared/infrastructure — shared and
 *               infrastructure are exempt because they are sub-rooted and have
 *               no barrel of their own). A deep `@features/settings/hooks/*`
 *               import from outside the feature is therefore a violation, while
 *               the bare `@features/settings` path is legal. Keep this thin:
 *               re-export only, never import platform APIs here.
 */

export * from './hooks/useThemeAssets';
