/**
 * components/index.ts — the public surface of the component layer.
 *
 * Screens import from `@components`; nothing reaches into a component file
 * directly, so components can be split or renamed without a wide refactor.
 */

export * from './arrowGeometry';
export * from './ArrowSnake';
export * from './BoardCanvas';
export * from './camera';
export * from './BoardViewport';
export * from './Hud';
export * from './Celebration';
export * from './CoachCard';
export * from './Overlays';
export * from './Screen';
