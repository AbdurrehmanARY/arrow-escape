/**
 * preview-themes.ts — render every theme to a standalone HTML page.
 *
 * Purpose:      See all six looks side by side in a browser, without waiting for
 *               a device build.
 * Responsibilities:
 *               - Emit one SVG board per theme, plus one detail strip showing the
 *                 arrowhead shapes at large size.
 * Notes:        Draws using `src/components/arrowGeometry`, the exact module the
 *               app renders from — so this preview cannot quietly disagree with
 *               what ships. If a theme looks wrong here, it looks wrong on the
 *               phone.
 *
 *               Run: `npx tsx tools/preview-themes.ts > preview.html`
 */

import { buildLevel, parseAscii, type Board, type BoardState } from '../src/game';
import {
  buildArrowGeometry,
  fitCellSize,
  offsetPoints,
  roundedHeadPath,
  toPointsAttr,
} from '../src/components/arrowGeometry';
import { THEMES, type ArrowStyle, type BoardStyle, type Palette, type Theme } from '../src/theme';

const DEMO_BOARD = `
  C G g g F f f .
  c c a g . e f .
  . c a . . e f f
  c c a a e e . f
  c . . a e . . .
  . d . a e . . B
  d d . A E . b b
  D . . . b b b .
`;

const CAP = { round: 'round', flat: 'butt', square: 'square', tapered: 'round' } as const;

function arrowSvg(
  board: Board,
  index: number,
  cellSize: number,
  ox: number,
  oy: number,
  style: ArrowStyle,
  palette: Palette,
): string {
  const g = buildArrowGeometry(board, index, cellSize, ox, oy, style);
  const variants = palette.arrowVariants;
  const color =
    style.colorful && variants && variants.length > 0
      ? variants[index % variants.length]!
      : palette.arrow;

  const cap = CAP[style.tail];
  const parts: string[] = [];

  if (style.shadow) {
    parts.push(
      `<polyline points="${toPointsAttr(offsetPoints(g.body, 0, cellSize * style.shadowOffsetRatio))}" fill="none" stroke="${palette.arrowShadow}" stroke-width="${g.stroke}" stroke-linecap="${cap}" stroke-linejoin="${style.join}"/>`,
    );
  }

  parts.push(
    `<polyline points="${toPointsAttr(g.body)}" fill="none" stroke="${color}" stroke-width="${g.stroke}" stroke-linecap="${cap}" stroke-linejoin="${style.join}"/>`,
  );

  if (style.highlight) {
    parts.push(
      `<polyline points="${toPointsAttr(offsetPoints(g.body, 0, -g.stroke * 0.18))}" fill="none" stroke="${palette.arrowHighlight}" stroke-width="${g.stroke * 0.24}" stroke-linecap="round" stroke-linejoin="${style.join}"/>`,
    );
  }

  switch (style.head) {
    case 'none':
      break;
    case 'chevron':
      parts.push(
        `<polyline points="${toPointsAttr([g.baseLeft, g.tip, g.baseRight])}" fill="none" stroke="${color}" stroke-width="${g.stroke}" stroke-linecap="round" stroke-linejoin="round"/>`,
      );
      break;
    case 'rounded':
      parts.push(`<path d="${roundedHeadPath(g, cellSize)}" fill="${color}"/>`);
      break;
    default:
      parts.push(
        `<polygon points="${toPointsAttr([g.tip, g.baseLeft, g.baseRight])}" fill="${color}"/>`,
      );
  }

  if (style.eyes) {
    for (const eye of g.eyes) {
      parts.push(`<circle cx="${eye.x}" cy="${eye.y}" r="${g.eyeRadius}" fill="#fff"/>`);
    }
    for (const pupil of g.pupils) {
      parts.push(
        `<circle cx="${pupil.x}" cy="${pupil.y}" r="${g.eyeRadius * 0.45}" fill="#1A1A1A"/>`,
      );
    }
  }

  return parts.join('');
}

function patternSvg(
  rows: number,
  cols: number,
  cellSize: number,
  ox: number,
  oy: number,
  boardStyle: BoardStyle,
  palette: Palette,
): string {
  const parts: string[] = [];
  const lw = Math.max(0.5, cellSize * boardStyle.lineRatio);

  if (boardStyle.pattern === 'dots') {
    const r = Math.max(1, cellSize * boardStyle.dotRatio);
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        parts.push(
          `<circle cx="${ox + col * cellSize + cellSize / 2}" cy="${oy + row * cellSize + cellSize / 2}" r="${r}" fill="${palette.pattern}"/>`,
        );
      }
    }
  } else if (boardStyle.pattern === 'lines') {
    for (let col = 0; col <= cols; col += 1) {
      const x = ox + col * cellSize;
      parts.push(
        `<line x1="${x}" y1="${oy}" x2="${x}" y2="${oy + rows * cellSize}" stroke="${palette.pattern}" stroke-width="${lw}"/>`,
      );
    }
    for (let row = 0; row <= rows; row += 1) {
      const y = oy + row * cellSize;
      parts.push(
        `<line x1="${ox}" y1="${y}" x2="${ox + cols * cellSize}" y2="${y}" stroke="${palette.pattern}" stroke-width="${lw}"/>`,
      );
    }
  } else if (boardStyle.pattern === 'crosses') {
    const arm = cellSize * 0.09;
    for (let row = 0; row <= rows; row += 1) {
      for (let col = 0; col <= cols; col += 1) {
        const x = ox + col * cellSize;
        const y = oy + row * cellSize;
        parts.push(
          `<line x1="${x - arm}" y1="${y}" x2="${x + arm}" y2="${y}" stroke="${palette.pattern}" stroke-width="${lw}" stroke-linecap="round"/>`,
          `<line x1="${x}" y1="${y - arm}" x2="${x}" y2="${y + arm}" stroke="${palette.pattern}" stroke-width="${lw}" stroke-linecap="round"/>`,
        );
      }
    }
  } else if (boardStyle.pattern === 'checker') {
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if ((row + col) % 2 === 1) continue;
        parts.push(
          `<rect x="${ox + col * cellSize}" y="${oy + row * cellSize}" width="${cellSize}" height="${cellSize}" fill="${palette.pattern}" opacity="0.35"/>`,
        );
      }
    }
  }

  return parts.join('');
}

function boardSvg(board: Board, state: BoardState, theme: Theme, size: number): string {
  const { rows, cols } = board;
  const pad = theme.board.padCells;
  const cellSize = fitCellSize(rows, cols, pad, size, size);
  const width = cellSize * (cols + pad * 2);
  const height = cellSize * (rows + pad * 2);
  const ox = cellSize * pad;
  const oy = cellSize * pad;

  const arrows: string[] = [];
  for (let i = 0; i < board.arrows.length; i += 1) {
    if (state.alive[i] !== 1) continue;
    arrows.push(arrowSvg(board, i, cellSize, ox, oy, theme.arrow, theme.palette));
  }

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${width}" height="${height}" rx="${theme.board.cornerRadius}" fill="${theme.palette.board}" stroke="${theme.palette.boardBorder}" stroke-width="1"/>
  ${patternSvg(rows, cols, cellSize, ox, oy, theme.board, theme.palette)}
  ${arrows.join('\n  ')}
</svg>`;
}

/** A short straight arrow in each of the four directions, to show the head shape big. */
function headStripSvg(theme: Theme, cellSize: number): string {
  const strip = parseAscii(`
    a A . b b B
    . . . . . .
    C c . . D .
    . . . . d .
  `);
  const built = buildLevel(strip);
  if (!built.ok) throw new Error(built.error);
  return boardSvg(built.value.board, built.value.initial, theme, cellSize * 7);
}

const built = buildLevel(parseAscii(DEMO_BOARD, { id: 1, name: 'Tangle', hearts: 5 }));
if (!built.ok) {
  console.error(built.error);
  process.exit(1);
}
const { board, initial } = built.value;

const plates = THEMES.map((theme, index) => {
  const p = theme.palette;
  const isDefault = theme.id === 'paper';
  return `<section class="plate">
  <div class="plate__head">
    <div class="plate__id">
      <span class="plate__num">${String(index + 1).padStart(2, '0')}</span>
      <h2>${theme.name}</h2>
      ${isDefault ? '<span class="tag">default</span>' : ''}
      ${theme.arrow.colorful ? '<span class="tag tag--warn">easier</span>' : ''}
    </div>
    <p class="plate__desc">${theme.description}</p>
  </div>

  <div class="field" style="background:${p.background}">
    <div class="field__hud" style="color:${p.textFaint}">
      <span style="color:${p.text}">Tangle</span>
      <span class="field__hearts" style="color:${p.heart}">♥♥♥<span style="color:${p.heartSpent}">♥♥</span></span>
    </div>
    <div class="field__board">${boardSvg(board, initial, theme, 400)}</div>
    <div class="field__strip">${headStripSvg(theme, 44)}</div>
  </div>

  <dl class="specs">
    <div><dt>head</dt><dd>${theme.arrow.head}</dd></div>
    <div><dt>tail</dt><dd>${theme.arrow.tail}</dd></div>
    <div><dt>grid</dt><dd>${theme.board.pattern}</dd></div>
    <div><dt>weight</dt><dd>${theme.arrow.strokeRatio.toFixed(2)}</dd></div>
    <div><dt>shadow</dt><dd>${theme.arrow.shadow ? 'yes' : 'no'}</dd></div>
    <div><dt>arrow</dt><dd><span class="chip" style="background:${p.arrow}"></span>${p.arrow}</dd></div>
  </dl>
</section>`;
}).join('\n');

console.log(`<title>ArrowPath — theme preview</title>
<style>
  :root {
    color-scheme: light dark;
    --ground: #0D1014;
    --panel: #141920;
    --hairline: #232A34;
    --text: #E9EDF2;
    --muted: #98A3B2;
    --faint: #626C79;
    --bone: #D8CFC0;
    --dot: rgba(216, 207, 192, 0.07);

    --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
    --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  }
  @media (prefers-color-scheme: light) {
    :root {
      --ground: #F2F1ED; --panel: #FFFFFF; --hairline: #DEDBD3;
      --text: #191C20; --muted: #5C636D; --faint: #8B929C;
      --bone: #6E6455; --dot: rgba(25, 28, 32, 0.06);
    }
  }
  :root[data-theme="light"] {
    --ground: #F2F1ED; --panel: #FFFFFF; --hairline: #DEDBD3;
    --text: #191C20; --muted: #5C636D; --faint: #8B929C;
    --bone: #6E6455; --dot: rgba(25, 28, 32, 0.06);
  }
  :root[data-theme="dark"] {
    --ground: #0D1014; --panel: #141920; --hairline: #232A34;
    --text: #E9EDF2; --muted: #98A3B2; --faint: #626C79;
    --bone: #D8CFC0; --dot: rgba(216, 207, 192, 0.07);
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: clamp(1.5rem, 5vw, 3.5rem) clamp(1rem, 4vw, 2.5rem) 5rem;
    font: 400 15px/1.6 var(--sans);
    color: var(--text);
    background-color: var(--ground);
    background-image: radial-gradient(var(--dot) 1.2px, transparent 1.2px);
    background-size: 22px 22px;
  }

  .masthead { max-width: 68ch; margin: 0 auto clamp(2rem, 5vw, 3rem); }
  .eyebrow {
    margin: 0 0 .5rem; font-family: var(--mono); font-size: 11px;
    letter-spacing: .18em; text-transform: uppercase; color: var(--faint);
  }
  h1 {
    margin: 0 0 .6rem; font-size: clamp(1.9rem, 5.5vw, 3rem); font-weight: 800;
    letter-spacing: -.03em; line-height: 1.05; text-wrap: balance;
  }
  .lede { margin: 0 0 .85rem; color: var(--muted); font-size: clamp(15px, 1.6vw, 17px); }
  .lede code {
    font-family: var(--mono); font-size: .88em; color: var(--text);
    background: var(--panel); border: 1px solid var(--hairline);
    padding: .12em .4em; border-radius: 5px;
  }
  .rule { height: 1px; background: var(--hairline); margin: clamp(1.5rem, 4vw, 2.25rem) auto 0; max-width: 68ch; }

  .gallery {
    display: grid; gap: clamp(1.25rem, 3vw, 2rem);
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr));
    max-width: 1440px; margin: clamp(2rem, 5vw, 3rem) auto 0;
  }

  .plate {
    display: flex; flex-direction: column; gap: 1rem;
    background: var(--panel); border: 1px solid var(--hairline);
    border-radius: 14px; padding: clamp(1rem, 2.5vw, 1.4rem);
  }
  .plate__id { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; }
  .plate__num {
    font-family: var(--mono); font-size: 12px; color: var(--faint);
    font-variant-numeric: tabular-nums;
  }
  .plate h2 { margin: 0; font-size: 1.25rem; font-weight: 700; letter-spacing: -.015em; }
  .tag {
    font-family: var(--mono); font-size: 10px; letter-spacing: .1em; text-transform: uppercase;
    color: var(--bone); border: 1px solid currentColor; border-radius: 999px;
    padding: .18em .55em; opacity: .85;
  }
  .tag--warn { opacity: .6; }
  .plate__desc { margin: .5rem 0 0; font-size: 13.5px; color: var(--muted); }

  .field {
    border-radius: 12px; padding: .9rem .9rem 1.1rem;
    display: flex; flex-direction: column; gap: .75rem; align-items: center;
    overflow-x: auto;
  }
  .field__hud {
    width: 100%; display: flex; align-items: center; justify-content: space-between;
    font-size: 13px; font-weight: 700; padding: 0 .15rem;
  }
  .field__hearts { font-size: 13px; letter-spacing: 1px; }
  .field__board svg, .field__strip svg { display: block; max-width: 100%; height: auto; }
  .field__strip { opacity: .92; }

  .specs { display: flex; flex-wrap: wrap; gap: .35rem; margin: 0; }
  .specs > div {
    display: flex; align-items: center; gap: .4rem;
    border: 1px solid var(--hairline); border-radius: 7px; padding: .22rem .5rem;
  }
  .specs dt {
    margin: 0; font-family: var(--mono); font-size: 9.5px; letter-spacing: .09em;
    text-transform: uppercase; color: var(--faint);
  }
  .specs dd {
    margin: 0; font-family: var(--mono); font-size: 11.5px; font-weight: 600;
    color: var(--text); font-variant-numeric: tabular-nums;
    display: flex; align-items: center; gap: .3rem;
  }
  .chip { width: 9px; height: 9px; border-radius: 2px; display: inline-block; }

  .footnote {
    max-width: 68ch; margin: clamp(2.5rem, 6vw, 4rem) auto 0;
    font-size: 13.5px; color: var(--muted);
  }
  .footnote strong { color: var(--text); font-weight: 700; }
</style>

<div class="masthead">
  <p class="eyebrow">ArrowPath · Phase 1</p>
  <h1>Six themes, one level</h1>
  <p class="lede">The same board and the same seven snakes, drawn under every theme the game ships. Each board is rendered by <code>src/components/arrowGeometry.ts</code> — the exact module the app draws from — so this is what the phone shows, not an impression of it.</p>
  <p class="lede">A theme sets the palette, the arrow shape, and the board pattern independently, so they mix freely. The strip beneath each board shows all four directions at larger size, for judging an arrowhead on its own.</p>
</div>
<div class="rule"></div>

<div class="gallery">
${plates}
</div>

<p class="footnote"><strong>One theme genuinely changes the game.</strong> Noodles colours every snake differently, and telling snakes apart is the skill this game tests — so it plays noticeably easier. Every other theme keeps all arrows one colour on purpose.</p>`);
