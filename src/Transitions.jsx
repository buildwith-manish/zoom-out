import React from 'react';
import {COLORS, cq, seriesColors} from './style';
import {clamp01, expoOut} from './gsap-helpers';

/**
 * Per-level scene transitions (settings.retention.transitions):
 *   iris   (easy)   lens ring + circle open / ring close   [lives in Round.jsx: iris(), IrisRing, CloseRing]
 *   wipe   (medium) curtain with a glowing amber edge, left -> right, in and out
 *   blinds (hard)   venetian-blind slices + shake + scanlines, in and out
 * Every function is a pure function of "seconds since the scene started".
 */

export const transFor = (settings, level) => (((settings.retention || {}).transitions || {})[level]) || 'iris';

const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const OPEN = {wipe: 0.75, blinds: 0.7};
const CLOSE = {wipe: 0.6, blinds: 0.55};
const STRIPE = () => cq(9);

/**
 * Opaque curtain matching the Stage background, so the wipe covers the scene
 * content (and the Stage background shows through seamlessly at the curtain
 * boundary). Without this, using clipPath alone leaves the Stage background
 * and watermark visible through the clipped area, causing a flash.
 */
function Curtain({side, x}) {
  // x = percentage (0-100) of the curtain boundary from the left edge
  // side='right' -> curtain covers [x%, 100%] (open wipe: right side hidden)
  // side='left'  -> curtain covers [0%, x%]  (close wipe: left side hidden)
  const series = seriesColors('animals');
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: side === 'right' ? `${x}%` : 0,
        right: side === 'right' ? 0 : `${100 - x}%`,
        background: `radial-gradient(120% 90% at 8% 0%, ${series.b1} 0%, ${series.b2} 48%, ${series.b3} 100%)`,
        zIndex: 6,
        pointerEvents: 'none',
      }}
    />
  );
}

function Edge({x, side}) {
  const w = cq(1.1);
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: side === 'right' ? `calc(${x}% - ${w}px)` : `${x}%`,
        width: w,
        background: `linear-gradient(180deg, ${COLORS.amber}, #fff 50%, ${COLORS.amber2})`,
        boxShadow: `0 0 ${cq(3)}px rgba(255,193,58,.9), 0 0 ${cq(8)}px rgba(255,193,58,.5)`,
        zIndex: 7,
        pointerEvents: 'none',
      }}
    />
  );
}

function Scan({amount, flash}) {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 7,
          pointerEvents: 'none',
          background: 'repeating-linear-gradient(0deg, rgba(0,0,0,.35) 0 3px, transparent 3px 7px)',
          opacity: amount,
        }}
      />
      <div style={{position: 'absolute', inset: 0, zIndex: 8, pointerEvents: 'none', background: '#fff', opacity: flash}} />
    </>
  );
}

function blindsMask(open) {
  const S = STRIPE();
  const m = `repeating-linear-gradient(180deg, #000 0, #000 ${open * S}px, transparent ${open * S}px, transparent ${S}px)`;
  return {maskImage: m, WebkitMaskImage: m};
}

function shakeXY(t, amp, seed) {
  if (t <= 0 || t >= 1) return 'none';
  const i = Math.floor(t * 10);
  const f = 1 - i / 10;
  return `translate(${(hash(seed + i) - 0.5) * 2 * amp * f}px, ${(hash(seed + i + 31) - 0.5) * 2 * amp * f}px)`;
}

/** transition INTO a question. returns {style, node} to spread on the scene container / render inside it */
export function openFx(kind, local) {
  const dur = OPEN[kind] || 0.75;
  const p = expoOut(clamp01(local / dur));
  if (kind === 'wipe') {
    // Opaque curtain covers the right portion [p*100%, 100%] not yet revealed.
    // No clipPath — the curtain visually masks the scene content from above,
    // and matches the Stage background so the boundary is seamless.
    return {
      style: {},
      node: p < 1 ? (
        <>
          <Curtain side="right" x={p * 100} />
          <Edge x={p * 100} side="right" />
        </>
      ) : null,
    };
  }
  const flash = local < 0.14 ? 0.6 * (1 - local / 0.14) : 0;
  return {
    style: {...blindsMask(p), transform: shakeXY(local / 0.35, cq(1.1), 7)},
    node: <Scan amount={Math.max(0, 0.5 * (1 - local / 0.6))} flash={flash} />,
  };
}

/** transition OUT of a reveal (last CLOSE seconds of the scene) */
export function closeFx(kind, local, duration) {
  const dur = CLOSE[kind] || 0.6;
  const start = duration - dur;
  const raw = clamp01((local - start) / dur);
  const p = raw >= 0.92 ? 1 : raw * raw;
  if (kind === 'wipe') {
    // Opaque curtain covers the left portion [0%, p*100%] being closed.
    return {
      style: {},
      node: raw > 0 ? (
        <>
          <Curtain side="left" x={p * 100} />
          <Edge x={p * 100} side="left" />
        </>
      ) : null,
    };
  }
  return {
    style: {...blindsMask(1 - p), transform: shakeXY(raw, cq(1.1), 19)},
    node: raw > 0 ? <Scan amount={0.4 * raw} flash={raw > 0.9 ? 0.5 : 0} /> : null,
  };
}
