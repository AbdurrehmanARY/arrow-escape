/**
 * skiaScene.ts — turn scene data into Skia paths and one recorded picture.
 *
 * Purpose:      Do every allocation the renderer needs *once*, off the frame path.
 * Responsibilities:
 *               - `buildArrowPaths` — an `SkPath` per arrow, built once per layout.
 *               - `recordStatic`    — every non-animating arrow, the grid and the
 *                                     obstacles, flattened into a single picture.
 * Notes:        This is where the performance argument actually lands, so it is
 *               worth being precise about what changed.
 *
 *               Under SVG every arrow was a React component holding four animated
 *               props and five to nine native nodes. A 180-arrow board was roughly
 *               1,600 nodes, each individually laid out, rasterised and composited.
 *               Panning re-drew all of them, which is why frame cost tracked how
 *               much of the board was *visible* rather than how much was moving.
 *
 *               Here, everything that is not moving this frame is recorded into one
 *               `SkPicture` and replayed as a single draw call. The picture is
 *               immutable and lives on the GPU side of the boundary; panning and
 *               zooming apply a matrix to it and touch nothing else. Cost stops
 *               scaling with arrow count and starts scaling with pixels, which is
 *               the whole point of moving to a canvas.
 *
 *               Paths are built once per *layout* — not per frame and not per
 *               render. Rebuilding an `SkPath` mid-gesture would hand back exactly
 *               the cost this module exists to remove.
 */

import { Skia, createPicture, type SkPath, type SkPicture } from '@shopify/react-native-skia';

import type { ArrowStyle, Palette } from '@theme';

import type { ArrowDraw, Scene } from './scene';

/** Stroke caps, mapped from the theme's tail shape. */
const CAP = { round: 1, flat: 0, square: 2, tapered: 1 } as const;
/** Stroke joins, mapped from the theme's join setting. */
const JOIN = { round: 1, miter: 0, bevel: 2 } as const;

/**
 * The paths for one arrow, plus what the release animation needs to trim them.
 *
 * `bodyFraction` is the body's share of the whole travelled path. The exit is drawn
 * by sliding a window of exactly that width from the start of the path to the end —
 * which is the same dash-window trick the SVG renderer used, except Skia trims
 * paths natively so there is no dash arithmetic left to get wrong.
 */
export interface ArrowPaths {
  readonly index: number;
  /** Body followed by the straight exit ray. */
  readonly body: SkPath;
  /** Arrowhead outline, or null when the theme draws no head. */
  readonly head: SkPath | null;
  /** The body's share of `body`'s total length, in the range 0..1. */
  readonly bodyFraction: number;
  /** Total travel in cells, which is what sets the release duration. */
  readonly travelCells: number;
}

/** Build the two paths for one arrow. Allocates; call once per layout. */
export function buildArrowPaths(draw: ArrowDraw): ArrowPaths {
  const body = Skia.Path.Make();
  const points = draw.body;

  const first = points[0]!;
  body.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i += 1) {
    const p = points[i]!;
    body.lineTo(p.x, p.y);
  }
  // The straight run off the board. Part of the same path so the trim window can
  // slide continuously from body into exit without a seam.
  body.lineTo(draw.exitPoint.x, draw.exitPoint.y);

  return {
    index: draw.index,
    body,
    head: buildHeadPath(draw),
    bodyFraction: draw.travel > 0 ? draw.bodyLength / draw.travel : 1,
    travelCells: draw.cellSpan,
  };
}

/** The arrowhead: a dome when the theme asks for one, a triangle otherwise. */
function buildHeadPath(draw: ArrowDraw): SkPath | null {
  if (draw.head.length < 3) return null;

  const [tip, left, right] = draw.head as [
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
  ];
  const path = Skia.Path.Make();

  if (draw.headCurve.length === 2) {
    const [c1, c2] = draw.headCurve as [{ x: number; y: number }, { x: number; y: number }];
    path.moveTo(left.x, left.y);
    path.quadTo(c1.x, c1.y, tip.x, tip.y);
    path.quadTo(c2.x, c2.y, right.x, right.y);
    path.close();
    return path;
  }

  path.moveTo(tip.x, tip.y);
  path.lineTo(left.x, left.y);
  path.lineTo(right.x, right.y);
  path.close();
  return path;
}

/** Build paths for every arrow in the scene, keyed by arrow index. */
export function buildAllArrowPaths(scene: Scene): Map<number, ArrowPaths> {
  const out = new Map<number, ArrowPaths>();
  for (const draw of scene.arrows) out.set(draw.index, buildArrowPaths(draw));
  return out;
}

/**
 * Record the board background, the grid, the obstacles and every static arrow into
 * one picture.
 *
 * The single most important function in the migration: what used to be ~1,600
 * native nodes becomes one draw. Re-recorded only when the scene or the set of
 * moving arrows changes — never during a gesture.
 */
export function recordStatic(
  scene: Scene,
  paths: Map<number, ArrowPaths>,
  staticArrows: readonly ArrowDraw[],
  style: ArrowStyle,
  palette: Palette,
): SkPicture {
  return createPicture((canvas) => {
    // ---- Board panel -----------------------------------------------------
    const panel = Skia.Paint();
    panel.setColor(Skia.Color(palette.board));
    canvas.drawRRect(
      Skia.RRectXY(Skia.XYWHRect(0, 0, scene.width, scene.height), 0, 0),
      panel,
    );

    drawPattern(canvas, scene, palette);
    drawObstacles(canvas, scene, palette);

    // ---- Arrows ----------------------------------------------------------
    // One paint object reused across every arrow rather than one per arrow. At 180
    // arrows that is 180 fewer native allocations per re-record.
    const stroke = Skia.Paint();
    stroke.setStyle(1); // stroke
    stroke.setAntiAlias(true);
    stroke.setStrokeCap(CAP[style.tail]);
    stroke.setStrokeJoin(JOIN[style.join]);

    const fill = Skia.Paint();
    fill.setAntiAlias(true);

    for (const draw of staticArrows) {
      const arrowPaths = paths.get(draw.index);
      if (!arrowPaths) continue;

      if (style.shadow && !scene.simplified) {
        stroke.setColor(Skia.Color(palette.arrowShadow));
        stroke.setStrokeWidth(draw.stroke);
        canvas.save();
        canvas.translate(0, scene.cellSize * style.shadowOffsetRatio);
        canvas.drawPath(trimmed(arrowPaths), stroke);
        canvas.restore();
      }

      stroke.setColor(Skia.Color(draw.color));
      stroke.setStrokeWidth(draw.stroke);
      canvas.drawPath(trimmed(arrowPaths), stroke);

      if (arrowPaths.head) {
        fill.setColor(Skia.Color(draw.color));
        canvas.drawPath(arrowPaths.head, fill);
      }

      if (style.eyes && draw.eyes.length > 0) {
        fill.setColor(Skia.Color('#FFFFFF'));
        for (const eye of draw.eyes) canvas.drawCircle(eye.x, eye.y, draw.eyeRadius, fill);
        fill.setColor(Skia.Color('#1A1A1A'));
        for (const pupil of draw.pupils) {
          canvas.drawCircle(pupil.x, pupil.y, draw.eyeRadius * 0.45, fill);
        }
      }
    }
  });
}

/**
 * A static arrow's visible body: the body only, never the exit ray.
 *
 * The stored path deliberately includes the ray so the release animation has
 * somewhere to travel, so anything drawn at rest has to stop at the body's end.
 */
function trimmed(paths: ArrowPaths): SkPath {
  const copy = paths.body.copy();
  copy.trim(0, paths.bodyFraction, false);
  return copy;
}

/** The grid the player reads the board against. */
function drawPattern(
  canvas: Parameters<Parameters<typeof createPicture>[0]>[0],
  scene: Scene,
  palette: Palette,
): void {
  if (scene.patternKind === 'none') return;

  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(palette.pattern));

  if (scene.patternKind === 'dots') {
    for (let row = 0; row < scene.rows; row += 1) {
      const cy = scene.originY + row * scene.cellSize + scene.cellSize / 2;
      for (let col = 0; col < scene.cols; col += 1) {
        const cx = scene.originX + col * scene.cellSize + scene.cellSize / 2;
        canvas.drawCircle(cx, cy, scene.patternRadius, paint);
      }
    }
    return;
  }

  // `lines`, `crosses` and `checker` all reduce to strokes or small rects on the
  // cell lattice, drawn into the same picture so they cost nothing per frame.
  paint.setStyle(1);
  paint.setStrokeWidth(scene.patternWidth);

  if (scene.patternKind === 'checker') {
    paint.setStyle(0);
    paint.setAlphaf(0.35);
    for (let row = 0; row < scene.rows; row += 1) {
      for (let col = 0; col < scene.cols; col += 1) {
        if ((row + col) % 2 !== 0) continue;
        canvas.drawRect(
          Skia.XYWHRect(
            scene.originX + col * scene.cellSize,
            scene.originY + row * scene.cellSize,
            scene.cellSize / 2,
            scene.cellSize / 2,
          ),
          paint,
        );
      }
    }
    return;
  }

  const arm = scene.patternKind === 'crosses' ? scene.cellSize * 0.09 : 0;
  for (let row = 0; row <= scene.rows; row += 1) {
    const y = scene.originY + row * scene.cellSize;
    for (let col = 0; col <= scene.cols; col += 1) {
      const x = scene.originX + col * scene.cellSize;
      if (scene.patternKind === 'crosses') {
        canvas.drawLine(x - arm, y, x + arm, y, paint);
        canvas.drawLine(x, y - arm, x, y + arm, paint);
      } else if (col < scene.cols) {
        canvas.drawLine(x, y, x + scene.cellSize, y, paint);
      }
    }
    if (scene.patternKind === 'lines') {
      for (let col = 0; col <= scene.cols; col += 1) {
        const x = scene.originX + col * scene.cellSize;
        canvas.drawLine(x, scene.originY, x, scene.originY + scene.rows * scene.cellSize, paint);
      }
    }
  }
}

/** Walls and gates. A handful per board at most. */
function drawObstacles(
  canvas: Parameters<Parameters<typeof createPicture>[0]>[0],
  scene: Scene,
  palette: Palette,
): void {
  if (scene.obstacles.length === 0) return;

  const paint = Skia.Paint();
  paint.setAntiAlias(true);

  for (const obstacle of scene.obstacles) {
    const rect = Skia.RRectXY(
      Skia.XYWHRect(obstacle.x, obstacle.y, obstacle.size, obstacle.size),
      obstacle.radius,
      obstacle.radius,
    );

    if (obstacle.kind === 'wall') {
      paint.setStyle(0);
      paint.setAlphaf(1);
      paint.setColor(Skia.Color(obstacle.color));
      canvas.drawRRect(rect, paint);
      continue;
    }

    // Open and shut must be unmistakable: a misread gate costs a heart, or on a
    // shutter board the level. Shut is filled with a bar across it; open is the
    // same outline left hollow and faded.
    paint.setColor(Skia.Color(obstacle.color));
    paint.setAlphaf(obstacle.open ? 0.45 : 1);

    if (obstacle.open) {
      paint.setStyle(1);
      paint.setStrokeWidth(Math.max(1, scene.cellSize * 0.07));
      canvas.drawRRect(rect, paint);
      continue;
    }

    paint.setStyle(0);
    canvas.drawRRect(rect, paint);

    const bar = Skia.Paint();
    bar.setAntiAlias(true);
    bar.setStyle(1);
    bar.setStrokeCap(1);
    bar.setStrokeWidth(Math.max(1.5, scene.cellSize * 0.1));
    bar.setColor(Skia.Color(palette.board));
    canvas.drawLine(
      obstacle.x + obstacle.size * 0.22,
      obstacle.y + obstacle.size / 2,
      obstacle.x + obstacle.size * 0.78,
      obstacle.y + obstacle.size / 2,
      bar,
    );
  }
}
