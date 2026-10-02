/**
 * The brand mark's polarity.
 *
 * The logo ships in two inks — charcoal for light grounds, bone for dark ones —
 * because one flat mark cannot be visible on both Paper `#EEEBE4` and Kinetic Neon
 * `#0A0E1A`. Which one a theme gets is decided from that theme's own background
 * colour, so a re-coloured or newly added theme picks the right mark without anyone
 * editing a switch statement.
 *
 * That makes exactly one thing worth testing hard: **a theme must never get an
 * invisible logo.** A wrong choice here is not a crash and not a failure anywhere
 * else — it is a faint smudge on a screen that still works, which is why it needs
 * an assertion rather than an eyeball.
 *
 * So the ink is not taken on trust. This reads the two shipped PNGs off disk,
 * measures the colour actually painted into them, and checks it against every
 * theme's real background. Changing the ink in `tools/make-brand-assets.ts`
 * therefore does not invalidate this test — it feeds it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

import { APP_NAME, BRAND, brandMark, brandWordmark, isDarkColor } from '../../src/shared/branding';
import { getThemeAssets } from '../../src/theme/themeAssets';
import { THEMES } from '../../src/theme/themes';

const CHARCOAL_MARK = require('../../assets/brand/arrow-mark.png');
const BONE_MARK = require('../../assets/brand/arrow-mark-light.png');

/**
 * The minimum contrast a mark must clear against its ground.
 *
 * WCAG asks only 3:1 for a graphical object; this deliberately demands the 4.5:1
 * text standard instead, so a new theme has to be clearly readable rather than
 * merely legal. The shipped palettes all sit at 7:1 or better, so this is a floor
 * with real headroom, not a threshold tuned to just pass.
 */
const MIN_CONTRAST = 4.5;

/** Relative luminance of a `#rrggbb` colour, per WCAG 2.x. */
function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '');
  const channel = (offset: number): number => {
    const raw = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return raw <= 0.04045 ? raw / 12.92 : Math.pow((raw + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** WCAG contrast ratio between two `#rrggbb` colours, order-independent. */
function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The colour that was actually painted into a shipped mark.
 *
 * The mark is a flat fill, so the commonest fully opaque pixel is the ink. Fully
 * opaque only, to ignore the anti-aliased rim.
 */
function measuredInk(relativePath: string): string {
  const png = PNG.sync.read(readFileSync(join(__dirname, '..', '..', relativePath)));
  const counts = new Map<string, number>();

  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] !== 255) continue;
    const hex = `#${[png.data[i], png.data[i + 1], png.data[i + 2]]
      .map((channel) => (channel ?? 0).toString(16).padStart(2, '0'))
      .join('')}`;
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }

  let best = '';
  let bestCount = 0;
  for (const [hex, count] of counts) {
    if (count > bestCount) {
      best = hex;
      bestCount = count;
    }
  }

  if (!best) throw new Error(`${relativePath} has no opaque pixels — is the mark there?`);
  return best;
}

/** The two shipped inks, read from the files rather than restated here. */
const CHARCOAL_INK = measuredInk('assets/brand/arrow-mark.png');
const BONE_INK = measuredInk('assets/brand/arrow-mark-light.png');

describe('isDarkColor', () => {
  it('treats the shipped dark grounds as dark and the light ones as light', () => {
    // Read from the registry, so a re-coloured theme is re-checked rather than
    // silently passing against a stale hex written here.
    const dark = THEMES.filter((theme) => isDarkColor(theme.palette.background))
      .map((theme) => theme.id)
      .sort();
    const light = THEMES.filter((theme) => !isDarkColor(theme.palette.background))
      .map((theme) => theme.id)
      .sort();

    expect(dark).toEqual(['blueprint', 'kineticNeon', 'midnight', 'noodles']);
    expect(light).toEqual(['arrow', 'bold', 'graphite', 'paper']);
  });

  it('judges by perceived brightness, not by the average of the channels', () => {
    // Bright yellow is a *light* ground even though its raw RGB average is middling.
    // A naive `(r + g + b) / 3` test puts Bold on the wrong side of the line.
    expect(isDarkColor('#F5C518')).toBe(false);
    // A saturated deep blue is dark to the eye even though it reads as "a colour".
    expect(isDarkColor('#0A2A43')).toBe(true);
  });

  it('accepts shorthand hex and falls back to light for anything unparseable', () => {
    expect(isDarkColor('#000')).toBe(true);
    expect(isDarkColor('#fff')).toBe(false);
    expect(isDarkColor('  #0E1120  ')).toBe(true);
    // Falling back to "light" is the safer failure: bone ink on a light ground is a
    // faint mark, where charcoal ink on a dark ground is no mark at all.
    expect(isDarkColor('not-a-colour')).toBe(false);
    expect(isDarkColor('')).toBe(false);
  });
});

describe('brand mark polarity', () => {
  it('shipped two inks that are actually opposite in brightness', () => {
    // Guards the measurement itself: if the un-masking tool ever regressed and
    // shipped its grey checkerboard as the mark, these would be the same colour.
    expect(isDarkColor(CHARCOAL_INK)).toBe(true);
    expect(isDarkColor(BONE_INK)).toBe(false);
    expect(contrastRatio(CHARCOAL_INK, BONE_INK)).toBeGreaterThan(MIN_CONTRAST);
  });

  it.each(THEMES.map((theme) => [theme.id, theme.name, theme.palette.background] as const))(
    'gives %s (%s) a mark visible on its %s ground',
    (id, _name, background) => {
      const asset = getThemeAssets(id).arrowIcon;
      const ink = asset === BONE_MARK ? BONE_INK : CHARCOAL_INK;
      const other = ink === CHARCOAL_INK ? BONE_INK : CHARCOAL_INK;

      // The *stronger* of the two inks, not merely an acceptable one.
      expect(contrastRatio(ink, background)).toBeGreaterThan(contrastRatio(other, background));
      expect(contrastRatio(ink, background)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    },
  );

  it('picks the light ink exactly on the dark grounds', () => {
    for (const theme of THEMES) {
      const expected = isDarkColor(theme.palette.background) ? BONE_MARK : CHARCOAL_MARK;
      expect(getThemeAssets(theme.id).arrowIcon).toBe(expected);
    }
  });

  it('returns the same object for the same theme, and falls back for an unknown one', () => {
    // Screens hold this in props and memoise on it, so a fresh object per call
    // would quietly defeat every `React.memo` between here and the mark.
    expect(getThemeAssets('paper')).toBe(getThemeAssets('paper'));
    expect(getThemeAssets('midnight')).toBe(getThemeAssets('midnight'));

    // An unknown id must not throw; it resolves the way `themeById` does.
    expect(() => getThemeAssets('does-not-exist')).not.toThrow();
    expect(getThemeAssets('does-not-exist').arrowIcon).toBe(getThemeAssets('paper').arrowIcon);
  });

  it('selects the matching polarity for the glyph and for the full lockup', () => {
    expect(brandMark(true)).toBe(BRAND.arrowMarkLight);
    expect(brandMark(false)).toBe(BRAND.arrowMark);
    expect(brandWordmark(true)).toBe(BRAND.wordmarkLight);
    expect(brandWordmark(false)).toBe(BRAND.wordmark);
  });
});

describe('the product name', () => {
  it('matches the name the OS shows, so the app cannot introduce itself twice', () => {
    // `app.json` is what Android prints under the launcher icon; `APP_NAME` is what
    // the Home and Settings screens print. They are the same product.
    expect(require('../../app.json').expo.name).toBe(APP_NAME);
  });
});
