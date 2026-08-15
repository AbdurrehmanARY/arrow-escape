/**
 * authStore.ts — who is signed in, if anyone.
 *
 * Purpose:      One place the whole app can ask "is there an account?", and the
 *               only place the sign-in flow is driven from.
 * Notes:        **Signed out is a first-class state, not an error.** The game is
 *               fully playable with no account and ships that way; an account adds
 *               sync and leagues and takes nothing away. Every field here is
 *               meaningful when `session` is undefined.
 *
 *               The session itself is persisted by the Supabase client into the OS
 *               keystore — this store deliberately holds no token and writes
 *               nothing to disk. Its whole job is to mirror the client's state into
 *               React so screens can re-render.
 */

import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';

import {
  configureGoogleSignIn,
  deleteAccount as requestDeletion,
  isGoogleConfigured,
  restoreGoogleSession,
  signInWithGoogle,
  signOut as endSession,
  type AuthFailure,
} from '@services/auth';
import { isBackendConfigured } from '@services/supabase';
import { useChallengeStore } from './challengeStore';
import { useLeagueStore } from './leagueStore';
import { useProgressStore } from './progressStore';

interface AuthState {
  /** Undefined when signed out. */
  readonly session: Session | undefined;
  /** True while a sign-in round trip is in flight, for the spinner. */
  readonly busy: boolean;
  /** Why the last attempt failed, cleared on the next one. */
  readonly failure: AuthFailure | undefined;
  /**
   * The provider's own words for the last failure.
   *
   * Kept because `failure` is a category and categories lose the cause: "rejected"
   * covers a client id of the wrong type, a provider that is switched off, and an
   * id missing from the Authorized Client IDs list — three different problems with
   * three different fixes and one message. Shown under the friendly line rather
   * than instead of it.
   */
  readonly failureDetail: string | undefined;
  /** False until the stored session has been read once. */
  readonly hydrated: boolean;
  /** When the session was last confirmed with the backend, epoch ms. */
  readonly syncedAt: number | undefined;

  hydrate: () => Promise<void>;
  signIn: () => Promise<boolean>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<boolean>;
}

/**
 * Merge every synced slice, in no particular order.
 *
 * A free function rather than a store action because it spans three stores and
 * belongs to none of them. Each half is independently safe to fail, so they run
 * together and nothing is thrown away if one of them cannot reach the network.
 */
export async function syncEverything(): Promise<void> {
  await Promise.allSettled([
    useProgressStore.getState().pullAndPush(),
    useChallengeStore.getState().pullAndPush(),
    useLeagueStore.getState().pushWeek(Date.now()),
  ]);
}

export const useAuthStore = create<AuthState>((set) => ({
  session: undefined,
  busy: false,
  failure: undefined,
  failureDetail: undefined,
  hydrated: false,
  syncedAt: undefined,

  hydrate: async () => {
    // No backend configured is a perfectly good end state: hydrated, signed out,
    // no failure to report. The player is not being told anything went wrong,
    // because nothing did.
    if (!isBackendConfigured() || !isGoogleConfigured()) {
      set({ hydrated: true });
      return;
    }

    // Prepare the native module before anything can tap the button, so the first
    // press opens the sheet rather than waiting on configuration.
    configureGoogleSignIn();

    // Silent restore: a returning player should simply *be* signed in. This shows
    // no UI and resolves to undefined when there is nothing saved, which is the
    // normal case rather than a failure.
    const session = await restoreGoogleSession();
    set({
      session,
      hydrated: true,
      ...(session ? { syncedAt: Date.now() } : {}),
    });

    // A restored session is the reinstall case: the device may have nothing and
    // the account everything. Same merge, same fire-and-forget — launch must not
    // wait on a network call, and the game is already playable by this point.
    if (session) void syncEverything();
  },

  signIn: async () => {
    set({ busy: true, failure: undefined, failureDetail: undefined });
    const result = await signInWithGoogle();

    if (!result.ok) {
      set({ busy: false, failure: result.reason, failureDetail: result.detail });
      return false;
    }
    set({ session: result.session, busy: false, syncedAt: Date.now(), failureDetail: undefined });

    // Signing in is the moment a device and an account first learn about each
    // other, so it is the one place a full merge is worth doing. Deliberately not
    // awaited: the Account screen should say "connected" the instant it is true,
    // not after three network round trips, and every one of them is a no-op when
    // offline.
    void syncEverything();
    return true;
  },

  signOut: async () => {
    await endSession();
    set({ session: undefined, syncedAt: undefined, failure: undefined });
  },

  deleteAccount: async () => {
    const done = await requestDeletion();
    if (done) set({ session: undefined, syncedAt: undefined });
    return done;
  },
}));

/** The signed-in address, for the account screen. */
export function accountEmail(state: Pick<AuthState, 'session'>): string | undefined {
  return state.session?.user.email ?? undefined;
}

/** `48s ago`, `3m ago`, `2h ago`. Undefined when never synced. */
export function syncedAgo(syncedAt: number | undefined, nowMs: number): string | undefined {
  if (syncedAt === undefined) return undefined;
  const seconds = Math.max(0, Math.floor((nowMs - syncedAt) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}
