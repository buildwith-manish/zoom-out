# Zoom Out Quiz

Remotion port of the Zoom Out Quiz HTML. A close-up drawing slowly zooms out over 12 seconds — name it before the full picture appears. Hint at 40%. Landscape **1920×1080**.

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
│   └── images/            # SVG drawings (or fetched photos)
├── scripts/
│   ├── csv-to-json.js
│   ├── fetch-images.js    # z-ai image-search, skips shutterstock.com
│   ├── resize-images.js   # ffmpeg → 1280×720
│   ├── refetch-broken.js
│   └── render-batches.js  # resume-safe, --size N
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
| **Total (4 rounds)** | **82.8s · 2484 frames @ 30fps** |

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

The HTML synthesises every cue with the Web Audio API (swish, shutter, zoom riser, ticks, hint sparkle, reveal hit, chime, plus the ducked music bed). `scripts/synth-audio.js` renders that same graph offline:

```bash
npm run synth-audio
# → public/sounds/*.wav  (individual cues)
# → public/sounds/soundtrack.wav  (full mix, used by the composition)
```

Re-run after changing `settings.json` timing so the bed and cues stay locked to the picture.

## Photos (optional)

The HTML drawings ship in `public/images/*.svg` so a render matches the original without a network.

To swap in real photos:

```bash
npm run fetch-images     # uses `z-ai image-search`, excludes shutterstock.com
npm run resize-images    # ffmpeg cover-crop to 1280×720
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

- Drawings stand in for photos; `fx` / `fy` is the zoom origin, `z0` is start magnification (12×).
- Hint fires at `hintAt` (0.4 = 40% through the zoom).
- `.gitignore` ignores `node_modules`, `out`, `src/rounds.json`, `scripts/.image-progress.json`.
