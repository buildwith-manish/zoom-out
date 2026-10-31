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
const ZOOM_BLURS = [1.2, 1.05, 0.85, 0.65, 0.45, 0.3, 0.15, 0, 0, 0, 0];

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

/** Blur in px, matching 1.2cqmin → 0 over the first 70% of the zoom. */
export function zoomBlur(progress) {
  return keyframeLerp(ZOOM_BLURS, progress) * cq(1);
}

export function easeInOut(t) {
  const x = clamp01(t);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

export function rasterImage(file) {
  return /\.(jpe?g|png|webp)$/i.test(file || '');
}
