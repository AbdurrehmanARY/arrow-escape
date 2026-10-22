/**
 * authStore.test.ts — the delete-account contract.
 *
 * Why: the in-app Privacy Policy promises a real in-app account deletion, and
 * `AccountScreen` only clears the local session when the service returns `true`.
 * This locks that promise: a confirmed deletion clears the session, and a failed
 * deletion leaves the signed-in state exactly as it was.
 *
 * The real `@services/auth` touches native Google sign-in; mocking it at the
 * module level lets this test run off-device and without a device.
 */
import { useAuthStore } from '../../src/state/authStore';
import { deleteAccount as requestDeletion } from '@services/auth';
import type { Session } from '@supabase/supabase-js';

jest.mock('@services/auth', () => ({
  configureGoogleSignIn: jest.fn(),
  deleteAccount: jest.fn(),
  isGoogleConfigured: jest.fn(() => true),
  restoreGoogleSession: jest.fn(),
  signInWithGoogle: jest.fn(),
  signOut: jest.fn(),
}));
jest.mock('@services/supabase', () => ({
  supabase: jest.fn(),
  isBackendConfigured: jest.fn(() => true),
}));
jest.mock('@services/sync', () => ({
  syncProfile: jest.fn(),
  syncProgress: jest.fn(),
  syncChallenges: jest.fn(),
  syncLeague: jest.fn(),
}));

const requestDeletionMock = requestDeletion as unknown as jest.Mock;

const SESSION = { user: { email: 'test@example.com' } } as unknown as Session;

describe('authStore.deleteAccount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({
      session: SESSION,
      busy: false,
      failure: undefined,
      failureDetail: undefined,
      hydrated: true,
      syncedAt: 123,
    });
  });

  it('clears the session when the backend confirms deletion', async () => {
    requestDeletionMock.mockResolvedValue(true);

    const done = await useAuthStore.getState().deleteAccount();

    expect(done).toBe(true);
    expect(requestDeletion).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().session).toBeUndefined();
    expect(useAuthStore.getState().syncedAt).toBeUndefined();
  });

  it('leaves the session intact when the backend rejects deletion', async () => {
    requestDeletionMock.mockResolvedValue(false);

    const done = await useAuthStore.getState().deleteAccount();

    expect(done).toBe(false);
    expect(useAuthStore.getState().session).toBe(SESSION);
    expect(useAuthStore.getState().syncedAt).toBe(123);
  });

  it('returns the backend verdict unchanged', async () => {
    // The store is a thin delegate: it returns exactly what the service says,
    // and does not retry or invent a result of its own.
    requestDeletionMock.mockResolvedValue(true);
    await expect(useAuthStore.getState().deleteAccount()).resolves.toBe(true);

    requestDeletionMock.mockResolvedValue(false);
    await expect(useAuthStore.getState().deleteAccount()).resolves.toBe(false);
  });
});
