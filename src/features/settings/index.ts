/**
 * features/settings/index.ts — the public surface of the settings feature.
 *
 * Purpose:      Re-export the hooks and screens this feature owns so callers import
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
 *
 *               **This barrel is also the sanctioned edge.** Home and League both
 *               read `useThemeAssets` from here, which the sibling-feature ban
 *               forbids; those two importers are named by
 *               SANCTIONED_FEATURE_IMPORTS in tools/check-architecture.ts, and an
 *               architecture test asserts that a third feature still cannot reach
 *               in. When the settings *store* leaves this feature — which is what
 *               has to happen before the hook can — that entry becomes deletable,
 *               and this barrel goes back to being ordinary.
 */

export * from './hooks/useThemeAssets';
export * from './screens/LegalDocumentScreen';
export * from './screens/PrivacyPolicyScreen';
export * from './screens/SettingsScreen';
export * from './screens/TermsAndConditionsScreen';

