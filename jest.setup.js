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
