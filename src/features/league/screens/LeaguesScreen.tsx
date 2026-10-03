/**
 * src/features/league/screens/LeaguesScreen.tsx — Weekly Competition & Leaderboard.
 *
 * Purpose:      Show the current league status, remaining countdown, and the 
 *               weekly leaderboard matching reference design.
 */

import { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { LeagueIntro, Screen, Springy, useTheme, withClick } from '@components';
import { playMusic } from '@services/audio';
import { syncProfile } from '@services/sync';
import { useAuthStore } from '@state';
import { fonts, radius, spacing, typography, withAlpha, type Palette } from '@theme';

import { NEUTRAL_AVATAR, useLeagueBoard } from '../hooks/useLeagueBoard';
import { useThemeAssets } from '@features/settings';

export function LeaguesScreen() {
  const { palette } = useTheme();
  const themeAssets = useThemeAssets();

  useEffect(() => {
    playMusic('menu');
  }, []);

  const session = useAuthStore((state) => state.session);

  const defaultName: string = useMemo(() => {
    if (!session?.user) return 'Player';
    const meta = session.user.user_metadata;
    if (meta?.full_name && typeof meta.full_name === 'string' && meta.full_name.trim()) {
      return meta.full_name.trim();
    }
    if (meta?.name && typeof meta.name === 'string' && meta.name.trim()) {
      return meta.name.trim();
    }
    if (session.user.email && typeof session.user.email === 'string') {
      const parts = session.user.email.split('@');
      if (parts[0]) return parts[0];
    }
    return 'Player';
  }, [session]);

  const [showIntro, setShowIntro] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [customName, setCustomName] = useState<string | undefined>(undefined);
  const [nameInput, setNameInput] = useState('');

  const userName = customName ?? defaultName;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const { userLeague, remainingText, leaderboardData, loading } = useLeagueBoard({
    now,
    userName,
  });

  const saveName = () => {
    const trimmed = nameInput.trim();
    if (trimmed.length > 0) {
      setCustomName(trimmed);
      void syncProfile(trimmed);
    }
    setEditingName(false);
  };

  return (
    <Screen palette={palette} scroll>
      <View style={styles.container}>
        {/* ---- Header: League Title, Countdown, and Info Button ----------- */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.leagueTitle, { color: palette.accent }]}>{userLeague.name} League</Text>
            <View style={styles.countdownRow}>
              <FontAwesome name="clock-o" size={14} color={palette.textFaint} />
              <Text style={[styles.countdownText, { color: palette.textMuted }]}>{remainingText}</Text>
            </View>
          </View>

          <Springy
            accessibilityRole="button"
            accessibilityLabel="How leagues work"
            onPress={withClick(() => setShowIntro(true))}
            hitSlop={12}
            style={styles.infoButton}
          >
            <FontAwesome name="info-circle" size={24} color={palette.textFaint} />
          </Springy>
        </View>

        {/* ---- 3D Shield Emblem ------------------------------------------- */}
        <View style={styles.shieldContainer}>
          <Image
            source={themeAssets.shields[userLeague.id] ?? themeAssets.shields.bronze}
            style={styles.shieldImage}
            resizeMode="contain"
          />
        </View>

        {/* ---- Leaderboard List -------------------------------------------- */}
        <View style={styles.leaderboard}>
          {loading || leaderboardData.length === 0 ? (
            <Empty palette={palette} />
          ) : leaderboardData.map((row) => (
            <View key={row.id}>
              {row.rank === 11 ? (
                <View style={styles.zoneDivider}>
                  <View style={[styles.zoneLine, { backgroundColor: palette.success }]} />
                  <Text style={[styles.zoneLabel, { color: palette.success }]}>PROMOTION ZONE (TOP 10)</Text>
                  <View style={[styles.zoneLine, { backgroundColor: palette.success }]} />
                </View>
              ) : null}

              {row.rank === 46 ? (
                <View style={styles.zoneDivider}>
                  <View style={[styles.zoneLine, { backgroundColor: palette.danger }]} />
                  <Text style={[styles.zoneLabel, { color: palette.danger }]}>DEMOTION ZONE (BOTTOM 5)</Text>
                  <View style={[styles.zoneLine, { backgroundColor: palette.danger }]} />
                </View>
              ) : null}

              <View
                style={[
                  styles.row,
                  { backgroundColor: palette.surface, borderColor: palette.border },
                  row.isUser && [styles.userRow, { backgroundColor: palette.accentMuted, borderColor: palette.accent }],
                  row.rank <= 10 && !row.isUser && { borderColor: withAlpha(palette.success, 0.3) },
                ]}
              >
                {/* Rank (Podium Medal for 1, 2, 3) */}
                <View style={styles.rankCol}>
                  {row.rank === 1 ? (
                    <Image source={themeAssets.podium.first} style={styles.podiumMedal} resizeMode="contain" />
                  ) : row.rank === 2 ? (
                    <Image source={themeAssets.podium.second} style={styles.podiumMedal} resizeMode="contain" />
                  ) : row.rank === 3 ? (
                    <Image source={themeAssets.podium.third} style={styles.podiumMedal} resizeMode="contain" />
                  ) : (
                    <Text
                      style={[
                        styles.rankText,
                        { color: row.rank <= 10 ? '#10B981' : palette.textMuted },
                        row.isUser && { color: palette.accent, fontWeight: '800' },
                      ]}
                    >
                      {row.rank}
                    </Text>
                  )}
                </View>

                {/* Neutral avatar. Real rows carry only a display name, so a
                    country flag here would be inventing a fact about a player. */}
                <View style={styles.flagContainer}>
                  <Text style={styles.flagText}>{NEUTRAL_AVATAR}</Text>
                </View>

                {/* Name */}
                <View style={styles.nameContainer}>
                  <Text
                    style={[
                      styles.nameText,
                      { color: palette.text },
                      row.isUser && { color: palette.accent, fontWeight: '800' },
                    ]}
                    numberOfLines={1}
                  >
                    {row.name}
                  </Text>
                  {row.isUser ? (
                    <Pressable
                      onPress={() => {
                        setNameInput(userName);
                        setEditingName(true);
                      }}
                      hitSlop={8}
                      style={styles.editPencil}
                    >
                      <FontAwesome name="pencil" size={14} color={palette.textFaint} />
                    </Pressable>
                  ) : null}
                </View>

                {/* Score */}
                <View style={styles.scoreContainer}>
                  <Image source={themeAssets.arrowIcon} style={styles.scoreIcon} resizeMode="contain" />
                  <Text
                    style={[
                      styles.scoreText,
                      { color: palette.text },
                      row.isUser && { color: palette.accent, fontWeight: '800' },
                    ]}
                  >
                    {row.arrows}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* ---- Edit Username Modal ----------------------------------------- */}
        <Modal visible={editingName} transparent animationType="fade" onRequestClose={() => setEditingName(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setEditingName(false)}>
            <Pressable style={[styles.modalSheet, { backgroundColor: palette.surface }]} onPress={(e) => e.stopPropagation()}>
              <Text style={[styles.modalTitle, { color: palette.text }]}>Change Username</Text>
              <TextInput
                value={nameInput}
                onChangeText={setNameInput}
                placeholder="Enter your name"
                placeholderTextColor={palette.textFaint}
                maxLength={18}
                style={[
                  styles.nameInput,
                  { backgroundColor: palette.surfaceRaised, color: palette.text, borderColor: palette.border },
                ]}
                autoFocus
              />
              <View style={styles.modalActions}>
                <Pressable onPress={() => setEditingName(false)} style={styles.modalCancel}>
                  <Text style={[styles.modalCancelText, { color: palette.textMuted }]}>Cancel</Text>
                </Pressable>
                <Pressable onPress={saveName} style={[styles.modalSave, { backgroundColor: palette.accent }]}>
                  <Text style={[styles.modalSaveText, { color: palette.textOnAccent }]}>Save</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* ---- How Leagues Work Explainer Modal ---------------------------- */}
        <LeagueIntro
          visible={showIntro}
          palette={palette}
          themeAssets={themeAssets}
          onClose={() => setShowIntro(false)}
        />
      </View>
    </Screen>
  );
}

/**
 * The table when there is nothing to put in it.
 *
 * The house empty state — the same dashed card, glyph and three lines as
 * Challenge history and Statistics — rather than a blank rectangle, because a
 * blank rectangle reads as broken.
 *
 * It shows while the fetch is in flight as well as when the table comes back
 * empty, which is a deliberate conflation: "still asking" and "nobody else is
 * playing" both mean "no rows to draw yet", and a spinner that resolves into
 * this is a smaller promise than one that resolves into a number.
 */
function Empty({ palette }: { palette: Palette }) {
  return (
    <View style={[styles.empty, { borderColor: palette.border }]}>
      <Text style={[styles.emptyGlyph, { color: palette.textFaint }]}>◆</Text>
      <Text style={[styles.emptyTitle, { color: palette.text }]}>No one to compare with yet</Text>
      <Text style={[styles.emptyBody, { color: palette.textMuted }]}>
        Your league, shield and countdown are above. The table fills in as other players in your
        league clear levels.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  leagueTitle: {
    fontFamily: fonts.displayExtra,
    fontWeight: '800',
    fontSize: 22,
    lineHeight: 28,
    includeFontPadding: false,
    color: '#5B67F7',
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  countdownText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    includeFontPadding: false,
    color: '#64748B',
  },
  infoButton: {
    padding: spacing.xs,
  },
  shieldContainer: {
    width: 150,
    height: 150,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.sm,
  },
  shieldImage: {
    width: 135,
    height: 135,
  },
  leaderboard: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  zoneDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.md,
    gap: spacing.sm,
  },
  zoneLine: {
    flex: 1,
    height: 1.5,
    opacity: 0.6,
  },
  zoneLabel: {
    fontFamily: fonts.displayExtra,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    letterSpacing: 1,
    includeFontPadding: false,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  userRow: {
    borderRadius: radius.lg,
  },
  rankText: {
    width: 32,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
    includeFontPadding: false,
    color: '#475569',
  },
  userRankText: {
    color: '#5B67F7',
  },
  flagContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  flagText: {
    fontSize: 18,
    lineHeight: 22,
  },
  nameContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  nameText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    includeFontPadding: false,
    color: '#334155',
  },
  userNameText: {
    color: '#5B67F7',
    fontWeight: '800',
  },
  editPencil: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  scoreIcon: {
    width: 16,
    height: 16,
  },
  scoreText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
    includeFontPadding: false,
    color: '#334155',
  },
  userScoreText: {
    color: '#5B67F7',
  },

  /* Modals */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modalSheet: {
    width: '100%',
    maxWidth: 400,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  modalTitle: {
    ...typography.title,
    fontFamily: fonts.displayExtra,
    fontWeight: '800',
  },
  nameInput: {
    height: 52,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 17,
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  modalCancel: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  modalCancelText: {
    ...typography.body,
    fontWeight: '700',
  },
  modalSave: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
  },
  modalSaveText: {
    ...typography.body,
    fontWeight: '800',
  },

  rankCol: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  podiumMedal: {
    width: 28,
    height: 28,
  },
  sheetEmblem: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  shieldsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 96,
    paddingHorizontal: spacing.sm,
  },
  shieldRowImg: {
    width: 64,
    height: 64,
  },
  sheetGlyph: { fontSize: 40, fontWeight: '800' },

  empty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyGlyph: { fontSize: 40 },
  emptyTitle: { ...typography.heading },
  emptyBody: { ...typography.body, textAlign: 'center' },
});
