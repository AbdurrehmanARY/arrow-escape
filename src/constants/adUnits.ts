/**
 * src/constants/adUnits.ts
 *
 * Purpose:      Single source of truth for AdMob ad unit IDs (Android-only).
 *               Real production IDs are defined here. No env vars.
 *               The game always serves production ads in all build modes.
 *
 * Responsibilities:
 *   - Never put the App ID ("~" format) here — that goes in app.json plugin config.
 *   - Only ad unit IDs ("/" format) go here.
 *   - Android-only build; no iOS configuration.
 *   - Production ad unit IDs are used in all builds.
 *
 * Notes:        TestIds are not used — the game always serves real production
 *               AdMob unit IDs.
 */

export const AD_UNITS = {
  banner: "ca-app-pub-7288667796446979/7582088414",

  interstitial: "ca-app-pub-7288667796446979/1736619388",

  rewarded: "ca-app-pub-7288667796446979/9116203924",
} as const;
