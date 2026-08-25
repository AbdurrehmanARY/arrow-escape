# ArrowPath — generation prompts

Every prompt needed to produce the game's artwork, ready to paste into Google Flow
(or Imagen / Midjourney / any image model). Companion to
[UI_ASSETS.md](UI_ASSETS.md), which explains *why* each asset looks the way it does.

**Read Part 0 first.** It says which assets a generator should make and which it
should not, and that distinction is the difference between usable art and a week
lost.

---

## Part 0 — What NOT to generate

### Do not generate the UI icons

Tab icons, HUD controls, chevrons, hearts, gears. A generator cannot produce these
to a usable standard, and the failure is structural rather than a prompting problem:

- It emits **raster**, not SVG. Your icons must tint across seven themes at runtime,
  which needs real `stroke="currentColor"` paths.
- Auto-tracing a 24 px raster gives ragged paths, uneven stroke weights and
  inconsistent optical sizing between icons.
- Consistency across a set is exactly what these models are worst at, and an icon
  set that is 90% consistent looks broken rather than 90% good.

**Use [Lucide](https://lucide.dev) instead** — `npm i lucide-react-native`. It is
MIT-licensed and its house style *is* the spec in UI_ASSETS.md: 24×24 viewBox, 2px
stroke, round caps, round joins, no fill, `currentColor`. Every icon in the brief
already exists in it:

| Need | Lucide name |
| --- | --- |
| Home tab | `house` |
| Challenge tab | `grid-3x3` |
| Leagues tab | `trophy` |
| Collection tab | `star` |
| Settings tab | `settings` |
| Hearts | `heart` |
| Hint | `lightbulb` |
| Pause / restart | `pause`, `rotate-ccw` |
| Back / close | `chevron-left`, `x` |
| Zoom | `maximize`, `locate-fixed` |
| Sound / music | `volume-2`, `volume-x`, `music` |
| Lock | `lock`, `lock-open` |
| Account / sync | `user`, `cloud`, `cloud-off` |
| Zone markers | `chevron-up`, `chevron-down`, `minus` |

That removes roughly 40 files of work and gives better results than any prompt
below would. Spend the generation budget on the things below, which genuinely need
illustration.

### Do generate these

Feature graphic · achievement badges · league shields · empty-state spots · promo
video · animated splash. All of them are illustration, none needs to tint, and all
are where a model is actually strong.

---

## Part 1 — Global style block

Prepend this to **every** prompt in Parts 2 and 3. It is what keeps twenty separate
generations looking like one game.

```
STYLE SYSTEM — ArrowPath
Flat vector illustration. Geometric, precise, generous negative space.
Rounded-cap strokes, consistent 2-3px optical weight, no outlines around shapes.

Palette, strictly:
  ground   #F2EFE6  warm off-white
  ink      #2B2B28  charcoal
  accent   #4FC3F7  cool blue, used sparingly - never more than 15% of the image
  muted    #B9B1A0  warm grey

Motif: the game is a grid puzzle. Arrows are "snakes" - connected chains of cells
forming a long winding path with a single triangular arrowhead at one end. They
thread through each other across a faint dotted grid. Use this motif everywhere.

FORBIDDEN, in every prompt:
no gradient, no glow, no bevel, no drop shadow, no 3D, no glossy plastic,
no photographic texture, no lens flare, no bokeh, no text, no lettering,
no numerals, no watermark, no mascot, no cartoon face, no dark outline stroke.
```

---

## Part 2 — Static illustrations

### 2.1 Feature graphic — the release blocker

```
1024 x 500 landscape banner, no alpha, no rounded corners.

A single dense grid-puzzle board fills the right two-thirds, bleeding off the top
and right edges of the frame. The board is a square lattice packed with long
winding snake-like paths, each a rounded-cap charcoal stroke with one small
triangular arrowhead, threaded through one another to fill about 85% of the grid.
A faint dotted grid shows behind them.

The left third is flat empty warm off-white, reserved for a title. Nothing in it.

Three arrowheads only are cool blue; every other stroke is charcoal.
Flat vector, no depth, no shading.
```

### 2.2 App icon — 512 × 512

```
Square app icon, 512 x 512, flat vector, centred composition.

A single arrow-snake: a thick rounded-cap charcoal path that turns twice in a
spiral and ends in one clean triangular arrowhead pointing up and to the right,
escaping past the edge of a faint dotted grid.

Warm off-white ground. The arrowhead alone is cool blue.
Bold and simple enough to read at 48 pixels. Generous margin - the path must not
touch the icon edge except where it escapes.
No container shape, no squircle, no border, no text.
```

### 2.3 Achievement badges — 10, in three families

Generate **one master per track**, then vary the tier. Consistency within a track
matters far more than novelty between them.

**Track `won` — diamond family** *(First Light 1, Regular 5, Committed 25, Centurion 100)*

```
A circular badge, flat vector, front-facing, no perspective.
Inside: a diamond formed from four arrow-snake paths meeting point to point,
their arrowheads pointing outward at the four compass points.
Charcoal strokes on warm off-white, thin charcoal ring border.
Tier 1 of 4: the simplest version - a single thin ring, minimal interior detail.
```

Then for each tier, replace the last line:

- *Tier 2* — `two concentric rings, the interior diamond slightly thicker.`
- *Tier 3* — `two rings with small notches at the compass points, interior filled charcoal.`
- *Tier 4* — `a laurel of short strokes around the outer ring, interior diamond in cool blue.`

**Track `streak` — flame family** *(On a Roll 3, Full Week 7, Unbroken 30)*

```
A circular badge, flat vector, front-facing.
Inside: an upward flame built from three nested arrow-snake paths, each curving
up and inward, arrowheads at the flame tips.
Charcoal on warm off-white, thin charcoal ring.
Tier 1 of 3: one path, thin ring.
```
- *Tier 2* — `two paths, doubled ring.`
- *Tier 3* — `three paths, the innermost cool blue, ring notched at the top.`

**Track `perfect` — star family** *(Clean Read 1, Sharp Eye 10, Faultless 50)*

```
A circular badge, flat vector, front-facing.
Inside: a five-point star whose outline is one continuous arrow-snake path,
beginning and ending at a single triangular arrowhead at the top point.
Charcoal on warm off-white, thin charcoal ring.
Tier 1 of 3: outline only.
```
- *Tier 2* — `star interior filled charcoal, doubled ring.`
- *Tier 3* — `star interior cool blue, ring of short radiating strokes.`

**Unearned state** — generate separately, do **not** just lower the opacity:

```
The same badge reduced to its silhouette only: a thin charcoal ring with a
dotted-outline placeholder of the interior shape, no fill, warm grey rather than
charcoal. It should read as "not yet", not as "broken".
```

### 2.4 League shields — 6 ranks

The one place a **material** reading is wanted, and the one place to bend the flat
rule slightly — a shield is an identity, not chrome.

```
A heraldic shield, flat vector, front-facing, symmetrical, no perspective.
The shield face carries a single arrow-snake path curving from lower-left to
upper-right, ending in a triangular arrowhead that crosses the shield's edge.
Simple two-tone: one flat fill for the shield, one darker tone for the path.
Clean geometric silhouette. No text, no numerals, no ribbon, no banner.

Material: <MATERIAL>
```

Substitute:

| League | `<MATERIAL>` |
| --- | --- |
| Bronze | `warm brown bronze, matte, one flat tone with a single darker rim` |
| Silver | `cool light grey silver, matte, one flat tone with a darker rim` |
| Gold | `warm yellow gold, matte, one flat tone with a darker rim` |
| Ruby | `deep red, faceted outline hinting at a cut gem, still flat-filled` |
| Obsidian | `near-black volcanic glass, one flat tone, a single pale edge highlight` |
| Diamond | `pale ice blue, geometric facet lines across the face, flat-filled` |

Generate all six in **one batch with one seed** so the silhouette is identical and
only the material changes. A ladder whose shields differ in shape reads as six
unrelated badges rather than six rungs.

### 2.5 Empty states — 3 spots

Roughly 200 px square, monochrome line art, more air than the badges.

**Collection**
```
A flat vector spot illustration: an open grid frame, mostly empty, with three
small arrow-snake paths resting in one corner and a dotted outline showing where
more would go. Charcoal line art on warm off-white. Calm, not sad.
```

**Leagues**
```
A flat vector spot illustration: a podium of three empty blocks drawn as outlines
only, with a single small arrow-snake curled on the lowest step. Charcoal line
art on warm off-white. Suggests "you are here first", not "nobody came".
```

**Challenge history**
```
A flat vector spot illustration: a row of seven small empty calendar squares in
outline, one of them holding a single arrow-snake. Charcoal line art on warm
off-white.
```

---

## Part 3 — Animated, for Google Flow

Flow generates **video**, which is what it is genuinely good at. These are the
places motion earns its keep. Keep clips short — 4-8 seconds — and never put text
in the generation; overlay type afterwards.

### 3.1 The one to make first — store promo / trailer loop

```
An 8-second flat 2D vector animation, top-down, camera locked, no camera movement.

A dense square grid puzzle board fills the frame, packed with long winding
snake-like paths in charcoal on a warm off-white ground, each path ending in a
single triangular arrowhead, threaded through one another over a faint dotted grid.

One by one, a path slides out through the edge of the board in the direction its
arrowhead points - the head leads and the whole body follows along exactly the
trail the head cleared, like a snake leaving a burrow. Each departure is quick and
smooth, about 0.4 seconds, and as each path leaves it reveals the paths beneath it.
Paths leave in sequence, one after another, never simultaneously.

Only one arrowhead is cool blue at any moment - the one about to leave.

Flat vector throughout. No camera zoom, no parallax, no depth of field, no glow,
no particles, no text, no UI elements, no hands or cursors.
```

> **This is the single most valuable asset in the file.** It shows the mechanic in
> eight seconds, which no still image can, and it doubles as your Play Store promo
> video and your website hero.

### 3.2 Animated splash — 2 seconds

```
A 2-second flat 2D vector animation on a warm off-white ground, camera locked.

A single charcoal arrow-snake path draws itself on from the lower left, curving
twice, and its triangular arrowhead comes to rest in the centre of frame. The path
then holds perfectly still.

Line-drawing motion only - the stroke extends along its own length as if being
drawn. No fade in, no scale, no rotation, no bounce.
The arrowhead is cool blue. Everything else charcoal.
No text, no logo, no background detail.
```

### 3.3 Achievement unlock — 1.5 seconds

```
A 1.5-second flat 2D vector animation, centred, warm off-white ground.

A circular badge with a thin charcoal ring. Its interior shape draws itself in
along a single continuous stroke, then the ring completes with a short clockwise
sweep. Finally three short strokes flick outward from the ring edge and vanish.

Crisp and quick, no bounce, no overshoot, no sparkle, no glow, no particles
beyond the three strokes. Flat vector. No text.
```

### 3.4 League promotion — 2 seconds

```
A 2-second flat 2D vector animation, centred, warm off-white ground.

A heraldic shield sits in frame. It slides upward out of the top of the frame and
a second shield in a brighter material rises from below to take its place, coming
to rest cleanly. A single arrow-snake path sweeps upward past both during the
transition.

Flat two-tone shields, no gradient, no shine sweep, no sparkle, no text.
Motion is smooth and decisive - no bounce, no elastic easing.
```

### 3.5 Board-clearing loop — for the website or a store screenshot backdrop

```
A seamless looping 6-second flat 2D vector animation, camera locked.

A grid of winding charcoal arrow-snake paths on warm off-white over a faint dotted
grid. Paths leave the board one at a time through their arrowhead's edge, and as
the board empties new paths slide in from the opposite edges to refill it, so the
density stays constant and the loop is seamless.

Flat vector, no camera movement, no depth, no glow, no text.
```

---

## Part 4 — Checklist

| # | Asset | Count | Tool | Blocking release |
| --- | --- | --- | --- | --- |
| 1 | Feature graphic | 1 | Image | **Yes** |
| 2 | Screenshots | 2–8 | Capture from the game | **Yes** |
| 3 | App icon | 1 | Image | Replace generated one |
| 4 | UI icons | ~40 | **Lucide, not generated** | No |
| 5 | Achievement badges | 10 + unearned | Image | No |
| 6 | League shields | 6 | Image | No |
| 7 | Empty states | 3 | Image | No |
| 8 | Promo video | 1 | **Flow** | No — but highest impact |
| 9 | Splash / unlock / promotion | 3 | Flow | No |

**Screenshots are shot, not generated.** A packed 50×50 board with ~150 snakes
threaded through a silhouette is more striking than anything a model will invent,
and it is honest about what the player gets. Capture one board per theme.

---

## Notes on getting good output

- **Batch within a family, one seed.** Six shields or four badges generated
  separately will not match. Generate them together and vary only the substituted
  line.
- **Negative prompts do most of the work.** The forbidden list in Part 1 is not
  decoration — image models default hard to glow, gradient and 3D, and every one of
  those breaks the flat system.
- **Never let the model render text.** It gets it wrong, and nothing here is
  localised yet. Overlay type yourself.
- **Check every static asset at final size** before accepting it. A badge that
  reads at 1024 px and mushes at 64 px is a badge you will regret.
