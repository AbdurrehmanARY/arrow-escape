/**
 * plugins/withStandaloneDebugBundling.js
 *
 * Purpose: Make the **debug** Android build embed its JavaScript bundle, so the
 *          APK runs standalone with no Metro development server required.
 *
 * Why this exists:
 *   By default, `@react-native/gradle-plugin` treats the `debug` variant as a
 *   dev build and SKIPS bundling `index.android.bundle`, expecting JS to be
 *   served by `npx expo start`. An APK handed to a tester therefore opens on a
 *   "Start local development server / fetch development server" screen — the
 *   exact confusion this plugin removes.
 *
 * How:
 *   Sets `debuggableVariants = []` in `android/app/build.gradle` during every
 *   `expo prebuild` (local) and every EAS cloud build, since the android folder
 *   is regenerated from scratch in both. Because the variant is no longer
 *   flagged debuggable, the React Native Gradle plugin bundles the JS into the
 *   APK exactly as it does for release.
 *
 *   Test ads are NOT driven by the Gradle "debuggable" flag. React Native's
 *   Gradle plugin bundles every non-debuggable variant with `--dev false`
 *   (`TaskConfiguration.kt` → `task.devEnabled.set(false)`), so `__DEV__` is
 *   `false` inside this APK. `src/config/index.ts` therefore reads the opt-in
 *   `EXPO_PUBLIC_USE_TEST_ADS=true` override (kept in gitignored `.env.local`)
 *   to select Google's test ad units for local tester builds.
 */

const { withAppBuildGradle, withProjectBuildGradle } = require('@expo/config-plugins');

/** The line we want present in the generated `android/app/build.gradle`. */
const ACTIVE_LINE = 'debuggableVariants = []';

/** Commented default line emitted by the Expo prebuild template. */
const TEMPLATE_COMMENT = '// debuggableVariants = ["liteDebug", "prodDebug"]';

/** Marker block inserted by this plugin, for idempotency. */
const MARKER = '/* ArrowPuzzle: standalone debug build — bundle JS into the APK */';

// Kotlin Gradle Plugin version pinned to avoid Internal Compiler Error (ICE)
// in react-native-safe-area-context during debug builds.
const KGP_VERSION = "'org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.20'";
const KGP_MARKER = '/* ArrowPath: pin Kotlin Gradle Plugin */';

function withStandaloneDebugBundling(config) {
  return withAppBuildGradle(config, (config) => {
    const contents = config.modResults.contents;

    // Already patched? Nothing to do — keeps `expo prebuild` idempotent.
    if (contents.includes(`${MARKER}\n${ACTIVE_LINE}`) || contents.includes(`${MARKER}\r\n${ACTIVE_LINE}`)) {
      return config;
    }

    // A previously active (uncommented) line may exist from a manual edit or a
    // prior patch; normalise it rather than stacking duplicates.
    let next = contents;
    const activeLineRe = /^[ \t]*debuggableVariants\s*=\s*\[[^\]]*\][ \t]*$/gm;
    if (activeLineRe.test(contents)) {
      next = contents.replace(activeLineRe, `${MARKER}\n    ${ACTIVE_LINE}`);
      config.modResults.contents = next;
      return config;
    }

    // Preferred path: replace the template's commented default.
    if (next.includes(TEMPLATE_COMMENT)) {
      next = next.replace(
        TEMPLATE_COMMENT,
        `${MARKER}\n    ${ACTIVE_LINE}`,
      );
      config.modResults.contents = next;
      return config;
    }

    // Fallback: insert after the `/* Variants */` header inside the react block.
    if (next.includes('/* Variants */')) {
      next = next.replace(
        '/* Variants */',
        `/* Variants */\n    ${MARKER}\n    ${ACTIVE_LINE}\n`,
      );
      config.modResults.contents = next;
      return config;
    }

    // Last resort: append inside the closing of the react block.
    next = next.replace(
      /react\s*\{/,
      `react {\n    ${MARKER}\n    ${ACTIVE_LINE}`,
    );
    config.modResults.contents = next;
    return config;
  });
}

module.exports = withStandaloneDebugBundling;

/**
 * Pin the Kotlin Gradle Plugin version in the root `android/build.gradle`.
 *
 * Why: `expo-build-properties` sets `kotlinVersion: "2.1.20"` for the Kotlin
 * Gradle plugin in the app module, but the *root* buildscript classpath can
 * still resolve to a mismatched versionless artifact, causing a Kotlin
 * "Internal compiler error" in react-native-safe-area-context.
 *
 * Prebuild regenerates the root build.gradle from the template, so we must
 * inject our pin during every `expo prebuild` — this plugin does that.
 */
function withRootKotlinPin(config) {
  return withProjectBuildGradle(config, (config) => {
    const contents = config.modResults.contents;

    // Already patched? Nothing to do.
    if (contents.includes(KGP_MARKER)) {
      return config;
    }

    // Replace the versionless kotlin-gradle-plugin line with our pinned version.
    const pinned = `${KGP_MARKER}\n    classpath(${KGP_VERSION})`;
    const next = contents.replace(
      /classpath\(['"]org\.jetbrains\.kotlin:kotlin-gradle-plugin['"]\)/,
      pinned,
    );

    config.modResults.contents = next;
    return config;
  });
}

// Extend the exported plugin to also patch the root build.gradle.
module.exports = (config) => {
  config = withRootKotlinPin(config);
  return withStandaloneDebugBundling(config);
};
