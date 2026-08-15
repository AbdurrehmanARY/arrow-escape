# Finishing Google sign-in

The client side is built and shipping. What is missing is entirely **accounts and
configuration** — things only you can create, because they need your Google and
Supabase logins and they mint credentials tied to your identity.

Until they exist the app is in a deliberate, honest state: the Account screen says
accounts are not switched on, the sign-in button is off rather than dead, and the
game plays exactly as it does today.

---

## What is already done

| Piece                                       | Where                      |
| ------------------------------------------- | -------------------------- |
| Supabase client, session in the OS keystore | `src/services/supabase.ts` |
| **Native** Google sign-in + token exchange  | `src/services/auth.ts`     |
| Silent restore on launch                    | `src/state/authStore.ts`   |
| Account screen — all five states            | `app/account.tsx`          |
| Config slot for the credentials             | `app.json` → `expo.extra`  |

**The flow is native, not a browser redirect.** Play Services draws the account
sheet in its own process and hands back a signed ID token; the app never sees a
password and never leaves the screen. `signInWithIdToken` exchanges that token for
a Supabase session — there is no PKCE, no redirect and no deep link involved.

`isBackendConfigured()` is what every screen keys off. It returns false while the
placeholders are still in `app.json`, and everything downstream behaves accordingly.

---

## What you need to do

### 1. Create a Supabase project

At [supabase.com](https://supabase.com) → **New project**. Free tier is enough.

From **Project Settings → API**, copy:

- **Project URL** — `https://xxxxxxxxxxxx.supabase.co`
- **anon / public key** — a long JWT

> The anon key is **safe to ship**. It is public by design and carries no authority
> beyond what row-level security allows. The **service role** key is the opposite —
> it bypasses every policy. It must never appear in this repo or in an APK, because
> anyone can unzip an APK and read it.

### 2. Create two Google OAuth clients

At [console.cloud.google.com](https://console.cloud.google.com) → **APIs & Services
→ Credentials**. You need **both**, and they do different jobs:

**a. Web application** — despite the name, this is the one the _app_ names in code.

Its client id is the **audience** of the ID token Google issues, and it is what
Supabase verifies. Already wired:

```
920357438418-gu2mb1tso2g6jir8emcqrito04ukomqt.apps.googleusercontent.com
```

> ⚠️ **Confirm this is a _Web application_ client, not an Android one.** Passing an
> Android client id as `webClientId` is the single most common failure in this flow:
> Google signs the user in, returns **no ID token**, and nothing explains why. The
> app detects exactly this case and says so.

**b. Android** — authorises _this app_ to use the Web client. Never named in code.

- Package name: `com.abdurrehmanary.arrowpath`
- SHA-1: `85:DA:69:F8:BF:D0:2A:CC:74:BC:B4:73:B6:AC:3B:58:EB:39:94:AD`

> ⚠️ That SHA-1 is your **EAS upload key**. Once you enrol in Play App Signing —
> mandatory for new apps — Google re-signs your AAB with a _different_ key, and
> Play Store installs will present a different fingerprint. Sign-in will work in
> your sideloaded APK and fail in production. Before going live, add the **App
> signing key** SHA-1 from Play Console → _Setup → App integrity_ as a second
> Android client. It does not exist until your first AAB upload.

### 3. Enable Google in Supabase

**Authentication → Providers → Google**, switch it on.

- Paste the **Web** client id and secret.
- In **Authorized Client IDs**, add the same Web client id. This is what lets
  Supabase accept an ID token minted by the native picker.

**No redirect URL is needed.** The native flow never leaves the app, so there is
nothing to redirect back to — this step existed only for the old browser flow.

### 4. Put the credentials in the app

In `app.json`, replace the Supabase placeholders (the Google client id is already
in place):

```json
"extra": {
  "supabase": {
    "url": "https://xxxxxxxxxxxx.supabase.co",
    "anonKey": "eyJhbGciOi..."
  },
  "google": {
    "webClientId": "920357438418-....apps.googleusercontent.com"
  }
}
```

Then rebuild — `extra` is inlined at build time, so a running dev server will not
pick this up:

```bash
npm run build:dev
```

### 5. Deploy the account-deletion function

The **Delete account** button calls an Edge Function named `delete-account`. Until
it is deployed the button reports honestly that deletion is unavailable and changes
nothing.

It has to be a server function because deleting a user requires the service role
key, and that key cannot ship inside the app.

```bash
npm run eas -- --version   # unrelated; use the Supabase CLI for this step
npx supabase functions new delete-account
npx supabase functions deploy delete-account
```

The function should read the caller's JWT, take the user id from it, and call
`auth.admin.deleteUser(id)` with the service role key from the function's own
environment. **Never take a user id from the request body** — that would let any
signed-in player delete anyone.

---

## What to check once it is live

1. **Sign in.** A Google account sheet should slide up **inside the app** — no
   browser, no screen transition. If a browser opens, the native module did not
   initialise.
2. **Force-quit and reopen.** The session should still be there; it is persisted in
   the Android keystore by `expo-secure-store`.
3. **Cancel a sign-in.** Press back in the browser. The app should say "Sign-in was
   cancelled", not show an error.
4. **Turn off the network and try.** Should read "Could not reach the server", not
   hang.
5. **Log out.** Progress on the device must survive — it is stored separately from
   the session and is not touched by signing out.

---

## Things worth knowing before you start

**Three failures account for nearly all of them**, and none says what is wrong:

1. **`webClientId` is an Android client.** Google signs in, returns no ID token.
   The app reports this one specifically.
2. **The Web client id is not in Supabase's Authorized Client IDs.** Supabase
   rejects a token it cannot vouch for.
3. **The SHA-1 does not match the signing key.** Sign-in fails on device while
   working elsewhere.

**Play Services is required.** The native picker cannot run without it, which rules
out most emulator images and some non-Google Android builds. The app reports this
case distinctly rather than as a generic failure.

**Sign in with Play Games is not built.** Your design shows it beside Google. It is
a separate provider needing its own Play Games Services configuration, and Supabase
does not support it natively — it needs a custom token flow. Worth doing later; it
is not a checkbox.

**Nothing syncs yet.** Signing in creates an account and proves who someone is. It
does **not** upload progress, challenge records, or league scores — that needs
tables, row-level security policies, and a sync routine, none of which exist. The
Account screen says "saved on this device" for exactly this reason, and will keep
being right until that work is done.

**Leagues still show only you.** A leaderboard needs other players' scores, which
needs the sync above plus a query. The screen is built and the week/zone maths is
tested; what is missing is rows to put in it.
