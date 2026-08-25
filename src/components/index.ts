/**
 * components/index.ts — the public surface of the component layer.
 *
 * Screens import from `@components`; nothing reaches into a component file
 * directly, so components can be split or renamed without a wide refactor.
 */

// The board itself is no longer here. It moved to `src/render/` when rendering
// went from SVG to Skia — see `@render/SkiaBoard`. `arrowGeometry` and `camera`
// stayed, because both are pure maths shared with the new renderer and with the
// off-device theme preview.
export * from './arrowGeometry';
export * from './camera';
export * from './cameraPresets';
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
export * from './StreakRewardModal';
