/**
 * app/account.tsx — connect an account, or see the one that is connected.
 *
 * Purpose:      The whole account surface: sign in, see sync state, log out, delete.
 * Notes:        Four states, and each one is honest about what it can actually do:
 *
 *               - **No backend configured** — says so, and does not show buttons
 *                 that would fail. This is the state the app ships in today.
 *               - **Signed out** — Google sign-in, live.
 *               - **Signing in** — a spinner over the sheet, matching the design.
 *               - **Connected** — address, sync time, log out, delete.
 *
 *               **Log out warns before it acts**, because signing out of a game
 *               whose progress lives on the device is a moment where a player can
 *               reasonably expect to lose something. Delete is worse and asks twice.
 *
 *               The one thing deliberately not built is a password field. Google is
 *               the only provider wired, and an email/password form that silently
 *               did nothing would be the worst thing on this screen.
 */

import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen, ScreenHeader, useSheetSound, useTheme, withClick } from '@components';
import { isGoogleConfigured } from '@services/auth';
import { isBackendConfigured } from '@services/supabase';
import { accountEmail, syncedAgo, useAuthStore } from '@state/authStore';
import { fonts, radius, spacing, typography, type Palette } from '@theme';

/** Why the last attempt failed, in the player's terms rather than the API's. */
const FAILURE_TEXT: Record<string, string> = {
  'not-configured': 'Accounts are not switched on in this build yet.',
  cancelled: 'Sign-in was cancelled.',
  network: 'Could not reach the server. Check your connection and try again.',
  'no-play-services':
    'Google Play Services is missing or out of date on this device. Sign-in needs it.',
  rejected: 'Google did not accept that sign-in. Try again, or use another account.',
};

export default function AccountScreen() {
  const router = useRouter();
  const { palette } = useTheme();

  const session = useAuthStore((state) => state.session);
  const busy = useAuthStore((state) => state.busy);
  const failure = useAuthStore((state) => state.failure);
  const failureDetail = useAuthStore((state) => state.failureDetail);
  const syncedAt = useAuthStore((state) => state.syncedAt);
  const signIn = useAuthStore((state) => state.signIn);
  const signOut = useAuthStore((state) => state.signOut);
  const deleteAccount = useAuthStore((state) => state.deleteAccount);

  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  // Re-render once a second only while the sheet is open and connected, so "48s
  // ago" stays true without a timer running for the life of the app.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [session]);

  // Both halves must be present: a Supabase project to hold the account, and a
  // Google client id to obtain an identity in the first place.
  const configured = isBackendConfigured() && isGoogleConfigured();
  const email = accountEmail({ session });
  const synced = syncedAgo(syncedAt, now);

  return (
    <Screen scroll>
      <ScreenHeader
        palette={palette}
        title="Account"
        subtitle={session ? 'Connected' : 'Not connected'}
        onBack={() => router.back()}
      />

      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <View
          style={[
            styles.avatar,
            { backgroundColor: session ? palette.accentMuted : palette.surfaceRaised },
          ]}
        >
          <Text
            style={[styles.avatarGlyph, { color: session ? palette.accent : palette.textFaint }]}
          >
            {session ? '◆' : '▲'}
          </Text>
        </View>

        {session ? (
          <>
            <Text style={[styles.title, { color: palette.text }]}>Account connected</Text>
            <Text style={[styles.email, { color: palette.accent }]}>{email}</Text>
            {synced ? (
              <Text style={[styles.body, { color: palette.textMuted }]}>Synced {synced}</Text>
            ) : null}
          </>
        ) : (
          <>
            <Text style={[styles.title, { color: palette.text }]}>Playing offline</Text>
            <Text style={[styles.body, { color: palette.textMuted }]}>
              Your levels, challenges and streaks are saved on this device.
            </Text>
          </>
        )}
      </View>

      {!configured ? (
        <View style={[styles.notice, { borderColor: palette.border }]}>
          <Text style={[styles.noticeTitle, { color: palette.text }]}>
            Accounts are not switched on yet
          </Text>
          <Text style={[styles.noticeBody, { color: palette.textMuted }]}>
            The sign-in flow is built, but this build has no backend connected — so
            the button is off rather than pretending to work. Progress stays on this
            device until it is.
          </Text>
        </View>
      ) : session ? (
        <View style={styles.actions}>
          {/*
            Signed in is a *state*, so it is a switch rather than a button.
            "Log out" is a verb on a control that otherwise only ever describes —
            a switch says what is true now and offers the one thing you can change
            about it.

            Turning it off does not sign out. It opens the confirmation, and the
            switch is driven by `session` rather than by its own state, so
            cancelling snaps it back on by itself with nothing to reset. Signing
            out of a game whose progress lives on the device is a moment where a
            player can reasonably expect to lose something, so it still asks.
          */}
          <View style={[styles.switchRow, { borderColor: palette.border }]}>
            <View style={styles.switchText}>
              <Text style={[styles.switchLabel, { color: palette.text }]}>Signed in</Text>
              <Text style={[styles.switchDetail, { color: palette.textFaint }]}>
                Turn off to log out of this device
              </Text>
            </View>
            <Switch
              value
              onValueChange={withClick(() => setConfirmLogout(true), 'toggle')}
              accessibilityLabel="Signed in. Turn off to log out."
              trackColor={{ false: palette.border, true: palette.accent }}
              thumbColor={palette.surfaceRaised}
            />
          </View>
          <Action
            palette={palette}
            label="Delete account"
            tone="quiet"
            onPress={() => setConfirmDelete(true)}
          />
          {deleteFailed ? (
            <Text style={[styles.error, { color: palette.danger }]}>
              Deletion is not available yet — it needs a server function that has not
              been deployed. Nothing was changed.
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.actions}>
          <Text style={[styles.prompt, { color: palette.textMuted }]}>
            Sign in to save your progress and compete in leagues.
          </Text>
          <Action
            palette={palette}
            label="Sign in with Google"
            tone="primary"
            onPress={() => void signIn()}
          />
          {failure ? (
            <>
              <Text style={[styles.error, { color: palette.danger }]}>
                {FAILURE_TEXT[failure] ?? 'Sign-in failed.'}
              </Text>
              {/*
                The provider's own words, under the friendly line rather than
                instead of it. "Google did not accept that sign-in" is true and
                useless; the sentence underneath is the one that says which of the
                three possible causes it actually was.
              */}
              {failureDetail ? (
                <Text style={[styles.errorDetail, { color: palette.textFaint }]}>
                  {failureDetail}
                </Text>
              ) : null}
            </>
          ) : null}
          <Text style={[styles.legal, { color: palette.textFaint }]}>
            Signing in creates an account with your Google address. Nothing else is
            collected.
          </Text>
        </View>
      )}

      {/* ---- Signing in ------------------------------------------------- */}
      <Modal visible={busy} transparent animationType="fade">
        <View style={styles.scrim}>
          <View style={[styles.sheet, { backgroundColor: palette.surface }]}>
            <Text style={[styles.sheetTitle, { color: palette.text }]}>Signing in</Text>
            <ActivityIndicator size="large" color={palette.accent} />
          </View>
        </View>
      </Modal>

      {/* ---- Log out ---------------------------------------------------- */}
      <Confirm
        visible={confirmLogout}
        palette={palette}
        title="Log out"
        highlight={email}
        detail={synced ? `Synced ${synced}` : undefined}
        body="Any progress not yet synced will stay on this device."
        confirmLabel="Log out"
        onConfirm={() => {
          setConfirmLogout(false);
          void signOut();
        }}
        onCancel={() => setConfirmLogout(false)}
      />

      {/* ---- Delete ----------------------------------------------------- */}
      <Confirm
        visible={confirmDelete}
        palette={palette}
        title="Delete account"
        highlight={email}
        body="This removes your account and anything synced to it. It cannot be undone. Progress saved on this device is not affected."
        confirmLabel="Delete permanently"
        onConfirm={() => {
          setConfirmDelete(false);
          void deleteAccount().then((done) => setDeleteFailed(!done));
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </Screen>
  );
}

function Action({
  palette,
  label,
  tone,
  onPress,
}: {
  palette: Palette;
  label: string;
  tone: 'primary' | 'danger' | 'quiet';
  onPress: () => void;
}) {
  const background =
    tone === 'primary' ? palette.accent : tone === 'danger' ? palette.danger : 'transparent';
  const color =
    tone === 'quiet' ? palette.textMuted : palette.textOnAccent;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={withClick(onPress)}
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: background, borderColor: tone === 'quiet' ? palette.border : background },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

/** A destructive confirmation. Cancel is the prominent option, deliberately. */
function Confirm({
  visible,
  palette,
  title,
  highlight,
  detail,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  palette: Palette;
  title: string;
  highlight?: string | undefined;
  detail?: string | undefined;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useSheetSound(visible);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.scrim} onPress={onCancel}>
        <Pressable
          style={[styles.sheet, { backgroundColor: palette.surface }]}
          onPress={(event) => event.stopPropagation()}
        >
          <Text style={[styles.sheetTitle, { color: palette.text }]}>{title}</Text>
          {highlight ? (
            <Text style={[styles.email, { color: palette.accent }]}>{highlight}</Text>
          ) : null}
          {detail ? (
            <Text style={[styles.body, { color: palette.textMuted }]}>{detail}</Text>
          ) : null}
          <Text style={[styles.body, { color: palette.textMuted }]}>{body}</Text>

          <View style={styles.sheetActions}>
            <Action palette={palette} label={confirmLabel} tone="danger" onPress={onConfirm} />
            <Action palette={palette} label="Cancel" tone="primary" onPress={onCancel} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  avatarGlyph: { fontSize: 30, fontWeight: '800' },
  title: { ...typography.heading, marginTop: spacing.sm },
  email: { ...typography.body, fontWeight: '700' },
  body: { ...typography.body, textAlign: 'center' },

  notice: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  noticeTitle: { ...typography.body, fontWeight: '700' },
  noticeBody: { ...typography.small },

  actions: { gap: spacing.sm },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  switchText: { flex: 1 },
  switchLabel: { ...typography.body, fontWeight: '700' },
  switchDetail: { ...typography.small, marginTop: 2 },
  prompt: { ...typography.body, textAlign: 'center', marginBottom: spacing.xs },
  action: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  actionLabel: { ...typography.body, fontWeight: '700' },
  pressed: { opacity: 0.75 },
  error: { ...typography.small, textAlign: 'center' },
  errorDetail: { ...typography.small, fontSize: 11, textAlign: 'center', marginTop: 2 },
  legal: { ...typography.small, textAlign: 'center', marginTop: spacing.sm },

  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  sheet: {
    width: '100%',
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  sheetTitle: { ...typography.title, fontFamily: fonts.displayExtra, fontWeight: '800' },
  sheetActions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.md },
});
