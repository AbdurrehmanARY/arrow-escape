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
 */
export * from './Hud';
export * from './Celebration';
export * from './CoachCard';
export * from './Overlays';
export * from './PauseMenu';
export * from './Pressable';
export * from './Screen';
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

