/**
 * shapes.ts — turning a silhouette into a set of usable cells.
 *
 * Purpose:      Decide which cells of a grid a level may use, so a board reads as
 *               a heart or a guitar rather than a rectangle of noise.
 * Responsibilities:
 *               - Analytic shapes (perfect at any size) and bitmap shapes.
 *               - Scaling, pruning, and connectivity repair.
 * Notes:        Shapes are not purely cosmetic. Growing bodies inside a
 *               constrained outline forces them to bend and double back, and bends
 *               are the main thing that makes a snake hard to trace. Shape and
 *               difficulty reinforce each other.
 *
 *               Two kinds of shape, because they fail differently. A circle or
 *               diamond is a tidy inequality that is exact at every resolution.
 *               A guitar is not expressible that way, so it is drawn once as a
 *               bitmap and *sampled* — with supersampling, because nearest-
 *               neighbour scaling turns a thin neck or a crown's points into
 *               dashed rubble.
 *
 *               Two repairs run after every mask, and both exist because the
 *               generator silently starves without them: cells no snake could use
 *               are pruned, and disconnected islands are dropped so the reported
 *               capacity is capacity the generator can actually reach.
 */

import { SHAPE_ART_IDS, shapeArtById, type ShapeCategory } from './shapeArt';
import { GLYPH_IDS, glyphField, glyphName } from './shapeGlyphs';
import { PROCEDURAL_IDS, proceduralById } from './shapeProcedural';

/** Shapes defined by a formula. Exact at any board size. */
export const ANALYTIC_SHAPES = ['free', 'diamond', 'circle', 'cross', 'ring', 'spiral'] as const;
export type AnalyticShape = (typeof ANALYTIC_SHAPES)[number];

/** Any shape name the generator accepts: analytic or a bitmap id. */
export type ShapeName = AnalyticShape | string;

/** A grid of booleans: true where a snake may be placed. */
export type ShapeMask = boolean[];

type Field = (u: number, v: number) => boolean;

const free: Field = () => true;
const diamond: Field = (u, v) => Math.abs(u) + Math.abs(v) <= 1.02;
const circle: Field = (u, v) => u * u + v * v <= 1.04;
const cross: Field = (u, v) => Math.abs(u) <= 0.42 || Math.abs(v) <= 0.42;

const ring: Field = (u, v) => {
  const d = u * u + v * v;
  return d <= 1.04 && d >= 0.2;
};

/**
 * An Archimedean spiral, thickened into a usable corridor.
 *
 * The angle must be normalised to 0..2pi first: `atan2` returns -pi..pi, and
 * feeding that in directly puts half the arm at a negative radius, which turns a
 * spiral into scattered noise.
 */
const spiral: Field = (u, v) => {
  const r = Math.sqrt(u * u + v * v);
  if (r > 1) return false;

  const turns = 2;
  const halfWidth = 0.2;
  if (r <= halfWidth) return true;

  const raw = Math.atan2(v, u);
  const angle = raw < 0 ? raw + Math.PI * 2 : raw;

  for (let k = 0; k < turns; k += 1) {
    const armRadius = (angle + Math.PI * 2 * k) / (Math.PI * 2 * turns);
    if (Math.abs(r - armRadius) <= halfWidth) return true;
  }
  return false;
};

const FIELDS: Record<AnalyticShape, Field> = { free, diamond, circle, cross, ring, spiral };

/**
 * Every shape name available.
 *
 * Four families, resolved in this order by `maskFor`, and the order matters only
 * because ids must not collide — analytic names, bitmap ids, glyph ids and
 * procedural ids are all disjoint and `SHAPE_NAMES` is asserted unique in the
 * shape tests.
 */
export const SHAPE_NAMES: readonly ShapeName[] = [
  ...ANALYTIC_SHAPES,
  ...SHAPE_ART_IDS,
  ...GLYPH_IDS,
  ...PROCEDURAL_IDS,
];

/** Category for a shape, for build reports and level metadata. */
export function categoryOf(shape: ShapeName): ShapeCategory | 'geometric' | 'glyph' {
  if ((ANALYTIC_SHAPES as readonly string[]).includes(shape)) return 'geometric';
  const bitmap = shapeArtById(shape);
  if (bitmap) return bitmap.category;
  if (GLYPH_IDS.includes(shape)) return 'glyph';
  return proceduralById(shape)?.category ?? 'geometric';
}

/** Display name for any shape, whichever family it comes from. */
export function shapeDisplayName(shape: ShapeName): string {
  const bitmap = shapeArtById(shape);
  if (bitmap) return bitmap.name;
  const procedural = proceduralById(shape);
  if (procedural) return procedural.name;
  if (GLYPH_IDS.includes(shape)) return glyphName(shape);
  return shape.charAt(0).toUpperCase() + shape.slice(1);
}

const index = (row: number, col: number, cols: number): number => row * cols + col;

/**
 * Sample a bitmap silhouette onto a target grid.
 *
 * Supersampled 3x3 per cell with a majority vote. Point sampling is much simpler
 * and much worse: at small board sizes it drops any feature thinner than one
 * target cell, so a crown loses its points and a guitar loses its neck. Voting
 * over a patch keeps thin features as long as they cover a reasonable share of
 * the cell they land in.
 */
function sampleArt(rows: number, cols: number, artRows: readonly string[]): ShapeMask {
  const mask: ShapeMask = new Array<boolean>(rows * cols).fill(false);
  const artHeight = artRows.length;
  const artWidth = artRows[0]?.length ?? 0;
  if (artHeight === 0 || artWidth === 0) return mask;

  const SUB = 3;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      let hits = 0;
      for (let sr = 0; sr < SUB; sr += 1) {
        for (let sc = 0; sc < SUB; sc += 1) {
          const v = (row + (sr + 0.5) / SUB) / rows;
          const u = (col + (sc + 0.5) / SUB) / cols;
          const ar = Math.min(artHeight - 1, Math.floor(v * artHeight));
          const ac = Math.min(artWidth - 1, Math.floor(u * artWidth));
          if (artRows[ar]![ac] === '#') hits += 1;
        }
      }
      // Slightly under half, so thin strokes survive being straddled by a cell
      // boundary rather than disappearing on a tie.
      mask[index(row, col, cols)] = hits >= 4;
    }
  }

  return mask;
}

/**
 * Drop cells no snake could ever use.
 *
 * A body is at least two cells long, so a masked cell with no masked neighbour is
 * dead space — it inflates the apparent capacity and starves the generator, which
 * then fails to place its last few arrows for reasons that look mysterious.
 * Repeats until stable, because removing one cell can strand another.
 */
function pruneIsolated(mask: ShapeMask, rows: number, cols: number): void {
  for (;;) {
    let removed = 0;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const cell = index(row, col, cols);
        if (!mask[cell]) continue;

        let neighbours = 0;
        if (row > 0 && mask[cell - cols]) neighbours += 1;
        if (row + 1 < rows && mask[cell + cols]) neighbours += 1;
        if (col > 0 && mask[cell - 1]) neighbours += 1;
        if (col + 1 < cols && mask[cell + 1]) neighbours += 1;

        if (neighbours === 0) {
          mask[cell] = false;
          removed += 1;
        }
      }
    }
    if (removed === 0) return;
  }
}

/**
 * Keep only regions big enough to hold a snake.
 *
 * A silhouette often scatters two- or three-cell specks — the tip of a flame, a
 * snowflake's outer arm. They pass the isolation prune but still cannot hold a
 * body of the length the level wants, so they count toward capacity while being
 * unusable. Dropping them makes reported capacity honest, which is what the
 * feasibility check in `check-curriculum` depends on.
 */
function pruneSmallRegions(mask: ShapeMask, rows: number, cols: number, minRegion: number): void {
  const seen = new Uint8Array(rows * cols);

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;

    const region: number[] = [];
    const stack = [start];
    seen[start] = 1;

    while (stack.length > 0) {
      const cell = stack.pop()!;
      region.push(cell);
      const row = Math.floor(cell / cols);
      const col = cell % cols;

      if (row > 0 && mask[cell - cols] && !seen[cell - cols]) {
        seen[cell - cols] = 1;
        stack.push(cell - cols);
      }
      if (row + 1 < rows && mask[cell + cols] && !seen[cell + cols]) {
        seen[cell + cols] = 1;
        stack.push(cell + cols);
      }
      if (col > 0 && mask[cell - 1] && !seen[cell - 1]) {
        seen[cell - 1] = 1;
        stack.push(cell - 1);
      }
      if (col + 1 < cols && mask[cell + 1] && !seen[cell + 1]) {
        seen[cell + 1] = 1;
        stack.push(cell + 1);
      }
    }

    if (region.length < minRegion) {
      for (const cell of region) mask[cell] = false;
    }
  }
}

export interface MaskOptions {
  /** Regions smaller than this are dropped. Defaults to 4 cells. */
  readonly minRegion?: number;
}

/**
 * Build the mask for a shape at a given board size.
 *
 * Analytic shapes are evaluated on cell centres mapped to -1..1; bitmap shapes
 * are supersampled. Both then go through the same two repairs, so every mask this
 * returns is made only of regions a snake can actually occupy.
 */
export function maskFor(
  shape: ShapeName,
  rows: number,
  cols: number,
  options: MaskOptions = {},
): ShapeMask {
  let mask: ShapeMask;

  // Glyphs and procedural families are fields like the analytic shapes, but their
  // *parameters* depend on the board — a glyph's stroke has to stay at least a cell
  // wide, and a honeycomb's cells have to stay visible. So they are built here,
  // per size, rather than being constants.
  const field =
    FIELDS[shape as AnalyticShape] ??
    glyphField(shape, rows, cols) ??
    proceduralById(shape)?.field(rows, cols);

  if (field) {
    mask = new Array<boolean>(rows * cols).fill(false);
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const u = ((col + 0.5) / cols) * 2 - 1;
        const v = ((row + 0.5) / rows) * 2 - 1;
        mask[index(row, col, cols)] = field(u, v);
      }
    }
  } else {
    const artwork = shapeArtById(shape);
    if (!artwork) {
      // An unknown shape falls back to the whole board rather than failing the
      // build: a level with the wrong outline is still playable, and the build
      // report names it so the typo is obvious.
      mask = new Array<boolean>(rows * cols).fill(true);
    } else {
      mask = sampleArt(rows, cols, artwork.art);
    }
  }

  pruneIsolated(mask, rows, cols);
  pruneSmallRegions(mask, rows, cols, options.minRegion ?? 4);
  pruneIsolated(mask, rows, cols);
  return mask;
}

/** How many cells a shape leaves usable. */
export function maskCapacity(mask: ShapeMask): number {
  return mask.reduce((total, allowed) => total + (allowed ? 1 : 0), 0);
}

/**
 * How many separate islands a mask leaves behind.
 *
 * This turned out to matter far more than it sounds, and it is not a cosmetic
 * property. Difficulty in this game is driven by how *few* arrows are free at
 * once: a board where one arrow of twenty can move is a hunt, and one where eight
 * can move is a stroll. Arrows in different islands can never block each other, so
 * every extra island raises the number free at any moment and drags
 * `expectedBlindMistakes` down.
 *
 * The perforated shapes — lattice, honeycomb, maze, brickwork — do exactly this,
 * and no amount of reseeding fixes it: a Hard plan on a lattice measures easier
 * than a Casual plan on an open board, every time. So the curriculum needs to be
 * able to ask, and `shapePoolFor` keeps these shapes out of the demanding tiers.
 */
export function maskRegionCount(mask: ShapeMask, rows: number, cols: number): number {
  const seen = new Uint8Array(rows * cols);
  let regions = 0;

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    regions += 1;

    const stack = [start];
    seen[start] = 1;
    while (stack.length > 0) {
      const cell = stack.pop()!;
      const row = Math.floor(cell / cols);
      const col = cell % cols;

      if (row > 0 && mask[cell - cols] && !seen[cell - cols]) {
        seen[cell - cols] = 1;
        stack.push(cell - cols);
      }
      if (row + 1 < rows && mask[cell + cols] && !seen[cell + cols]) {
        seen[cell + cols] = 1;
        stack.push(cell + cols);
      }
      if (col > 0 && mask[cell - 1] && !seen[cell - 1]) {
        seen[cell - 1] = 1;
        stack.push(cell - 1);
      }
      if (col + 1 < cols && mask[cell + 1] && !seen[cell + 1]) {
        seen[cell + 1] = 1;
        stack.push(cell + 1);
      }
    }
  }

  return regions;
}

/** Render a mask as text, for eyeballing a new shape before generating with it. */
export function renderMask(mask: ShapeMask, rows: number, cols: number): string {
  const lines: string[] = [];
  for (let row = 0; row < rows; row += 1) {
    let line = '';
    for (let col = 0; col < cols; col += 1) line += mask[index(row, col, cols)] ? '#' : '.';
    lines.push(line);
  }
  return lines.join('\n');
}
