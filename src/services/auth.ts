/**
 * auth.ts — signing in with Google, natively.
 *
 * Purpose:      Turn a "Sign in with Google" tap into a Supabase session without
 *               ever leaving the app.
 * Responsibilities:
 *               - `configureGoogleSignIn` — once, at launch.
 *               - `signInWithGoogle`      — native picker, then token exchange.
 *               - `signOut`, `deleteAccount`, `currentSession`.
 * Notes:        **This is the native Play Services flow, not a browser redirect and
 *               not a WebView.** The distinction matters and is easy to conflate:
 *
 *               - A *WebView* showing Google's login page is what Google blocks,
 *                 and rightly — an app-controlled WebView can read what is typed.
 *               - The *system browser* works but bounces the player out of the app
 *                 and back, which is a visible, slow seam.
 *               - The *native picker* is neither. Play Services renders the account
 *                 sheet in its own process; the app receives only a signed ID token
 *                 and never sees a password. It is both the nicest and the most
 *                 secure of the three.
 *
 *               **The exchange is `signInWithIdToken`, not an OAuth code.** Google
 *               hands back an ID token — a JWT signed by Google, with the client id
 *               in its `aud` claim. Supabase verifies that signature and audience
 *               itself, so there is no redirect, no PKCE, and no code round trip.
 *
 *               **`webClientId` must be the *Web* OAuth client, on Android.** That
 *               is genuinely counter-intuitive and it is where this flow usually
 *               fails. The Android client authorises *the app* by package name and
 *               SHA-1 and is never named in code; the Web client is what the ID
 *               token is issued *for*, and it is the audience Supabase checks. Pass
 *               an Android client id here and every sign-in fails with a message
 *               that mentions neither.
 *
 *               Every function returns a typed result rather than throwing, the
 *               same rule `src/game/` follows: sign-in fails for a dozen ordinary
 *               reasons and none of them should reach the UI as an exception.
 */

import Constants from 'expo-constants';
import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import type { Session } from '@supabase/supabase-js';

import { supabase } from './supabase';

/** Why a sign-in did not produce a session. */
export type AuthFailure =
  /** No Supabase project, or no Google client id, in this build. */
  | 'not-configured'
  /** The player dismissed the account sheet. Not an error worth shouting about. */
  | 'cancelled'
  /** Play Services missing or out of date — common on emulators and some OEMs. */
  | 'no-play-services'
  /** Network, DNS, or the provider unreachable. */
  | 'network'
  /** Anything Google or Supabase rejected — wrong client id, blocked account. */
  | 'rejected';

export type AuthResult =
  | { readonly ok: true; readonly session: Session }
  | { readonly ok: false; readonly reason: AuthFailure; readonly detail?: string };

/**
 * The Web OAuth client id, from `app.json` -> `expo.extra.google.webClientId`.
 *
 * Config rather than an env file, because Expo inlines `extra` at build time: there
 * is one place to look, and no way for the value to exist during the build but not
 * at runtime. The client id is not a secret — it is embedded in every ID token
 * request and visible in any APK.
 */
function webClientId(): string | undefined {
  const extra = Constants.expoConfig?.extra as
    | { google?: { webClientId?: string } }
    | undefined;
  const id = extra?.google?.webClientId;
  if (!id || id.includes('YOUR_')) return undefined;
  return id;
}

/** Whether native sign-in can run at all in this build. */
export function isGoogleConfigured(): boolean {
  return webClientId() !== undefined;
}

/**
 * Summarise an ID token's claims for a failure message.
 *
 * A JWT's payload is base64url, not encryption — the claims are readable by
 * anyone holding the token and carry no secret. Only the signature proves
 * anything, and that is not touched here. Worth having because every OIDC
 * rejection comes down to one of these four fields, and the provider's own error
 * text names none of them.
 */
function describeToken(token: string): string {
  try {
    const payload = token.split('.')[1];
    if (!payload) return 'token is not a JWT';

    const json = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
    ) as { iss?: string; aud?: string; azp?: string; exp?: number };

    const secondsLeft =
      payload && json.exp ? Math.round(json.exp - Date.now() / 1000) : undefined;

    return [
      `iss=${json.iss ?? '?'}`,
      `aud=${json.aud ?? '?'}`,
      json.azp && json.azp !== json.aud ? `azp=${json.azp}` : undefined,
      secondsLeft === undefined ? undefined : `expires in ${secondsLeft}s`,
    ]
      .filter(Boolean)
      .join(' · ');
  } catch {
    return 'could not decode token';
  }
}

let configured = false;

/**
 * Prepare the native module. Safe to call repeatedly; does nothing without a
 * client id, which is the state the app ships in until one is supplied.
 */
export function configureGoogleSignIn(): void {
  if (configured) return;
  const id = webClientId();
  if (!id) return;

  GoogleSignin.configure({
    // Yes, the *Web* client id — see the note at the top of this file.
    webClientId: id,
    // No `offlineAccess`: a server auth code is only needed when a backend wants to
    // act on the player's behalf against Google APIs. Supabase does not, and asking
    // for it would widen the consent screen for nothing.
    offlineAccess: false,
  });
  configured = true;
}

/**
 * Show the native account sheet and exchange the result for a Supabase session.
 *
 * The whole flow stays inside the app: Play Services draws the picker, returns a
 * signed ID token, and Supabase verifies it. No browser, no redirect, no scheme
 * handling.
 */
export async function signInWithGoogle(): Promise<AuthResult> {
  const client = supabase();
  if (!client || !isGoogleConfigured()) return { ok: false, reason: 'not-configured' };

  configureGoogleSignIn();

  try {
    // Checked explicitly so a missing or stale Play Services reports itself rather
    // than surfacing as a generic failure. It is the usual emulator problem.
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    // Drop any cached Google credential before opening the sheet.
    //
    // Without this, a second sign-in can resolve straight back to the account used
    // last time without showing anything — which looks like a dead button to
    // someone trying to switch accounts, and gives no way to correct a wrong
    // choice. Clearing first makes the press always mean the same thing: choose an
    // account. It costs nothing when there is nothing cached.
    //
    // This does *not* affect the silent restore on launch — see
    // `restoreGoogleSession`, which is what keeps a returning player signed in.
    try {
      await GoogleSignin.signOut();
    } catch {
      // Nothing cached. Normal on a first run.
    }

    const response = await GoogleSignin.signIn();
    if (response.type === 'cancelled') return { ok: false, reason: 'cancelled' };

    const idToken = response.data.idToken;
    if (!idToken) {
      // Almost always a `webClientId` that is an Android client rather than a Web
      // one: Google signs the user in, but issues no ID token for that audience.
      return {
        ok: false,
        reason: 'rejected',
        detail: 'Google returned no ID token. Check that webClientId is a Web OAuth client.',
      };
    }

    const { data, error } = await client.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    if (error || !data.session) {
      // The provider's message alone does not say which claim it objected to, and
      // the claims are not secret — only the signature is. Decoding them turns
      // "Bad ID token" into something actionable.
      return {
        ok: false,
        reason: 'rejected',
        detail: `${error?.message ?? 'no session'} · ${describeToken(idToken)}`,
      };
    }
    return { ok: true, session: data.session };
  } catch (error) {
    if (isErrorWithCode(error)) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) return { ok: false, reason: 'cancelled' };
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return { ok: false, reason: 'no-play-services' };
      }
      if (error.code === statusCodes.IN_PROGRESS) {
        // A second tap while the sheet is already open. Not a failure to report.
        return { ok: false, reason: 'cancelled' };
      }
    }
    return {
      ok: false,
      reason: 'network',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Sign in without showing anything, if Play Services already has a credential.
 *
 * Called at launch. It is what makes a returning player simply *be* signed in
 * rather than having to ask again, and it shows no UI when there is nothing to
 * restore.
 */
export async function restoreGoogleSession(): Promise<Session | undefined> {
  const client = supabase();
  if (!client || !isGoogleConfigured()) return undefined;

  // A Supabase session already in the keystore beats asking Google again.
  const existing = await currentSession();
  if (existing) return existing;

  configureGoogleSignIn();
  try {
    const response = await GoogleSignin.signInSilently();
    if (response.type !== 'success' || !response.data.idToken) return undefined;

    const { data } = await client.auth.signInWithIdToken({
      provider: 'google',
      token: response.data.idToken,
    });
    return data.session ?? undefined;
  } catch {
    // No saved credential is the normal case, not an error.
    return undefined;
  }
}

/** The stored session, or `undefined`. Reads from the keystore. */
export async function currentSession(): Promise<Session | undefined> {
  const client = supabase();
  if (!client) return undefined;
  const { data } = await client.auth.getSession();
  return data.session ?? undefined;
}

/**
 * End the session on this device.
 *
 * Signs out of Google as well as Supabase. Leaving the Google credential behind
 * would mean the next "sign in" silently reuses the same account with no picker,
 * which looks broken to anyone trying to switch accounts.
 */
export async function signOut(): Promise<void> {
  const client = supabase();
  if (client) await client.auth.signOut();

  try {
    await GoogleSignin.signOut();
  } catch {
    // Already signed out, or never configured. Nothing to recover from.
  }
}

/**
 * Ask the backend to delete this account, and revoke Google access.
 *
 * Deletion itself needs an Edge Function: the anon key cannot remove a user, and
 * the key that can must never ship inside an app. Returns false when there is no
 * backend or the function is not deployed — the UI says so rather than claiming
 * success.
 */
export async function deleteAccount(): Promise<boolean> {
  const client = supabase();
  if (!client) return false;

  const { error } = await client.functions.invoke('delete-account');
  if (error) return false;

  try {
    // Revoke rather than sign out: the player asked to be forgotten, so the app's
    // permission to see their Google identity should go too.
    await GoogleSignin.revokeAccess();
  } catch {
    // Best effort — the account is already gone server-side.
  }
  return true;
}
