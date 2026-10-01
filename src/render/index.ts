/**
 * render/index.ts — the public surface of the rendering layer.
 *
 * Purpose:      One import path for the Skia board and the maths it draws with,
 *               so `app/` and `components/` never reach into `render/` internals.
 * Notes:        `arrowGeometry`, `camera` and `cameraPresets` moved here from
 *               `components/` in Phase 9. They are pure geometry with no React in
 *               them, and this is the layer that consumes them — leaving them in
 *               the component layer made `render/` depend upward on `components/`,
 *               which ARCHITECTURE.md §3 forbids. They are exported from here
 *               rather than imported by file so the old `@components/x` paths have
 *               exactly one correct replacement.
 *
 *               Deliberately NOT exported: `SkiaBoard`. The board is a top-level
 *               surface, not a helper — it is mounted directly by the play screen
 *               and composed with nothing else here — so it stays at
 *               `@render/SkiaBoard` rather than being re-exported. The checker in
 *               `tools/check-architecture.ts` sanctions exactly this one import.
 */

export * from './arrowGeometry';
export * from './camera';
export * from './cameraPresets';
export * from './hitTest';
export * from './timings';
export * from './scene';
// Board interaction lives one level down so a Skia node, a gesture handler and a
// camera hook are not siblings of the scene graph that composes them.
//
// Note the folder is `view/`, not `camera/`: `camera.ts` and `cameraPresets.ts` sit
// beside this index, and a `camera/` directory next to a `camera.ts` file is an
// ambiguity that resolves differently on a case-insensitive filesystem than on a
// case-sensitive one. Same for `render/arrows/` vs the `arrowGeometry` file.
export * from './arrows/ArrowNode';
export * from './effects/PressOverlay';
export * from './effects/DepartingDotsNode';
export * from './view/useBoardCamera';
export * from './gestures/useBoardGestures';
