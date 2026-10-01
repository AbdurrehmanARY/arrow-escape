/**
 * clean-image-backgrounds.ts — Make image backgrounds transparent across the game.
 *
 * Converts solid-background JPEGs into clean, transparent PNGs via flood-fill
 * alpha masking from outer borders, preserving all subject details, highlights,
 * and icons.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
// @ts-ignore
import Jimp from 'jimp-compact';

interface ProcessOptions {
  mode: 'light' | 'dark';
  lumThreshold: number; // e.g. 175 for light, 115 for dark
  satThreshold: number; // e.g. 18
  feather: number;      // alpha ramp width
}

async function removeBackground(
  inputPath: string,
  outputPath: string,
  options?: Partial<ProcessOptions>
): Promise<void> {
  const jimpImage = await Jimp.read(inputPath);
  const w = jimpImage.bitmap.width;
  const h = jimpImage.bitmap.height;

  // Read corners and border to determine mode if not explicitly passed
  let borderLumSum = 0;
  let borderSamples = 0;
  const samplePixels: { r: number; g: number; b: number }[] = [];

  for (let x = 0; x < w; x += 10) {
    const p1 = Jimp.intToRGBA(jimpImage.getPixelColor(x, 0));
    const p2 = Jimp.intToRGBA(jimpImage.getPixelColor(x, h - 1));
    borderLumSum += (p1.r + p1.g + p1.b) / 3 + (p2.r + p2.g + p2.b) / 3;
    borderSamples += 2;
    samplePixels.push(p1, p2);
  }
  for (let y = 0; y < h; y += 10) {
    const p1 = Jimp.intToRGBA(jimpImage.getPixelColor(0, y));
    const p2 = Jimp.intToRGBA(jimpImage.getPixelColor(w - 1, y));
    borderLumSum += (p1.r + p1.g + p1.b) / 3 + (p2.r + p2.g + p2.b) / 3;
    borderSamples += 2;
    samplePixels.push(p1, p2);
  }

  const avgBorderLum = borderLumSum / borderSamples;
  const isLight = avgBorderLum > 130;
  const mode = options?.mode ?? (isLight ? 'light' : 'dark');
  const lumThreshold = options?.lumThreshold ?? (mode === 'light' ? 175 : 115);
  const satThreshold = options?.satThreshold ?? 18;
  const feather = options?.feather ?? 25;

  // Buffer for alpha: 255 = fully opaque, 0 = fully transparent
  const alphaMap = new Uint8Array(w * h);
  alphaMap.fill(255);

  const visited = new Uint8Array(w * h);
  const queue: number[] = []; // store 1D indices (y * w + x)

  // Seed borders
  for (let x = 0; x < w; x++) {
    queue.push(x); // y = 0
    visited[x] = 1;
    const bIdx = (h - 1) * w + x;
    queue.push(bIdx);
    visited[bIdx] = 1;
  }
  for (let y = 1; y < h - 1; y++) {
    const lIdx = y * w;
    queue.push(lIdx); // x = 0
    visited[lIdx] = 1;
    const rIdx = y * w + (w - 1);
    queue.push(rIdx); // x = w - 1
    visited[rIdx] = 1;
  }

  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    if (idx === undefined) break;
    const x = idx % w;
    const y = Math.floor(idx / w);

    const color = Jimp.intToRGBA(jimpImage.getPixelColor(x, y));
    const lum = (color.r + color.g + color.b) / 3;
    const sat = Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);

    let isBg = false;
    let alpha = 255;

    if (mode === 'light') {
      if (sat <= satThreshold) {
        if (lum >= lumThreshold) {
          isBg = true;
          alpha = 0;
        } else if (lum > lumThreshold - feather) {
          // Feather edge
          const t = (lum - (lumThreshold - feather)) / feather;
          alpha = Math.round(255 * (1 - t));
          isBg = true;
        }
      }
    } else {
      // Dark mode background
      if (sat <= satThreshold) {
        if (lum <= lumThreshold) {
          isBg = true;
          alpha = 0;
        } else if (lum < lumThreshold + feather) {
          const t = (lumThreshold + feather - lum) / feather;
          alpha = Math.round(255 * (1 - t));
          isBg = true;
        }
      }
    }

    if (isBg) {
      alphaMap[idx] = alpha;

      // Expand to 4 neighbors if alpha === 0 (full background)
      if (alpha === 0) {
        const neighbors = [
          x > 0 ? idx - 1 : -1,
          x < w - 1 ? idx + 1 : -1,
          y > 0 ? idx - w : -1,
          y < h - 1 ? idx + w : -1,
        ];
        for (const n of neighbors) {
          if (n >= 0 && visited[n] === 0) {
            visited[n] = 1;
            queue.push(n);
          }
        }
      }
    }
  }

  // Create PNG with alpha channel
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const color = Jimp.intToRGBA(jimpImage.getPixelColor(x, y));
      const pngIdx = idx * 4;
      png.data[pngIdx] = color.r;
      png.data[pngIdx + 1] = color.g;
      png.data[pngIdx + 2] = color.b;
      png.data[pngIdx + 3] = alphaMap[idx] ?? 255;
    }
  }

  const pngBuffer = PNG.sync.write(png);
  writeFileSync(outputPath, pngBuffer);
  console.log(`Processed ${inputPath} -> ${outputPath} (mode: ${mode}, w: ${w}, h: ${h})`);
}

async function cleanPngEdges(filePath: string): Promise<void> {
  const data = readFileSync(filePath);
  const png = PNG.sync.read(data);
  const w = png.width;
  const h = png.height;

  // Clear any residual corner/border artifacts within 3px of borders if mostly transparent
  let cleaned = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < 4 || x >= w - 4 || y < 4 || y >= h - 4) {
        const idx = (y * w + x) * 4;
        const a = png.data[idx + 3];
        // If not completely opaque or corner pixel
        if (a !== undefined && a > 0 && a < 240) {
          png.data[idx + 3] = 0;
          cleaned++;
        }
      }
    }
  }

  if (cleaned > 0) {
    writeFileSync(filePath, PNG.sync.write(png));
    console.log(`Cleaned ${cleaned} edge pixels in ${filePath}`);
  }
}

async function main() {
  const root = process.cwd();

  // 1. Records assets
  const records = [
    'largest streak.jpg',
    'largest streak_inactive.jpg',
    'largest streak_locked.jpg',
    'highest_win_streak.jpg',
    'highest_win_streak-inactive.jpg',
    'highest_win_streak_locked.jpg',
    'most_win.jpeg',
    'most_win_inative.jpeg',
    'most_win_locked.jpeg',
  ];

  for (const r of records) {
    const inPath = join(root, 'assets', 'records', r);
    // Replace .jpg/.jpeg with .png
    const outName = r.replace(/\.(jpg|jpeg)$/i, '.png');
    const outPath = join(root, 'assets', 'records', outName);
    await removeBackground(inPath, outPath);
  }

  // 2. League 3D arrow icon
  const arrowIn = join(root, 'assets', 'league', 'Charcoal_3D_arrow_icon_202609071452.jpeg');
  const arrowOut = join(root, 'assets', 'league', 'Charcoal_3D_arrow_icon_202609071452.png');
  await removeBackground(arrowIn, arrowOut);

  // 3. Process league_fighter awards
  const awardsToProcess = [
    'league_fighter_inactive.png',
    'league_fighter_locked.png',
  ];
  for (const a of awardsToProcess) {
    const fullPath = join(root, 'assets', 'awards', a);
    if (existsSync(fullPath)) {
      await removeBackground(fullPath, fullPath, { mode: 'dark', lumThreshold: 110, satThreshold: 20 });
    }
  }

  // 4. Clean residual edge pixels in league_fighter_*.png
  const awardsToClean = [
    join(root, 'assets', 'awards', 'league_fighter_active.png'),
    join(root, 'assets', 'awards', 'league_fighter_inactive.png'),
    join(root, 'assets', 'awards', 'league_fighter_locked.png'),
    join(root, 'assets', 'awards', 'league fighter .png'),
  ];
  for (const a of awardsToClean) {
    if (existsSync(a)) {
      await cleanPngEdges(a);
    }
  }

  console.log('Background transparency processing complete.');
}

main().catch((err) => {
  console.error('Error processing image backgrounds:', err);
  process.exit(1);
});
