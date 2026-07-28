/**
 * The save envelope.
 *
 * Every one of these is about the same promise: **a bad save must never stop the
 * app opening.** Losing progress is bad; an app that will not launch is worse and
 * cannot be recovered from without a reinstall. So corruption, a partial write, a
 * save from a future build, and a storage backend that throws all resolve to the
 * same safe answer — start fresh.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearAll, loadSlice, SAVE_VERSION, saveSlice, STORAGE_KEYS } from '@services/storage';

interface Fixture {
  value: number;
  label: string;
}

const FALLBACK: Fixture = { value: 0, label: 'fresh' };
const KEY = 'testslice';
const FULL_KEY = `arrowpath:v1:${KEY}`;

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

describe('round trip', () => {
  it('reads back exactly what was written', async () => {
    const data: Fixture = { value: 42, label: 'saved' };
    await saveSlice(KEY, data);
    await expect(loadSlice<Fixture>(KEY, FALLBACK)).resolves.toEqual(data);
  });

  it('wraps the payload in a versioned envelope', async () => {
    await saveSlice(KEY, { value: 1, label: 'x' });
    const raw = await AsyncStorage.getItem(FULL_KEY);
    expect(JSON.parse(raw!)).toEqual({
      version: SAVE_VERSION,
      data: { value: 1, label: 'x' },
    });
  });

  it('namespaces its keys so it never collides with another library', async () => {
    await saveSlice(KEY, FALLBACK);
    const keys = await AsyncStorage.getAllKeys();
    expect(keys).toContain(FULL_KEY);
  });
});

describe('falling back safely', () => {
  it('returns the fallback when nothing has been saved', async () => {
    await expect(loadSlice<Fixture>(KEY, FALLBACK)).resolves.toEqual(FALLBACK);
  });

  it('survives a value that is not JSON at all', async () => {
    await AsyncStorage.setItem(FULL_KEY, '{ this is not json');
    await expect(loadSlice<Fixture>(KEY, FALLBACK)).resolves.toEqual(FALLBACK);
  });

  it('survives a half-written envelope', async () => {
    await AsyncStorage.setItem(FULL_KEY, JSON.stringify({ data: { value: 9 } }));
    await expect(loadSlice<Fixture>(KEY, FALLBACK)).resolves.toEqual(FALLBACK);
  });

  it('survives a JSON value that is not an object', async () => {
    await AsyncStorage.setItem(FULL_KEY, '"just a string"');
    await expect(loadSlice<Fixture>(KEY, FALLBACK)).resolves.toEqual(FALLBACK);
  });

  it('refuses a save from a newer build rather than guessing at it', async () => {
    // Downgrading is rare but real, and a future schema cannot be interpreted by
    // this build. Guessing risks corrupting it further on the next write.
    await AsyncStorage.setItem(
      FULL_KEY,
      JSON.stringify({ version: SAVE_VERSION + 5, data: { value: 7, label: 'future' } }),
    );
    await expect(loadSlice<Fixture>(KEY, FALLBACK)).resolves.toEqual(FALLBACK);
  });

  it('does not throw when the storage backend itself fails', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk gone'));
    await expect(loadSlice<Fixture>(KEY, FALLBACK)).resolves.toEqual(FALLBACK);
  });

  it('swallows a failed write, because a save must never interrupt play', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
    await expect(saveSlice(KEY, FALLBACK)).resolves.toBeUndefined();
  });
});

describe('migration', () => {
  it('hands an older save to the migrator', async () => {
    await AsyncStorage.setItem(
      FULL_KEY,
      JSON.stringify({ version: SAVE_VERSION - 1, data: { legacy: 3 } }),
    );

    const migrate = jest.fn((_version: number, data: unknown): Fixture => ({
      value: (data as { legacy: number }).legacy,
      label: 'migrated',
    }));

    await expect(loadSlice<Fixture>(KEY, FALLBACK, migrate)).resolves.toEqual({
      value: 3,
      label: 'migrated',
    });
    expect(migrate).toHaveBeenCalledWith(SAVE_VERSION - 1, { legacy: 3 });
  });

  it('falls back when a migration declines to handle the shape', async () => {
    await AsyncStorage.setItem(
      FULL_KEY,
      JSON.stringify({ version: SAVE_VERSION - 1, data: { nonsense: true } }),
    );
    await expect(
      loadSlice<Fixture>(KEY, FALLBACK, () => undefined),
    ).resolves.toEqual(FALLBACK);
  });

  it('falls back when an old save exists and no migrator was supplied', async () => {
    await AsyncStorage.setItem(
      FULL_KEY,
      JSON.stringify({ version: SAVE_VERSION - 1, data: { legacy: 1 } }),
    );
    await expect(loadSlice<Fixture>(KEY, FALLBACK)).resolves.toEqual(FALLBACK);
  });
});

describe('clearAll', () => {
  it('removes this app data and leaves everything else alone', async () => {
    await saveSlice(STORAGE_KEYS.progress, { a: 1 });
    await saveSlice(STORAGE_KEYS.settings, { b: 2 });
    await AsyncStorage.setItem('someone-elses-key', 'keep me');

    await clearAll();

    const keys = await AsyncStorage.getAllKeys();
    expect(keys).toEqual(['someone-elses-key']);
  });

  it('does not throw when there is nothing to clear', async () => {
    await expect(clearAll()).resolves.toBeUndefined();
  });
});
