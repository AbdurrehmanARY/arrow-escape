/**
 * make-brand-assets.ts — derive every shipped brand image from the approved art.
 *
 * Purpose:      Turn the five approved Arrow Puzzle logo files into production PNGs
 *               at the exact sizes Expo, Android and Google Play expect.
 * Responsibilities:
 *               - Un-mask the artwork.
 *               - Crop to the mark, resample it cleanly, recolour it to the palette.
 *               - Emit the in-app marks, the wordmark lockup, and every
 *                 launcher/splash and store asset.
 * Notes:        The source JPEGs have *fake* transparency: a grey checkerboard is
 *               painted into the pixels and the mark sits on top of it. Measured
 *               luminance across the five files shows two dominant light bands (the
 *               checkerboard) and a dark mark, with the lightest checkerboard band
 *               at L160 and the mark's interior below L64. So a ramp rather than a
 *               hard cut separates them, which keeps the mark's own anti-aliased
 *               edge — a threshold would chew it off and leave a jagged outline.
 *
 *               Everything downstream is generated from these five files, so the
 *               icon, the adaptive layers, the splash mark and the store listing
 *               cannot drift apart: they are the same drawing at different sizes.
 *
 *               Colours are the game's own (see src/theme/themes.ts). The mark ships
 *               in charcoal for light grounds and bone for dark ones, because a
 *               single flat mark is invisible on half the shipped themes.
 *
 *               Run: `npm run icons:brand`
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
// @ts-ignore
import Jimp from 'jimp-compact';

interface Rgba {
  r: number;
  g: number;
  b: number;
}

/** A coverage mask: alpha 0..1 per pixel, row-major. */
interface Mask {
  width: number;
  height: number;
  alpha: Float32Array;
}

/** The game's palette, mirrored from src/theme/themes.ts. */
const CHARCOAL: Rgba = { r: 0x3b, g: 0x36, b: 0x30 };
const BONE: Rgba = { r: 0xf6, g: 0xf4, b: 0xee };
const PAPER: Rgba = { r: 0xee, g: 0xeb, b: 0xe4 };
const BLACK: Rgba = { r: 0, g: 0, b: 0 };

/** Alpha ramp across the luminance gap between the mark and the checkerboard. */
const INK_MAX_LUM = 96;
const INK_MIN_LUM = 136;

/** The approved artwork, and what each file is for. */
const SOURCES = {
  /** The horizontal lockup: mark plus "ARROW PUZZLE". */
  wordmark: 'logo-wordmark.jpg',
  /** The master mark: one bold bend and a large head. */
  mark: 'mark-minimalist.jpg',
  /** Lighter alternate weight, kept as an approved source. */
  line: 'mark-line.jpg',
  /** Heavier alternate weight, kept as an approved source. */
  thick: 'mark-thick.jpg',
  /** Closed silhouette, for the Android 13+ themed-icon layer. */
  silhouette: 'mark-silhouette.jpg',
} as const;

const SOURCE_DIR = join(process.cwd(), 'assets', 'brand', 'source');

/**
 * Read a source JPEG and reduce it to a coverage mask.
 *
 * Returns alpha 0..1 per pixel: 1 inside the mark, 0 on the checkerboard, and a
 * partial value in between so the mark's own edge survives the round trip.
 */
async function readMask(file: string): Promise<Mask> {
  const image = await Jimp.read(join(SOURCE_DIR, file));
  const { width, height, data } = image.bitmap;
  const alpha = new Float32Array(width * height);

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
    const t = (INK_MIN_LUM - lum) / (INK_MIN_LUM - INK_MAX_LUM);
    alpha[p] = t <= 0 ? 0 : t >= 1 ? 1 : t;
  }

  return { width, height, alpha };
}

/**
 * The bounding box of everything with real coverage, plus a one-pixel margin.
 *
 * The source files are square canvases with a lot of dead space around the mark,
 * and the amount differs per file. Cropping here means the same `fit` value means
 * the same thing for every asset, so nothing is accidentally rendered small.
 */
function cropToContent(mask: Mask): Mask {
  const { width, height, alpha } = mask;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((alpha[y * width + x] ?? 0) > 0.02) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) throw new Error('No mark found in source image.');

  const x0 = Math.max(0, minX - 1);
  const y0 = Math.max(0, minY - 1);
  const x1 = Math.min(width, maxX + 2);
  const y1 = Math.min(height, maxY + 2);
  const outWidth = x1 - x0;
  const outHeight = y1 - y0;
  const out = new Float32Array(outWidth * outHeight);

  for (let y = 0; y < outHeight; y += 1) {
    for (let x = 0; x < outWidth; x += 1) {
      out[y * outWidth + x] = alpha[(y0 + y) * width + (x0 + x)] ?? 0;
    }
  }

  return { width: outWidth, height: outHeight, alpha: out };
}

/**
 * Resample a coverage mask into a target box, preserving aspect ratio.
 *
 * A plain nearest-neighbour resize aliases badly here, because the mark is mostly
 * long thin diagonals — exactly the shape that shatters under point sampling. So
 * this is an area average: every destination pixel integrates the whole source
 * region it covers. That is a correct box filter when shrinking, which is the only
 * direction these assets go.
 */
function resample(mask: Mask, targetWidth: number, targetHeight: number): Float32Array {
  const { width, height, alpha } = mask;
  const out = new Float32Array(targetWidth * targetHeight);
  const scaleX = width / targetWidth;
  const scaleY = height / targetHeight;

  for (let y = 0; y < targetHeight; y += 1) {
    const sy0 = y * scaleY;
    const sy1 = (y + 1) * scaleY;
    const y0 = Math.floor(sy0);
    const y1 = Math.min(height, Math.max(y0 + 1, Math.ceil(sy1)));

    for (let x = 0; x < targetWidth; x += 1) {
      const sx0 = x * scaleX;
      const sx1 = (x + 1) * scaleX;
      const x0 = Math.floor(sx0);
      const x1 = Math.min(width, Math.max(x0 + 1, Math.ceil(sx1)));

      let sum = 0;
      let weight = 0;

      for (let sy = y0; sy < y1; sy += 1) {
        // How much of this source row falls inside the destination pixel.
        const wy = Math.min(sy1, sy + 1) - Math.max(sy0, sy);
        if (wy <= 0) continue;

        for (let sx = x0; sx < x1; sx += 1) {
          const wx = Math.min(sx1, sx + 1) - Math.max(sx0, sx);
          if (wx <= 0) continue;

          const w = wx * wy;
          sum += (alpha[sy * width + sx] ?? 0) * w;
          weight += w;
        }
      }

      out[y * targetWidth + x] = weight > 0 ? sum / weight : 0;
    }
  }

  return out;
}

/**
 * Compose the mark onto a square canvas.
 *
 * `fit` is the fraction of the canvas the mark's longest side should occupy, which
 * is how each destination gets its inset: a launcher icon wants the mark small and
 * centred so no mask can clip it, a splash mark wants it larger.
 *
 * With a background the result is opaque and the mark is blended in; without one
 * the mark carries its own alpha.
 */
function render(
  mask: Mask,
  size: number,
  options: { ink: Rgba; background?: Rgba; fit?: number },
): PNG {
  const fit = options.fit ?? 0.78;
  const scale = Math.min(size / mask.width, size / mask.height) * fit;
  const drawWidth = Math.max(1, Math.round(mask.width * scale));
  const drawHeight = Math.max(1, Math.round(mask.height * scale));
  const scaled = resample(mask, drawWidth, drawHeight);

  const background = options.background;
  const originX = Math.round((size - drawWidth) / 2);
  const originY = Math.round((size - drawHeight) / 2);
  const png = new PNG({ width: size, height: size });

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const lx = x - originX;
      const ly = y - originY;
      const inside = lx >= 0 && lx < drawWidth && ly >= 0 && ly < drawHeight;
      const cover = inside ? (scaled[ly * drawWidth + lx] ?? 0) : 0;
      const i = (y * size + x) * 4;

      if (cover <= 0) {
        // Outside the mark: either transparent, or the flat background colour.
        png.data[i] = background ? background.r : 0;
        png.data[i + 1] = background ? background.g : 0;
        png.data[i + 2] = background ? background.b : 0;
        png.data[i + 3] = background ? 255 : 0;
        continue;
      }

      if (background) {
        png.data[i] = Math.round(background.r + (options.ink.r - background.r) * cover);
        png.data[i + 1] = Math.round(background.g + (options.ink.g - background.g) * cover);
        png.data[i + 2] = Math.round(background.b + (options.ink.b - background.b) * cover);
        png.data[i + 3] = 255;
      } else {
        png.data[i] = options.ink.r;
        png.data[i + 1] = options.ink.g;
        png.data[i + 2] = options.ink.b;
        png.data[i + 3] = Math.round(cover * 255);
      }
    }
  }

  return png;
}

/**
 * The wordmark lockup as one wide transparent image.
 *
 * Kept at the source's own aspect ratio rather than squared, because "ARROW PUZZLE"
 * is a line of type: forcing it into a square box would stretch the letterforms.
 */
function renderWordmark(mask: Mask, ink: Rgba, targetWidth = 1200): PNG {
  const targetHeight = Math.max(1, Math.round((mask.height / mask.width) * targetWidth));
  const scaled = resample(mask, targetWidth, targetHeight);
  const png = new PNG({ width: targetWidth, height: targetHeight });

  for (let p = 0; p < scaled.length; p += 1) {
    const i = p * 4;
    png.data[i] = ink.r;
    png.data[i + 1] = ink.g;
    png.data[i + 2] = ink.b;
    png.data[i + 3] = Math.round((scaled[p] ?? 0) * 255);
  }

  return png;
}

/**
 * The Google Play feature graphic, which must be exactly 1024x500.
 *
 * Laid out here rather than derived from the lockup alone because the approved
 * lockup is a single wide row, and a 1024x500 banner needs the mark *above* the
 * wordmark to fill the space without leaving the type tiny.
 */
function renderFeatureGraphic(wordmark: Mask, mark: Mask): PNG {
  const width = 1024;
  const height = 500;
  const png = new PNG({ width, height });

  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = PAPER.r;
    png.data[i + 1] = PAPER.g;
    png.data[i + 2] = PAPER.b;
    png.data[i + 3] = 255;
  }

  const blit = (source: Mask, boxWidth: number, boxHeight: number, centreY: number): void => {
    const scale = Math.min(boxWidth / source.width, boxHeight / source.height);
    const drawWidth = Math.max(1, Math.round(source.width * scale));
    const drawHeight = Math.max(1, Math.round(source.height * scale));
    const scaled = resample(source, drawWidth, drawHeight);
    const originX = Math.round((width - drawWidth) / 2);
    const originY = Math.round(centreY - drawHeight / 2);

    for (let y = 0; y < drawHeight; y += 1) {
      const py = originY + y;
      if (py < 0 || py >= height) continue;

      for (let x = 0; x < drawWidth; x += 1) {
        const px = originX + x;
        if (px < 0 || px >= width) continue;

        const cover = scaled[y * drawWidth + x] ?? 0;
        if (cover <= 0) continue;

        const i = (py * width + px) * 4;
        png.data[i] = Math.round(PAPER.r + (CHARCOAL.r - PAPER.r) * cover);
        png.data[i + 1] = Math.round(PAPER.g + (CHARCOAL.g - PAPER.g) * cover);
        png.data[i + 2] = Math.round(PAPER.b + (CHARCOAL.b - PAPER.b) * cover);
      }
    }
  };

  blit(mark, 130, 130, 178);
  blit(wordmark, 760, 170, 330);

  return png;
}

/** Write a PNG into the repo, creating the directory if it is new. */
function write(relative: string, png: PNG): void {
  const path = join(process.cwd(), relative);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, PNG.sync.write(png));
  console.log(`  ${relative}  ${png.width}x${png.height}`);
}

/**
 * Derive every asset.
 *
 * Written as one flat list of destinations so the whole brand surface is visible in
 * a single screen — if a new place needs a logo, it belongs in this list.
 */
async function main(): Promise<void> {
  const missing = Object.values(SOURCES).filter((file) => !existsSync(join(SOURCE_DIR, file)));
  if (missing.length > 0) {
    throw new Error(`Missing approved source art in assets/brand/source: ${missing.join(', ')}`);
  }

  console.log('Deriving Arrow Puzzle brand assets from the approved artwork:');

  const [mark, wordmark, silhouette] = await Promise.all([
    readMask(SOURCES.mark),
    readMask(SOURCES.wordmark),
    readMask(SOURCES.silhouette),
  ]);

  const markInk = cropToContent(mark);
  const lockup = cropToContent(wordmark);
  const monochrome = cropToContent(silhouette);

  // ---- In-app marks -------------------------------------------------------
  // Both polarities, because half the shipped themes are dark grounds and a single
  // charcoal mark would disappear on Midnight, Blueprint and Kinetic Neon.
  write('assets/brand/arrow-mark.png', render(markInk, 512, { ink: CHARCOAL, fit: 0.86 }));
  write('assets/brand/arrow-mark-light.png', render(markInk, 512, { ink: BONE, fit: 0.86 }));
  write('assets/brand/wordmark.png', renderWordmark(lockup, CHARCOAL));
  write('assets/brand/wordmark-light.png', renderWordmark(lockup, BONE));

  // ---- Launcher, splash, web ---------------------------------------------
  // The store icon is the approved art on the game's paper ground.
  write('assets/icon.png', render(markInk, 1024, { ink: CHARCOAL, background: PAPER, fit: 0.7 }));

  // Adaptive foreground: transparent and inset hard, because launchers crop to
  // masks that differ per device and anything near the edge can be lost.
  write('assets/android-icon-foreground.png', render(markInk, 1024, { ink: CHARCOAL, fit: 0.5 }));

  // Adaptive background: a flat colour only. It gets masked, so it carries no art.
  {
    const png = new PNG({ width: 1024, height: 1024 });
    for (let i = 0; i < png.data.length; i += 4) {
      png.data[i] = PAPER.r;
      png.data[i + 1] = PAPER.g;
      png.data[i + 2] = PAPER.b;
      png.data[i + 3] = 255;
    }
    write('assets/android-icon-background.png', png);
  }

  // Android 13+ themed icons take one flat silhouette and tint it themselves, so
  // this uses the dedicated silhouette art rather than the open mark.
  write('assets/android-icon-monochrome.png', render(monochrome, 1024, { ink: BLACK, fit: 0.5 }));

  // Splash: transparent, so it sits on the themed splash ground. Two files, because
  // `expo-splash-screen` uses a light ground in light mode and a dark one in dark
  // mode — a single polarity would be invisible on one of them.
  write('assets/splash-icon.png', render(markInk, 512, { ink: CHARCOAL, fit: 0.8 }));
  write('assets/splash-icon-dark.png', render(markInk, 512, { ink: BONE, fit: 0.8 }));

  // A favicon needs an opaque ground: browsers draw transparency as white, and the
  // bone mark would vanish on it.
  write('assets/favicon.png', render(markInk, 96, { ink: CHARCOAL, background: PAPER, fit: 0.78 }));

  // ---- Google Play listing -----------------------------------------------
  write(
    'store/play-icon-512.png',
    render(markInk, 512, { ink: CHARCOAL, background: PAPER, fit: 0.7 }),
  );
  write(
    'store/play-icon-1024.png',
    render(markInk, 1024, { ink: CHARCOAL, background: PAPER, fit: 0.7 }),
  );
  write('store/feature-graphic-1024x500.png', renderFeatureGraphic(lockup, markInk));

  console.log('\nDone. Run `npx expo start --clear` to pick up the launcher changes.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
