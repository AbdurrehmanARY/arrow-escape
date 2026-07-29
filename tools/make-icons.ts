/**
 * make-icons.ts — draw the app icon from the game's own art.
 *
 * Purpose:      Replace Expo's placeholder icons with something that is actually
 *               this game.
 * Responsibilities:
 *               - Rasterise a snake — rounded body, triangular head — to PNG.
 *               - Emit the icon, adaptive icon pair, splash mark, and favicon.
 * Notes:        Rasterised by hand because there is no image library here worth
 *               adding a native dependency for. It is not much work: a thick
 *               rounded line is exactly "every pixel within half a stroke of the
 *               polyline", which is a distance test, and a triangle is three
 *               half-plane tests. Supersampling 4x4 per pixel gives clean edges.
 *
 *               Drawn with the same proportions the renderer uses, so the icon is
 *               the game rather than an illustration of it. A single bold arrow
 *               with one bend: at 48px in a launcher, a whole tangle turns to
 *               mush, and the arrowhead is the thing that has to survive.
 *
 *               Run: `npm run icons:build`
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

interface Point {
  x: number;
  y: number;
}

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const PAPER: Rgba = { r: 0x3b, g: 0x36, b: 0x30, a: 255 };
const BONE: Rgba = { r: 0xf6, g: 0xf4, b: 0xee, a: 255 };
const MIDNIGHT: Rgba = { r: 0x16, g: 0x1a, b: 0x2c, a: 255 };
const DOT: Rgba = { r: 0x2c, g: 0x33, b: 0x50, a: 255 };
const CLEAR: Rgba = { r: 0, g: 0, b: 0, a: 0 };

/** Squared distance from a point to a segment. Squared to avoid a needless sqrt. */
function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(p.x - a.x, p.y - a.y);

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Inside test for a triangle, via the sign of three cross products. */
function insideTriangle(p: Point, a: Point, b: Point, c: Point): boolean {
  const sign = (p1: Point, p2: Point, p3: Point) =>
    (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);

  const d1 = sign(p, a, b);
  const d2 = sign(p, b, c);
  const d3 = sign(p, c, a);
  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNegative && hasPositive);
}

interface ArrowShape {
  readonly body: readonly Point[];
  readonly stroke: number;
  readonly tip: Point;
  readonly left: Point;
  readonly right: Point;
}

/**
 * The icon's arrow, in a 0..1 square.
 *
 * One bend and a large head. A straight arrow reads as a generic UI chevron; a
 * full tangle is unreadable at launcher size. One bend says "these bodies wind"
 * while still resolving at 48px.
 */
function buildArrow(size: number, inset: number): ArrowShape {
  const s = (v: number) => inset + v * (size - inset * 2);

  // Tail low-left, up, then right toward the head.
  const body: Point[] = [
    { x: s(0.16), y: s(0.82) },
    { x: s(0.16), y: s(0.44) },
    { x: s(0.5), y: s(0.44) },
    { x: s(0.5), y: s(0.22) },
  ];

  const stroke = (size - inset * 2) * 0.17;
  const head = body[body.length - 1]!;
  // Head continues upward out of the last segment.
  const tipLength = (size - inset * 2) * 0.2;
  const halfWidth = stroke * 1.25;

  const shape: ArrowShape = {
    body,
    stroke,
    tip: { x: head.x, y: head.y - tipLength },
    left: { x: head.x - halfWidth, y: head.y },
    right: { x: head.x + halfWidth, y: head.y },
  };

  // Centre on the mark's *drawn* bounds, not its path coordinates. The stroke
  // radius and the arrowhead both stick out well past the polyline, and by
  // different amounts on each axis, so eyeballing the offsets leaves it visibly
  // low and left in the launcher.
  return centreShape(shape, size);
}

/** Shift a shape so its ink is centred in a `size` square. */
function centreShape(shape: ArrowShape, size: number): ArrowShape {
  const half = shape.stroke / 2;
  const xs: number[] = [];
  const ys: number[] = [];

  for (const point of shape.body) {
    xs.push(point.x - half, point.x + half);
    ys.push(point.y - half, point.y + half);
  }
  for (const point of [shape.tip, shape.left, shape.right]) {
    xs.push(point.x);
    ys.push(point.y);
  }

  const dx = size / 2 - (Math.min(...xs) + Math.max(...xs)) / 2;
  const dy = size / 2 - (Math.min(...ys) + Math.max(...ys)) / 2;
  const move = (p: Point): Point => ({ x: p.x + dx, y: p.y + dy });

  return {
    body: shape.body.map(move),
    stroke: shape.stroke,
    tip: move(shape.tip),
    left: move(shape.left),
    right: move(shape.right),
  };
}

/** Is this exact point inside the arrow? */
function hitsArrow(p: Point, arrow: ArrowShape): boolean {
  const half = arrow.stroke / 2;
  for (let i = 1; i < arrow.body.length; i += 1) {
    if (distanceToSegment(p, arrow.body[i - 1]!, arrow.body[i]!) <= half) return true;
  }
  return insideTriangle(p, arrow.tip, arrow.left, arrow.right);
}

export interface IconOptions {
  readonly size: number;
  readonly background: Rgba;
  readonly arrowColor: Rgba;
  /** Blank margin, as a fraction of the size. Adaptive icons need a safe zone. */
  readonly inset: number;
  /** Corner radius as a fraction of size; 0.5 gives a circle, 0 a square. */
  readonly cornerRadius: number;
  readonly dotGrid: boolean;
}

/**
 * Render one icon.
 *
 * Supersampled 4x4 per pixel: an arrowhead is all diagonals, and without
 * anti-aliasing it looks like a staircase at every size that matters.
 */
function renderIcon(options: IconOptions): PNG {
  const { size, background, arrowColor, inset, cornerRadius, dotGrid } = options;
  const png = new PNG({ width: size, height: size });
  const arrow = buildArrow(size, size * inset);

  const SUB = 4;
  const radius = size * cornerRadius;
  const dotSpacing = size / 12;
  const dotRadius = size * 0.008;

  /** Rounded-rect mask, so the icon can be shipped square or rounded. */
  const insideCorner = (p: Point): boolean => {
    if (radius <= 0) return true;
    const cx = Math.min(Math.max(p.x, radius), size - radius);
    const cy = Math.min(Math.max(p.y, radius), size - radius);
    return Math.hypot(p.x - cx, p.y - cy) <= radius;
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let arrowHits = 0;
      let shapeHits = 0;
      let dotHits = 0;

      for (let sy = 0; sy < SUB; sy += 1) {
        for (let sx = 0; sx < SUB; sx += 1) {
          const p: Point = { x: x + (sx + 0.5) / SUB, y: y + (sy + 0.5) / SUB };
          if (!insideCorner(p)) continue;
          shapeHits += 1;

          if (hitsArrow(p, arrow)) {
            arrowHits += 1;
          } else if (dotGrid) {
            const gx = Math.abs(((p.x + dotSpacing / 2) % dotSpacing) - dotSpacing / 2);
            const gy = Math.abs(((p.y + dotSpacing / 2) % dotSpacing) - dotSpacing / 2);
            if (Math.hypot(gx, gy) <= dotRadius) dotHits += 1;
          }
        }
      }

      const total = SUB * SUB;
      const shapeAlpha = shapeHits / total;
      const arrowAlpha = arrowHits / total;
      const dotAlpha = dotHits / total;

      // Composite bottom-up: background, then grid dots, then the arrow.
      let r = background.r;
      let g = background.g;
      let b = background.b;
      let a = (background.a / 255) * shapeAlpha;

      if (dotAlpha > 0) {
        r = r * (1 - dotAlpha) + DOT.r * dotAlpha;
        g = g * (1 - dotAlpha) + DOT.g * dotAlpha;
        b = b * (1 - dotAlpha) + DOT.b * dotAlpha;
      }
      if (arrowAlpha > 0) {
        r = r * (1 - arrowAlpha) + arrowColor.r * arrowAlpha;
        g = g * (1 - arrowAlpha) + arrowColor.g * arrowAlpha;
        b = b * (1 - arrowAlpha) + arrowColor.b * arrowAlpha;
        a = Math.max(a, arrowAlpha);
      }

      const index = (size * y + x) << 2;
      png.data[index] = Math.round(r);
      png.data[index + 1] = Math.round(g);
      png.data[index + 2] = Math.round(b);
      png.data[index + 3] = Math.round(a * 255);
    }
  }

  return png;
}

function write(name: string, png: PNG): void {
  const path = join(process.cwd(), 'assets', name);
  writeFileSync(path, PNG.sync.write(png));
  console.log(`  ${name}  ${png.width}x${png.height}`);
}

console.log('Rendering icons from the game’s own arrow geometry:');

// Store icon: square, dark, with the grid showing. Expo rounds it per platform.
write(
  'icon.png',
  renderIcon({
    size: 1024,
    background: MIDNIGHT,
    arrowColor: BONE,
    inset: 0.14,
    cornerRadius: 0,
    dotGrid: true,
  }),
);

// Adaptive foreground: transparent, and inset hard. Android crops adaptive icons
// to a mask that varies by launcher, so anything near the edge can be cut off.
write(
  'android-icon-foreground.png',
  renderIcon({
    size: 1024,
    background: CLEAR,
    arrowColor: BONE,
    inset: 0.28,
    cornerRadius: 0,
    dotGrid: false,
  }),
);

// Adaptive background: flat colour, no mark. It gets masked and must survive it.
{
  const png = new PNG({ width: 1024, height: 1024 });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = MIDNIGHT.r;
    png.data[i + 1] = MIDNIGHT.g;
    png.data[i + 2] = MIDNIGHT.b;
    png.data[i + 3] = 255;
  }
  write('android-icon-background.png', png);
}

// Monochrome layer for Android 13+ themed icons: silhouette only.
write(
  'android-icon-monochrome.png',
  renderIcon({
    size: 1024,
    background: CLEAR,
    arrowColor: { r: 0, g: 0, b: 0, a: 255 },
    inset: 0.28,
    cornerRadius: 0,
    dotGrid: false,
  }),
);

// Splash mark: transparent so it sits on the themed splash colour.
write(
  'splash-icon.png',
  renderIcon({
    size: 512,
    background: CLEAR,
    arrowColor: PAPER,
    inset: 0.18,
    cornerRadius: 0,
    dotGrid: false,
  }),
);

write(
  'favicon.png',
  renderIcon({
    size: 96,
    background: MIDNIGHT,
    arrowColor: BONE,
    inset: 0.16,
    cornerRadius: 0.18,
    dotGrid: false,
  }),
);

console.log('\nDone. Run `npx expo start --clear` to see them.');
