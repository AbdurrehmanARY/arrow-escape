/**
 * app/(tabs)/leagues.tsx — Weekly Competition & Leaderboard.
 *
 * Purpose:      Show the current league status, remaining countdown, and the 
 *               weekly leaderboard matching reference design.
 */

import { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { Screen, Springy, useSheetSound, useTheme, withClick } from '@components';
import { today } from '@challenge';
import {
  arrowsFor,
  formatRemaining,
  leagueForArrows,
  msRemaining,
  weekOf,
} from '@league';
import { syncProfile } from '@services/sync';
import { useAuthStore } from '@state/authStore';
import { statsOf, useChallengeStore } from '@state/challengeStore';
import { arrowsThisWeek, useLeagueStore } from '@state/leagueStore';
import { fonts, radius, spacing, typography, type Palette } from '@theme';

const ARROW_ICON = require('../../assets/images/arrow_icon.png');

export const LEAGUE_IMAGES: Record<string, any> = {
  bronze: require('../../assets/images/shield_bronze.jpg'),
  silver: require('../../assets/images/shield_silver.jpg'),
  gold: require('../../assets/images/shield_gold.jpg'),
  ruby: require('../../assets/images/shield_ruby.jpg'),
  obsidian: require('../../assets/images/shield_obsidian.jpg'),
  diamond: require('../../assets/images/shield_diamond.jpg'),
};

interface LeaderboardEntry {
  id: string;
  rank: number;
  flag: string;
  name: string;
  arrows: number;
  isUser?: boolean;
}

const LEADERBOARD_ROSTER: Omit<LeaderboardEntry, 'rank' | 'isUser' | 'arrows'>[] = [
  { id: '1', flag: '🇨🇦', name: 'Player02997' },
  { id: '2', flag: '🇺🇸', name: 'AdrianLee' },
  { id: '3', flag: '🇬🇧', name: 'OliviaRoss' },
  { id: '4', flag: '🇪🇬', name: 'UnicornCape' },
  { id: '5', flag: '🌐', name: 'CobaltFern5' },
  { id: '6', flag: '🇮🇪', name: 'LateToGame' },
  { id: '7', flag: '🌐', name: 'OopsIWon' },
  { id: '8', flag: '🇨🇾', name: 'Crispy5' },
  { id: '9', flag: '🇫🇷', name: 'Player07688' },
  { id: '10', flag: '🌐', name: 'X3na' },
  { id: '11', flag: '🇪🇸', name: 'ArrowPro99' },
  { id: '12', flag: '🇩🇪', name: 'MasterNinja' },
  { id: '13', flag: '🇯🇵', name: 'KageRider' },
  { id: '14', flag: '🇧🇷', name: 'SilvaSpeed' },
  { id: '15', flag: '🇦🇺', name: 'OzzyEscape' },
  { id: '16', flag: '🇨🇳', name: 'ChenZen' },
  { id: '17', flag: '🇲🇽', name: 'MateoV' },
  { id: '18', flag: '🇸🇪', name: 'SvenBold' },
  { id: '19', flag: '🇮🇳', name: 'MayaP' },
  { id: '20', flag: '🇷🇺', name: 'ViktorK' },
  { id: '21', flag: '🇰🇷', name: 'ChloeSun' },
  { id: '22', flag: '🇨🇦', name: 'LiamW' },
  { id: '23', flag: '🇺🇸', name: 'SophiaStar' },
  { id: '24', flag: '🇳🇴', name: 'LucasNord' },
  { id: '25', flag: '🇮🇹', name: 'IsabellaB' },
  { id: '26', flag: '🇬🇧', name: 'EthanHunt' },
  { id: '27', flag: '🇦🇪', name: 'AmiraL' },
  { id: '28', flag: '🇿🇦', name: 'NoahZ' },
  { id: '29', flag: '🇳🇱', name: 'EmmaV' },
  { id: '30', flag: '🇳🇿', name: 'OliverQ' },
  { id: '31', flag: '🇸🇬', name: 'ZoeSwift' },
  { id: '32', flag: '🇦🇷', name: 'LeoFire' },
  { id: '33', flag: '🇵🇹', name: 'AriaSky' },
  { id: '34', flag: '🇦🇹', name: 'MaxPower' },
  { id: '35', flag: '🇮🇪', name: 'LilyBloom' },
  { id: '36', flag: '🇭🇰', name: 'KaiStorm' },
  { id: '37', flag: '🇩🇰', name: 'NoraGold' },
  { id: '38', flag: '🇨🇱', name: 'GabrielS' },
  { id: '39', flag: '🇬🇷', name: 'ElenaR' },
  { id: '40', flag: '🇧🇪', name: 'HugoBoss' },
  { id: '41', flag: '🇵🇱', name: 'MilaZen' },
  { id: '42', flag: '🇸🇦', name: 'TariqK' },
  { id: '43', flag: '🇫🇮', name: 'SaraMoon' },
  { id: '44', flag: '🇵🇪', name: 'DiegoR' },
  { id: '45', flag: '🇯🇵', name: 'YukiT' },
  { id: '46', flag: '🇩🇪', name: 'LarsB' },
  { id: '47', flag: '🇹🇷', name: 'FatimaH' },
  { id: '48', flag: '🇪🇸', name: 'CarlosM' },
  { id: '49', flag: '🇺🇦', name: 'AnnaBell' },
];

export default function LeaguesScreen() {
  const { palette } = useTheme();

  const weeks = useLeagueStore((state) => state.weeks);
  const challengeRecords = useChallengeStore((state) => state.records);
  const session = useAuthStore((state) => state.session);

  const defaultName: string = useMemo(() => {
    if (!session?.user) return 'AtifPasha';
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

  const week = useMemo(() => weekOf(now), [now]);
  const stats = useMemo(
    () => statsOf({ records: challengeRecords }, today()),
    [challengeRecords],
  );

  const userArrows = arrowsFor(arrowsThisWeek({ weeks }, now), stats.won);
  const userLeague = leagueForArrows(userArrows);
  const remainingText = formatRemaining(msRemaining(week, now));

  // Construct dynamic 50-player leaderboard starting from Bronze
  const leaderboardData = useMemo(() => {
    const maxScore =
      userLeague.id === 'bronze'
        ? 380
        : userLeague.id === 'silver'
          ? 1150
          : userLeague.id === 'gold'
            ? 2450
            : userLeague.id === 'ruby'
              ? 4950
              : userLeague.id === 'obsidian'
                ? 8950
                : 15000;

    const minScore = userLeague.entryArrows + 5;

    // Generate 49 opponent scores realistically scaled across league range
    const opponents: LeaderboardEntry[] = LEADERBOARD_ROSTER.map((opp, index) => {
      const ratio = 1 - index / 48;
      const arrows = Math.max(1, Math.round(minScore + ratio * (maxScore - minScore)));
      return {
        ...opp,
        rank: 0,
        arrows,
      };
    });

    const userEntry: LeaderboardEntry = {
      id: 'you',
      rank: 0,
      flag: '🇵🇰',
      name: userName,
      arrows: userArrows,
      isUser: true,
    };

    const combined = [...opponents, userEntry];
    combined.sort((a, b) => b.arrows - a.arrows);

    return combined.map((entry, idx) => ({
      ...entry,
      rank: idx + 1,
    }));
  }, [userArrows, userLeague, userName]);

  const saveName = () => {
    const trimmed = nameInput.trim();
    if (trimmed.length > 0) {
      setCustomName(trimmed);
      void syncProfile(trimmed);
    }
    setEditingName(false);
  };

  return (
    <Screen scroll>
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
            source={LEAGUE_IMAGES[userLeague.id] ?? LEAGUE_IMAGES.bronze}
            style={styles.shieldImage}
            resizeMode="contain"
          />
        </View>

        {/* ---- Leaderboard List -------------------------------------------- */}
        <View style={styles.leaderboard}>
          {leaderboardData.map((row) => (
            <View key={row.id}>
              {row.rank === 11 ? (
                <View style={styles.zoneDivider}>
                  <View style={[styles.zoneLine, { backgroundColor: '#10B981' }]} />
                  <Text style={[styles.zoneLabel, { color: '#10B981' }]}>PROMOTION ZONE (TOP 10)</Text>
                  <View style={[styles.zoneLine, { backgroundColor: '#10B981' }]} />
                </View>
              ) : null}

              {row.rank === 46 ? (
                <View style={styles.zoneDivider}>
                  <View style={[styles.zoneLine, { backgroundColor: '#EF4444' }]} />
                  <Text style={[styles.zoneLabel, { color: '#EF4444' }]}>DEMOTION ZONE (BOTTOM 5)</Text>
                  <View style={[styles.zoneLine, { backgroundColor: '#EF4444' }]} />
                </View>
              ) : null}

              <View
                style={[
                  styles.row,
                  { backgroundColor: palette.surface, borderColor: palette.border },
                  row.isUser && [styles.userRow, { backgroundColor: palette.accentMuted, borderColor: palette.accent }],
                  row.rank <= 10 && !row.isUser && { borderColor: 'rgba(16, 185, 129, 0.3)' },
                ]}
              >
                {/* Rank */}
                <Text
                  style={[
                    styles.rankText,
                    { color: row.rank <= 10 ? '#10B981' : palette.textMuted },
                    row.isUser && { color: palette.accent, fontWeight: '800' },
                  ]}
                >
                  {row.rank}
                </Text>

                {/* Flag / Avatar */}
                <View style={styles.flagContainer}>
                  <Text style={styles.flagText}>{row.flag}</Text>
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
                  <Image source={ARROW_ICON} style={styles.scoreIcon} resizeMode="contain" />
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
          onClose={() => setShowIntro(false)}
        />
      </View>
    </Screen>
  );
}

function LeagueIntro({
  visible,
  palette,
  onClose,
}: {
  visible: boolean;
  palette: Palette;
  onClose: () => void;
}) {
  const [page, setPage] = useState(0);
  useSheetSound(visible);

  const pages = [
    { glyph: '➤', text: 'Collect arrows in levels to build up your weekly score.' },
    { glyph: '◆', text: 'Compete with 50 players in your league table.' },
    { glyph: '▲', text: 'Finish in the top zone at the end of the week to promote to a higher league!' },
  ];

  const last = page === pages.length - 1;
  const current = pages[page]!;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: palette.surface }]} onPress={(e) => e.stopPropagation()}>
          <Text style={[styles.sheetTitle, { color: palette.text }]}>Leagues</Text>

          {page === 2 ? (
            <View style={styles.shieldsRow}>
              {['bronze', 'silver', 'gold', 'ruby', 'obsidian', 'diamond'].map((id, index) => (
                <Image
                  key={id}
                  source={LEAGUE_IMAGES[id]}
                  style={[styles.shieldRowImg, { marginLeft: index > 0 ? -16 : 0, zIndex: 10 - index }]}
                  resizeMode="contain"
                />
              ))}
            </View>
          ) : (
            <View style={[styles.sheetEmblem, { backgroundColor: palette.accentMuted }]}>
              <Text style={[styles.sheetGlyph, { color: palette.accent }]}>{current.glyph}</Text>
            </View>
          )}

          <Text style={[styles.sheetBody, { color: palette.textMuted }]}>{current.text}</Text>

          <View style={styles.dots}>
            {pages.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  {
                    backgroundColor: index === page ? palette.accent : palette.border,
                    width: index === page ? 10 : 8,
                    height: index === page ? 10 : 8,
                  },
                ]}
              />
            ))}
          </View>

          <Springy
            accessibilityRole="button"
            accessibilityLabel={last ? 'Close' : 'Continue'}
            onPress={withClick(() => {
              if (last) {
                setPage(0);
                onClose();
              } else {
                setPage((value) => value + 1);
              }
            })}
            style={[styles.continue, { backgroundColor: palette.accent }]}
          >
            <Text style={[styles.continueLabel, { color: palette.textOnAccent }]}>
              {last ? 'Got it' : 'Continue'}
            </Text>
          </Springy>
        </Pressable>
      </Pressable>
    </Modal>
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
    fontSize: 28,
    color: '#5B67F7',
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  countdownText: {
    fontSize: 16,
    fontWeight: '700',
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
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  userRow: {
    borderRadius: radius.lg,
  },
  rankText: {
    width: 36,
    fontSize: 18,
    fontWeight: '800',
    color: '#475569',
  },
  userRankText: {
    color: '#5B67F7',
  },
  flagContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  flagText: {
    fontSize: 20,
  },
  nameContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  nameText: {
    fontSize: 17,
    fontWeight: '700',
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
    width: 18,
    height: 18,
  },
  scoreText: {
    fontSize: 17,
    fontWeight: '800',
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

  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  sheet: {
    width: '100%',
    maxWidth: 400,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  sheetTitle: { ...typography.title, fontFamily: fonts.displayExtra, fontWeight: '800' },
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
  sheetBody: { ...typography.body, textAlign: 'center' },
  dots: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  dot: { borderRadius: 5 },
  continue: {
    alignSelf: 'stretch',
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  continueLabel: { ...typography.body, fontWeight: '800' },
});
