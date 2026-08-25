# UI asset brief

What has to be drawn, the style it has to be drawn in, and prompts you can paste.

Built from the shipped screens: 16 routes, 7 themes, 600 levels, 138 silhouettes.
One constraint governs every decision below — **the game re-colours its entire
interface at runtime.**

---

## The style verdict

**Flat, single-colour, stroke-based vector icons. Nothing else will work.**

Not a taste call. `src/theme/themes.ts` ships **seven complete palettes** — Paper,
Midnight, Noodles, Bold, Blueprint, Graphite, Kinetic Neon — across light and dark
schemes, and every surface, stroke and label is drawn from a token at runtime. An
asset with colour baked into it is correct in exactly one theme and wrong in six.

So every icon must be a **single-path monochrome SVG** the app tints with
`palette.text`, `palette.accent` or `palette.textFaint`. Full colour is permissible
only where nothing tints it: the app icon and the Play Store listing.

Matching what the game already looks like — geometric, precise, generous
whitespace, no gloss, no bevel, no shadow, no gradient. The board is a dotted grid
with rounded-cap snakes; the interface should read as the same hand.

**2px stroke on a 24px grid, round caps, round joins, no fill.** Transit signage,
not mobile-game candy.

> **Do not commission a 3D, glossy, "casual mobile game" icon set.** It is the
> default output of most asset generators and it will fight the game on every
> screen. ArrowPath is a *reading* puzzle — its difficulty is tracing a line
> through a tangle. Visual noise in the chrome directly harms that.

---

## The master prompt

Paste as-is. It sets the system; the inventories below supply the subjects.

```
Design a monochrome vector icon set for a minimalist mobile puzzle game.

STYLE
- Flat geometric line icons. No fill, no gradient, no shadow, no bevel, no 3D,
  no colour. Pure stroke.
- 24 x 24 px artboard, 2 px stroke weight, round caps, round joins.
- Keep 2 px of clear space inside the artboard edge on all sides.
- Optically balanced: each icon should read at 20 px on a phone tab bar.
- Geometric and precise, built from circles, straight lines and 90/45 degree
  angles. Transit-signage clarity, not illustrative character work.
- Single continuous colour (#000000). The app recolours at runtime.

OUTPUT
- SVG, one file per icon, viewBox="0 0 24 24".
- Strokes as strokes, NOT converted to outlines or filled paths.
- No embedded fill colours, no inline style attributes, no <text> elements.
- Every path must inherit stroke="currentColor".

CONTEXT
The game is a grid puzzle where arrows are "snakes" - connected chains of cells
with an arrowhead at one end - that slide off the board. The visual language is
a dotted grid, rounded-cap lines, and a lot of empty space. Icons must feel like
they belong to the same drawing system as the board.

DO NOT
- No rounded "app icon" containers or squircle backgrounds behind the glyph.
- No colour, no duotone, no highlight or accent strokes.
- No cartoon faces, no mascots, no glossy plastic, no drop shadows.
- No text or numerals inside the icons.
```

---

## 1. Navigation icons — currently Unicode text

The tab bar renders these as `<Text>` glyphs at `fontSize: 20`
(`app/(tabs)/_layout.tsx:39-45`). They render inconsistently across Android OEM
fonts and `▦` has no reliable glyph at all. **Highest-value replacement in this
document.**

| Now | Tab        | Draw instead                                                   |
| --- | ---------- | -------------------------------------------------------------- |
| `⌂` | Home       | Simple house outline, pitched roof, no door or window detail    |
| `▦` | Challenge  | 3×3 grid of squares with one cell emphasised — echoes the board |
| `◆` | Leagues    | Podium of three bars, tallest centred                           |
| `★` | Collection | Five-point star, geometric, sharp points, outline only          |
| `⚙` | Settings   | Six-tooth gear, generous inner circle so it survives 20px       |

Each needs **two weights**: regular for unfocused, heavier 2.5px (or filled) for
focused. The tab bar currently signals selection with **colour alone** — a problem
for colour-blind players that a weight change fixes for free.

---

## 2. In-game HUD and controls

From `Hud.tsx`, `PauseMenu.tsx`, `Overlays.tsx`, `play/[id].tsx`. These sit over
the board, so they must be the quietest things on screen.

| Asset            | Notes                                                             | States                    |
| ---------------- | ----------------------------------------------------------------- | ------------------------- |
| Heart            | Geometric, not anatomical. Core scoring symbol — five per level    | full · spent              |
| Hint             | Lightbulb or sparkle. Must not read as "info"                     | enabled · depleted        |
| Pause            | Two vertical bars, equal weight                                    | —                         |
| Restart          | Circular arrow, ~300° sweep, clear arrowhead                       | —                         |
| Back             | Left chevron. Replaces the `←` text glyph                          | —                         |
| Close            | X at 45°, equal arms                                               | —                         |
| Zoom / recentre  | 532 of 600 boards need pan and zoom — not optional                 | fit · reset               |
| Sound / music    | Speaker and note. Two independent toggles in settings              | on · off (struck through) |
| Star             | Per-level rating. Must match the Collection tab star exactly       | earned · empty            |
| Lock             | Locked levels. Closed shackle, simple body                         | locked · unlocked         |

---

## 3. Difficulty and progression

Ten tiers collapse to five curated bands (`bandOf` in `tools/curriculum.ts`), shown
as pips. Decision 54 records why: ten distinguishable dot colours do not exist in a
colour-blind-safe palette, so the pips pair up and the tier *name* carries the
precision.

- **Five band pips** — a shape ramp, not only a colour ramp. One filled dot → five,
  or a rising bar cluster. Shape must carry the meaning alone.
- **Oversized-board marker** — 515 boards need zoom and pan. A small "expand" glyph
  on those level cards sets expectations before a player opens one.
- **Gate markers**, two kinds playing by different rules: `opens` (clears once its
  colour leaves) and `shuts` (the 40 planning levels, where tap order can lose the
  board). Shutter levels are the only ones where a mistake costs more than a heart
  — they deserve a distinct, slightly ominous mark.
---

## 3a. Achievements — 10 badges, three tracks

`src/challenge/rewards.ts` defines the full ladder. Every entry carries a `glyph`
field whose own comment says *"A short glyph, so the screen needs no image assets
to be legible"* — these are **placeholders explicitly waiting for artwork**. Ten
rewards currently share **three** glyphs, so four different achievements are
visually identical today.

Three tracks, because they reward different things: turning up, persistence, and
skill. The art should make the track readable at a glance — a shared silhouette per
track, escalating in weight or detail with the threshold.

| Track     | Now | ID           | Name       | Earned by                                  |
| --------- | --- | ------------ | ---------- | ------------------------------------------ |
| `won`     | `◆` | `first-win`  | First Light| Win your first challenge                    |
| `won`     | `◆` | `won-5`      | Regular    | Win 5 challenges                            |
| `won`     | `◆` | `won-25`     | Committed  | Win 25 challenges                           |
| `won`     | `◆` | `won-100`    | Centurion  | Win 100 challenges                          |
| `streak`  | `▲` | `streak-3`   | On a Roll  | Win 3 days in a row                         |
| `streak`  | `▲` | `streak-7`   | Full Week  | Win 7 days in a row                         |
| `streak`  | `▲` | `streak-30`  | Unbroken   | Win 30 days in a row                        |
| `perfect` | `★` | `perfect-1`  | Clean Read | Win with no heart lost and no hint spent    |
| `perfect` | `★` | `perfect-10` | Sharp Eye  | 10 flawless challenge wins                  |
| `perfect` | `★` | `perfect-50` | Faultless  | 50 flawless challenge wins                  |

Each badge needs **earned** and **unearned** states. Unearned must not simply be
the earned one at low opacity — the rewards screen is mostly unearned for a new
player, and a wall of ghosts reads as broken rather than aspirational.

---

## 3b. League shields — 6 ranks

`src/league/league.ts` states it outright: *"Six rungs, matching the reference
design's six shields."* The shields are named in code and nothing draws them.

| League   | Entry (arrows/week) |
| -------- | ------------------- |
| Bronze   | 0                   |
| Silver   | 400                 |
| Gold     | 1,200               |
| Ruby     | 2,500               |
| Obsidian | 5,000               |
| Diamond  | 9,000               |

These are the one place a **material** reading is wanted — metal, gem, stone — and
the one place the monochrome rule is worth bending, since a league shield is an
identity, not chrome. If you tint them, supply each as a flat two-tone SVG so the
theme can still drive the surround.

Also needed, and currently the `▲` glyph: **zone markers** for the three standings
in `zoneFor` — `promotion` (up), `demotion` (down), `safe` (neutral). These must be
distinguishable by shape alone, not by red/green.

---

## 3c. Stats screen iconography

`app/stats.tsx` is entirely typographic today. Each block wants a small mark:

- **Record** — levels cleared · perfect reads · chapters done
- **Streak** — current and longest
- **How you clear them** — three clear-quality grades that need three distinct
  marks: *Perfect (no wrong taps)*, *Clean (one or two)*, *Scraped through*
- **By difficulty** — reuses the five band pips
- **Along the way** — wrong taps on best runs · hints used

- **Streak flame** — daily challenge streaks, shared with the Challenge tab.

---

## 4. Account, sync and empty states

| Asset             | Where                    | Notes                                                                                          |
| ----------------- | ------------------------ | ---------------------------------------------------------------------------------------------- |
| Google mark       | `account.tsx`            | **Do not draw this.** Use Google's official asset — a redrawn "G" breaks their terms and can fail review |
| Account / avatar  | `account.tsx`            | Currently the glyphs `◆` and `▲`. Person-in-circle, signed-in and signed-out                    |
| Cloud sync        | `account.tsx`            | Three visually distinct states: synced · device-only · checking                                 |
| Empty: Collection | `collection.tsx`         | Spot illustration ~200px, monochrome line art                                                   |
| Empty: Leagues    | `leagues.tsx`            | Shows only you until sync lands — this state will be seen a lot                                 |
| Empty: History    | `challenge/history.tsx`  | —                                                                                               |

---

## 5. Store listing — the actual release blocker

Cannot be generated from the codebase, and the only assets standing between you and
submission. Full colour is fine; nothing tints them.

| Asset             | Spec                                         | Status                |
| ----------------- | -------------------------------------------- | --------------------- |
| App icon          | 512 × 512 PNG, 32-bit                        | generated — replace   |
| Feature graphic   | 1024 × 500 PNG/JPG, no alpha                 | **missing**           |
| Phone screenshots | min 2, max 8 · 16:9 or 9:16 · ≥ 320px        | **missing**           |
| Adaptive icon     | fg + bg + monochrome, 432 × 432              | in `assets/`          |
| Splash            | `splash-icon.png`                            | in `assets/`          |
| Promo video       | YouTube URL                                  | optional              |

**For screenshots, use the game itself.** A packed 50×50 brutal board with ~150
snakes threaded through a silhouette is more arresting than anything an illustrator
would invent, and it is honest about what the player gets. Shoot one board per
theme to show the range.

```
FEATURE GRAPHIC — 1024 x 500, no alpha, no rounded corners

A single dense grid-puzzle board fills the right two-thirds, bleeding off the
top and right edges. The board is a square lattice packed with long winding
snake-like paths, each path a rounded-cap stroke with a small triangular
arrowhead at one end, threaded through each other to fill roughly 85% of the
grid. Behind them, a faint dotted grid.

Left third: generous empty space for the title, on a flat solid ground.

Palette: warm off-white ground (#F2EFE6), charcoal strokes (#2B2B28), a single
cool blue accent (#4FC3F7) on no more than three of the arrowheads.

Flat vector. No gradient, no glow, no bevel, no 3D, no photographic texture.
No text in the image.
```

---

## Non-negotiable constraints

1. **Every icon must tint.** Ship SVG with `stroke="currentColor"` and no baked
   fills. Colour in an asset makes it unusable in six of the seven themes.
2. **Legible at 20px.** The tab bar draws at exactly this size. Detail that dies
   below 24px is detail that should not exist.
3. **Both schemes.** Four themes are light, three are dark. A weight that reads on
   paper can bloom on navy — check every icon on both.
4. **Never colour-only.** `groupColors` is already drawn from a colour-blind-safe
   set and gates carry a shape cue as well. Any new state needs shape or weight
   difference too.
5. **No text baked into artwork.** Nothing is localised yet; art with words in it
   forecloses that.

### Palette tokens available to tint against

`text` · `textMuted` · `textFaint` · `accent` · `textOnAccent` · `success` ·
`danger` · `heart` · `heartSpent` · `surface` · `surfaceRaised` · `border` · `wall`

---

## Order of work

1. **Five tab icons, two weights each** — 10 files. Replaces text glyphs that
   render differently on every Android device.
2. **Feature graphic + screenshots** — the only true release blockers.
3. **HUD set** — heart, hint, pause, restart, back, close, zoom, sound, star, lock.
   ~14 files with states.
4. **Difficulty pips and gate markers** — carries meaning the interface currently
   spells out in words.
5. **Empty-state spots** — three drawings. Real, but nothing is broken without them.
