/**
 * Babel configuration.
 *
 * `react-native-worklets/plugin` is what compiles Reanimated worklets so release
 * animations run on the UI thread instead of the JS thread. Reanimated 4 moved
 * the plugin out into the worklets package; without it, every animation silently
 * falls back to the JS thread and stutters under load.
 *
 * It must stay last in the plugin list.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-worklets/plugin'],
  };
};
