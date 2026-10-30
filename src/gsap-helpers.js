/**
 * GSAP Pattern 1 — pure easing functions.
 * Remotion owns time (frame → 0..1). These return eased progress.
 * No GSAP timelines, no ticker, no side effects.
 */

export function power3Out(t) {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
}

export function expoOut(t) {
  const x = clamp01(t);
  return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
}

export function backOut(t) {
  const x = clamp01(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

export function elasticOut(t) {
  const x = clamp01(t);
  const c4 = (2 * Math.PI) / 3;
  if (x === 0 || x === 1) return x;
  return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
}

export function linear(t) {
  return clamp01(t);
}

export function clamp01(t) {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Map a local-time window through an ease. */
export function gsapTween(local, delay, duration, easeFn) {
  if (duration <= 0) return local >= delay ? 1 : 0;
  const t = (local - delay) / duration;
  return (easeFn || linear)(clamp01(t));
}
