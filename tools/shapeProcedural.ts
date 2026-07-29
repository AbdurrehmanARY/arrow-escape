/**
 * shapeProcedural.ts — silhouettes generated from a formula.
 *
 * Purpose:      Pattern families a drawing cannot capture — mandalas, tilings,
 *               weaves, mazes — as fields evaluated at whatever size a board is.
 * Responsibilities:
 *               - One field per family, plus its name and category.
 * Notes:        These exist for a reason the shape library did not previously have.
 *               A bitmap silhouette is an *outline*: it says where the board ends.
 *               These say where the board is **perforated** — they carve holes,
 *               channels and corridors through the middle of it, and that changes
 *               what the generator produces rather than just how it looks. A snake
 *               grown inside a honeycomb has to thread between cells, so it bends
 *               constantly, and bends are the main thing that makes a snake hard to
 *               trace.
 *
 *               So a procedural shape is a difficulty device dressed as decoration,
 *               which is exactly the trade the shape system was built for.
 *
 *               Every field takes `(u, v)` in -1..1 and is resolution-independent
 *               by construction. Feature scale is in *board* units rather than
 *               absolute ones, so a honeycomb on a 10x10 board has cells a player
 *               can see, and so does one on a 30x30.
 */

import type { ShapeCategory } from './shapeArt';

/** True where a snake may be placed. */
export type Field = (u: number, v: number) => boolean;

export interface ProceduralShape {
  readonly id: string;
  readonly name: string;
  readonly category: ShapeCategory;
  /**
   * Built per board size rather than being a constant.
   *
   * Feature scale has to track the grid: a mandala with sixteen petals on a 9x9
   * board is a smear, and the same one on a 30x30 board is the point of the
   * shape. Every family below picks its detail level from `rows`/`cols`.
   */
  readonly field: (rows: number, cols: number) => Field;
}

/** Feature count that grows with the board but never runs away. */
const detail = (rows: number, cols: number, min: number, max: number): number => {
  const size = Math.min(rows, cols);
  return Math.round(Math.max(min, Math.min(max, size / 3.2)));
};

/** Angle in 0..2pi. `atan2` returns -pi..pi, which breaks every radial pattern. */
const angleOf = (u: number, v: number): number => {
  const raw = Math.atan2(v, u);
  return raw < 0 ? raw + Math.PI * 2 : raw;
};

/**
 * A mandala: petals radiating from a filled hub.
 *
 * The hub matters more than it looks. Without it the petals meet at a single point
 * and the middle of the board becomes a knot of one-cell channels that the mask
 * pruner then deletes, leaving a ring of disconnected petals and a generator that
 * cannot place anything.
 */
const mandala: ProceduralShape = {
  id: 'mandala',
  name: 'Mandala',
  category: 'abstract',
  field: (rows, cols) => {
    const petals = detail(rows, cols, 5, 10);
    return (u, v) => {
      const r = Math.sqrt(u * u + v * v);
      if (r > 1) return false;
      if (r <= 0.28) return true;
      const wobble = 0.62 + 0.36 * Math.abs(Math.cos(angleOf(u, v) * petals));
      return r <= wobble;
    };
  },
};

/**
 * An eight-fold star tiling, in the Islamic geometric tradition.
 *
 * Built from two square lattices at 45 degrees to each other, which is the
 * standard construction and produces the eight-pointed star and its cross
 * automatically rather than by drawing them.
 */
const starTiling: ProceduralShape = {
  id: 'starTiling',
  name: 'Star Tiling',
  category: 'abstract',
  field: (rows, cols) => {
    const period = Math.PI * detail(rows, cols, 2, 4);
    return (u, v) => {
      const a = Math.abs(Math.sin(u * period) * Math.sin(v * period));
      const d = Math.SQRT1_2 * (u + v);
      const e = Math.SQRT1_2 * (u - v);
      const b = Math.abs(Math.sin(d * period) * Math.sin(e * period));
      // A product of two sines spends most of its range near zero, so the cut has
      // to sit high or the "tiling" is a solid board with a few dimples in it.
      return Math.max(a, b) > 0.58;
    };
  },
};

/**
 * A woven band pattern — Celtic knotwork, reduced to what survives a grid.
 *
 * Real knotwork is about which band crosses over which, and a board mask has no
 * way to express that: there is only inside and outside. What does survive is the
 * *weave*, two families of diagonal bands crossing at regular intervals, and at
 * board resolution that is what reads as knotwork anyway.
 */
const knotwork: ProceduralShape = {
  id: 'knotwork',
  name: 'Knotwork',
  category: 'abstract',
  field: (rows, cols) => {
    const period = Math.PI * detail(rows, cols, 2, 4);
    return (u, v) => {
      // Two families of diagonal bands. The union of two 60%-coverage families is
      // almost the whole board, so each band has to be narrow for the weave to be
      // visible at all.
      const band = (t: number): boolean => Math.abs(Math.sin(t * period)) > 0.78;
      return band(Math.SQRT1_2 * (u + v)) || band(Math.SQRT1_2 * (u - v));
    };
  },
};

/**
 * A honeycomb: hexagonal cells with walls between them.
 *
 * The mask is the *walls*, not the cells — a lattice of corridors. Cells would be
 * a scatter of disconnected pockets, and the region pruner would keep exactly one
 * of them.
 */
const honeycomb: ProceduralShape = {
  id: 'honeycomb',
  name: 'Honeycomb',
  category: 'abstract',
  field: (rows, cols) => {
    const scale = detail(rows, cols, 2, 4) * 0.9;
    return (u, v) => {
      // Three axes 60 degrees apart give hexagonal symmetry; the sum of their
      // cosines peaks at cell centres and bottoms out at the points where three
      // cells meet. Cutting at the low end punches a hexagonal grid of holes and
      // leaves the rest of the board connected — the other way round would leave a
      // scatter of separate pockets and the region pruner would keep one of them.
      const a = Math.cos(u * scale * Math.PI);
      const b = Math.cos((u * 0.5 + v * 0.866) * scale * Math.PI);
      const c = Math.cos((u * 0.5 - v * 0.866) * scale * Math.PI);
      return a + b + c > -0.45;
    };
  },
};

/**
 * A DNA double helix: two sine strands with rungs between them.
 *
 * The only shape in the library that is deliberately *narrow* — it uses a fraction
 * of the board, which makes it one of the few that produces long straight runs.
 * Those are easy to trace, so this reads as a breather level, and the curriculum
 * benefits from having a few.
 */
const helix: ProceduralShape = {
  id: 'helix',
  name: 'Double Helix',
  category: 'abstract',
  field: (rows, cols) => {
    const turns = detail(rows, cols, 2, 3) * 0.8;
    const width = 0.58;
    return (u, v) => {
      const phase = v * Math.PI * turns;
      const strandA = Math.sin(phase) * width;
      const strandB = -strandA;
      // The band is measured in `u`, but the strand sweeps fastest sideways exactly
      // where `sin` crosses zero — so a fixed-width band pinches there and the
      // helix falls into disconnected pieces. Widening by the local slope keeps the
      // strand a constant *perpendicular* thickness, which is what keeps it whole.
      const slope = Math.abs(Math.cos(phase)) * width * turns;
      const half = 0.15 * Math.sqrt(1 + slope * slope);
      if (Math.abs(u - strandA) < half || Math.abs(u - strandB) < half) return true;

      // Rungs, only where the strands are far enough apart to need one.
      const spread = Math.abs(strandA - strandB);
      return spread > 0.5 && Math.abs(Math.sin(phase * 2)) < 0.22 && Math.abs(u) < spread / 2;
    };
  },
};

/**
 * A maze: a grid of corridors with some walls knocked through.
 *
 * Deterministic and seedless. It is a shape, not a puzzle — the maze is there to
 * make snakes turn corners, and a randomly-carved one would make the level library
 * non-reproducible for no gain.
 */
const maze: ProceduralShape = {
  id: 'maze',
  name: 'Maze',
  category: 'abstract',
  field: (rows, cols) => {
    const cells = detail(rows, cols, 3, 6);
    return (u, v) => {
      const x = (u + 1) / 2;
      const y = (v + 1) / 2;
      const gx = Math.floor(x * cells);
      const gy = Math.floor(y * cells);
      const fx = x * cells - gx;
      const fy = y * cells - gy;

      // Corridors along both axes, with roughly a third of the junctions blocked
      // by a hash of the cell coordinates.
      const blocked = (gx * 7 + gy * 13 + gx * gy * 3) % 5 === 0;
      const onRow = fy > 0.3 && fy < 0.7;
      const onCol = fx > 0.3 && fx < 0.7;
      if (blocked) return onRow || onCol ? onCol : false;
      return onRow || onCol;
    };
  },
};

/** Concentric rings — a target, and a reliable source of long curved runs. */
const rings: ProceduralShape = {
  id: 'rings',
  name: 'Rings',
  category: 'abstract',
  field: (rows, cols) => {
    const count = detail(rows, cols, 2, 4);
    return (u, v) => {
      const r = Math.sqrt(u * u + v * v);
      if (r > 1) return false;
      return Math.abs(Math.sin(r * Math.PI * count)) > 0.42 || r < 0.18;
    };
  },
};

/** Spokes from a hub. Every snake ends up radial, which reads unlike anything else. */
const starburst: ProceduralShape = {
  id: 'starburst',
  name: 'Starburst',
  category: 'abstract',
  field: (rows, cols) => {
    const spokes = detail(rows, cols, 6, 14);
    return (u, v) => {
      const r = Math.sqrt(u * u + v * v);
      if (r > 1) return false;
      if (r < 0.24) return true;
      return Math.abs(Math.cos(angleOf(u, v) * spokes)) > 0.55;
    };
  },
};

/** A square lattice: bars in both directions, with square holes between. */
const lattice: ProceduralShape = {
  id: 'lattice',
  name: 'Lattice',
  category: 'abstract',
  field: (rows, cols) => {
    const bars = detail(rows, cols, 2, 5);
    return (u, v) => {
      const period = Math.PI * bars;
      return Math.abs(Math.sin(u * period)) > 0.72 || Math.abs(Math.sin(v * period)) > 0.72;
    };
  },
};

/** Stacked waves. Long horizontal runs, so it plays gently for its size. */
const waves: ProceduralShape = {
  id: 'waves',
  name: 'Waves',
  category: 'nature',
  field: (rows, cols) => {
    const bands = detail(rows, cols, 2, 5);
    return (u, v) => {
      const offset = Math.sin(u * Math.PI * 1.6) * 0.16;
      return Math.abs(Math.sin((v + offset) * Math.PI * bands)) > 0.42;
    };
  },
};

/** Nested chevrons pointing up. */
const chevrons: ProceduralShape = {
  id: 'chevrons',
  name: 'Chevrons',
  category: 'abstract',
  field: (rows, cols) => {
    const count = detail(rows, cols, 2, 5);
    return (u, v) => Math.abs(Math.sin((v - Math.abs(u) * 0.7) * Math.PI * count)) > 0.45;
  },
};

/** A four-petal flower, from a polar rose. */
const rose: ProceduralShape = {
  id: 'rose',
  name: 'Rose',
  category: 'nature',
  field: (rows, cols) => {
    const petals = detail(rows, cols, 3, 6);
    return (u, v) => {
      const r = Math.sqrt(u * u + v * v);
      if (r > 1) return false;
      return r <= Math.abs(Math.cos(angleOf(u, v) * (petals / 2))) * 0.95 + 0.12;
    };
  },
};

/** A checkerboard of solid blocks joined at their corners by short bridges. */
const bricks: ProceduralShape = {
  id: 'bricks',
  name: 'Brickwork',
  category: 'abstract',
  field: (rows, cols) => {
    const courses = detail(rows, cols, 2, 5);
    return (u, v) => {
      const y = (v + 1) / 2;
      const row = Math.floor(y * courses);
      const stagger = row % 2 === 0 ? 0 : 0.5;
      const x = ((u + 1) / 2) * courses + stagger;
      const fx = x - Math.floor(x);
      const fy = y * courses - row;
      // Mortar lines are the gaps; the bricks themselves are the mask.
      return fx > 0.08 && fx < 0.92 && fy > 0.14 && fy < 0.86;
    };
  },
};

/** A spiral galaxy: two curved arms sweeping out from a core. */
const galaxy: ProceduralShape = {
  id: 'galaxy',
  name: 'Galaxy',
  category: 'nature',
  field: (rows, cols) => {
    const tightness = detail(rows, cols, 2, 4);
    return (u, v) => {
      const r = Math.sqrt(u * u + v * v);
      if (r > 1) return false;
      if (r < 0.22) return true;
      const arm = angleOf(u, v) - r * Math.PI * tightness;
      return Math.abs(Math.sin(arm)) > 0.62;
    };
  },
};

/** A stepped pyramid — wide at the bottom, one course narrower each level up. */
const ziggurat: ProceduralShape = {
  id: 'ziggurat',
  name: 'Ziggurat',
  category: 'object',
  field: (rows, cols) => {
    const steps = detail(rows, cols, 3, 6);
    return (u, v) => {
      const y = (v + 1) / 2;
      const level = Math.floor(y * steps);
      const halfWidth = 0.12 + ((level + 1) / steps) * 0.86;
      return Math.abs(u) <= halfWidth;
    };
  },
};

/** Every procedural family, in a stable order. */
export const PROCEDURAL_SHAPES: readonly ProceduralShape[] = [
  mandala,
  starTiling,
  knotwork,
  honeycomb,
  helix,
  maze,
  rings,
  starburst,
  lattice,
  waves,
  chevrons,
  rose,
  bricks,
  galaxy,
  ziggurat,
];

const BY_ID = new Map(PROCEDURAL_SHAPES.map((shape) => [shape.id, shape]));

/** Look up a procedural family by id. */
export function proceduralById(id: string): ProceduralShape | undefined {
  return BY_ID.get(id);
}

/** Ids only, for the shape registry. */
export const PROCEDURAL_IDS: readonly string[] = PROCEDURAL_SHAPES.map((shape) => shape.id);
