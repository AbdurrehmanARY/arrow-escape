/**
 * make-app-images.ts — generate missing image assets for the UI.
 */

import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const imagesDir = join(process.cwd(), 'assets', 'images');
if (!existsSync(imagesDir)) {
  mkdirSync(imagesDir, { recursive: true });
}

// 1. Copy trophy_01.png to cup.png if cup.png doesn't exist or as replacement
const trophySrc = join(process.cwd(), 'assets', 'challenge', 'trophy_01.png');
const cupDst = join(imagesDir, 'cup.png');
copyFileSync(trophySrc, cupDst);
console.log('Created assets/images/cup.png');

// 2. Generate dark/matte arrow icon PNG for arrow_icon.png
const size = 128;
const png = new PNG({ width: size, height: size });

// Color definitions (Dark Matte #18181B / #3F3F46 arrow)
const ARROW_COLOR = { r: 0x18, g: 0x18, b: 0x1b, a: 255 };

// Point & segment helpers
interface Point { x: number; y: number; }

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function insideTriangle(p: Point, a: Point, b: Point, c: Point): boolean {
  const sign = (p1: Point, p2: Point, p3: Point) =>
    (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  const d1 = sign(p, a, b);
  const d2 = sign(p, b, c);
  const d3 = sign(p, c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

// Arrow geometry pointing up-right
const body: Point[] = [
  { x: 30, y: 98 },
  { x: 30, y: 55 },
  { x: 75, y: 55 },
  { x: 75, y: 35 },
];
const strokeWidth = 22;
const halfStroke = strokeWidth / 2;
const tip: Point = { x: 75, y: 15 };
const left: Point = { x: 50, y: 35 };
const right: Point = { x: 100, y: 35 };

const SUB = 4;

for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    let hits = 0;
    for (let sy = 0; sy < SUB; sy++) {
      for (let sx = 0; sx < SUB; sx++) {
        const p = { x: x + (sx + 0.5) / SUB, y: y + (sy + 0.5) / SUB };
        let hit = false;
        for (let i = 1; i < body.length; i++) {
          if (distanceToSegment(p, body[i - 1]!, body[i]!) <= halfStroke) {
            hit = true;
            break;
          }
        }
        if (!hit && insideTriangle(p, tip, left, right)) {
          hit = true;
        }
        if (hit) hits++;
      }
    }
    const alpha = hits / (SUB * SUB);
    const idx = (size * y + x) << 2;
    png.data[idx] = ARROW_COLOR.r;
    png.data[idx + 1] = ARROW_COLOR.g;
    png.data[idx + 2] = ARROW_COLOR.b;
    png.data[idx + 3] = Math.round(alpha * 255);
  }
}

const arrowDst = join(imagesDir, 'arrow_icon.png');
writeFileSync(arrowDst, PNG.sync.write(png));
console.log('Created assets/images/arrow_icon.png');
