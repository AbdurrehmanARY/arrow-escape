# Implementation Audit

Fixes for three interconnected issues identified during Phase 22 playtest
preparation, plus the ongoing investigation into heart-deduction inconsistency
across Android versions.

All changes pass `npm run verify` (typecheck + lint + 434 tests + level validation).

## Phase 1: Multiplayer League Leaderboard — FIXED

### Root Cause
`leaderboard()` in `src/services/sync.ts` used a PostgREST embedded join
`profiles(display_name)` on `league_scores`. No FK path exists from
`league_scores.user_id → profiles.id` — both FKs point at `auth.users`. PostgREST
returns `PGRST200 "no relationship found"` before row-level security is evaluated,
causing `leaderboard()` to return `[]` permanently.

### Fix Applied
Replaced the broken embedded join with two separate queries joined in JavaScript:
1. Fetch `league_scores` for the week, ordered by arrows desc
2. Fetch `profiles(id, display_name)` filtered by the result's user_ids
3. Join in JS with a `Map` lookup — missing profiles default to `'Player'`

Requires no schema changes, remains in pure TypeScript.

### Files Modified
- `src/services/sync.ts`: Refactored `leaderboard()` to use two-query JS join

## Phase 1b: League Push-on-Change — FIXED

### Fix Applied
Added `pushWeekDebounced()` in `src/state/leagueStore.ts` — uses the existing
`debounce()` helper (1000ms), called from `addClear()`, `addChallengeWin()`, and
`addBonusPoints()`. Reads state directly via `getState()` to avoid stale closures.

### Files Modified
- `src/state/leagueStore.ts`: Added debounced push after every score-changing action

## Phase 1c: League Refetch-on-Focus — FIXED

### Fix Applied
Added AppState listener in `src/features/league/hooks/useLeagueBoard.ts` that
triggers `leaderboard(weekId)` refetch when app becomes active. Guards against
refetching while initial load is pending.

### Files Modified
- `src/features/league/hooks/useLeagueBoard.ts`: Added AppState listener for refetch

## Phase 2: Banner Ads — FIXED

### Root Cause
`getBannerComponent()` in `src/services/ads.ts` existed but had **zero call sites**.
The banner infrastructure was complete but never mounted anywhere.

### Fix Applied
Mounted the banner on both screens, resolved at module scope to satisfy
`react-hooks/static-components` lint rule:
- **HomeScreen.tsx**: Module-scope `BannerAd` + conditional render at bottom
- **PlayScreen.tsx**: Same pattern — module-scope resolution + conditional render

### Files Modified
- `src/services/ads.ts`: No changes needed (infrastructure was complete)
- `src/features/home/screens/HomeScreen.tsx`: Added banner mount
- `src/features/gameplay/screens/PlayScreen.tsx`: Added banner mount

## Phase 3: Arrow Tap Delay — FIXED

### Root Cause
The tap gesture had `isIntroAnimating.value` guards in `onBegin` and `onEnd`.
The intro animation is 200ms pause + 1100ms zoom — a ~1.3s window where taps
were silently dropped, creating perceived lag.

### Fix Applied
Removed `isIntroAnimating` guards from `onBegin` and `onEnd`:
- Taps now provide immediate press feedback
- Taps now fire immediately instead of being blocked during intro
- Removed `isIntroAnimating` from `UseBoardGesturesArgs` interface and destructuring
- Removed `isIntroAnimating` from SkiaBoard.tsx's `useBoardGestures` call

The `isIntroAnimating` shared value still exists in `useBoardCamera.ts` for
camera animation state tracking. The intro zoom still plays — only its tap-blocking
side effect is removed.

### Files Modified
- `src/render/gestures/useBoardGestures.ts`: Removed guards
- `src/render/SkiaBoard.tsx`: Removed param from call site

## Phase 4: Heart Deduction — ROOT CAUSE IDENTIFIED (DEVICE TESTING REQUIRED)

### Current Understanding
Heart deduction uses the `chargedArrows` logic in `src/game/rules.ts` — the rules
are pure, deterministic, and charge exactly once per arrow. No evidence of rule-level
bugs; all 434 unit tests pass.

### Hypothesis
Inconsistency stems from the input layer:
- `Gesture.Race` between tap, pan, and pinch in `useBoardGestures.ts`
- The previous ~1.3s tap-dead zone during intro (now fixed in Phase 3)
- Potential touch variance on older Android versions

### Device Testing Required
Physical Android devices (10-16) to verify:
- Hearts deducted exactly once per valid tap
- No double-deducts on rapid taps
- Correct count after background/resume
- Consistent behavior across versions

## Testing Summary

### Automated Verification ✓
- `npx tsc --noEmit`: No type errors
- `npx eslint . --max-warnings=0`: No lint errors
- `npm test`: All 434 tests pass (34 test suites)
- `npm run levels:validate`: All 1000 levels decode and are solvable

### Manual Verification Required
1. League multiplayer: Two devices, two accounts, verify leaderboard sync
2. Banner ads: Test on device with test ad unit IDs
3. Heart deduction: Android 10-16 devices, verify consistent behavior
4. Tap responsiveness: Measure tap-to-arrow-movement start time