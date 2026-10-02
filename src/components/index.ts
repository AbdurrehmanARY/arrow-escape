/**
 * components/index.ts — the public surface of the component layer.
 *
 * Screens import from `@components`; nothing reaches into a component file
 * directly, so components can be split or renamed without a wide refactor.
 *
 * The board itself is no longer here, and neither is the maths it draws with.
 * `arrowGeometry`, `camera` and `cameraPresets` moved to `src/render/` in
 * Phase 9: they are pure geometry with no React in them, `render/` is the layer
 * that consumes them, and leaving them here meant `render/` had to import
 * `components/` — a layer inversion the architecture rules forbid. Use
 * `@render/*` for them.
 *
 * `Pressable.tsx` left for `shared/primitives/` in Phase 2b (see its own header
 * for why it could move without changing a call site: colour is already handed
 * to its helpers, not read from a store). Its exports are re-exported from their
 * new home below so the rest of `components/` and the `app/` routes can keep
 * pulling `Springy` from `@components` — a documented compatibility shim, not a
 * layer mistake. The 14 call sites that imported it directly were re-pointed to
 * `@shared/primitives/Pressable`; this barrel keeps the public surface stable.
 *
 * `Screen.tsx` split in Phase 2c-2: the page frame moved to
 * `shared/components/Screen.tsx` (it only ever needed the palette, which it now takes
 * as a required prop instead of reading `@state` through `useTheme`). The frame is
 * re-exported from its new home below for the same reason `Pressable` is — so the 16
 * render sites keep importing `Screen` from `@components` unchanged, and `tsc`'s
 * required-prop rule makes the site list compiler-enforced. `useTheme`, `ScreenHeader`
 * and `IconButton` stay in `./Screen`: they still touch `@state` and `./sound`.
 */
export * from './Hud';
export * from './Celebration';
export * from './CoachCard';
export * from './Overlays';
export * from './PauseMenu';
export * from '@shared/primitives/Pressable';
export * from './Screen';
export * from '@shared/components/Screen';
export * from './sound';
export * from './ChallengeBadges';
export * from './MonthlyTrophyModal';
export * from './DummyAdModal';
export * from './AwardInfoLayout';
export * from './AwardInfoPage';
export * from './levels/ChapterGrid';
export * from './levels/ChapterList';
export * from './levels/JumpToLevel';
export * from './levels/LevelTile';
export * from './LeagueIntro';
export * from './StreakRewardModal';
export * from './MonthlyTrophyBadge';

