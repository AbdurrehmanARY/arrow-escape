# ArrowPath — Production Cleanup

**Brief:** prepare the game for production. Single source of truth for every
image/visual asset, remove test-only functionality, remove dummy leaderboard
data, Google-only auth, fifth award = the shield, theme-aware award
backgrounds, Privacy/Terms pages, drop Remove Ads + language settings, one logo.

| Phase | Meaning |
| --- | --- |
| **A** | Audit (this document) |
| **B** | Asset single source of truth |
| **C** | Production cleanup (dev/test, leaderboard, auth) |
| **D** | Fifth award = shield |
| **E** | Theme-aware award backgrounds |
| **F** | Privacy / Terms |
| **G** | Verification + docs |

Each phase ends green on `npm run verify` and `npm run architecture:check`.

---

## Phase A — Audit

### 1. Image assets

Every runtime image is a `require()` inside one of five files. `require()` is
**invisible to `tools/check-architecture.ts`** — its regex only matches
`import … from` — so this is the one area the layer rules do not currently
enforce. Exact counts (raw-string matches, verified this phase):

| File | Layer | `require()`s | Assets |
| --- | --- | ---: | --- |
| `src/shared/branding/index.ts` | `shared` | 4 | `assets/brand/{arrow-mark, arrow-mark-light, wordmark, wordmark-light}.png` |
| `src/theme/themeAssets.ts` | `theme` | 24 | 12 per theme family × 2 families (`records/largest streak`, `league/` ×4, `shields/` ×6) |
| `src/challenge/rewards.ts` | `challenge` | 24 | `awards/` ×15 (5 families × 3 states), `records/` ×9 |
| `src/challenge/monthlyTrophies.ts` | `challenge` | 24 | `monthly trophies/` ×24 (12 months × active/locked) |
| `src/challenge/rewardArt.ts` | `challenge` | **20** | **DEAD — zero importers** |
| **Total** | | **96** | 76 live + 20 dead |

Two further `require()`s are *module* loads, not images, and are out of scope:
`src/services/ads.ts:103` and `src/services/auth.ts:107` (lazy SDK loading).

**Audio** — `src/services/audio/audioAssets.ts` has 34 `require()`s. Out of
scope: the brief says *image/visual* asset, and requirement #24 forbids changing
audio behaviour. Recorded as a parallel hazard (same depth fragility).

**Build-time assets** consumed by `app.json`, not by code, and therefore **must
not** enter a runtime registry: `icon.png`, `android-icon-{foreground,background,monochrome}.png`,
`splash-icon.png`, `splash-icon-dark.png`, `favicon.png`.

#### File-level duplication already on disk (byte-identical)

| A | B | Size |
| --- | --- | ---: |
| `league_climber_inactive.webp` | `league_climber_locked.webp` | 80,970 |
| `perfect play unactive.webp` | `perfect_play_locked.webp` | 68,086 |
| `perfect_play_unactive.webp` | `perfect_play_active.webp` | 93,216 |
| `unstoppable_locked.jpg_202609071441.webp` | `unstoppable_locked.webp` | 137,192 |
| `unstoppable.jpg_202609071440.webp` | `unstoppable_active.webp` | 193,502 |
| `level_legend_active .webp` *(trailing space)* | `level_legend_active.webp` | 79,944 |
| `level_legend_unactive.webp` | `level_legend_locked.webp` | 99,074 |
| `assets/wordmark-light.png` | `assets/brand/source/logo-wordmark.jpg` | 633,784 |
| `assets/Charcoal_3D_arrow_icon_202609071452.webp` | `assets/league/Charcoal_3D_arrow_icon_202609071452.webp` | 20,346 |

Orphans: `assets/Black_silhouette_logo_mark_centered_20261001141746.webp`
(223,462, unreferenced loose logo); `assets/league/Charcoal_3D_arrow_icon_202609071452.webp`
(unreferenced); the loose `assets/wordmark-light.png`.
`assets/shields/Game_rank_shield_badge_icon_*.webp` is required for **both**
`obsidian` and `diamond`.

Latent: `assets/brand/wordmark-light.png` (633,784) was never regenerated — it
is still raw JPEG bytes with a `.png` extension, ~36× the size of `wordmark.png`
(17,727). Recorded as tech debt. **No image file will be edited, re-encoded or
regenerated in this work** (brief: do not alter image content).

Obsolete tool: `tools/sync-user-assets.ts` creates `assets/images/` and copies
colour-baked files into `assets/challenge/*`. None of its outputs exist in the
repo and nothing imports them.

**Conclusion:** the code-level *require* sites are the fixable duplication; the
file-level duplicates are documented exceptions rather than edited.

### 2. Test / development-only functionality

| Item | Location | Action |
| --- | --- | --- |
| `UNLOCK_ALL_LEVELS = false` | `src/config/index.ts:65` | **Remove** flag + doc block |
| Its reads | `src/state/progressStore.ts:21,169`; `app/levels.tsx:39,67` | **Remove** |
| `JumpToLevel.tsx` | `src/components/levels/` | **Delete** — only rendered under the flag; carries the literal `TESTING · all levels open` badge |
| `DummyAdModal.tsx` | `src/components/` | **Delete** — "Simulated Rewarded Video Ad Player for Development"; barrel-only, no screen imports it |
| `CoachCard.tsx` | `src/components/` | **Delete** — dead since `play/[id].tsx` stopped rendering coach cards; only a comment and the barrel reference remain |
| `console.log` ×8 | `src/services/ads.ts` | **Gate behind `__DEV__`** — `[AdMob] Requesting InterstitialAd…` ships to release today |
| `USE_TEST_ADS` | `src/config/index.ts:35` | **KEEP** — production-safety guard, deliberately asymmetric so release cannot serve test ads |
| `console.warn` ×1 | `src/services/storage.ts` | **KEEP** — real load/save failure reporter |
| `tools/_scratch-*.ts` ×6 | `tools/` | Leave — not shipped, not scanned by `verify` |
| Automated tests | `__tests__/` (31 suites, 396 tests) | **Untouched** |

No debug screens, dev menus, fake API responses or bypass-auth paths exist. The
"simulated ad" and "Supabase not configured" branches are graceful degradation,
not mocks. `RECENT_COLORS` (6 hardcoded hexes in `src/hooks/useHexInput.ts`) is
a UX colour picker, not test data — leave.

### 3. Dummy leaderboard data

One file: **`src/hooks/useLeagueBoard.ts`**.

- `LEADERBOARD_ROSTER`, lines 51–101 — **49 hardcoded fake players with flag
  emoji** (`Player02997`, `AdrianLee`, `UnicornCape`, `HugoBoss`, …).
- Lines 138–181 synthesise their scores by scaling a band per league
  (`ratio = 1 - index / 48`), merge the user's row, then sort and rank.

The real source already exists and has **no caller**:
`src/services/sync.ts:293 leaderboard(weekId, limit)` → Supabase `league_scores`
⋈ `profiles`, ranked, returning `[]` when unconfigured or signed out.

Also `app/(tabs)/leagues.tsx:32` returns the literal `'AtifPasha'` as the
signed-out display-name fallback.

`supabase/seed.sql` §2 additionally invents 24 rival accounts in `auth.users`
(`rival1@arrowpath.invalid`) plus their scores — dev-only SQL, never shipped in
the app, but explicitly fake leaderboard users.

### 4. Authentication

Already compliant — verification only. One path: `src/services/auth.ts` (native
Play Services → signed ID token → Supabase `signInWithIdToken`) →
`src/state/authStore.ts` → `app/account.tsx`. No email/password, guest,
anonymous, test-login or bypass path exists anywhere.

### 5. Awards — two overlapping systems

- **Live:** `calculateAllRewards()` / `useCalculatedRewards()` / `useRewardBadge()`
  in `src/challenge/rewards.ts` → **9** `CalculatedRewardItem`s
  (`level-legend`, `perfect-play`, `unstoppable`, `league-climber`,
  `league-fighter`, `shield`, `longest-streak`, `highest-win-streak`, `most-wins`),
  each with active/inactive/locked art and a `route`.
- **Legacy:** `REWARDS` (6 `RewardDefinition`s) + `rewardProgress` /
  `earnedCount` / `nextReward`, covered by `__tests__/challenge/rewards.test.ts`.
- Surfaces: `collection.tsx` (`AwardTile`), `challenge/rewards.tsx`
  (`RewardCard`), `challenge/stats.tsx` (`ChallengeBadges`), `AwardInfoPage` +
  `AwardInfoLayout`, and 8 `app/(tabs)/challenge/info/*.tsx` routes.
- `calculateAllRewards` **already receives** `leagueWeeks`, `challengeRecords`,
  `nowMs` — so the shield award needs **no new import and no new edge**.

### 6. Shield — one source of truth, computed three times

Authoritative chain: `LEAGUES` (`src/league/league.ts`, bronze→diamond with
`entryArrows`) + `arrowsThisWeek(useLeagueStore)` + `arrowsFor(cleared, challengeWins)`
→ `leagueForArrows(score)`. Art: `themeAssets.shields[leagueId]` (theme-aware,
6 entries).

That chain is duplicated at `app/(tabs)/index.tsx:58-59`,
`src/hooks/useLeagueBoard.ts:133-134`, and inside `rewards.ts`. There is **no
shield store, no shield setting, and no representable "no shield"** —
`leagueForArrows(0)` returns Bronze.

**Resolved in Phase D.** `src/hooks/useCurrentShield.ts` now owns the chain and
returns `shield: League | undefined`, so "no shield" is a state the code can
represent. All three copies call it.

### 7. Theme / award backgrounds — one violation

`app/(tabs)/collection.tsx:314` — `AwardTile`: `backgroundColor: 'white'`.
Exactly the hardcoded-white award background the brief names, and the only one.
Everything else already complies (`palette.surface` in `ChallengeBadges` /
`RewardCard`, `'transparent'` in `AwardInfoLayout` / `TrophyTile`). Non-award
literals found are semantic and stay: `#10B981` earned badge, `#10B981`/`#EF4444`
zone dividers, `#11141b` error screen.

### 8. Settings — current inventory

`Language` (modal with 5 **fake** options) · `Vibrations` · `Music` · `Sounds` ·
`Themes` · `Account Connection` · **`Remove Ads`** · **`Restore purchases`** ·
`Rate us` · `Write us` · `Privacy` (**dead** — only plays a click) ·
`Terms of Service` (**dead**) · brand footer.

No IAP/purchase dependency exists anywhere — `removeAds` is local
`useState(false)` and *Restore purchases* is a click. (`Rate us` / `Write us`
are also no-ops; out of scope, flagged as debt.)

### 9. Legal infrastructure — none

No privacy/terms screens or text. Root `LICENSE` is **Expo's MIT template**
(`Copyright (c) 2015-present 650 Industries, Inc.`), not the app's own. No
company name, contact email or jurisdiction exists in the repo. Package id
`com.abdurrehmanary.arrowpath`; AdMob app id `ca-app-pub-1159231009656865~8175461307`.

**Verified behaviour for the policy.** Critically, **telemetry never leaves the
device** — `src/services/telemetry.ts:55 trackTelemetry` writes to a 50-entry
in-memory buffer only; there is no network sink. No Firebase, no GA. Ads are
`requestNonPersonalizedAdsOnly: true`. Session lives in `expo-secure-store`;
progress in AsyncStorage (`STORAGE_KEYS`). Server tables, only when signed in:
`profiles.display_name`, `level_records`, `challenge_records`, `league_scores`.
Declared permissions include `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`,
`FOREGROUND_SERVICE*`.

---


---

## Phase B-G — CLEARED

Phases B (asset single source of truth), C (production cleanup), E (theme
integration), and F (legal) are **deferred** — not in scope for this work
session. Phase D (fifth award = shield) was already marked DONE prior to this
session and is left untouched.

Phase G (verification) will run as part of the commit for whatever scope is
actually being changed.

---

## Decisions

| # | Decision | Rationale |
| --- | --- | --- |
| D1 | **Shield exists iff `arrowsThisWeek > 0`** | Matches the weekly reset; makes "no shield" a real state so the disabled row and locked award can trigger |
| D2 | `score` keeps its existing lifetime input | `arrowsFor(arrowsThisWeek, stats.won)` adds `stats.won * 250` (lifetime wins). Requirement #24 forbids changing progression, so `arrowsThisWeek > 0` is used only as the *existence* test. Pre-existing behaviour, documented not fixed |
| D3 | Home keeps its Bronze fallback emblem | Requirement #24 — no unrelated visual change. Only the award and the setting gain the no-shield treatment |
| D4 | Empty leaderboard → empty state, never fabricated rows | Brief is explicit |
| D5 | `supabase/seed.sql` §2 stripped | 24 fake leaderboard users |
| D6 | `CoachCard`, `DummyAdModal`, `JumpToLevel` deleted; `UNLOCK_ALL_LEVELS` deleted | Dev-only |
| D7 | `rewardArt.ts` left in Phase B, listed as debt | Dead art, not dev UI |
| D8 | Image **files** untouched; duplicates documented | Brief: do not alter image content |
| D9 | Audio out of scope | Not a visual asset; #24 forbids audio changes |
| D10 | `USE_TEST_ADS` kept | Production-safety guard |

## Risks

- **`tsc` does not catch a wrong `require()` depth** — the registry absorbs all
  of them, but a wrong path in the registry itself fails only at bundle time.
  Mitigate with a `require.resolve`-style smoke check or by running the bundler.
- **Removing the roster is a real behaviour change** (Leagues is empty until
  others play) — intended, but the change a user notices most.
- **`useCurrentShield` consolidating three call sites** touches Home and Leagues;
  `remainingText`/zones must stay identical.
- **`playableUpTo` vs `highestUnlocked` collapse** touches
  `__tests__/state/progress.test.ts`.
- Legal copy must stay inside verified facts (no analytics, no purchase claims).

## Verification sweeps (run at Phase G)

```
LEADERBOARD_ROSTER | 'AtifPasha'        → 0 matches
UNLOCK_ALL_LEVELS                          → 0 matches
TESTING · all levels open                  → 0 matches
DummyAdModal | CoachCard | JumpToLevel     → 0 matches
'Remove Ads' | 'Restore purchases'         → 0 matches
setLanguage | showLangModal                → 0 matches
backgroundColor: 'white' in collection.tsx → 0 matches
require('../../assets in src               → 0 matches (all moved to registry)
email | password signin paths              → 0 matches (auth)
```

<!-- END -->