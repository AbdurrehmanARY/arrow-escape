/**
 * shared/assets/images/index.ts — the public surface of the image registry.
 *
 * Purpose:      Let any layer ask for an image without knowing how the registry
 *               is organised, and keep the registry's internals (`image()`, the
 *               per-domain groups) free to change shape.
 * Responsibilities:
 *               - Re-export `ImageAsset`, `IMAGES`, `ALL_IMAGES` and the domain
 *                 groups.
 * Notes:        Lives under `shared/` so every layer may import it: `shared` is
 *               sub-rooted and barrel-exempt, and `DEEP_IMPORT_ALLOWED` in
 *               ARCHITECTURE.md §10 covers it, so `@shared/assets/images`
 *               resolves from `theme`, `challenge`, `components`, `services` and
 *               `app` with no extra mapping. That is also why `themeAssets`
 *               may import it without a cycle: `theme` → `shared` is allowed,
 *               and `shared` → `theme` is not, so the dependency runs one way.
 *
 *               Audio is deliberately not here. `src/services/audio/audioAssets.ts`
 *               owns the 34 sound `require()`s; the brief scopes this registry
 *               to images, and changing audio is out of scope.
 */

export {
  AWARD_IMAGES,
  ALL_IMAGES,
  BRAND_IMAGES,
  HEART_IMAGES,
  IMAGES,
  RECORD_IMAGES,
  SHIELD_IMAGES,
  THEME_IMAGES,
  TROPHY_IMAGES,
  imageByKey,
  type ImageAsset,
} from './registry';
