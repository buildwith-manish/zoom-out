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

// Zoom curve — ONE continuous camera move.
//
// The whole zoom-out is a single move in log space: scale = z0^(1 - g(p)), so the
// picture changes size at a steady *perceived* rate (a 2x zoom always looks like the
// same amount of movement, whatever the scale). g is a sine ease-in-out, so the move
// starts from rest, accelerates gently through the middle and settles softly onto the
// full picture. There are no holds and no jumps: velocity is zero only at the very
// start and the very end, and changes smoothly everywhere in between.
//
// (The old curve was stepped: a fast zoom, a dead stop, a nudge, another dead stop,
// then the real zoom-out. Peak speed on easy was ~2.2 ln-units/s with the picture
// frozen for 35% of the time. This one peaks at (pi/2)*ln(z0)/zoomDur, about 0.47
// ln-units/s on easy, roughly 4.7x gentler.)

const easeSine = (x) => -(Math.cos(Math.PI * clamp01(x)) - 1) / 2;

// zoomDur is accepted for call-site compatibility; the curve is duration-independent.
function zoomProgressCurve(progress) {
  return easeSine(progress);
}

/** Magnification at zoom progress 0..1: z0 -> 1, exponential (log-space), one smooth ease. */
export function zoomScale(progress, z0 = 12, zoomDur = 8) {
  return Math.pow(Math.max(1, z0), 1 - zoomProgressCurve(progress, zoomDur));
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

// Camera pan with a SOFT edge instead of a hard clamp.
//
// The wrapper must always cover the frame, so its translation has to stay inside
// [1 - s, 0]. The old code did that with clamp(), which is only C0: the instant the
// ideal "keep the subject centred" pan hit a limit, the pan velocity snapped from
// "tracking" to "pinned" in a single frame. That is the jolt you saw as the picture
// approached its final position. Here the ideal pan is expressed as u in [-1, 1] across
// the legal range (|u| > 1 would be out of range) and passed through a function that is
// the identity for |u| <= PAN_LINEAR and then eases (C2-smoothly, via tanh) toward the
// limit without ever touching it. Velocity and acceleration are therefore continuous, the
// picture still always covers the frame, and framing while zoomed in is unchanged.
const PAN_LINEAR = 0.6;
function softPan(s, F) {
  const h = (s - 1) / 2; // half-width of the legal translation range [1 - s, 0]
  if (h < 1e-9) return 0;
  const mid = (1 - s) / 2;
  const u = (0.5 - s * F - mid) / h; // ideal centred pan, as a fraction of the legal half-range
  const m = Math.abs(u);
  const r = m <= PAN_LINEAR ? m : PAN_LINEAR + (1 - PAN_LINEAR) * Math.tanh((m - PAN_LINEAR) / (1 - PAN_LINEAR));
  return mid + h * Math.sign(u) * r;
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
  const tx = softPan(s, Fx);
  const ty = softPan(s, Fy);
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
