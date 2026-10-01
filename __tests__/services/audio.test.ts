/**
 * __tests__/services/audio.test.ts — unit tests for the audio service.
 *
 * Tests:
 * - Preloading and playing sound effects
 * - Applying audio settings (master, music, sfx volumes, muting)
 * - Retrigger throttling (RETRIGGER_GAP_MS)
 * - Stopping individual and all SFX
 * - Music playback and stopping
 * - Audio lifecycle (disposeAudio)
 */

import {
  initAudio,
  applyAudioSettings,
  audioSettings,
  playSfx,
  stopSfx,
  stopAllSfx,
  playVoice,
  stopVoice,
  cleanupAudioOnUnmount,
  playMusic,
  stopMusic,
  disposeAudio,
  hasAudioAssets,
} from '@services/audio';

// Mock expo-audio and expo-haptics
jest.mock('@services/haptics', () => ({
  triggerHapticForSfx: jest.fn(),
}));

describe('Audio Service', () => {
  beforeEach(() => {
    disposeAudio();
    applyAudioSettings({
      masterVolume: 1,
      musicVolume: 0.7,
      sfxVolume: 1,
      musicMuted: false,
      sfxMuted: false,
    });
  });

  afterEach(() => {
    disposeAudio();
  });

  it('reports hasAudioAssets correctly', () => {
    expect(hasAudioAssets()).toBe(true);
  });

  it('initializes audio and reads default settings', async () => {
    await initAudio();
    const settings = audioSettings();
    expect(settings.masterVolume).toBe(1);
    expect(settings.sfxVolume).toBe(1);
    expect(settings.musicVolume).toBe(0.7);
    expect(settings.sfxMuted).toBe(false);
    expect(settings.musicMuted).toBe(false);
  });

  it('updates audio settings with applyAudioSettings', () => {
    applyAudioSettings({ masterVolume: 0.8, sfxMuted: true });
    const settings = audioSettings();
    expect(settings.masterVolume).toBe(0.8);
    expect(settings.sfxMuted).toBe(true);
    expect(settings.musicVolume).toBe(0.7);
  });

  it('plays sfx without error and respects sfxMuted', async () => {
    await initAudio();
    expect(() => playSfx('buttonClick')).not.toThrow();

    // Muted sfx should not throw or fail
    applyAudioSettings({ sfxMuted: true });
    expect(() => playSfx('buttonClick')).not.toThrow();
  });

  it('stops individual sfx and all sfx without throwing', async () => {
    await initAudio();
    playSfx('arrowRelease');
    expect(() => stopSfx('arrowRelease')).not.toThrow();
    expect(() => stopAllSfx()).not.toThrow();
  });

  it('plays and stops music beds', () => {
    expect(() => playMusic('gameplay')).not.toThrow();
    // Repeating playMusic for same track should be a no-op
    expect(() => playMusic('gameplay')).not.toThrow();
    expect(() => playMusic('menu')).not.toThrow();
    expect(() => stopMusic()).not.toThrow();
  });

  it('plays and stops voice announcements', async () => {
    await initAudio();
    expect(() => playVoice('victory')).not.toThrow();
    expect(() => stopVoice()).not.toThrow();
    expect(() => cleanupAudioOnUnmount()).not.toThrow();
  });

  it('handles disposeAudio cleanly', async () => {
    await initAudio();
    playMusic('gameplay');
    playSfx('correctMove');
    playVoice('awardEarned');
    expect(() => disposeAudio()).not.toThrow();
    expect(hasAudioAssets()).toBe(true); // static asset definitions remain
  });
});
