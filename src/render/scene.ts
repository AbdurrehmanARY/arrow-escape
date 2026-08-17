/**
 * scene.ts — the board as a flat list of things to draw.
 *
 * Purpose:      Turn a `Board`, a `BoardState` and a theme into immutable draw
 *               data, so the renderer becomes a function of that data and holds no
 *               opinions of its own.
 * Responsibilities:
 *               - `buildScene`   — everything on the board, once per layout change.
 *               - `splitScene`   — which arrows are static this frame and which are
 *                                  animating, because they are drawn very differently.
 * Notes:        **Pure TypeScript. No React, no Skia, no platform.** That is the
 *               same rule `src/game/` follows and it is here for the same reason:
 *               the drawing maths is the part that is easy to get subtly wrong, and
 *               a canvas cannot be inspected by a test.
 *
 *               This matters more under Skia than it did under SVG. An SVG tree can
 *               be rendered in Jest and queried — that is how `heartsUi` and
 *               `hintGlow` work. A Skia canvas draws pixels and answers no
 *               questions. Without this module the entire render layer would become
 *               untestable, so everything that *can* be decided without a GPU is
 *               decided here, where it can be asserted on.
 *
 *               The split between static and animating arrows is the whole
 *               performance argument. Static arrows are recorded once into a single
 *               picture and replayed as one node; only the handful actually moving
 *               get per-arrow work. On a 180-arrow board that is one node plus two,
 *               rather than 180 components each with four animated props.
 */

import { exitPath, NO_GROUP, type ArrowId, type Board, type BoardState } from '@game';
import type { ArrowStyle, BoardStyle, Palette } from '@theme';

import { buildArrowGeometry, cellCentre, type Point } from '../components/arrowGeometry';

/** Which visual state an arrow is in. Mirrors the old `ArrowVisualState`. */
export type ArrowVisual = 'normal' | 'blocked' | 'blocker' | 'safe' | 'hinted';

/**
 * Everything needed to draw one arrow, with no board or theme lookups left to do.
 *
 * Deliberately flat and self-contained: the renderer should never reach back into
 * `Board` mid-frame, because that is how a draw call ends up doing a search.
 */
export interface ArrowDraw {
  /** Index into `board.arrows`, so a tap can be resolved back to a move. */
  readonly index: number;
  /** Stable id, used as a React key when this arrow is drawn on its own. */
  readonly id: ArrowId;

  /** Body centres, tail first — drawing tail-to-head puts the head on top. */
  readonly body: readonly Point[];
  /** The point the head reaches once it is fully clear of the board. */
  readonly exitPoint: Point;
  /** Unit vector the arrow travels along. */
  readonly forward: Point;

  /** Arrowhead outline. Empty when the style draws no head. */
  readonly head: readonly Point[];
  /** Control points for a `rounded` head, empty otherwise. */
  readonly headCurve: readonly Point[];
  readonly eyes: readonly Point[];
  readonly pupils: readonly Point[];
  readonly eyeRadius: number;

  readonly stroke: number;
  readonly color: string;

  /** Length of the body alone, in dp. The dash window's width. */
  readonly bodyLength: number;
  /** Body plus exit ray — how far the head travels to leave. */
  readonly travel: number;
  /** The same distance in cells, which is what sets the animation's duration. */
  readonly cellSpan: number;
}

/** A wall or a gate. There are only ever a handful, so a draw each is fine. */
export interface ObstacleDraw {
  readonly kind: 'wall' | 'gate';
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly radius: number;
  readonly color: string;
  /** Gates only: an open gate is drawn hollow and dashed. */
  readonly open: boolean;
}

export interface Scene {
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  readonly originX: number;
  readonly originY: number;
  readonly cols: number;
  readonly rows: number;
  readonly arrows: readonly ArrowDraw[];
  readonly obstacles: readonly ObstacleDraw[];
  /** Cell centres for the grid pattern, or empty when the pattern is `none`. */
  readonly patternKind: BoardStyle['pattern'];
  readonly patternRadius: number;
  readonly patternWidth: number;
  /**
   * True when the board is dense enough to drop shadow and gloss.
   *
   * Carried on the scene rather than recomputed in the renderer so that the budget
   * is a property of the frame, not a decision the draw code makes each time.
   */
  readonly simplified: boolean;
}

export interface SceneInput {
  readonly board: Board;
  readonly state: BoardState;
  readonly cellSize: number;
  readonly width: number;
  readonly height: number;
  readonly originX: number;
  readonly originY: number;
  readonly palette: Palette;
  readonly arrowStyle: ArrowStyle;
  readonly boardStyle: BoardStyle;
  /** Arrows still drawn although they have left `state` — mid-exit. */
  readonly departing?: readonly number[];
  /**
   * Arrows marked as blocked, and arrows marked as having blocked one.
   *
   * Lists rather than single indices, because these marks now stand for the rest
   * of the level rather than flashing once — see `GameState.blockedArrows`.
   */
  readonly blockedArrows?: readonly number[];
  readonly blockerArrows?: readonly number[];
  readonly hintedArrow?: number | undefined;
  readonly safeArrows?: readonly number[];
}

/**
 * Above this many arrows, shadow and gloss are dropped.
 *
 * Unchanged from the SVG renderer, and for the same reason: both are full-length
 * strokes that carry no information and are invisible on a board big enough to
 * trigger the budget. Kept here so the threshold lives with the data it describes.
 */
export const SIMPLIFY_ABOVE_ARROWS = 45;

/**
 * Colour for an arrow.
 *
 * Precedence is load-bearing and unchanged from the SVG version. Gameplay state
 * wins over everything — a blocked arrow must read as blocked whatever else is true
 * of it. Below that a colour group beats the theme, because a group colour is the
 * only thing linking an arrow to the gate it controls.
 */
export function colorForArrow(
  visual: ArrowVisual,
  arrowIndex: number,
  group: number,
  style: ArrowStyle,
  palette: Palette,
): string {
  if (visual === 'blocked') return palette.arrowBlocked;
  if (visual === 'blocker') return palette.arrowBlocker;
  if (visual === 'safe') return palette.arrowSafe;
  if (visual === 'hinted') return palette.arrowHinted;

  if (group !== NO_GROUP && palette.groupColors.length > 0) {
    return palette.groupColors[group % palette.groupColors.length]!;
  }

  const variants = palette.arrowVariants;
  if (style.colorful && variants && variants.length > 0) {
    return variants[arrowIndex % variants.length]!;
  }
  return palette.arrow;
}

/**
 * Which visual state an arrow is in, given the frame's highlights.
 *
 * Precedence matters and is unchanged: blocked beats blocker beats hinted beats
 * safe. An arrow can be several of these at once — the thing that blocked you last
 * turn may be the one the hint now points at — and the most urgent reading wins.
 */
export function visualForArrow(
  index: number,
  blocked: ReadonlySet<number>,
  blockers: ReadonlySet<number>,
  hintedArrow: number | undefined,
  safe: ReadonlySet<number>,
): ArrowVisual {
  if (blocked.has(index)) return 'blocked';
  if (blockers.has(index)) return 'blocker';
  if (index === hintedArrow) return 'hinted';
  if (safe.has(index)) return 'safe';
  return 'normal';
}

/**
 * Build the whole scene.
 *
 * Called when the board, the highlights or the layout change — not per frame, and
 * never during a gesture. Panning and zooming move a matrix; they do not rebuild
 * this.
 */
export function buildScene(input: SceneInput): Scene {
  const { board, state, cellSize, originX, originY, palette, arrowStyle, boardStyle } = input;
  const { cols, rows } = board;

  const safe = new Set(input.safeArrows ?? []);
  const blocked = new Set(input.blockedArrows ?? []);
  const blockers = new Set(input.blockerArrows ?? []);
  const departing = input.departing ?? [];
  const simplified = board.arrows.length > SIMPLIFY_ABOVE_ARROWS;

  const arrows: ArrowDraw[] = [];
  for (let index = 0; index < board.arrows.length; index += 1) {
    const alive = state.alive[index] === 1;
    if (!alive && !departing.includes(index)) continue;

    const arrow = board.arrows[index]!;
    const geometry = buildArrowGeometry(board, index, cellSize, originX, originY, arrowStyle);
    const { body, forward, tip, baseLeft, baseRight, stroke } = geometry;

    // How far the head must travel to be fully clear. Purely geometric: the ray is
    // clear by definition whenever an arrow is allowed to leave.
    const rayLength = (exitPath(board, index).length + 1) * cellSize;
    const bodyLength = (body.length - 1) * cellSize;
    const head = body[body.length - 1]!;

    const visual = visualForArrow(index, blocked, blockers, input.hintedArrow, safe);

    arrows.push({
      index,
      id: arrow.id,
      body,
      exitPoint: {
        x: head.x + forward.x * rayLength,
        y: head.y + forward.y * rayLength,
      },
      forward,
      head: arrowStyle.head === 'none' ? [] : [tip, baseLeft, baseRight],
      headCurve: arrowStyle.head === 'rounded' ? roundedHeadControls(geometry, cellSize) : [],
      eyes: geometry.eyes,
      pupils: geometry.pupils,
      eyeRadius: geometry.eyeRadius,
      stroke,
      color: colorForArrow(visual, index, arrow.group, arrowStyle, palette),
      bodyLength,
      travel: bodyLength + rayLength,
      cellSpan: cellSize > 0 ? (bodyLength + rayLength) / cellSize : 0,
    });
  }

  return {
    width: input.width,
    height: input.height,
    cellSize,
    originX,
    originY,
    cols,
    rows,
    arrows,
    obstacles: buildObstacles(input),
    patternKind: boardStyle.pattern,
    patternRadius: Math.max(1, cellSize * boardStyle.dotRatio),
    patternWidth: Math.max(0.5, cellSize * boardStyle.lineRatio),
    simplified,
  };
}

/** The two quadratic control points of a `rounded` arrowhead. */
function roundedHeadControls(
  geometry: ReturnType<typeof buildArrowGeometry>,
  cellSize: number,
): readonly Point[] {
  const { baseLeft, baseRight, forward } = geometry;
  const pull = cellSize * 0.3;
  return [
    { x: baseLeft.x + forward.x * pull, y: baseLeft.y + forward.y * pull },
    { x: baseRight.x + forward.x * pull, y: baseRight.y + forward.y * pull },
  ];
}

/** Walls and gates, positioned and coloured. */
function buildObstacles(input: SceneInput): readonly ObstacleDraw[] {
  const { board, state, cellSize, originX, originY, palette } = input;
  if (!board.hasObstacles) return [];

  const inset = cellSize * 0.08;
  const size = cellSize - inset * 2;
  const out: ObstacleDraw[] = [];

  for (let cell = 0; cell < board.cellCount; cell += 1) {
    const isWall = board.walls[cell] === 1;
    const group = board.gateGroup[cell] ?? NO_GROUP;
    if (!isWall && group === NO_GROUP) continue;

    const x = originX + (cell % board.cols) * cellSize + inset;
    const y = originY + Math.floor(cell / board.cols) * cellSize + inset;

    if (isWall) {
      out.push({
        kind: 'wall',
        x,
        y,
        size,
        radius: cellSize * 0.16,
        color: palette.wall,
        open: false,
      });
      continue;
    }

    out.push({
      kind: 'gate',
      x,
      y,
      size,
      radius: cellSize * 0.16,
      color: palette.groupColors[group % palette.groupColors.length]!,
      // A gate is open while any arrow of its colour is still on the board.
      open: (state.groupsLeft[group] ?? 0) > 0,
    });
  }

  return out;
}

/**
 * Split the scene into what can be recorded once and what has to move.
 *
 * This is the performance argument in one function. Everything static goes into a
 * single recorded picture and is replayed as one draw; the arrows that are actually
 * animating this frame — one mid-exit, perhaps one shaking, perhaps one hinted —
 * are drawn individually. The game's own shape is what makes this work: the rules
 * only ever put a handful of arrows in motion at once.
 */
export function splitScene(
  scene: Scene,
  moving: ReadonlySet<number>,
): { static: readonly ArrowDraw[]; animated: readonly ArrowDraw[] } {
  if (moving.size === 0) return { static: scene.arrows, animated: [] };

  const staticArrows: ArrowDraw[] = [];
  const animated: ArrowDraw[] = [];
  for (const arrow of scene.arrows) {
    if (moving.has(arrow.index)) animated.push(arrow);
    else staticArrows.push(arrow);
  }
  return { static: staticArrows, animated };
}

/** Grid dot centres. Only used by the pattern renderer, and only for `dots`. */
export function patternCentres(scene: Scene): Point[] {
  const out: Point[] = [];
  for (let row = 0; row < scene.rows; row += 1) {
    for (let col = 0; col < scene.cols; col += 1) {
      out.push(
        cellCentre(row * scene.cols + col, scene.cols, scene.cellSize, scene.originX, scene.originY),
      );
    }
  }
  return out;
}
