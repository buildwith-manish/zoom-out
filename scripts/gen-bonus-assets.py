#!/usr/bin/env python3
"""
gen-bonus-assets.py — generates the visual assets for the 5 original bonus rounds.

  1. COLOR DNA      → public/bonus/colors/*.json     (dominant-color barcode data)
  2. SHADOW REVEAL  → public/bonus/shadow/*.png      (subject silhouettes)
  3. MACRO TEXTURE  → public/bonus/texture/*.jpg     (extreme close-up crops)
  4. UNPIXELATION   → public/bonus/unpixel/*_N.jpg   (5 pixelation levels)
  5. RECIPE REVERSE → no assets (emoji ingredient cards rendered in React)

Run from the repo root:  python3 scripts/gen-bonus-assets.py
"""

import json
import os
import sys
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
IMG_DIR = ROOT / 'public' / 'images'
OUT_COLORS = ROOT / 'public' / 'bonus' / 'colors'
OUT_SHADOW = ROOT / 'public' / 'bonus' / 'shadow'
OUT_TEXTURE = ROOT / 'public' / 'bonus' / 'texture'
OUT_UNPIXEL = ROOT / 'public' / 'bonus' / 'unpixel'

# ---------------------------------------------------------------------------
# Foods used by each bonus round (from questions.json image set)
# ---------------------------------------------------------------------------
COLOR_DNA_FOODS = ['easy_07_watermelon', 'easy_08_banana', 'easy_15_broccoli', 'easy_06_strawberry', 'medium_11_cotton-candy']
# Photos with clean, uniform backgrounds (verified by corner-variance scan) —
# only these produce clean silhouettes with simple thresholding.
# banana: iconic crescent · star-fruit: star cross-section · cauliflower: cloud blob
SHADOW_FOODS = ['hard_03_star-fruit', 'easy_08_banana', 'medium_05_cauliflower']
TEXTURE_FOODS = ['medium_08_waffle', 'easy_06_strawberry', 'easy_14_corn-on-the-cob', 'hard_06_romanesco']
UNPIXEL_FOODS = ['easy_01_pizza']
UNPIXEL_LEVELS = [12, 24, 48, 96, 192]

# Focus points (fx, fy) from questions.json for the texture crops — where the
# most interesting surface detail lives. Falls back to centre when missing.
FOCUS = {
    'medium_08_waffle': (0.50, 0.50),
    'easy_06_strawberry': (0.50, 0.45),
    'easy_14_corn-on-the-cob': (0.50, 0.50),
    'hard_06_romanesco': (0.50, 0.50),
}


def hex_of(rgb):
    return '#{:02x}{:02x}{:02x}'.format(*rgb[:3])


# ---------------------------------------------------------------------------
# 1. COLOR DNA — dominant colors of a photo, as barcode data
# ---------------------------------------------------------------------------
def color_dna(name):
    """Extract the dominant colors from a photo via adaptive quantisation.

    Returns a list of {hex, weight} sorted by weight, deduped, max 6 entries.
    """
    src = IMG_DIR / f'{name}.jpg'
    img = Image.open(src).convert('RGB')
    img.thumbnail((256, 256))  # speed + noise reduction

    q = img.quantize(colors=16, method=Image.MEDIANCUT)
    palette = q.getpalette()
    counts = sorted(q.getcolors(256 * 256) or [], reverse=True)

    total = sum(c for c, _ in counts) or 1
    out = []
    for count, idx in counts:
        rgb = tuple(palette[idx * 3: idx * 3 + 3])
        # skip near-black and near-white — they read as "background"
        lum = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]
        if lum < 26 or lum > 236:
            continue
        # skip colours too close to one already picked
        too_close = False
        for prev in out:
            pr, pg, pb = prev['rgb']
            dist = abs(pr - rgb[0]) + abs(pg - rgb[1]) + abs(pb - rgb[2])
            if dist < 90:
                too_close = True
                break
        if too_close:
            continue
        out.append({'hex': hex_of(rgb), 'rgb': rgb, 'weight': count / total})
        if len(out) >= 6:
            break

    # renormalise weights to sum to 1
    wsum = sum(o['weight'] for o in out) or 1
    for o in out:
        o['weight'] = round(o['weight'] / wsum, 4)
    return [{'hex': o['hex'], 'weight': o['weight']} for o in out]


# ---------------------------------------------------------------------------
# 2. SHADOW REVEAL — subject silhouette (transparent PNG)
# ---------------------------------------------------------------------------
def make_shadow(name, out_path):
    """Extract the subject as a black silhouette on transparency.

    Strategy: estimate the background colour from the 4 corners, then keep
    pixels whose colour distance from it exceeds a threshold. Morphological
    clean-up removes speckle; the mask is cropped to the subject's bbox.
    """
    src = IMG_DIR / f'{name}.jpg'
    img = Image.open(src).convert('RGB')
    w, h = img.size
    small = img.resize((w // 4, h // 4))  # work small, scale up later

    # --- background estimate: median of the four corner patches
    sw, sh = small.size
    patch = 24
    corners = []
    for box in [(0, 0, patch, patch), (sw - patch, 0, sw, patch),
                (0, sh - patch, patch, sh), (sw - patch, sh - patch, sw, sh)]:
        px = list(small.crop(box).getdata())
        corners.append(tuple(sum(c[i] for c in px) // len(px) for i in range(3)))
    bg = tuple(sum(c[i] for c in corners) // 4 for i in range(3))

    # --- distance map from background
    px = small.load()
    mask = Image.new('L', small.size, 0)
    mp = mask.load()
    THRESH = 68
    for y in range(sh):
        for x in range(sw):
            r, g, b = px[x, y]
            d = abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2])
            mp[x, y] = 255 if d > THRESH else 0

    # --- clean: close holes, open speckle
    mask = mask.filter(ImageFilter.MinFilter(5))   # erode speckle
    mask = mask.filter(ImageFilter.MaxFilter(5))   # dilate back
    mask = mask.filter(ImageFilter.MaxFilter(5))   # fill subject
    mask = mask.filter(ImageFilter.MinFilter(3))

    # --- crop to the mask's bounding box (+ margin)
    bbox = mask.getbbox()
    if bbox is None:
        print(f'    ! no subject found for {name}; using centre crop')
        bbox = (sw // 4, sh // 4, 3 * sw // 4, 3 * sh // 4)
    m = 18
    bbox = (max(0, bbox[0] - m), max(0, bbox[1] - m),
            min(sw, bbox[2] + m), min(sh, bbox[3] + m))
    mask = mask.crop(bbox)

    # --- upscale back (smooth) and build the RGBA silhouette
    bw, bh = mask.size
    target_w = 1400
    target_h = max(1, round(bh * target_w / bw))
    mask = mask.resize((target_w, target_h), Image.LANCZOS)

    sil = Image.new('RGBA', mask.size, (0, 0, 0, 0))
    black = Image.new('RGBA', mask.size, (10, 8, 24, 255))
    sil.paste(black, (0, 0), mask)
    sil.save(out_path)
    return out_path


# ---------------------------------------------------------------------------
# 3. MACRO TEXTURE — extreme close-up crop
# ---------------------------------------------------------------------------
def make_texture(name, out_path, frac=0.16):
    """Crop a small window around the food's focus point, upscale to 16:9."""
    src = IMG_DIR / f'{name}.jpg'
    img = Image.open(src).convert('RGB')
    w, h = img.size
    fx, fy = FOCUS.get(name, (0.5, 0.5))

    cw = int(w * frac)            # crop width
    ch = int(cw * 9 / 16)         # 16:9 window
    cx, cy = int(fx * w), int(fy * h)
    left = max(0, min(w - cw, cx - cw // 2))
    top = max(0, min(h - ch, cy - ch // 2))
    crop = img.crop((left, top, left + cw, top + ch))
    crop = crop.resize((1400, 788), Image.LANCZOS)
    crop.save(out_path, quality=92)
    return out_path


# ---------------------------------------------------------------------------
# 4. UNPIXELATION — pixelated versions at 5 levels
# ---------------------------------------------------------------------------
def make_unpixel(name, out_dir):
    """For each level N: resize to N px wide, then back up with NEAREST."""
    src = IMG_DIR / f'{name}.jpg'
    img = Image.open(src).convert('RGB')
    w, h = img.size
    paths = []
    for n in UNPIXEL_LEVELS:
        nh = max(1, round(h * n / w))
        tiny = img.resize((n, nh), Image.LANCZOS)
        big = tiny.resize((1600, 900), Image.NEAREST)
        p = out_dir / f'{name}_{n}.jpg'
        big.save(p, quality=90)
        paths.append(p)
    return paths


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def main():
    for d in (OUT_COLORS, OUT_SHADOW, OUT_TEXTURE, OUT_UNPIXEL):
        d.mkdir(parents=True, exist_ok=True)

    assets = {'colors': {}, 'shadow': {}, 'texture': {}, 'unpixel': {}}

    print('== COLOR DNA ==')
    for name in COLOR_DNA_FOODS:
        data = color_dna(name)
        out = OUT_COLORS / f'{name}.json'
        out.write_text(json.dumps(data, indent=2))
        assets['colors'][name] = data
        swatches = ' '.join(f"{d['hex']}({int(d['weight']*100)}%)" for d in data)
        print(f'  {name}: {swatches}')

    print('\n== SHADOW REVEAL ==')
    for name in SHADOW_FOODS:
        p = make_shadow(name, OUT_SHADOW / f'{name}.png')
        assets['shadow'][name] = f'bonus/shadow/{name}.png'
        print(f'  {name} -> {p.name} ({p.stat().st_size // 1024}KB)')

    print('\n== MACRO TEXTURE ==')
    for name in TEXTURE_FOODS:
        p = make_texture(name, OUT_TEXTURE / f'{name}.jpg')
        fx, fy = FOCUS.get(name, (0.5, 0.5))
        assets['texture'][name] = {
            'file': f'bonus/texture/{name}.jpg',
            'fx': fx, 'fy': fy,
            'zoom': round(1 / 0.16, 2),  # crop frac 0.16 -> start scale
        }
        print(f'  {name} -> {p.name} ({p.stat().st_size // 1024}KB)')

    print('\n== UNPIXELATION ==')
    for name in UNPIXEL_FOODS:
        paths = make_unpixel(name, OUT_UNPIXEL)
        assets['unpixel'][name] = {
            'levels': UNPIXEL_LEVELS,
            'files': {str(n): f'bonus/unpixel/{name}_{n}.jpg' for n in UNPIXEL_LEVELS},
        }
        print(f'  {name}: {len(paths)} levels ({UNPIXEL_LEVELS})')

    # Combined manifest the Remotion component imports (webpack-bundled JSON).
    manifest = ROOT / 'src' / 'bonus-assets.json'
    manifest.write_text(json.dumps(assets, indent=2) + '\n')
    print(f'\nWrote {manifest.relative_to(ROOT)}')
    print('All bonus assets generated.')


if __name__ == '__main__':
    main()
