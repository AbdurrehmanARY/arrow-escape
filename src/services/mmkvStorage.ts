/**
 * mmkvStorage.ts — asynchronous wrapper over react-native-mmkv.
 *
 * Provides an AsyncStorage-compatible interface over synchronous MMKV storage.
 * This enables gradual migration from AsyncStorage to MMKV without changing
 * the call sites. All methods return Promises for API compatibility.
 */

import { MMKV } from 'react-native-mmkv';

const storage = new MMKV({
  id: 'arrowpuzzle-storage',
  encryptionKey: 'arrowpuzzle-secure-key',
});

/**
 * MMKV storage wrapper with AsyncStorage-compatible async interface.
 * All methods return Promises for API compatibility with existing AsyncStorage usage.
 */
export const mmkvStorage = {
  /**
   * Get a string value by key.
   * @param key - The key to retrieve
   * @returns The string value or null if not found
   */
  getItem: async (key: string): Promise<string | null> => {
    const value = storage.getString(key);
    return value ?? null;
  },

  /**
   * Set a string value for a key.
   * @param key - The key to set
   * @param value - The string value to store
   * @returns true if successful
   */
  setItem: async (key: string, value: string): Promise<void> => {
    storage.set(key, value);
  },

  /**
   * Remove a key from storage.
   * @param key - The key to remove
   * @returns true if the key was removed
   */
  removeItem: async (key: string): Promise<void> => {
    storage.delete(key);
  },

  /**
   * Get all keys in storage.
   * @returns Array of all keys
   */
  getAllKeys: async (): Promise<readonly string[]> => {
    return storage.getAllKeys();
  },

  /**
   * Get multiple items by keys.
   * @param keys - Array of keys to retrieve
   * @returns Array of [key, value] pairs
   */
  multiGet: async (keys: string[]): Promise<[string, string | null][]> => {
    return keys.map((k) => [k, storage.getString(k) ?? null]);
  },

  /**
   * Set multiple key-value pairs.
   * @param kvArray - Array of [key, value] pairs
   */
  multiSet: async (kvArray: readonly [string, string][]): Promise<void> => {
    kvArray.forEach(([k, v]) => storage.set(k, v));
  },

  /**
   * Remove multiple keys.
   * @param keys - Array of keys to remove
   */
  multiRemove: async (keys: string[]): Promise<void> => {
    keys.forEach((k) => storage.delete(k));
  },

  /**
   * Clear all storage.
   */
  clearAll: async (): Promise<void> => {
    storage.clearAll();
  },

  /**
   * Get the underlying MMKV instance for advanced usage.
   * @internal
   */
  _getInstance: () => storage,
};

/**
 * Check if MMKV storage is available.
 * Always returns true since MMKV is bundled with the app.
 */
export const hasNativeStorage = (): boolean => true;

/**
 * Get the underlying MMKV instance for direct access when needed.
 * @returns The MMKV instance
 */
export const getMMKVInstance = (): MMKV => storage;