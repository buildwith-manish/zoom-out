import React from 'react';
import {Img, staticFile} from 'remotion';
import {backOut, expoOut, power3Out, elasticOut, gsapTween, clamp01} from './gsap-helpers';
import {COLORS, FONTS, cq} from './style';
import {clamp, lerp, focusFrac, zoomCamera, easeInOut} from './util';
import assets from './bonus-assets.json';

/**
 * ─── BONUS ROUNDS ──────────────────────────────────────────────────────────
 * Five one-off puzzle mechanics spliced in after Q10/20/30/40/50 (settings.bonus):
 *
 *   1. COLOR DNA      — a "barcode" of the food's dominant colors; name the food
 *   2. SHADOW REVEAL  — black silhouette on a spotlight; name the food
 *   3. MACRO TEXTURE  — extreme close-up crop; name the surface
 *   4. PIXEL FOCUS    — image starts 12px pixelated and sharpens in steps
 *   5. RECIPE REVERSE — emoji ingredient cards; cook the combo
 *
 * Scene layout (local time):
 *   [0 … clockStart)                pre-roll banner over the puzzle
 *   [clockStart … clockStart+clock) puzzle + countdown ring
 *   [clockStart+clock … end)        reveal: answer slam + photo + mechanic bridge
 *
 * Every mechanic hands off to the answer photo with its own transition
 * ("bridge"): the barcode collapses away, the shadow fills in, the macro pulls
 * back, the pixels resolve, the ingredient cards fly out.
 */

const KIND_COLOR = {
  colordna: '#2ee6d6', // teal
  shadow: '#a88bff', // violet
  texture: '#ff9e3d', // orange
  unpixel: '#57e389', // green
  recipe: '#ff7bac', // pink
};

const kindColor = (kind) => KIND_COLOR[kind] || COLORS.amber;

// Where each unpixel level kicks in as a fraction of the clock (0..1).
const UNPIXEL_AT = [0, 0.32, 0.54, 0.74, 0.9];
const UNPIXEL_BLEND = 0.45; // seconds of crossfade between steps

// ---------------------------------------------------------------- icons ----

function ArrowDownIcon({size, color = COLORS.amber}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{display: 'block', flex: 'none'}}>
      <path d="M12 4v14M6 13l6 6 6-6" />
    </svg>
  );
}

function CheckIcon({size, color = '#111436'}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" style={{display: 'block', flex: 'none'}}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function FocusIcon({size, color = '#fff'}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" style={{display: 'block', flex: 'none'}}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v3.4M12 18.1v3.4M2.5 12h3.4M18.1 12h3.4" />
    </svg>
  );
}

function DiceIcon({size, color = '#fff'}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" style={{display: 'block', flex: 'none'}}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <circle cx="8.6" cy="8.6" r="1.5" fill={color} stroke="none" />
      <circle cx="15.4" cy="15.4" r="1.5" fill={color} stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill={color} stroke="none" />
    </svg>
  );
}

// ------------------------------------------------------- shared bits -------

/** Amber corner brackets (same look as the question cards, tintable). */
function Brackets({color}) {
  const s = cq(0.55);
  const size = cq(4.4);
  const off = cq(1.8);
  const common = {
    position: 'absolute',
    width: size,
    height: size,
    borderStyle: 'solid',
    borderColor: color,
    borderWidth: s,
    zIndex: 3,
    pointerEvents: 'none',
    filter: `drop-shadow(0 0 ${cq(1.2)}px ${color})`,
  };
  return (
    <>
      <i style={{...common, left: off, top: off, borderRight: 0, borderBottom: 0}} />
      <i style={{...common, right: off, top: off, borderLeft: 0, borderBottom: 0}} />
      <i style={{...common, left: off, bottom: off, borderRight: 0, borderTop: 0}} />
      <i style={{...common, right: off, bottom: off, borderLeft: 0, borderTop: 0}} />
    </>
  );
}

/** Small uppercase label chip pinned inside the puzzle card. */
function CardChip({children, color = COLORS.amber, icon, style}) {
  return (
    <div
      style={{
        position: 'absolute',
        zIndex: 4,
        display: 'flex',
        alignItems: 'center',
        gap: cq(1),
        background: 'rgba(10,14,80,.62)',
        border: `${cq(0.2)}px solid ${COLORS.glassline}`,
        borderRadius: cq(1.2),
        padding: `${cq(1)}px ${cq(1.8)}px`,
        font: `700 ${cq(2.1)}px/1 ${FONTS.mono}`,
        letterSpacing: '0.14em',
        color: '#fff',
        ...style,
      }}
    >
      {icon}
      {children}
    </div>
  );
}

/** Word-by-word rise header (same rhythm as the question headlines). */
function Headline({words, local, size, color, delay = 0.1, stagger = 0.09, dur = 0.55, slam = false, slamDelay = 0.15}) {
  return (
    <h2
      style={{
        margin: 0,
        font: `400 ${size}px/1.02 ${FONTS.display}`,
        letterSpacing: '-0.005em',
        overflow: 'hidden',
        paddingBottom: cq(0.6),
        color: color || '#fff',
        textAlign: 'center',
        textShadow: slam ? `0 0 ${cq(4)}px rgba(255,193,58,.45)` : undefined,
      }}
    >
      {words.map((w, i) => {
        const p = slam
          ? gsapTween(local, i * 0.45 * 0.09 + slamDelay, 0.6, backOut)
          : gsapTween(local, i * stagger + delay, dur, backOut);
        return (
          <React.Fragment key={i}>
            <span
              style={{
                display: 'inline-block',
                opacity: p,
                transform: slam
                  ? `translateY(${(1 - p) * 100}%) scale(${lerp(1.25, 1, p)})`
                  : `translateY(${(1 - p) * 100}%)`,
              }}
            >
              {w}
            </span>
            {i < words.length - 1 ? ' ' : null}
          </React.Fragment>
        );
      })}
    </h2>
  );
}

/** Letter-by-letter answer slam with the amber cascade (like the reveals). */
function AnswerSlam({text, local, size}) {
  const chars = String(text).toUpperCase().split('');
  const CASCADE_DELAY = 0.06;
  const CASCADE_DUR = 0.22;
  return (
    <h2
      style={{
        margin: 0,
        font: `400 ${size}px/1.02 ${FONTS.display}`,
        letterSpacing: '-0.005em',
        overflow: 'hidden',
        paddingBottom: cq(0.6),
        color: '#fff',
        textAlign: 'center',
        textShadow: `0 0 ${cq(4)}px rgba(255,193,58,.45)`,
      }}
    >
      {chars.map((c, i) => {
        const slamDelay = i * 0.0405 + 0.15;
        const p = gsapTween(local, slamDelay, 0.6, backOut);
        const colourP = gsapTween(local, slamDelay + 0.6 + i * CASCADE_DELAY, CASCADE_DUR, power3Out);
        const col = colourP < 1
          ? `rgb(255, ${Math.round(lerp(255, 193, colourP))}, ${Math.round(lerp(255, 58, colourP))})`
          : COLORS.amber;
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              color: col,
              opacity: p,
              transform: `translateY(${(1 - p) * 100}%) scale(${lerp(1.25, 1, p)})`,
              textShadow: colourP > 0.5 ? `0 0 ${cq(3) * colourP}px rgba(255,193,58,${0.6 * colourP})` : 'none',
            }}
          >
            {c === ' ' ? '\u00a0' : c}
          </span>
        );
      })}
    </h2>
  );
}

/** Iris open — same motion language as the question scenes. */
function irisOpen(local) {
  const openDur = 0.8;
  const p = expoOut(clamp01(local / openDur));
  return {
    clipPath: `circle(${80 * p}% at 50% 55%)`,
    transform: `scale(${lerp(1.15, 1, p)})`,
  };
}

/** Iris ring pulse at scene start. */
function OpenRing({local}) {
  const p = gsapTween(local, 0, 0.75, expoOut);
  const size = lerp(cq(20) * 0.05, cq(20) * 14, p);
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        borderRadius: '50%',
        border: `${cq(1)}px solid ${COLORS.amber}`,
        boxShadow: `0 0 ${cq(4)}px rgba(255,193,58,.7)`,
        zIndex: 7,
        pointerEvents: 'none',
        opacity: 1 - p,
      }}
    />
  );
}

/** Ring that closes the scene at the very end. */
function CloseRing({local, duration}) {
  const start = duration - 0.6;
  if (local < start) return null;
  const p = gsapTween(local, start, 0.6, (t) => t * t * t);
  const size = lerp(cq(230), 0, p);
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '55%',
        width: size,
        height: size,
        transform: 'translate(-50%, -50%)',
        borderRadius: '50%',
        border: `${cq(1)}px solid ${COLORS.amber}`,
        boxShadow: `0 0 ${cq(4)}px rgba(255,193,58,.8), inset 0 0 ${cq(4)}px rgba(255,193,58,.5)`,
        zIndex: 7,
        pointerEvents: 'none',
        opacity: p < 0.15 ? p / 0.15 : 1,
      }}
    />
  );
}

// ---------------------------------------------------------- top bar --------

function BonusTopBar({local, n, total, round}) {
  const fade = gsapTween(local, 0, 0.5, power3Out);
  const col = kindColor(round.kind);
  return (
    <div
      style={{
        position: 'absolute',
        left: cq(5),
        right: cq(5),
        top: cq(3.4),
        zIndex: 6,
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        gap: cq(2),
        opacity: fade,
        pointerEvents: 'none',
      }}
    >
      <div style={{justifySelf: 'start', display: 'flex', alignItems: 'center', gap: cq(1.2)}}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: cq(0.8),
            background: COLORS.glass,
            border: `${cq(0.2)}px solid ${col}`,
            borderRadius: cq(2),
            padding: `${cq(1)}px ${cq(2.2)}px`,
            backdropFilter: 'blur(2px)',
          }}
        >
          <small style={{font: `700 ${cq(2)}px/1 ${FONTS.mono}`, letterSpacing: '0.12em', color: col}}>BONUS</small>
          <b style={{font: `400 ${cq(5.2)}px/1 ${FONTS.display}`}}>{n}</b>
          <span style={{font: `700 ${cq(2.6)}px/1 ${FONTS.mono}`, opacity: 0.8}}>/{total}</span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: cq(1.2),
            background: COLORS.glass,
            border: `${cq(0.2)}px solid ${col}`,
            borderRadius: cq(2),
            padding: `${cq(1.1)}px ${cq(2.4)}px`,
            backdropFilter: 'blur(2px)',
          }}
        >
          <i style={{width: cq(1.7), height: cq(1.7), borderRadius: '50%', background: col, boxShadow: `0 0 ${cq(1.4)}px ${col}`}} />
          <b style={{font: `700 ${cq(2.6)}px/1 ${FONTS.mono}`, letterSpacing: '0.18em', color: col}}>{round.name}</b>
        </div>
      </div>
      <div
        style={{
          gridColumn: 2,
          display: 'flex',
          alignItems: 'center',
          gap: cq(1.6),
          font: `700 ${cq(3.9)}px/1 ${FONTS.mono}`,
          letterSpacing: '0.26em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        <svg width={cq(4.8)} height={cq(4.8)} viewBox="0 0 100 100" style={{display: 'block', flex: 'none', filter: 'drop-shadow(0 0 6px rgba(255,193,58,.55))'}}>
          <line x1="66" y1="66" x2="91" y2="91" stroke={COLORS.amber2} strokeWidth="13" strokeLinecap="round" />
          <circle cx="41" cy="41" r="31" fill="rgba(255,255,255,.10)" stroke={COLORS.amber} strokeWidth="10" />
          <line x1="27" y1="41" x2="55" y2="41" stroke="#fff" strokeWidth="9" strokeLinecap="round" />
        </svg>
        <span>
          Zoom <i style={{fontStyle: 'normal', color: COLORS.amber}}>Out</i>
        </span>
      </div>
      <div />
    </div>
  );
}

// ------------------------------------------------------ puzzle card --------

function PuzzleCard({local, children, accent}) {
  const enter = gsapTween(local, 0.35, 0.5, backOut);
  return (
    <div
      style={{
        flex: '1 1 0',
        minHeight: 0,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: cq(2.2),
        border: `${cq(0.25)}px solid ${COLORS.glassline}`,
        background: '#0c0a22',
        boxShadow: `0 ${cq(3)}px ${cq(7)}px rgba(2,4,60,.5)`,
        alignSelf: 'center',
        width: 'auto',
        aspectRatio: '16 / 9',
        maxWidth: '88%',
        marginBottom: cq(1),
        opacity: enter,
        transform: `scale(${lerp(0.94, 1, enter)})`,
      }}
    >
      {children}
      <Brackets color={accent} />
    </div>
  );
}

// ── 1. COLOR DNA ────────────────────────────────────────────────────────────

function ColorDnaPuzzle({local, palette, accent}) {
  const scanT = (local * 0.9) % 1; // sweep cycles
  return (
    <>
      {/* faint lab grid */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `linear-gradient(rgba(255,255,255,.05) ${cq(0.15)}px, transparent ${cq(0.15)}px)`,
          backgroundSize: `100% ${cq(4)}px`,
        }}
      />
      <div style={{position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column'}}>
        <div style={{flex: 1, display: 'flex', alignItems: 'stretch', padding: `${cq(5.5)}px ${cq(6)}px ${cq(1)}px`, gap: cq(0.7)}}>
          {palette.map((c, i) => {
            const p = gsapTween(local, 0.55 + i * 0.14, 0.65, backOut);
            return (
              <div
                key={i}
                style={{
                  flex: Math.max(0.14, c.weight),
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'flex-end',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: `${lerp(6, 100, p)}%`,
                    background: c.hex,
                    borderRadius: cq(0.7),
                    boxShadow: `inset 0 ${cq(-0.6)}px 0 rgba(0,0,0,.28), 0 0 ${cq(2.2)}px ${c.hex}66`,
                  }}
                />
              </div>
            );
          })}
        </div>
        <div style={{flex: 'none', display: 'flex', padding: `0 ${cq(6)}px ${cq(4.6)}px`, gap: cq(0.7)}}>
          {palette.map((c, i) => {
            const p = gsapTween(local, 0.8 + i * 0.14, 0.5, power3Out);
            return (
              <div key={i} style={{flex: Math.max(0.14, c.weight), display: 'flex', justifyContent: 'center'}}>
                <span
                  style={{
                    font: `700 ${cq(1.9)}px/1 ${FONTS.mono}`,
                    letterSpacing: '0.1em',
                    color: '#fff',
                    opacity: p * 0.85,
                    background: 'rgba(10,14,80,.5)',
                    border: `${cq(0.16)}px solid ${COLORS.glassline}`,
                    borderRadius: cq(0.7),
                    padding: `${cq(0.7)}px ${cq(1)}px`,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c.hex.toUpperCase()}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {/* analysis sweep */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          pointerEvents: 'none',
          background: `linear-gradient(100deg, transparent 42%, ${accent}26 50%, transparent 58%)`,
          transform: `translateX(${lerp(-120, 120, scanT)}%)`,
        }}
      />
      <CardChip style={{left: cq(3), top: cq(3)}} color={accent}>DOMINANT COLORS</CardChip>
    </>
  );
}

// ── 2. SHADOW REVEAL ────────────────────────────────────────────────────────

function ShadowPuzzle({local, src, accent}) {
  const enter = gsapTween(local, 0.55, 0.7, expoOut);
  const breathe = 1 + 0.015 * Math.sin(local * 1.6 * Math.PI * 2 / 2);
  const glow = 0.55 + 0.45 * Math.sin((local / 1.9) * Math.PI * 2);
  return (
    <>
      {/* spotlight from above */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(60% 90% at 50% -18%, rgba(168,139,255,.28) 0%, rgba(168,139,255,.10) 34%, transparent 62%)`,
        }}
      />
      {/* floor line */}
      <div
        style={{
          position: 'absolute',
          left: '12%',
          right: '12%',
          bottom: '16%',
          height: cq(0.18),
          background: `linear-gradient(90deg, transparent, ${accent}88, transparent)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Img
          src={staticFile(src)}
          style={{
            maxHeight: '74%',
            maxWidth: '78%',
            objectFit: 'contain',
            opacity: enter,
            transform: `scale(${lerp(0.92, 1, enter) * breathe})`,
            filter: `drop-shadow(0 0 ${cq(2.4)}px rgba(168,139,255,${lerp(0.35, 0.95, glow)}))`,
          }}
        />
      </div>
      <CardChip style={{left: cq(3), top: cq(3)}} color={accent}>SILHOUETTE ONLY</CardChip>
    </>
  );
}

// ── 3. MACRO TEXTURE ────────────────────────────────────────────────────────

function TexturePuzzle({local, src, zoom, accent}) {
  const enter = gsapTween(local, 0.45, 0.55, power3Out);
  const drift = easeInOut(clamp01((local - 0.6) / 12));
  const scale = lerp(1.05, 1.16, drift);
  return (
    <>
      <div style={{position: 'absolute', inset: 0, overflow: 'hidden', opacity: enter}}>
        <Img
          src={staticFile(src)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            transform: `scale(${scale}) translateX(${lerp(-1.4, 1.2, drift)}%)`,
          }}
        />
      </div>
      {/* edge vignette */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          pointerEvents: 'none',
          background: 'radial-gradient(105% 105% at 50% 50%, transparent 55%, rgba(6,4,44,.55) 100%)',
        }}
      />
      <CardChip style={{left: cq(3), bottom: cq(3)}} color={accent} icon={<FocusIcon size={cq(2.1)} color={accent} />}>
        MACRO ×{zoom.toFixed(1)}
      </CardChip>
    </>
  );
}

// ── 4. PIXEL FOCUS ──────────────────────────────────────────────────────────

function UnpixelPuzzle({puzzleP, local, data, accent}) {
  if (!data) return null;
  const {levels, files} = data;
  // active level index by clock progress
  let idx = 0;
  for (let i = 0; i < UNPIXEL_AT.length; i++) {
    if (puzzleP >= UNPIXEL_AT[i]) idx = i;
  }
  const enter = gsapTween(local, 0.45, 0.5, power3Out);
  // Render the current step crossfading over the previous one.
  const cur = files[String(levels[idx])];
  const prev = idx > 0 ? files[String(levels[idx - 1])] : null;
  const span = () => {
    const next = UNPIXEL_AT[idx + 1] != null ? UNPIXEL_AT[idx + 1] : 1;
    return Math.max(0.001, next - UNPIXEL_AT[idx]);
  };
  const blendP = idx === 0 ? 1 : clamp01((puzzleP - UNPIXEL_AT[idx]) * (span() / UNPIXEL_BLEND));
  const grid = levels[idx];
  return (
    <>
      <div style={{position: 'absolute', inset: 0, opacity: enter}}>
        {prev ? (
          <Img src={staticFile(prev)} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block'}} />
        ) : null}
        <Img
          src={staticFile(cur)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            opacity: idx === 0 ? 1 : blendP,
          }}
        />
      </div>
      {/* pixel-grid overlay sheen on the coarsest steps */}
      {grid <= 48 ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 2,
            pointerEvents: 'none',
            opacity: 0.5 * (1 - clamp01((puzzleP - 0.45) / 0.2)),
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px)',
            backgroundSize: `${cq(3)}px ${cq(3)}px`,
          }}
        />
      ) : null}
      <CardChip style={{left: cq(3), bottom: cq(3)}} color={accent} icon={<DiceIcon size={cq(2.1)} color={accent} />}>
        {grid}PX GRID
      </CardChip>
    </>
  );
}

// ── 5. RECIPE REVERSE ───────────────────────────────────────────────────────

const EMOJI_FONT = '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", "Noto Emoji", sans-serif';

function RecipeCard({local, i, emoji, label, accent}) {
  const flip = gsapTween(local, 0.6 + i * 0.38, 0.6, backOut);
  const bob = Math.sin((local / 1.6) * Math.PI * 2 + i * 1.9) * cq(0.55);
  return (
    <div style={{perspective: cq(40)}}>
      <div
        style={{
          width: cq(17),
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: cq(1.2),
          opacity: clamp01(flip * 1.4),
          transform: `translateY(${bob}px)`,
        }}
      >
        <div
          style={{
            width: cq(15),
            height: cq(15),
            display: 'grid',
            placeItems: 'center',
            background: 'linear-gradient(160deg, rgba(255,255,255,.16), rgba(255,255,255,.05))',
            border: `${cq(0.3)}px solid ${accent}`,
            borderRadius: cq(2),
            boxShadow: `0 ${cq(1.4)}px ${cq(4)}px rgba(2,4,60,.55), inset 0 0 ${cq(3)}px ${accent}33`,
            transform: `rotateY(${lerp(92, 0, flip)}deg) scale(${lerp(0.7, 1, flip)})`,
          }}
        >
          <span style={{fontFamily: EMOJI_FONT, fontSize: cq(8.2), lineHeight: 1, display: 'block'}}>{emoji}</span>
        </div>
        <span
          style={{
            font: `700 ${cq(2.2)}px/1 ${FONTS.mono}`,
            letterSpacing: '0.18em',
            color: '#fff',
            background: 'rgba(10,14,80,.55)',
            border: `${cq(0.18)}px solid ${COLORS.glassline}`,
            borderRadius: cq(0.8),
            padding: `${cq(0.8)}px ${cq(1.4)}px`,
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

function RecipePuzzle({local, ingredients, accent}) {
  const qPulse = 0.5 + 0.5 * Math.sin((local / 1.1) * Math.PI * 2);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: cq(3),
      }}
    >
      {ingredients.map(([emoji, label], i) => (
        <React.Fragment key={i}>
          {i > 0 ? (
            <span
              style={{
                font: `700 ${cq(5)}px/1 ${FONTS.mono}`,
                color: COLORS.amber,
                opacity: gsapTween(local, 0.6 + i * 0.38 - 0.12, 0.4, power3Out),
              }}
            >
              +
            </span>
          ) : null}
          <RecipeCard local={local} i={i} emoji={emoji} label={label} accent={accent} />
        </React.Fragment>
      ))}
      <span
        style={{
          font: `700 ${cq(5)}px/1 ${FONTS.mono}`,
          color: COLORS.amber,
          opacity: gsapTween(local, 0.6 + ingredients.length * 0.38, 0.4, power3Out),
        }}
      >
        =
      </span>
      <div style={{perspective: cq(40)}}>
        <div
          style={{
            width: cq(15),
            height: cq(15),
            display: 'grid',
            placeItems: 'center',
            border: `${cq(0.35)}px dashed ${COLORS.amber}`,
            borderRadius: cq(2),
            opacity: gsapTween(local, 1.9, 0.5, backOut),
            transform: `scale(${lerp(0.94, 1.02, qPulse)})`,
            boxShadow: `0 0 ${cq(2 + qPulse * 2)}px rgba(255,193,58,${lerp(0.25, 0.7, qPulse)})`,
          }}
        >
          <span style={{font: `400 ${cq(8.4)}px/1 ${FONTS.display}`, color: COLORS.amber}}>?</span>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ clock --------

function BonusClock({local, clockStart, clock, accent, chipText}) {
  const p = clamp01((local - clockStart) / clock);
  const raw = Math.max(0, clock * (1 - p));
  const pts = Math.max(0, Math.ceil(raw - 1e-6));
  const tickAge = pts - raw;
  const tickP = p <= 0 ? 1 : clamp01(tickAge / 0.3);
  const tickScale = lerp(1.3, 1, elasticOut(tickP));
  const last3 = raw <= 3.05;
  // amber -> red as the clock dies
  const heat = clamp01((p - 0.72) / 0.28);
  const col = `rgb(255, ${Math.round(lerp(193, 77, heat))}, ${Math.round(lerp(58, 79, heat))})`;
  const R = 42;
  const C = 2 * Math.PI * R;
  const enter = gsapTween(local, clockStart - 0.4, 0.5, backOut);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: cq(3.6),
        height: cq(12),
        flexShrink: 0,
        opacity: enter,
        transform: `translateY(${(1 - enter) * cq(3)}px)`,
      }}
    >
      <div style={{position: 'relative', width: cq(9.6), height: cq(9.6), flex: 'none'}}>
        <svg viewBox="0 0 100 100" style={{width: '100%', height: '100%', display: 'block'}}>
          <circle cx="50" cy="50" r={R} stroke="rgba(255,255,255,.14)" strokeWidth="7" fill="none" />
          <circle cx="50" cy="50" r={R} stroke="rgba(255,255,255,.3)" strokeWidth="7" fill="none" strokeDasharray={`${C / 12} ${C}`} strokeLinecap="butt" transform="rotate(-90 50 50)" />
          <circle
            cx="50"
            cy="50"
            r={R}
            stroke={col}
            strokeWidth="7"
            fill="none"
            strokeDasharray={C}
            strokeDashoffset={C * p}
            strokeLinecap="round"
            transform="rotate(-90 50 50)"
            style={{filter: `drop-shadow(0 0 ${cq(1.4)}px ${col})`}}
          />
        </svg>
        <div style={{position: 'absolute', inset: 0, display: 'grid', placeItems: 'center'}}>
          <b
            style={{
              font: `400 ${cq(4.4)}px/1 ${FONTS.display}`,
              color: last3 ? col : '#fff',
              transform: `scale(${tickScale})`,
              display: 'block',
              textShadow: last3 ? `0 0 ${cq(2.4)}px ${col}aa` : 'none',
            }}
          >
            {pts}
          </b>
        </div>
      </div>
      <CommentChip local={local} clockStart={clockStart} text={chipText} />
    </div>
  );
}

function CommentChip({local, clockStart, text}) {
  const p = gsapTween(local, clockStart + 2.2, 0.5, backOut);
  if (p <= 0) return null;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: cq(1.4),
        background: COLORS.glass,
        border: `${cq(0.25)}px solid ${COLORS.amber}`,
        borderRadius: cq(3),
        padding: `${cq(1.3)}px ${cq(2.6)}px`,
        backdropFilter: 'blur(2px)',
        font: `700 ${cq(2.6)}px/1 ${FONTS.mono}`,
        letterSpacing: '0.16em',
        whiteSpace: 'nowrap',
        opacity: p,
        transform: `scale(${lerp(0.85, 1, p)})`,
        boxShadow: `0 0 ${cq(2.2)}px rgba(255,193,58,.35)`,
      }}
    >
      {text}
      <ArrowDownIcon size={cq(3)} />
    </div>
  );
}

// ------------------------------------------------------------ reveal -------

/** Mechanic-specific handoff animation layered over the answer photo. */
function RevealBridge({kind, rl, round, qItem, data}) {
  if (kind === 'colordna' && data && rl < 1.1) {
    const palette = data;
    return (
      <div style={{position: 'absolute', inset: 0, zIndex: 3, display: 'flex', padding: 0, gap: cq(0.7)}}>
        {palette.map((c, i) => {
          const p = gsapTween(rl, 0.05 + i * 0.05, 0.42, power3Out);
          return (
            <div
              key={i}
              style={{
                flex: Math.max(0.14, c.weight),
                background: c.hex,
                transformOrigin: 'top',
                transform: `scaleY(${1 - p})`,
                opacity: 1 - p * 0.25,
              }}
            />
          );
        })}
      </div>
    );
  }
  if (kind === 'shadow' && rl < 1.3) {
    const p = gsapTween(rl, 0.1, 0.85, power3Out);
    if (p >= 1) return null;
    const src = (assets.shadow && assets.shadow[round.asset]) || null;
    if (!src) return null;
    return (
      <div style={{position: 'absolute', inset: 0, zIndex: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none'}}>
        <Img
          src={staticFile(src)}
          style={{
            maxHeight: '74%',
            maxWidth: '78%',
            objectFit: 'contain',
            opacity: 1 - p,
            transform: `scale(${lerp(1, 1.06, p)})`,
          }}
        />
      </div>
    );
  }
  if (kind === 'texture' && rl < 1.6) {
    // photo pulls back from the macro crop: handled by the card (zoom wrapper)
    return null;
  }
  if (kind === 'unpixel' && rl < 1.2) {
    const p = gsapTween(rl, 0.05, 0.6, power3Out);
    if (p >= 1) return null;
    const u = assets.unpixel && assets.unpixel[round.asset];
    const file = u && u.files && u.files['192'];
    if (!file) return null;
    return (
      <Img
        src={staticFile(file)}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          zIndex: 3,
          opacity: 1 - p,
          display: 'block',
        }}
      />
    );
  }
  if (kind === 'recipe' && rl < 1.4) {
    const ings = round.ingredients || [];
    const chips = [];
    ings.forEach(([emoji], i) => {
      const dir = i % 2 === 0 ? -1 : 1;
      const p = gsapTween(rl, 0.08 + i * 0.07, 0.6, power3Out);
      if (p >= 1) return;
      chips.push(
        <span
          key={i}
          style={{
            position: 'absolute',
            left: `${50 + (i - (ings.length - 1) / 2) * 17}%`,
            top: '50%',
            fontFamily: EMOJI_FONT,
            fontSize: cq(8),
            lineHeight: 1,
            zIndex: 3,
            opacity: 1 - p,
            transform: `translate(-50%, -50%) translateX(${dir * p * 160}%) rotate(${dir * p * 40}deg)`,
          }}
        >
          {emoji}
        </span>
      );
    });
    return <>{chips}</>;
  }
  return null;
}

/** Flash + spark burst + check badge at the reveal moment. */
function BonusRevealFX({local}) {
  const flash = 1 - gsapTween(local, 0, 0.7, power3Out);
  const shine = gsapTween(local, 0.25, 1, power3Out);
  const pop = gsapTween(local, 0.45, 0.6, elasticOut);
  const draw = gsapTween(local, 0.8, 0.4, power3Out);
  const sparks = [];
  const SPARK_COUNT = 26;
  for (let k = 0; k < SPARK_COUNT; k++) {
    const isOuter = k % 2 === 0;
    const launchDelay = isOuter ? 0.05 : 0.13;
    const travelDur = isOuter ? 1.4 : 1.1;
    const a = (k * (360 / SPARK_COUNT) * Math.PI) / 180;
    const d = cq(isOuter ? 30 + ((k * 5) % 4) * 8 : 18 + ((k * 7) % 3) * 7);
    const sz = cq(isOuter ? 1.3 : 2.0);
    const p = gsapTween(local, launchDelay, travelDur, expoOut);
    const col = k % 3 === 0 ? '#fff' : k % 3 === 1 ? COLORS.amber : COLORS.amber2;
    sparks.push(
      <i
        key={k}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: sz,
          height: sz,
          margin: `${-sz / 2}px 0 0 ${-sz / 2}px`,
          borderRadius: '50%',
          background: col,
          boxShadow: `0 0 ${cq(1.8)}px ${col}`,
          zIndex: 5,
          transform: `translate(${Math.cos(a) * d * p}px, ${Math.sin(a) * d * p}px) scale(${lerp(1.6, 0.1, p)})`,
          opacity: 1 - p * p,
        }}
      />,
    );
  }
  const pulses = [0, 0.18, 0.38].map((delay, i) => {
    const p = gsapTween(local, delay, 0.95, expoOut);
    const maxScale = i === 2 ? 2.4 : 3.6;
    const bw = i === 0 ? cq(0.8) : cq(0.4);
    const col = i === 2 ? COLORS.amber2 : COLORS.amber;
    return (
      <div
        key={i}
        style={{
          position: 'absolute',
          left: '50%',
          top: '58%',
          width: cq(30),
          height: cq(30),
          margin: `${-cq(15)}px 0 0 ${-cq(15)}px`,
          borderRadius: '50%',
          border: `${bw}px solid ${col}`,
          boxShadow: `0 0 ${cq(4)}px rgba(255,193,58,.65)`,
          zIndex: 7,
          pointerEvents: 'none',
          transform: `scale(${lerp(0.2, maxScale, p)})`,
          opacity: (1 - p) * (i === 2 ? 0.65 : 1),
        }}
      />
    );
  });
  return (
    <>
      <div style={{position: 'absolute', inset: 0, background: '#fff', zIndex: 5, opacity: flash * 0.9, pointerEvents: 'none'}} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 5,
          pointerEvents: 'none',
          background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,.55) 50%, transparent 65%)',
          transform: `translateX(${lerp(-120, 120, shine)}%)`,
        }}
      />
      {sparks}
      <div
        style={{
          position: 'absolute',
          right: cq(3),
          bottom: cq(3.2),
          zIndex: 5,
          width: cq(7.4),
          height: cq(7.4),
          borderRadius: '50%',
          background: COLORS.amber,
          display: 'grid',
          placeItems: 'center',
          boxShadow: `0 0 ${cq(3)}px rgba(255,193,58,.8)`,
          transform: `scale(${pop}) rotate(${lerp(-40, 0, pop)}deg)`,
        }}
      >
        <CheckIcon size={cq(4.2)} />
      </div>
      {pulses}
    </>
  );
}

/** The answer photo card. `zoomFrom` (texture round) animates a pull-back. */
function AnswerCard({rl, round, qItem, kind, children}) {
  const punchP = clamp01(rl / 0.8);
  const punchScale = punchP < 0.28 ? lerp(1, 1.045, punchP / 0.28) : lerp(1.045, 1, (punchP - 0.28) / 0.72);
  // texture bridge: pull back from the macro focus
  const zp = gsapTween(rl, 0.05, 1.0, expoOut);
  const scale = kind === 'texture' ? lerp(2.5, 1, zp) : 1;
  const ar = Number(qItem && qItem.ar) || 16 / 9;
  const cam = kind === 'texture'
    ? zoomCamera(scale, focusFrac(qItem && qItem.fx), focusFrac(qItem && qItem.fy), ar)
    : {transform: 'none'};
  return (
    <div
      style={{
        flex: '1 1 0',
        minHeight: 0,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: cq(2.2),
        border: `${cq(0.25)}px solid ${COLORS.glassline}`,
        background: '#0c0a22',
        boxShadow: `0 0 ${cq(6)}px rgba(255,193,58,.55), 0 ${cq(3)}px ${cq(7)}px rgba(2,4,60,.5)`,
        alignSelf: 'center',
        width: 'auto',
        aspectRatio: '16 / 9',
        maxWidth: '88%',
        marginBottom: cq(1),
        transform: `scale(${punchScale})`,
      }}
    >
      <div style={{position: 'absolute', inset: 0, overflow: 'hidden'}}>
        <div style={{position: 'absolute', inset: 0, transformOrigin: '0 0', transform: cam.transform}}>
          <Img
            src={staticFile(`images/${round.image}`)}
            style={{width: '100%', height: '100%', objectFit: 'cover', display: 'block'}}
          />
        </div>
      </div>
      {children}
      <Brackets color={COLORS.amber} />
    </div>
  );
}

function EraseChip({rl, text}) {
  const p = gsapTween(rl, 0.55, 0.5, backOut);
  if (p <= 0) return null;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: cq(1.3),
        height: cq(12),
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: cq(1.2),
          background: COLORS.amber,
          borderRadius: cq(3),
          padding: `${cq(1.3)}px ${cq(2.8)}px`,
          font: `700 ${cq(2.7)}px/1 ${FONTS.mono}`,
          letterSpacing: '0.14em',
          color: '#111436',
          whiteSpace: 'nowrap',
          opacity: p,
          transform: `scale(${lerp(0.8, 1, p)})`,
          boxShadow: `0 0 ${cq(3)}px rgba(255,193,58,.55)`,
        }}
      >
        {text}
        <span
          style={{
            width: cq(3.4),
            height: cq(3.4),
            borderRadius: '50%',
            background: '#111436',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <CheckIcon size={cq(2.2)} color={COLORS.amber} />
        </span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ banner -------

function BonusBanner({local, clockStart, round, n, total}) {
  if (local >= clockStart + 0.45) return null;
  const out = clamp01((local - (clockStart - 0.35)) / 0.45);
  const col = kindColor(round.kind);
  const words = ['BONUS', 'ROUND'];
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 9,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: cq(2.4),
        background: 'rgba(6,4,44,.84)',
        backdropFilter: 'blur(3px)',
        opacity: 1 - out,
      }}
    >
      <h2
        style={{
          margin: 0,
          font: `400 ${cq(17)}px/1 ${FONTS.display}`,
          letterSpacing: '-0.005em',
          overflow: 'hidden',
          paddingBottom: cq(0.6),
          textAlign: 'center',
          textShadow: `0 0 ${cq(6)}px rgba(255,193,58,.35)`,
        }}
      >
        {words.map((w, i) => {
          const p = gsapTween(local, i * 0.14 + 0.12, 0.6, backOut);
          return (
            <React.Fragment key={i}>
              <span
                style={{
                  display: 'inline-block',
                  color: i === 0 ? COLORS.amber : '#fff',
                  opacity: p,
                  transform: `translateY(${(1 - p) * 100}%) scale(${lerp(1.25, 1, p)})`,
                }}
              >
                {w}
              </span>
              {i < words.length - 1 ? ' ' : null}
            </React.Fragment>
          );
        })}
      </h2>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: cq(1.6),
          opacity: gsapTween(local, 0.55, 0.45, backOut),
          transform: `scale(${lerp(0.85, 1, gsapTween(local, 0.55, 0.45, backOut))})`,
        }}
      >
        <span style={{font: `700 ${cq(2.4)}px/1 ${FONTS.mono}`, letterSpacing: '0.3em', color: 'rgba(255,255,255,.75)'}}>
          {n} OF {total}
        </span>
        <i style={{width: cq(1.2), height: cq(1.2), borderRadius: '50%', background: col, boxShadow: `0 0 ${cq(1.2)}px ${col}`}} />
        <b style={{font: `700 ${cq(3.4)}px/1 ${FONTS.mono}`, letterSpacing: '0.24em', color: col}}>{round.name}</b>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- scene -------

export function BonusScene({local, duration, round, bonusIndex, settings, questions, clockStart}) {
  const B = settings.bonus || {};
  const clock = B.clock != null ? B.clock : 8;
  const totalRounds = (B.rounds || []).length;
  const revealAt = clockStart + clock;
  const reveal = local >= revealAt;
  const rl = reveal ? local - revealAt : 0;
  const puzzleP = clamp01((local - clockStart) / clock);
  const accent = kindColor(round.kind);
  const qItem = questions.find((x) => x.image === round.image) || {};
  const palette = (assets.colors && assets.colors[round.asset]) || [];
  const texData = (assets.texture && assets.texture[round.asset]) || null;
  const unpixData = (assets.unpixel && assets.unpixel[round.asset]) || null;
  const ir = irisOpen(local);

  const puzzle = (() => {
    switch (round.kind) {
      case 'colordna':
        return <ColorDnaPuzzle local={local} palette={palette} accent={accent} />;
      case 'shadow': {
        const src = (assets.shadow && assets.shadow[round.asset]) || '';
        return <ShadowPuzzle local={local} src={src} accent={accent} />;
      }
      case 'texture':
        return <TexturePuzzle local={local} src={texData ? texData.file : ''} zoom={texData ? texData.zoom : 6.25} accent={accent} />;
      case 'unpixel':
        return <UnpixelPuzzle puzzleP={puzzleP} local={local} data={unpixData} accent={accent} />;
      case 'recipe':
        return <RecipePuzzle local={local} ingredients={round.ingredients || []} accent={accent} />;
      default:
        return null;
    }
  })();

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: cq(1.6),
        padding: `${cq(12.5)}px ${cq(5)}px ${cq(3.4)}px`,
        color: '#fff',
        clipPath: ir.clipPath,
        transform: ir.transform,
      }}
    >
      <BonusTopBar local={local} n={bonusIndex + 1} total={totalRounds} round={round} />
      {reveal ? (
        <>
          <div style={{textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0}}>
            <div
              style={{
                font: `700 ${cq(1.9)}px/1 ${FONTS.mono}`,
                letterSpacing: '0.3em',
                textTransform: 'uppercase',
                color: COLORS.amber,
                height: 0,
                overflow: 'visible',
                transform: `translateY(${-cq(2.2)}px)`,
                opacity: gsapTween(rl, 0.2, 0.4, expoOut),
              }}
            >
              BONUS ANSWER
            </div>
            <AnswerSlam text={round.answer} local={rl} size={cq(7.4)} />
          </div>
          <AnswerCard rl={rl} round={round} qItem={qItem} kind={round.kind}>
            <BonusRevealFX local={rl} />
            <RevealBridge kind={round.kind} rl={rl} round={round} qItem={qItem} data={palette} />
          </AnswerCard>
          <EraseChip rl={rl} text={B.eraseChip || 'NAIL IT? ERASE 1 WRONG'} />
        </>
      ) : (
        <>
          <div style={{textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: cq(0.8)}}>
            <Headline words={String(round.question || '').split(' ')} local={local} size={cq(7.4)} amberAt={1} />
          </div>
          <PuzzleCard local={local} accent={accent}>{puzzle}</PuzzleCard>
          <BonusClock local={local} clockStart={clockStart} clock={clock} accent={accent} chipText={B.commentChip || 'DROP YOUR ANSWER BELOW'} />
        </>
      )}
      <OpenRing local={local} />
      <CloseRing local={local} duration={duration} />
      <BonusBanner local={local} clockStart={clockStart} round={round} n={bonusIndex + 1} total={totalRounds} />
    </div>
  );
}

export default BonusScene;
