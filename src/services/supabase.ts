/**
 * supabase.ts — the Supabase client, and where its credentials come from.
 *
 * Purpose:      One configured client for the whole app, or a clear `undefined` if
 *               the project has not been set up yet.
 * Responsibilities:
 *               - Read the URL and anon key from Expo config.
 *               - Persist the session in the OS keystore, not in plain storage.
 *               - Report honestly when it is not configured.
 * Notes:        **This returns `undefined` rather than throwing when unconfigured**,
 *               and every caller is expected to handle that. The game has to keep
 *               working with no backend at all — that is the state it ships in
 *               today, and a missing environment variable must never be the reason
 *               a puzzle game will not launch.
 *
 *               **The session lives in `expo-secure-store`, not AsyncStorage.** A
 *               Supabase session contains a refresh token, which is a long-lived
 *               credential: anything that can read it can act as the player
 *               indefinitely. AsyncStorage is plain, unencrypted, world-readable on
 *               a rooted device and included in some backup flows. SecureStore is
 *               backed by the Android keystore.
 *
 *               **SecureStore has a ~2048-byte limit per value and a real session
 *               does not fit.** A Google session measures about 3,200 bytes, so the
 *               adapter splits it across numbered entries and reassembles on read.
 *               This was found the hard way: the first sign-in that Supabase
 *               actually accepted then failed while being stored, and reported
 *               itself as a network error.
 */

import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Largest value SecureStore documents as safe for a single entry.
 *
 * Chunks are written well under it. The margin covers the fact that the limit is
 * on the *encrypted* value, which is longer than the plaintext measured here.
 */
const CHUNK_SIZE = 1500;

/**
 * Marks a key whose value is split across `key.0 … key.n-1`.
 *
 * A real Supabase session is about **3,200 bytes** — access token, refresh token,
 * the decoded user, and Google's own provider tokens — so it does not fit in one
 * SecureStore entry. This was originally a loud throw on the assumption that
 * sessions were "comfortably under" the limit; they are not, and the first
 * successful Google sign-in failed at the moment of storing it.
 *
 * Chunking rather than falling back to AsyncStorage, because the reason this uses
 * SecureStore at all is that a session contains a refresh token — a long-lived
 * credential that anything able to read it can use to act as the player
 * indefinitely. Storing it in plain, world-readable-on-a-rooted-device storage to
 * dodge a size limit would trade the whole point of the file for convenience.
 */
const CHUNK_MARKER = '__chunked__:';

/**
 * Credentials, read from `app.json` -> `expo.extra.supabase`.
 *
 * Config rather than a `.env` file because Expo inlines `extra` into the build, so
 * there is exactly one place to look and no chance of a value existing at build
 * time but not at runtime. The anon key is safe to ship — it is public by design and
 * carries no authority beyond what row-level security allows.
 */
function credentials(): { url: string; anonKey: string } | undefined {
  const extra = Constants.expoConfig?.extra as
    | { supabase?: { url?: string; anonKey?: string } }
    | undefined;

  const url = extra?.supabase?.url;
  const anonKey = extra?.supabase?.anonKey;
  if (!url || !anonKey) return undefined;
  if (url.includes('YOUR_') || anonKey.includes('YOUR_')) return undefined;

  return { url, anonKey };
}

/** How many chunks `key` was split into, or 0 if it is stored whole. */
function chunkCount(head: string | null): number {
  if (!head?.startsWith(CHUNK_MARKER)) return 0;
  const count = Number(head.slice(CHUNK_MARKER.length));
  return Number.isInteger(count) && count > 0 ? count : 0;
}

/** Delete every chunk belonging to `key`, given how many there were. */
async function clearChunks(key: string, count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await SecureStore.deleteItemAsync(`${key}.${i}`);
  }
}

/**
 * A SecureStore-backed storage adapter in the shape Supabase expects.
 *
 * Values that fit go in whole, so a small entry costs one read. Anything larger is
 * split, with the head entry holding the count — see `CHUNK_MARKER`. Reads and
 * writes are symmetrical, and a shrinking value cleans up the chunks it no longer
 * needs, so switching accounts cannot leave a fragment of the previous session
 * behind to be reassembled into nonsense.
 */
const secureStorage = {
  getItem: async (key: string): Promise<string | null> => {
    const head = await SecureStore.getItemAsync(key);
    const count = chunkCount(head);
    if (count === 0) return head;

    const parts: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`);
      // A missing chunk means a partial write or a partial wipe. Returning what
      // survived would hand Supabase malformed JSON; reporting nothing stored is
      // both true and recoverable — the player simply signs in again.
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join('');
  },

  setItem: async (key: string, value: string): Promise<void> => {
    // Whatever was there before may have had more chunks than this value needs.
    const previous = chunkCount(await SecureStore.getItemAsync(key));

    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      await clearChunks(key, previous);
      return;
    }

    const count = Math.ceil(value.length / CHUNK_SIZE);
    for (let i = 0; i < count; i += 1) {
      await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
    // The head is written last, so an interrupted write leaves the old value
    // readable rather than a marker pointing at chunks that do not all exist yet.
    await SecureStore.setItemAsync(key, `${CHUNK_MARKER}${count}`);
    if (previous > count) await clearChunks(key, previous);
  },

  removeItem: async (key: string): Promise<void> => {
    const count = chunkCount(await SecureStore.getItemAsync(key));
    await SecureStore.deleteItemAsync(key);
    await clearChunks(key, count);
  },
};

let client: SupabaseClient | undefined;
let attempted = false;

/**
 * The shared client, or `undefined` when Supabase is not configured.
 *
 * Created lazily and once. Callers must handle `undefined` — see the note above.
 */
export function supabase(): SupabaseClient | undefined {
  if (attempted) return client;
  attempted = true;

  const config = credentials();
  if (!config) return undefined;

  client = createClient(config.url, config.anonKey, {
    auth: {
      storage: secureStorage,
      autoRefreshToken: true,
      persistSession: true,
      // The OAuth redirect is handled explicitly by `auth.ts`, so the client must
      // not try to parse a URL it will never see.
      detectSessionInUrl: false,
    },
  });
  return client;
}

/** Whether a backend exists at all. Screens use this to explain themselves. */
export function isBackendConfigured(): boolean {
  return credentials() !== undefined;
}
