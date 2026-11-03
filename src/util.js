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

const ZOOM_SCALES = [12, 9.36, 7.31, 5.7, 4.45, 3.46, 2.7, 2.11, 1.64, 1.28, 1];
// Smooth blur decay across the whole zoom. Starts a touch softer than before (1.0 vs
// 1.2 cqmin) and tapers to 0 only at the very end (progress 1.0) instead of dropping
// to 0 at 70%, so a light recognisable blur stays on the photo until late — the image
// never looks fully sharp too early. Sweet-spot curve: ~14px → ~8px @3s → ~3px @5s →
// ~1px @7s → 0 @8s (at 2560x1440, cq(1)=14.4px).
const ZOOM_BLURS = [1.0, 0.9, 0.78, 0.64, 0.5, 0.38, 0.28, 0.19, 0.11, 0.05, 0];

function keyframeLerp(values, t) {
  const x = clamp01(t);
  const n = values.length - 1;
  const p = x * n;
  const i = Math.min(n - 1, Math.floor(p));
  const f = p - i;
  return values[i] + (values[i + 1] - values[i]) * f;
}

/** HTML @keyframes zoom — exponential-looking linear keyframes, remapped so any z0 still ends at exactly 1x. */
export function zoomScale(progress, z0 = 12) {
  return 1 + (keyframeLerp(ZOOM_SCALES, progress) - 1) * ((z0 - 1) / 11);
}

/** Blur in px, a smooth decay from ~1cqmin at the start to 0 at the end of the zoom. */
export function zoomBlur(progress) {
  return keyframeLerp(ZOOM_BLURS, progress) * cq(1);
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
function coverExtents(ar, frameAr = 16 / 9) {
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
 * frame, then held at the centre of the frame while zoomed in. The camera is clamped
 * so the frame never leaves the photo (no empty edges) using the photo's true cover
 * extents, so off-centre subjects stay centred and edge subjects drift only as far as
 * they must, easing to dead-centre as the scale reaches 1. Returns the CSS transform
 * (origin 0 0) and the on-screen position of the focus point (for the lens vignette).
 *
 * For 16:9 photos this is identical to the old fixed-16:9 camera; `ar` makes it match
 * any image exactly.
 */
export function zoomCamera(scale, fx, fy, ar = 16 / 9, frameAr = 16 / 9) {
  const s = Math.max(1, scale);
  const {X0, X1, Y0, Y1} = coverExtents(ar, frameAr);
  // focus point in frame space
  const Fx = X0 + fx * (X1 - X0);
  const Fy = Y0 + fy * (Y1 - Y0);
  // keep the frame inside the (scaled) photo on both axes: no empty edges
  const tx = clamp(0.5 - s * Fx, 1 - s * X1, -s * X0);
  const ty = clamp(0.5 - s * Fy, 1 - s * Y1, -s * Y0);
  return {
    transform: `translate(${tx * 100}%, ${ty * 100}%) scale(${s})`,
    focusX: tx + s * Fx,
    focusY: ty + s * Fy,
  };
}

export function easeInOut(t) {
  const x = clamp01(t);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

export function rasterImage(file) {
  return /\.(jpe?g|png|webp)$/i.test(file || '');
}
