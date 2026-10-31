# Zoom Out Quiz

Remotion port of the Zoom Out Quiz HTML. A close-up photo slowly zooms out over 8 seconds — name it before the full picture appears. Hint at 40%. Landscape **1920×1080**.

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
│   └── images/            # 50 animal photos (1920×1080) + logo.svg
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

Edit `settings.json` for timing / watermark / series colour (`main` · `animals` · `food` · `science`). Edit `rounds.csv` or `questions.json` for the prompts.

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

Background bed is the playful marimba/bass track from `scripts/zoomout_music.py`. Quiz cues (swish, shutter, zoom riser, ticks, hint sparkle, reveal hit, chime) are the HTML Web Audio graph, rendered offline.

```bash
npm run music          # public/sounds/background.wav  (needs numpy + scipy)
npm run synth-audio    # public/sounds/sfx.wav + individual cues
```

The composition plays `background.wav` under `sfx.wav`. Re-run both after changing round count or zoom length so the bed stays continuous with the picture.

## Photos (optional)

The 50 animal photos ship in `public/images/` (1920×1080).

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
