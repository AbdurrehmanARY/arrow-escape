/**
 * Jest setup.
 *
 * AsyncStorage is a native module, so under Jest it resolves to null and any test
 * that touches persistence dies on import. The package ships an official in-memory
 * mock for exactly this — using it means the storage tests exercise the real
 * envelope logic (versioning, corruption fallback, key namespacing) against a
 * faithful backend, rather than against a stub written here that could drift from
 * how AsyncStorage actually behaves.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

/**
 * `expo-audio` cannot be imported under Jest at all.
 *
 * It reaches for a native class at module scope (`ExpoAudio.ts` reads `.prototype`
 * off something that does not exist off-device) and throws before any test body
 * runs. That was harmless while audio was confined to screens, and stopped being
 * harmless the moment `withClick` put `playSfx` underneath every shared button —
 * one import now reaches `Hud`, `Screen`, `Overlays` and anything that renders
 * them, so a renderer test dies on an import it never asked for.
 *
 * Unlike Skia (decision 103) the answer is not to extract the logic: there is no
 * logic here to extract. `services/audio.ts` is a thin wrapper whose entire job is
 * to talk to this module, so the module is what gets replaced.
 *
 * Deliberately not `jest.fn()`s: a shared spy that survives between suites is a
 * cross-test dependency waiting to happen. Tests that care what was played mock
 * `@services/audio` themselves and assert against their own spy — see
 * `__tests__/components/sound.test.tsx`.
 */
jest.mock('expo-audio', () => ({
  createAudioPlayer: () => ({
    volume: 0,
    loop: false,
    play() {},
    pause() {},
    remove() {},
    seekTo() {},
  }),
  setAudioModeAsync: () => Promise.resolve(),
}));
