/**
 * fix-png-headers.ts — convert mislabeled JPEGs with .png extensions into valid PNG files.
 *
 * AAPT2 fails to compile Android release resources when a file named .png is actually a JPEG.
 * This tool scans `assets/` and re-encodes any mislabeled images to true PNG format using jimp-compact.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
// @ts-ignore
import Jimp from 'jimp-compact';

async function fixPngs(dir: string): Promise<void> {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      await fixPngs(fullPath);
    } else if (entry.endsWith('.png')) {
      const buffer = readFileSync(fullPath);
      // Check if JPEG header (0xFF 0xD8)
      if (buffer[0] === 0xff && buffer[1] === 0xd8) {
        console.log(`Converting JPEG to true PNG: ${fullPath}`);
        const image = await Jimp.read(fullPath);
        await image.writeAsync(fullPath);
        console.log(`Fixed: ${fullPath}`);
      }
    }
  }
}

async function main() {
  console.log('Scanning assets directory for mislabeled PNG files...');
  await fixPngs('assets');
  console.log('Asset image check and conversion complete.');
}

main().catch((err) => {
  console.error('Error fixing PNG headers:', err);
  process.exit(1);
});
