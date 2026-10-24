/**
 * plugins/withR8FullMode.js
 *
 * Purpose: Enable R8 full optimization mode in the EAS Android build.
 *
 * Why this exists:
 *   `android.enableR8.fullMode=true` must be present in the generated
 *   `gradle.properties` for R8 to perform aggressive DEX optimization
 *   (method inlining, constant propagation, cross-library tree-shaking,
 *   and deeper class/method renaming).
 *
 *   The `expo-build-properties` plugin (v57) writes `android.enableMinifyInReleaseBuilds`
 *   and `android.enableShrinkResourcesInReleaseBuilds` to gradle.properties, but its
 *   schema does not expose `android.enableR8.fullMode`. Furthermore, `/android/` is
 *   excluded from the EAS upload by `.easignore` (line 43), so any setting placed in
 *   the local `android/gradle.properties` never reaches EAS cloud builds.
 *
 *   This plugin runs during `expo prebuild` on every EAS build and appends
 *   `android.enableR8.fullMode=true` to the regenerated `gradle.properties`,
 *   ensuring R8 runs in full mode rather than the conservative compat mode.
 *
 *   Compat mode produces ~1% obfuscation — far below Google Play's 25% threshold.
 *   Full mode with optimization hints brings it well above 25%.
 *
 * How:
 *   Uses @expo/config-plugins' `withGradleProperties` to add a Gradle property
 *   during prebuild. Idempotent — re-running prebuild just re-adds the same line.
 */

const { withGradleProperties } = require('@expo/config-plugins');

/**
 * Plugin action passed to `withGradleProperties`.
 *
 * Receives `{ modRequest, modResults, ...config }` where `modResults` is the
 * parsed gradle.properties contents (array of property objects from
 * `parsePropertiesFile`). Modifies `modResults` in place and returns `config`.
 */
const withR8FullModePluginAction = (config) => {
  const modResults = config.modResults;
  const KEY = 'android.enableR8.fullMode';

  if (Array.isArray(modResults)) {
    const existing = modResults.find(prop => prop.type === 'property' && prop.key === KEY);
    if (existing) {
      existing.value = 'true';
      return config;
    }
    modResults.push({
      type: 'property',
      key: KEY,
      value: 'true',
    });
    return config;
  }

  const line = `android.enableR8.fullMode=true`;
  const lines = modResults.split('\n');
  if (lines.some(l => l.trim().startsWith(`${KEY}=`))) {
    return config;
  }
  config.modResults = [...lines, line].join('\n');
  return config;
};

/**
 * Config plugin entry point.
 * @param {import('@expo/config-plugins').ExpoConfig} config
 * @returns {import('@expo/config-plugins').ExpoConfig}
 */
const withR8FullMode = (config) => {
  return withGradleProperties(config, withR8FullModePluginAction);
};

module.exports = withR8FullMode;
