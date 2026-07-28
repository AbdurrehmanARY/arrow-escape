# Audio assets

The game runs perfectly without these files — every audio call is a no-op when the
asset is missing (see `src/services/audio.ts`). Drop the files in here with these
exact names and sound turns on with no code change.

| File | When it plays | What it should be |
|---|---|---|
| `release.m4a` | an arrow threads off the board | a light, short swoosh — this fires constantly, so it must never grate |
| `blocked.m4a` | a tap fails and costs a heart | a soft, low bump. Not a buzzer — the player made a reading mistake, not an error |
| `win.m4a` | level cleared | a warm, brief chime |
| `fail.m4a` | out of hearts | a gentle descending note. Deliberately not harsh; the board was still winnable |
| `tap.m4a` | a hint is spent | a small tick |
| `ambient.m4a` | loops during play | soft, low-key, no strong melody. It has to survive being heard for an hour |

## Format

- **`.m4a` (AAC)** — small, and hardware-decoded on Android, which matters because
  `release.m4a` can fire several times a second.
- **Mono, 44.1 kHz**, normalised to about **-14 LUFS**.
- Effects **under 400 ms**. `release.m4a` should be under 250 ms so it finishes
  before the animation does.
- `ambient.m4a` must **loop seamlessly** — trim on a zero crossing, or the seam
  clicks once a minute forever.

## Mixing note

Per-effect volumes are set in `SFX_VOLUME` in `src/services/audio.ts`, so mix the
files at a consistent level and adjust balance there rather than baking it in.

Audio mixes with other apps rather than seizing focus, and respects the device
silent switch — this is a quiet puzzle game, not something that should stop
someone's podcast.

## Licensing

Whatever you use must be cleared for commercial distribution. Keep the licence or
purchase receipt for each file somewhere outside the repo; Google Play will not
ask, but a rights holder might.
