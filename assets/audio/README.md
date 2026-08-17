# Audio assets

The game runs perfectly without these files — **every audio call is a no-op when
the asset is missing** (see `src/services/audio.ts`). Replacing one is dropping a
file in and changing one line of `src/services/audioAssets.ts`.

**Every file currently in this folder is synthesised, not recorded.** They are
computed from formulas by `npm run sounds:build` — clean and plain, in the register
of early system sounds rather than produced game audio. That was the right trade
against silence, and it is not the finished article.

**They are `.wav`, not the `.m4a` this document asks for**, because AAC encoding
needs a codec this toolchain does not have. The whole set is about 3.5MB, 90% of it
music. Real files should be `.m4a` — see [Format](#format) — which takes that under
800KB.

Two files listed below are **deliberately not wired to anything**, and are marked
where they appear: `correct-move` and `undo` (no undo is exposed), and `countdown`
(there is no countdown anywhere in this game — no pre-level timer, no turn clock,
no claim window). Everything else fires at a real moment.

---

## Layout

```
assets/audio/
  music/    menu.m4a  gameplay.m4a  victory.m4a  failure.m4a
  sfx/      arrow-pickup.m4a  arrow-release.m4a  …
```

---

## Music

Four beds. `menu` and `gameplay` **loop**; `victory` and `failure` play once over
the top, ducking whatever is underneath.

| File | When | What it should be |
|---|---|---|
| `music/menu.m4a` | main menu, level select | unhurried, a little warmer than the gameplay bed. This is the first thing anyone hears |
| `music/gameplay.m4a` | during a level | soft, low-key, **no strong melody**. It has to survive being heard for an hour without becoming the thing you notice |
| `music/victory.m4a` | level cleared | 2–3 seconds, resolved and warm. It plays *over* the bed, so leave headroom |
| `music/failure.m4a` | out of hearts, or a board sealed shut | 2–3 seconds, gentle and descending. Deliberately not harsh — on almost every level the board behind it was still winnable |

**Loops must be seamless.** Trim on a zero crossing with no trailing silence. A
20ms gap is inaudible once and unbearable on the fortieth repeat, and it will
become the most noticeable thing in the game.

---

## Sound effects

### Gameplay

| File | When |
|---|---|
| `sfx/arrow-pickup.m4a` | a finger lands on an arrow, before the tap resolves. Confirms *which* arrow is under the thumb — very short and very quiet |
| `sfx/arrow-release.m4a` | an arrow threads off the board — **fires constantly, so it must never grate.** The most important file here |
| `sfx/wrong-move.m4a` | a completed tap that hit **no arrow**. Costs nothing, so it must not sound like a penalty |
| `sfx/collision.m4a` | a tap on an arrow that cannot leave. This one *does* cost a heart |
| `sfx/heart-lost.m4a` | the heart drains, layered under `collision`. Soft and low — the player misread, they did not fail |
| `sfx/last-heart.m4a` | one heart remaining. Fires once a level, so it can afford to be distinctive |
| `sfx/hint.m4a` | a hint is spent and the arrow lights up |
| `sfx/restart.m4a` | level restarted, from any of the four places that can cause one |
| `sfx/pause.m4a` · `sfx/resume.m4a` | the pause sheet opening and closing |
| `sfx/correct-move.m4a` | **not wired.** `arrow-release` already covers a successful tap |
| `sfx/undo.m4a` | **not wired.** No undo is exposed today |

### UI

| File | When |
|---|---|
| `sfx/button.m4a` | every button and every tab. **The most-played sound in the app** — felt rather than heard, or it becomes the whole experience |
| `sfx/toggle.m4a` | a settings switch. Deliberately distinct from `button`: a switch is not a button |
| `sfx/popup-open.m4a` · `sfx/popup-close.m4a` | confirmation dialogs and the league explainer. **Not** the win/fail sheets, which have voices of their own |
| `sfx/reward-collected.m4a` | a hint earned by watching a rewarded ad |

### Progress

| File | When |
|---|---|
| `sfx/level-complete.m4a` | the board is cleared. First in the win sequence |
| `sfx/star.m4a` | …and it was cleared with **no wrong taps** |
| `sfx/achievement.m4a` | …and that win earned a new award |
| `sfx/difficulty-unlocked.m4a` | …and it was the last level before a new tier |
| `sfx/fireworks.m4a` | under the confetti burst, 140ms in. **Texture, not an event** — soft |

The first four are a sequence, spaced 420ms apart, and all four can fire on one
win. Judge them as a phrase rather than in isolation.

### Failure

| File | When |
|---|---|
| `sfx/out-of-hearts.m4a` | five wrong reads. The board behind it is almost always still winnable — so, not harsh |
| `sfx/game-over.m4a` | a gate sealed on an arrow that still needed the way out. Heavier; this one really is over |

### Miscellaneous

| File | When |
|---|---|
| `sfx/notification.m4a` | a message appears under the board — out of hints, nothing to hint at |
| `sfx/reward-ready.m4a` | a rewarded ad becomes available while the player has no hints |
| `sfx/countdown.m4a` | **not wired.** Nothing in this game counts down |

---

## Format

- **`.m4a` (AAC)** — small, and hardware-decoded on Android, which matters because
  `arrow-release` can fire several times a second.
- **Mono, 44.1 kHz.** These carry no stereo information, and mono halves the bundle.
- Normalise to about **−14 LUFS**, with **no clipping**. The app applies its own
  per-sound gain on top, so files should be consistent with each other rather than
  pre-balanced against each other.
- **Trim leading silence.** Silence at the head of a file is indistinguishable from
  audio latency, and this game plays a sound on every tap.
- Keep effects **under ~700ms**; `arrow-release` under 250ms so it finishes before
  the animation does.

## Mixing

Relative levels are set in code, not baked into the files — see `SFX_GAIN` and
`MUSIC_GAIN` in `src/services/audioAssets.ts`. Two behaviours worth knowing when
judging a file:

- The same effect will not retrigger within 45ms (`RETRIGGER_GAP_MS`). Two copies
  of one short sound that close together sum and clip rather than sounding like two
  events — which is what "no overlapping distortion" actually requires.
- Music cross-fades over 600ms and ducks to a quarter under a sting.

Audio mixes with other apps rather than seizing focus, and respects the device
silent switch — this is a quiet puzzle game, not something that should stop
someone's podcast.

## Licensing

Whatever you use must be cleared for commercial distribution. Keep the licence or
purchase receipt for each file somewhere outside the repo; Google Play will not
ask, but a rights holder might.
