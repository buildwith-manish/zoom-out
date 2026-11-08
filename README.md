# Zoom Out

Remotion video format "Zoom Out" by Quiz Matrix. A close-up photo slowly zooms out over 8 seconds — name it before the full picture appears. Hint at 40%. Landscape **1920×1080**.

Motion uses **GSAP Pattern 1**: GSAP easing is implemented as pure functions (`backOut`, `expoOut`, `elasticOut`, `power3Out`). Remotion owns every frame. There are **no GSAP timelines** and no ticker.

- `back.out` — word slide-ins, card pop, watermark entrance
- `expo.out` — iris reveals, sparks, shine
- `elastic.out` — knob ticks, answer stamp / check
- `power3.out` — fades, flash, timeline rise

## Project layout

```
zoom-out/
├── package.json
├── remotion.config.ts
├── tsconfig.json
├── settings.json          # timing, copy, watermark
├── rounds.csv             # round data (source)
├── questions.json         # round data (JSON)
├── public/
│   ├── fonts/             # Anton, JetBrains Mono
│   ├── sounds/
│   └── images/            # 50 food photos (2688×1536) + logo.svg
├── scripts/
│   ├── csv-to-json.js
│   ├── fetch-images.js    # z-ai image-search, skips shutterstock.com
│   ├── resize-images.js   # ffmpeg → 1920×1080
│   ├── refetch-broken.js
│   ├── render-batches.js  # resume-safe, --size N
│   ├── synth-audio.js     # HTML SFX
│   └── zoomout_music.py   # playful background bed
└── src/
    ├── index.js
    ├── Root.jsx
    ├── Round.jsx
    ├── timing.js
    ├── util.js
    ├── style.js
    └── gsap-helpers.js
```

## Timeline (default settings)

| Scene | Duration |
| --- | --- |
| Intro | 5.5s |
| Each question | 14s (1.5s hold + 12s zoom + 0.5s) |
| Each answer | 4s |
| Score | 4s |
| Sting | 1.3s |
| **Total (4 rounds)** | **see settings.json** |

Edit `settings.json` for timing / watermark / series colour (`main` · `animals` · `food` · `science`; this project uses `food`). Edit `rounds.csv` or `questions.json` for the prompts.

## Install

```bash
npm install
```

Optional: rebuild JSON from the CSV.

```bash
npm run csv-to-json
```

## Preview

```bash
npm run dev
```

Opens Remotion Studio. Composition id: `ZoomOut`.

## Sound

Background bed is the playful marimba/bass track from `scripts/zoomout_music.py`. Sound cues (swish, shutter, zoom riser, ticks, hint sparkle, reveal hit, chime) are the HTML Web Audio graph, rendered offline.

```bash
npm run music          # public/sounds/background.wav  (needs numpy + scipy)
npm run audio          # music + sound effects + cue ducking + final master → background.mp3, sfx.mp3, master.mp3 (use this one)
npm run master         # just the final mix: voiceover + music (ducked under the voice) + sfx → master.mp3, -14 LUFS
npm run synth-audio    # public/sounds/sfx.wav + individual cues
```

The composition plays `background.wav` under `sfx.wav`. Re-run both after changing round count or zoom length so the bed stays continuous with the picture.

## Photos (optional)

The 50 food photos ship in `public/images/` (2688×1536, 16:7 → ar 1.75). Names match the `image` column in `rounds.csv`.

To swap in real photos:

```bash
npm run fetch-images     # uses `z-ai image-search`, excludes shutterstock.com
npm run resize-images    # ffmpeg cover-crop to 1920×1080
npm run refetch-broken   # drop tiny/corrupt files and retry
```

`scripts/.image-progress.json` makes fetch resume-safe.

## Render

```bash
npm run render
# → out/zoom-out.mp4
```

Resume-safe batches (useful on long encodes):

```bash
npm run render-batches -- --size 300
```

`--size N` is frames per batch. Progress lives in `out/.render-progress.json`. Re-run the same command to continue.

Still of a question frame:

```bash
npx remotion still ZoomOut out/preview.jpg --frame=200
```

## Notes

- `fx` / `fy` is the zoom origin, `z0` is start magnification (12×).
- Hint fires at `hintAt` (0.4 = 40% through the zoom).
- `.gitignore` ignores `node_modules`, `out`, `src/rounds.json`, `scripts/.image-progress.json`.

## Level title cards

`rounds.csv` has a `level` column (`easy`, `medium`, `hard`). When the level changes, a short title card is inserted (`levelDuration` seconds in `settings.json`; set `levelCards` to `false` to turn it off) and a coloured level badge appears in the top bar of every question. After changing levels or durations, re-run `npm run csv-to-json`, `npm run music`, `npm run synth-audio`, and convert `sfx.wav` to `sfx.mp3`.

## Music ducking

`npm run audio` rebuilds everything in order: continuous music → sound effects → `scripts/duck_music.py`, which dips the music (up to about 8 dB) for a moment under each short cue (ticks, hits, whooshes) and swells it back, then matches the overall loudness so the music is not quieter on average. The composition plays the results, `public/sounds/background.mp3` and `sfx.mp3`.

## Final audio master

The composition plays one file, `public/sounds/master.mp3`, built by `scripts/master-audio.js` (`npm run master`, also the last step of `npm run audio`). It mixes `voiceover.wav` (high-pass, light compression, presence EQ), `background.mp3` (music, sidechain-ducked about 10 dB under the voice and back up in the gaps) and `sfx.mp3` (cues, ducked about 3 dB under the voice), then normalises to -14 LUFS integrated / -1.5 dBTP, the YouTube reference level. Ducking depth, release and loudness target are constants at the top of the script. The raw stems stay in `public/sounds/` and can be A/B'd with `QuizAudioStems` in `src/audio.js`. Re-run `npm run master` after changing any stem or the video length.

## Zoom curve and motion blur

The zoom is exponential, `scale = z0^(1 - g(p))`, a constant rate in log-scale (an even perceived speed) with a soft landing on the last 15% (`zoomScale` in `src/util.js`). Camera motion blur is done in a WebGL2 pass (`src/ZoomCanvas.jsx`): each pixel averages `samples` sub-frame renders across the shutter angle in 32-bit float and is dithered once at the end, so there is no banding (Remotion's `<CameraMotionBlur>` was tried first and bands visibly in this video's smooth gradients). Tune it with `MOTION_BLUR` in `src/Round.jsx`; set `enabled: false` to use the plain DOM zoom, which is also the automatic fallback if WebGL2 is unavailable. Note the photo's defocus blur is much wider than the per-frame motion at 60fps, so the physically accurate shutter (360°) is subtle by design.
