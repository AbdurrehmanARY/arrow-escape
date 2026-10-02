/**
 * The image registry's two jobs: describe every image once, and be the only
 * place in `src/` that reaches into `assets/`.
 *
 * The second job is the one that matters. `require()` returns `any` and
 * `tools/check-architecture.ts` only inspects `import … from`, so a stray asset
 * path is invisible to both `tsc` and the layer rules — it fails on a device at
 * bundle time, in front of a player. This suite closes that gap by walking the
 * source tree, which makes "single source of truth" a rule rather than a
 * convention someone has to remember.
 *
 * The identity assertions do real work too: `require()` of the same absolute
 * path yields the same module object, so `toBe` proves the registry points at
 * the *intended* file, not merely at *a* file that exists. Several of these
 * have spaces or generated names in them, which is exactly where a typo hides.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import {
  AWARD_IMAGES,
  ALL_IMAGES,
  BRAND_IMAGES,
  IMAGES,
  RECORD_IMAGES,
  SHIELD_IMAGES,
  THEME_IMAGES,
  TROPHY_IMAGES,
  imageByKey,
} from '../../src/shared/assets/images';

const ROOT = join(__dirname, '..', '..');
const SRC = join(ROOT, 'src');
/** The one directory in `src/` allowed to `require()` a non-audio asset. */
const REGISTRY_DIR = join('src', 'shared', 'assets');

/** Audio is out of scope for this registry — see `PRODUCTION_CLEANUP.md` D9. */
const AUDIO_DIR = join('src', 'services', 'audio');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('the image registry', () => {
  it('describes every image, with unique semantic keys', () => {
    const keys = new Set<string>();
    for (const asset of ALL_IMAGES) {
      expect(asset.key).toMatch(/^[a-z][a-zA-Z]*\.[a-zA-Z][a-zA-Z]*$/);
      expect(asset.key.length).toBeGreaterThan(0);
      expect(asset.name.trim().length).toBeGreaterThan(0);
      expect(asset.description.trim().length).toBeGreaterThan(0);
      expect(keys.has(asset.key)).toBe(false);
      keys.add(asset.key);
    }
    expect(ALL_IMAGES.length).toBeGreaterThan(60);
  });

  it('is the whole catalogue, not a sample of it', () => {
    const groups = [
      BRAND_IMAGES,
      RECORD_IMAGES,
      AWARD_IMAGES,
      TROPHY_IMAGES,
      THEME_IMAGES,
      SHIELD_IMAGES,
    ];
    const fromGroups = groups.flatMap((group) => Object.values(group));
    expect(ALL_IMAGES).toHaveLength(fromGroups.length);
    // Each group entry appears in `IMAGES` under the same object identity, so
    // the flat catalogue is a view of the groups rather than a second copy.
    for (const asset of fromGroups) {
      const property = asset.key.split('.')[1] as keyof typeof IMAGES;
      expect(IMAGES[property]).toBe(asset);
    }
  });

  it('resolves to the intended file, not merely to one that exists', () => {
    // Filenames with spaces, a trailing space, and a generated name: the cases
    // a hand-typed path is most likely to get wrong.
    expect(IMAGES.wordmarkDark.source).toBe(require('../../assets/brand/wordmark.png'));
    expect(IMAGES.largestStreak.source).toBe(require('../../assets/records/largest streak.webp'));
    expect(RECORD_IMAGES.mostWinsInactive.source).toBe(
      require('../../assets/records/most_win_inative.webp'),
    );
    expect(AWARD_IMAGES.perfectPlayInactive.source).toBe(
      require('../../assets/awards/perfect play unactive.webp'),
    );
    expect(THEME_IMAGES.leagueIntro.source).toBe(require('../../assets/league/league info.webp'));
    expect(TROPHY_IMAGES.janLocked.source).toBe(
      require('../../assets/monthly trophies/jan lock.webp'),
    );
    expect(TROPHY_IMAGES.aprLocked.source).toBe(
      require('../../assets/monthly trophies/Locked_championship_cup_on_base_202609042146.webp'),
    );
    expect(SHIELD_IMAGES.bronze.source).toBe(
      require('../../assets/shields/Bronze_mobile_game_rank_shield_202609042103.webp'),
    );
  });

  it('degrades instead of throwing on an unknown key', () => {
    expect(imageByKey('awards.nope')).toBeUndefined();
    expect(imageByKey('')).toBeUndefined();
    expect(imageByKey('shield.gold')?.key).toBe('shield.gold');
  });

  it('is the only module in src/ that requires an asset', () => {
    // Audio is deliberately exempt (PRODUCTION_CLEANUP.md D9), and this test
    // file itself lives in `__tests__`, outside `SRC`, so it cannot exempt itself.
    const offenders = sourceFiles(SRC)
      .map((file) => relative(ROOT, file).split(sep).join(sep))
      .filter((file) => !file.startsWith(REGISTRY_DIR))
      .filter((file) => !file.startsWith(AUDIO_DIR))
      .filter((file) => /require\(\s*['"][^'"]*assets\//.test(readFileSync(join(ROOT, file), 'utf8')));

    expect(offenders).toEqual([]);
  });
});
