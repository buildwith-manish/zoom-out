import {cq} from './style';
import {clamp01} from './gsap-helpers';

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function mix(a, b, t) {
  return lerp(a, b, t);
}

// Zoom curve. Magnification falls exponentially, scale = z0^(1 - g(p)), which is a
// constant rate of change in log-scale: the eye reads that as a perfectly even zoom
// speed. (The previous 11-keyframe lookup interpolated linearly in scale between
// keyframes, so the speed stepped at every keyframe.) It always ends at exactly 1x.
//
// g(p) is p with a soft landing: the last (1 - LAND) of the move eases out with a
// continuous slope, so the picture settles instead of stopping dead. Normalised so
// g(1) = 1.
const LAND = 0.85;
const G_SLOPE = 1 / (LAND + (1 - LAND) / 2);

function zoomProgressCurve(progress) {
  const p = clamp01(progress);
  if (p <= LAND) return G_SLOPE * p;
  const x = (p - LAND) / (1 - LAND);
  return G_SLOPE * (LAND + (1 - LAND) * (x - (x * x) / 2));
}

/** Magnification at zoom progress 0..1: z0 -> 1, exponential with a soft landing. */
export function zoomScale(progress, z0 = 12) {
  return Math.pow(Math.max(1, z0), 1 - zoomProgressCurve(progress));
}

// Gaussian "defocus" (the difficulty mechanic, separate from motion blur). Smooth
// power decay that matches the old tuned table within ~0.04 cqmin everywhere:
// ~14px at the start -> ~8px @3s -> ~3px @5s -> ~1px @7s -> 0 @8s (cq(1) = 14.4px at 1440p).
const BLUR_START = 1.0;
const BLUR_EXP = 1.35;

/** Blur in px, a smooth decay from ~1cqmin at the start to 0 at the end of the zoom. */
export function zoomBlur(progress) {
  return BLUR_START * Math.pow(1 - clamp01(progress), BLUR_EXP) * cq(1);
}

/** '47%' | 0.47 | 47 -> 0.47 (fraction of the frame). */
export function focusFrac(v, fallback = 0.5) {
  if (v == null || v === '') return fallback;
  const n = parseFloat(String(v));
  if (Number.isNaN(n)) return fallback;
  return clamp(String(v).includes('%') || n > 1 ? n / 100 : n, 0, 1);
}

/**
 * Where a source image of aspect `ar` (w/h) sits inside the 16:9 frame under
 * object-fit: cover. X0..X1 / Y0..Y1 are the photo's extents in frame-normalised
 * [0,1] coords (they exceed [0,1] on the axis that gets cropped). For a 16:9 photo
 * this is exactly {0,1,0,1}.
 */
export function coverExtents(ar, frameAr = 16 / 9) {
  if (ar >= frameAr) {
    const w = ar / frameAr; // photo wider than frame -> cropped left/right
    return {X0: 0.5 - w / 2, X1: 0.5 + w / 2, Y0: 0, Y1: 1};
  }
  const h = frameAr / ar; // photo taller than frame -> cropped top/bottom
  return {X0: 0, X1: 1, Y0: 0.5 - h / 2, Y1: 0.5 + h / 2};
}

/**
 * Zoom camera, image-aware. The focus point (fx, fy) is given in IMAGE space (a
 * fraction across the source photo). It is mapped through the object-fit:cover
 * geometry of the photo's real aspect ratio `ar` (w/h, default 16/9) into the 16:9
 * frame, then held at the centre of the frame while zoomed in. The wrapper div is
 * frame-sized (inset:0) with the image using object-fit:cover, so at scale s it covers
 * [tx, tx+s] x [ty, ty+s] in frame-normalised coords. The camera is clamped to
 * [1-s, 0] on both axes so the wrapper always fully covers the frame — no empty edges,
 * no black lines — while still centring the subject as soon as s > 1 allows. Returns
 * the CSS transform (origin 0 0) and the on-screen position of the focus point (for
 * the lens vignette).
 *
 * For 16:9 photos this is identical to the old fixed-16:9 camera; `ar` makes it match
 * any image exactly.
 */
export function zoomCamera(scale, fx, fy, ar = 16 / 9, frameAr = 16 / 9) {
  const s = Math.max(1, scale);
  const {X0, X1, Y0, Y1} = coverExtents(ar, frameAr);
  // focus point in frame space (maps image-space fx/fy through the cover geometry)
  const Fx = X0 + fx * (X1 - X0);
  const Fy = Y0 + fy * (Y1 - Y0);
  // The wrapper div is frame-sized (inset:0) with object-fit:cover, so at scale s it
  // covers [tx, tx+s] x [ty, ty+s]. Clamp to [1-s, 0] so it always fully covers the
  // frame — no empty edges, no black lines. (Using the cover extents here would allow
  // the wrapper to shift beyond [1-s, 0] and reveal the card background as a gap.)
  const tx = clamp(0.5 - s * Fx, 1 - s, 0);
  const ty = clamp(0.5 - s * Fy, 1 - s, 0);
  return {
    transform: `translate(${tx * 100}%, ${ty * 100}%) scale(${s})`,
    focusX: tx + s * Fx,
    focusY: ty + s * Fy,
    s,
    tx,
    ty,
  };
}

export function easeInOut(t) {
  const x = clamp01(t);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

export function rasterImage(file) {
  return /\.(jpe?g|png|webp)$/i.test(file || '');
}
