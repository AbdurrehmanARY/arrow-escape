/**
 * inspect-shapes.ts — print silhouettes at a real board size.
 *
 * Purpose:      Check a shape still reads after being scaled and repaired, before
 *               600 levels get generated inside it.
 * Notes:        The bitmap in `shapeArt.ts` is not what a level sees. Sampling,
 *               isolation pruning and small-region pruning all change it, and a
 *               silhouette that looks fine at 16x16 can lose its defining feature
 *               at 12x12. This prints the *post-repair* mask, which is the thing
 *               that actually matters.
 *
 *               Run: `npm run shapes:inspect [rows] [cols] [filter]`
 */

import { categoryOf, maskCapacity, maskFor, renderMask, SHAPE_NAMES } from './shapes';

const rows = Number(process.argv[2] ?? 14);
const cols = Number(process.argv[3] ?? 14);
const filter = process.argv[4]?.toLowerCase();

const shapes = filter
  ? SHAPE_NAMES.filter((s) => s.toLowerCase().includes(filter))
  : SHAPE_NAMES;

let thin = 0;

for (const shape of shapes) {
  const mask = maskFor(shape, rows, cols);
  const capacity = maskCapacity(mask);
  const fill = ((capacity / (rows * cols)) * 100).toFixed(0);

  // Below roughly a fifth of the grid there is not enough room for a level of
  // any density, which usually means the silhouette needs a bigger board.
  const warning = capacity < rows * cols * 0.18 ? '  <-- very thin' : '';
  if (warning) thin += 1;

  console.log(`${shape}  [${categoryOf(shape)}]  ${capacity}/${rows * cols} cells (${fill}%)${warning}`);
  console.log(renderMask(mask, rows, cols));
  console.log('');
}

console.log(`${shapes.length} shapes at ${rows}x${cols}. ${thin} flagged as very thin.`);
