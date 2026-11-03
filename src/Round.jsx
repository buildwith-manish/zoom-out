import React, {useEffect, useState} from 'react';
import {
  AbsoluteFill,
  Img,
  continueRender,
  delayRender,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {backOut, expoOut, elasticOut, power3Out, gsapTween, clamp01} from './gsap-helpers';
import {COLORS, FONTS, LEVELS, cq, seriesColors} from './style';
import {buildScenes, sceneAt, levelInfo} from './timing';
import {clamp, lerp, zoomScale, zoomBlur, zoomCamera, focusFrac, easeInOut, rasterImage} from './util';
import {QuizAudio} from './audio';

function Fonts() {
  const [handle] = useState(() => delayRender('fonts'));
  useEffect(() => {
    const faces = [
      new FontFace('Anton', `url(${staticFile('fonts/Anton-Regular.ttf')})`, {weight: '400'}),
      new FontFace('JetBrains Mono', `url(${staticFile('fonts/JetBrainsMono-Medium.ttf')})`, {weight: '500'}),
      new FontFace('JetBrains Mono', `url(${staticFile('fonts/JetBrainsMono-Bold.ttf')})`, {weight: '700'}),
    ];
    Promise.all(faces.map((f) => f.load()))
      .then((loaded) => {
        loaded.forEach((f) => document.fonts.add(f));
        continueRender(handle);
      })
      .catch(() => continueRender(handle));
  }, [handle]);
  return null;
}

function Pic({item, style}) {
  const file = item.image || `${item.art}.svg`;
  const src = staticFile(`images/${file}`);
  if (rasterImage(file)) {
    return <Img src={src} style={style} />;
  }
  return <Img src={src} style={style} />;
}

function CornerBrackets() {
  const s = cq(0.55);
  const size = cq(5);
  const off = cq(2);
  const common = {
    position: 'absolute',
    width: size,
    height: size,
    borderStyle: 'solid',
    borderColor: COLORS.amber,
    borderWidth: s,
    zIndex: 3,
    pointerEvents: 'none',
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

function Words({words, local, delay = 0.1, dur = 0.55, stagger = 0.09, size, amberAt, amberFrom, color, slam, slamDelay = 0.15}) {
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
        textShadow: slam ? '0 0 4cqmin rgba(255,193,58,.45)'.replace('4cqmin', `${cq(4)}px`) : undefined,
      }}
    >
      {words.map((w, i) => {
        const p = slam
          ? gsapTween(local, i * 0.45 * 0.09 + slamDelay, 0.6, backOut)
          : gsapTween(local, i * stagger + delay, dur, backOut);
        const isAmber =
          (typeof amberAt === 'number' && i === amberAt) ||
          (typeof amberFrom === 'number' && i >= amberFrom);
        return (
          <React.Fragment key={i}>
            <span
              style={{
                display: 'inline-block',
                color: isAmber ? COLORS.amber : color || '#fff',
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

function LetterSlam({text, local, size}) {
  const chars = text.toUpperCase().split('');
  return (
    <h2
      style={{
        margin: 0,
        font: `400 ${size}px/1.02 ${FONTS.display}`,
        letterSpacing: '-0.005em',
        overflow: 'hidden',
        paddingBottom: cq(0.6),
        color: COLORS.amber,
        textAlign: 'center',
        textShadow: `0 0 ${cq(4)}px rgba(255,193,58,.45)`,
      }}
    >
      {chars.map((c, i) => {
        const p = gsapTween(local, i * 0.0405 + 0.15, 0.6, backOut);
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity: p,
              transform: `translateY(${(1 - p) * 100}%) scale(${lerp(1.25, 1, p)})`,
            }}
          >
            {c === ' ' ? '\u00a0' : c}
          </span>
        );
      })}
    </h2>
  );
}

function LevelBadge({level}) {
  const L = LEVELS[level];
  if (!L) return <div />;
  return (
    <div
      style={{
        justifySelf: 'end',
        display: 'flex',
        alignItems: 'center',
        gap: cq(1.2),
        background: COLORS.glass,
        border: `${cq(0.2)}px solid ${L.color}`,
        borderRadius: cq(2),
        padding: `${cq(1.1)}px ${cq(2.4)}px`,
        backdropFilter: 'blur(2px)',
      }}
    >
      <i style={{width: cq(1.7), height: cq(1.7), borderRadius: '50%', background: L.color, boxShadow: `0 0 ${cq(1.4)}px ${L.color}`}} />
      <b style={{font: `700 ${cq(2.6)}px/1 ${FONTS.mono}`, letterSpacing: '0.18em', color: L.color}}>{L.label}</b>
    </div>
  );
}

function LevelCard({local, duration, questions, level}) {
  const ir = iris(local, 'intro', duration);
  const L = LEVELS[level] || LEVELS.easy;
  const info = levelInfo(questions, level);
  const fade = gsapTween(local, 0.05, 0.4, power3Out);
  const sub = gsapTween(local, 0.55, 0.5, expoOut);
  const chip = gsapTween(local, 0.75, 0.5, backOut);
  const glow = gsapTween(local, 0, 0.9, expoOut);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: cq(2.6),
        color: '#fff',
        clipPath: ir.clipPath,
        transform: ir.transform,
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: cq(95),
          height: cq(95),
          borderRadius: '50%',
          background: `radial-gradient(circle, ${L.color}55 0%, ${L.color}00 62%)`,
          transform: `scale(${lerp(0.4, 1, glow)})`,
          opacity: glow,
        }}
      />
      <div style={{font: `700 ${cq(2.8)}px/1 ${FONTS.mono}`, letterSpacing: '0.45em', opacity: fade * 0.9, zIndex: 1}}>
        LEVEL {info.ord} OF {info.total}
      </div>
      <div style={{zIndex: 1, textShadow: `0 0 ${cq(5)}px ${L.color}88`}}>
        <Words words={[L.label]} local={local} size={cq(30)} color={L.color} slam />
      </div>
      <div
        style={{
          zIndex: 1,
          font: `700 ${cq(3.4)}px/1 ${FONTS.mono}`,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          opacity: sub,
          transform: `translateY(${(1 - sub) * cq(2)}px)`,
        }}
      >
        {L.sub}
      </div>
      <div
        style={{
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: cq(2.4),
          background: COLORS.glass,
          border: `${cq(0.2)}px solid ${COLORS.glassline}`,
          borderRadius: cq(3),
          padding: `${cq(1.4)}px ${cq(3.2)}px`,
          opacity: chip,
          transform: `scale(${lerp(0.8, 1, chip)})`,
        }}
      >
        <span style={{font: `700 ${cq(2.6)}px/1 ${FONTS.mono}`, letterSpacing: '0.12em'}}>
          {info.count} ANIMALS · Q{info.first}–{info.last}
        </span>
        <span style={{display: 'flex', gap: cq(1)}}>
          {info.order.map((lv, k) => (
            <i
              key={lv}
              style={{
                width: cq(2.2),
                height: cq(2.2),
                borderRadius: '50%',
                border: `${cq(0.3)}px solid ${LEVELS[lv] ? LEVELS[lv].color : '#fff'}`,
                background: k + 1 <= info.ord ? (LEVELS[lv] ? LEVELS[lv].color : '#fff') : 'transparent',
              }}
            />
          ))}
        </span>
      </div>
      <CloseRing local={local} duration={duration} />
    </div>
  );
}

function LensMark({size}) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{display: 'block', flex: 'none', filter: 'drop-shadow(0 0 6px rgba(255,193,58,.55))'}}>
      <line x1="66" y1="66" x2="91" y2="91" stroke={COLORS.amber2} strokeWidth="13" strokeLinecap="round" />
      <circle cx="41" cy="41" r="31" fill="rgba(255,255,255,.10)" stroke={COLORS.amber} strokeWidth="10" />
      <line x1="27" y1="41" x2="55" y2="41" stroke="#fff" strokeWidth="9" strokeLinecap="round" />
    </svg>
  );
}

function TopBar({index, total, local, level}) {
  const fade = gsapTween(local, 0, 0.5, power3Out);
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
      <div style={{justifySelf: 'start', display: 'flex', alignItems: 'center', gap: cq(1.6)}}>
      <div
        style={{
          justifySelf: 'start',
          display: 'flex',
          alignItems: 'baseline',
          gap: cq(0.8),
          background: COLORS.glass,
          border: `${cq(0.2)}px solid ${COLORS.glassline}`,
          borderRadius: cq(2),
          padding: `${cq(1)}px ${cq(2.2)}px`,
          backdropFilter: 'blur(2px)',
        }}
      >
        <small style={{font: `700 ${cq(2)}px/1 ${FONTS.mono}`, opacity: 0.8}}>Q</small>
        <b style={{font: `400 ${cq(5.2)}px/1 ${FONTS.display}`}}>{index + 1}</b>
        <span style={{font: `700 ${cq(2.6)}px/1 ${FONTS.mono}`, opacity: 0.8}}>/{total}</span>
      </div>
        <LevelBadge level={level} />
      </div>
      <div
        style={{
          gridColumn: 2,
          font: `700 ${cq(3.9)}px/1 ${FONTS.mono}`,
          letterSpacing: '0.26em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: cq(1.4),
        }}
      >
        <LensMark size={cq(4.8)} />
        <span>
          Zoom <i style={{fontStyle: 'normal', color: COLORS.amber}}>Out</i>
        </span>
      </div>
      <div />
    </div>
  );
}

function PhotoCard({
  item,
  local,
  zoomDelay,
  zoomDur,
  cardDelay = 0.35,
  flashDelay = 0.35,
  showLens = true,
  locked = false,
  punch = false,
  forceScale,
  children,
}) {
  const enter = gsapTween(local, cardDelay, 0.5, backOut);
  const flashT = gsapTween(local, flashDelay, 0.35, power3Out);
  const zoomProg = zoomDur > 0 ? clamp01((local - zoomDelay) / zoomDur) : 1;
  const scale = forceScale != null ? forceScale : local >= 0 ? zoomScale(Math.max(0, zoomProg), item.z0 || 12) : item.z0 || 12;
  const blur = forceScale != null ? 0 : zoomBlur(Math.max(0, zoomProg));
  const cam = zoomCamera(scale, focusFrac(item.fx), focusFrac(item.fy), Number(item.ar) || 16 / 9);
  const lensFade = showLens ? 1 - gsapTween(local, zoomDelay, zoomDur || 0.01, (t) => t * t) : 0;

  let punchScale = 1;
  if (punch) {
    const p = clamp01(local / 0.8);
    punchScale = p < 0.28 ? lerp(1, 1.045, p / 0.28) : lerp(1.045, 1, (p - 0.28) / 0.72);
  }

  const lockGlow = locked
    ? `0 0 ${cq(6)}px rgba(255,193,58,.55), 0 ${cq(3)}px ${cq(7)}px rgba(2,4,60,.5)`
    : `0 ${cq(3)}px ${cq(7)}px rgba(2,4,60,.5)`;

  return (
    <div
      style={{
        flex: '1 1 0',
        minHeight: 0,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: cq(2.2),
        border: `${cq(0.25)}px solid ${COLORS.glassline}`,
        background: item.pic || '#fff',
        boxShadow: lockGlow,
        alignSelf: 'center',
        width: 'auto',
        aspectRatio: '16 / 9',
        maxWidth: '88%',
        marginBottom: cq(1),
        opacity: punch ? 1 : enter,
        transform: punch ? `scale(${punchScale})` : `scale(${lerp(0.94, 1, enter)})`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transformOrigin: '0 0',
          transform: cam.transform,
          filter: blur > 0.05 ? `blur(${blur}px)` : 'none',
        }}
      >
        <Pic item={item} style={{width: '100%', height: '100%', objectFit: 'cover', display: 'block'}} />
      </div>
      {showLens ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 2,
            pointerEvents: 'none',
            opacity: lensFade,
            background: `radial-gradient(circle at ${(cam.focusX * 100).toFixed(2)}% ${(cam.focusY * 100).toFixed(2)}%, transparent 18%, rgba(6,4,44,.62) 100%)`,
          }}
        />
      ) : null}
      <CornerBrackets />
      <div
        style={{
          position: 'absolute',
          left: cq(3),
          bottom: cq(3.2),
          zIndex: 3,
          display: 'flex',
          gap: cq(1.4),
          alignItems: 'center',
          background: 'rgba(10,14,80,.62)',
          border: `${cq(0.2)}px solid ${COLORS.glassline}`,
          borderRadius: cq(1.2),
          padding: `${cq(1.1)}px ${cq(1.8)}px`,
          font: `700 ${cq(2.2)}px/1 ${FONTS.mono}`,
          letterSpacing: '0.14em',
        }}
      >
        ZOOM{' '}
        <b style={{color: COLORS.amber, fontVariantNumeric: 'tabular-nums', minWidth: '5.6ch'}}>
          ×{scale.toFixed(1)}
        </b>
      </div>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: '#fff',
          opacity: punch ? 0 : (1 - flashT) * 0.9,
          zIndex: 4,
          pointerEvents: 'none',
        }}
      />
      {children}
    </div>
  );
}

function Timeline({local, settings, hint}) {
  const ZS = settings.zoomStart;
  const ZD = settings.zoomDuration;
  const enter = gsapTween(local, 0.9, 0.5, power3Out);
  const prog = clamp01((local - ZS) / ZD);
  const pct = prog * 100;
  const raw = Math.max(0, ZD * (1 - prog));
  const pts = Math.max(0, Math.ceil(raw - 1e-6));
  const tickAge = pts - raw;
  const tickP = prog <= 0 ? 1 : clamp01(tickAge / 0.3);
  const tickScale = lerp(1.35, 1, elasticOut(tickP));
  const hon = local >= ZS + ZD * settings.hintAt;
  const hintOn = gsapTween(local, ZS + ZD * settings.hintAt, 0.3, backOut);

  const ticks = [];
  const n = ZD * 4;
  for (let ti = 0; ti <= n; ti++) {
    const maj = ti % 4 === 0;
    ticks.push(
      <i
        key={ti}
        style={{
          position: 'absolute',
          top: cq(6),
          left: `${(ti / n) * 100}%`,
          width: cq(0.2),
          height: maj ? cq(2) : cq(0.9),
          background: maj ? 'rgba(255,255,255,.8)' : 'rgba(255,255,255,.4)',
          transform: 'translateX(-50%)',
        }}
      />,
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: cq(3.6),
        width: '58%',
        alignSelf: 'center',
        height: cq(12),
        opacity: enter,
        transform: `translateY(${(1 - enter) * cq(3)}px)`,
        flexShrink: 0,
      }}
    >
      <div style={{flex: 1, position: 'relative', height: cq(11), minWidth: 0}}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: cq(3.6),
            height: cq(1.8),
            borderRadius: cq(2),
            background: 'rgba(255,255,255,.14)',
            border: `${cq(0.2)}px solid rgba(255,255,255,.4)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: cq(3.6),
            height: cq(1.8),
            width: `${pct}%`,
            borderRadius: cq(2),
            background: `linear-gradient(90deg, ${COLORS.amber}, ${COLORS.amber2})`,
            boxShadow: `0 0 ${cq(2.4)}px rgba(255,170,40,.75)`,
          }}
        />
        {ticks}
        <span
          style={{
            position: 'absolute',
            top: cq(9.4),
            left: 0,
            font: `700 ${cq(1.9)}px/1 ${FONTS.mono}`,
            letterSpacing: '0.14em',
            color: 'rgba(255,255,255,.75)',
            whiteSpace: 'nowrap',
          }}
        >
          CLOSE-UP
        </span>
        <span
          style={{
            position: 'absolute',
            top: cq(9.4),
            left: '100%',
            transform: 'translateX(-100%)',
            font: `700 ${cq(1.9)}px/1 ${FONTS.mono}`,
            letterSpacing: '0.14em',
            color: 'rgba(255,255,255,.75)',
            whiteSpace: 'nowrap',
          }}
        >
          FULL VIEW
        </span>
        <div
          style={{
            position: 'absolute',
            left: `${settings.hintAt * 100}%`,
            top: cq(4.5),
            width: cq(4.8),
            height: cq(4.8),
            borderRadius: '50%',
            transform: `translate(-50%, -50%) scale(${lerp(1, 1.3, hintOn)})`,
            background: hon ? COLORS.amber : '#2a1d6e',
            border: `${cq(0.35)}px solid rgba(255,255,255,.85)`,
            display: 'grid',
            placeItems: 'center',
            zIndex: 1,
            boxShadow: hon ? `0 0 ${cq(3)}px rgba(255,193,58,.9)` : 'none',
          }}
        >
          <svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke={hon ? '#111436' : '#fff'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
          </svg>
        </div>
        <div
          style={{
            position: 'absolute',
            left: `${settings.hintAt * 100}%`,
            top: cq(8.4),
            transform: 'translateX(-50%)',
            whiteSpace: 'nowrap',
            font: `700 ${cq(2.2)}px/1 ${FONTS.mono}`,
            letterSpacing: '0.14em',
            padding: `${cq(1)}px ${cq(2.2)}px`,
            borderRadius: cq(3),
            border: `${cq(0.2)}px solid ${hon ? COLORS.amber : COLORS.glassline}`,
            background: hon ? COLORS.amber : COLORS.glass,
            color: hon ? '#111436' : 'rgba(255,255,255,.75)',
            boxShadow: hon ? `0 0 ${cq(2.6)}px rgba(255,193,58,.7)` : 'none',
            zIndex: 1,
          }}
        >
          {hon ? hint : 'HINT'}
        </div>
        <div
          style={{
            position: 'absolute',
            top: cq(4.5),
            left: `${pct}%`,
            width: cq(8),
            height: cq(8),
            borderRadius: '50%',
            background: '#fff',
            border: `${cq(0.8)}px solid ${COLORS.amber2}`,
            color: '#111436',
            display: 'grid',
            placeItems: 'center',
            transform: 'translate(-50%, -50%)',
            boxShadow: `0 0 ${cq(3)}px rgba(255,170,40,.7)`,
            zIndex: 2,
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: -cq(1.5),
              borderRadius: '50%',
              border: `${cq(0.35)}px dashed rgba(255,255,255,.8)`,
              transform: `rotate(${(local * 360) / 5}deg)`,
            }}
          />
          <b
            style={{
              font: `700 ${cq(3.8)}px/1 ${FONTS.mono}`,
              display: 'block',
              transform: `scale(${tickScale})`,
            }}
          >
            {pts}
          </b>
        </div>
      </div>
    </div>
  );
}

function iris(local, kind, duration) {
  const openDur = 0.8;
  const closeDur = 0.6;
  let radius = 80;
  let scale = 1;
  if (kind === 'intro' || kind === 'outro') {
    if (local < openDur) {
      const p = expoOut(clamp01(local / openDur));
      radius = 80 * p;
      scale = lerp(1.15, 1, p);
    } else if (local > duration - closeDur) {
      const p = clamp01((local - (duration - closeDur)) / closeDur);
      radius = 80 * (1 - p * p * p);
      scale = 1;
    }
  } else if (kind === 'r') {
    radius = 80;
    if (local >= 3.4) {
      const p = clamp01((local - 3.4) / closeDur);
      radius = 80 * (1 - p * p * p);
    }
  } else {
    const p = expoOut(clamp01(local / openDur));
    radius = 80 * p;
    scale = lerp(1.15, 1, p);
  }
  return {
    clipPath: `circle(${radius}% at 50% 55%)`,
    transform: `scale(${scale})`,
  };
}

function IrisRing({local}) {
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

function CloseRing({local, duration}) {
  const start = duration - 0.6;
  const p = gsapTween(local, start, 0.6, (t) => t * t * t);
  const size = lerp(cq(230), 0, p);
  const opacity = p < 0.15 ? p / 0.15 : 1;
  if (local < start) return null;
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
        opacity,
      }}
    />
  );
}

function RevealFX({local}) {
  const flash = 1 - gsapTween(local, 0, 0.7, power3Out);
  const shine = gsapTween(local, 0.25, 1, power3Out);
  const pop = gsapTween(local, 0.45, 0.6, elasticOut);
  const draw = gsapTween(local, 0.8, 0.4, power3Out);
  const sparks = [];
  for (let k = 0; k < 18; k++) {
    const a = (k * 20 * Math.PI) / 180;
    const d = cq(24 + ((k * 7) % 3) * 9);
    const p = gsapTween(local, 0.05, 1.3, expoOut);
    sparks.push(
      <i
        key={k}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: cq(1.6),
          height: cq(1.6),
          margin: `${-cq(0.8)}px 0 0 ${-cq(0.8)}px`,
          borderRadius: '50%',
          background: k % 3 ? COLORS.amber : '#fff',
          boxShadow: `0 0 ${cq(1.6)}px ${k % 3 ? COLORS.amber : '#fff'}`,
          zIndex: 5,
          transform: `translate(${Math.cos(a) * d * p}px, ${Math.sin(a) * d * p}px) scale(${lerp(1.4, 0.2, p)})`,
          opacity: 1 - p,
        }}
      />,
    );
  }
  const pulses = [0, 0.2].map((delay, i) => {
    const p = gsapTween(local, delay, 0.9, expoOut);
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
          border: `${i ? cq(0.4) : cq(0.8)}px solid ${COLORS.amber}`,
          boxShadow: `0 0 ${cq(4)}px rgba(255,193,58,.7)`,
          zIndex: 7,
          pointerEvents: 'none',
          transform: `scale(${lerp(0.2, 3.4, p)})`,
          opacity: 1 - p,
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
        <svg viewBox="0 0 24 24" width="58%" height="58%" fill="none" stroke="#111436" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
          <path pathLength="24" d="M5 12.5l4.5 4.5L19 7.5" style={{strokeDasharray: 24, strokeDashoffset: 24 * (1 - draw)}} />
        </svg>
      </div>
      {pulses}
    </>
  );
}

function Watermark({t, settings}) {
  const enter = gsapTween(t, 0.2, 0.7, backOut);
  const glintCycle = Math.max(0, t - 1.6);
  const glintLocal = glintCycle % 6;
  const glintP = easeInOut(clamp01(glintLocal / (6 * 0.2)));
  const breathe = 0.5 + 0.5 * Math.sin((t / 3.4) * Math.PI * 2);
  const parts = String(settings.watermark || 'QUIZ MATRIX').trim().split(/\s+/);
  const last = parts.length > 1 ? parts.pop() : '';
  const first = parts.join(' ') || last;
  const pos = settings.watermarkPosition || 'tr';
  return (
    <div
      style={{
        position: 'absolute',
        zIndex: 8,
        display: 'flex',
        alignItems: 'center',
        gap: cq(1.4),
        color: '#fff',
        opacity: (settings.watermarkOpacity ?? 0.7) * enter,
        pointerEvents: 'none',
        font: `700 ${cq(2.3)}px/1 ${FONTS.mono}`,
        letterSpacing: '0.2em',
        top: cq(3.2),
        right: pos === 'tl' ? 'auto' : cq(5),
        left: pos === 'tl' ? cq(5) : 'auto',
        transform: `translateY(${(1 - enter) * -cq(1.6)}px) scale(${lerp(0.92, 1, enter)})`,
      }}
    >
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          gap: cq(1.6),
          padding: `${cq(1)}px ${cq(2.4)}px ${cq(1)}px ${cq(1.4)}px`,
          borderRadius: cq(3),
          background: 'rgba(14,8,60,.42)',
          border: `${cq(0.2)}px solid rgba(255,255,255,.4)`,
          backdropFilter: 'blur(3px)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(105deg, transparent 38%, rgba(255,255,255,.6) 50%, transparent 62%)',
            transform: `translateX(${lerp(-130, 130, glintP)}%)`,
            pointerEvents: 'none',
          }}
        />
        <Img
          src={staticFile('images/logo.svg')}
          style={{
            maxHeight: cq(6.4),
            maxWidth: cq(18),
            objectFit: 'contain',
            display: 'block',
            filter: `drop-shadow(0 0 ${lerp(cq(0.6), cq(1.7), breathe)}px rgba(255,200,60,${lerp(0.5, 1, breathe)}))`,
          }}
        />
        <span style={{display: 'flex', flexDirection: 'column', lineHeight: 1.15}}>
          <b style={{fontWeight: 700, color: '#fff'}}>{first}</b>
          {last && first !== last ? <i style={{fontStyle: 'normal', color: COLORS.amber}}>{last}</i> : null}
        </span>
      </div>
    </div>
  );
}

function Stage({t, series, children}) {
  const colors = seriesColors(series);
  const gridSize = cq(7);
  const gridShift = ((t % 14) / 14) * gridSize;
  const sweepT = easeInOut((t % 7) / 7);
  const sweepX = -80 + sweepT * 300;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(120% 90% at 8% 0%, ${colors.b1} 0%, ${colors.b2} 48%, ${colors.b3} 100%)`,
        overflow: 'hidden',
        color: '#fff',
        fontFamily: FONTS.mono,
      }}
    >
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,.075) ${cq(0.15)}px, transparent ${cq(0.15)}px), linear-gradient(90deg, rgba(255,255,255,.075) ${cq(0.15)}px, transparent ${cq(0.15)}px)`,
          backgroundSize: `${gridSize}px ${gridSize}px`,
          backgroundPosition: `${gridShift}px ${gridShift}px`,
          maskImage: 'radial-gradient(90% 80% at 50% 45%, #000 30%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(90% 80% at 50% 45%, #000 30%, transparent 100%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          width: '60%',
          background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,.10) 50%, transparent 65%)',
          transform: `translateX(${sweepX}%)`,
          pointerEvents: 'none',
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(120% 100% at 50% 50%, transparent 55%, ${colors.vig} 100%)`,
          pointerEvents: 'none',
        }}
      />
      {children}
    </AbsoluteFill>
  );
}

function Wordmark({local, settings}) {
  const inP = gsapTween(local, 0.15, 0.45, backOut);
  const move = easeInOut(clamp01((local - 1.0) / 0.55));
  const dim = 1 - clamp01((local - 0.95) / 0.5);
  const y = -(settings.height / 2 - cq(5.6)) * move;
  const s = lerp(1, 0.2, move);
  return (
    <div style={{position: 'absolute', inset: 0, zIndex: 9, pointerEvents: 'none'}}>
      <div style={{position: 'absolute', inset: 0, background: 'rgba(6,4,44,.72)', opacity: dim}} />
      <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <div
          style={{
            font: `400 ${cq(26)}px/1 ${FONTS.display}`,
            letterSpacing: '0.02em',
            color: '#fff',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: cq(3),
            textShadow: `0 ${cq(0.8)}px 0 rgba(20,8,90,.9), 0 0 ${cq(5)}px rgba(255,193,58,.4)`,
            opacity: inP,
            transform: `translateY(${y}px) scale(${lerp(0.6, 1, inP) * s})`,
          }}
        >
          <LensMark size={cq(22)} />
          <span>
            {String(settings.brandLeft).toUpperCase()} <span style={{color: COLORS.amber}}>{String(settings.brandRight).toUpperCase()}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function Intro({local, duration, settings}) {
  const ir = iris(local, 'intro', duration);
  const item = {
    image: settings.introImage,
    art: settings.introArt,
    pic: settings.introPic,
    fx: settings.introFx,
    fy: settings.introFy,
    z0: settings.introZ0,
  };
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: cq(2.2),
        padding: `${cq(8.4)}px ${cq(5)}px ${cq(4.6)}px`,
        color: '#fff',
        clipPath: ir.clipPath,
        transform: ir.transform,
      }}
    >
      <div style={{marginTop: cq(1), textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
        <Words words={settings.introHeadline} local={local} size={cq(10.5)} amberFrom={settings.introAmberFrom} slam slamDelay={settings.introHookDelay ?? 0.15} />
        {settings.introSub ? (
          <div
            style={{
              marginTop: cq(0.6),
              font: `700 ${cq(2.5)}px/1 ${FONTS.mono}`,
              letterSpacing: '0.28em',
              color: '#fff',
              opacity: gsapTween(local, 0.9, 0.5, power3Out) * 0.9,
              transform: `translateY(${(1 - gsapTween(local, 0.9, 0.5, power3Out)) * cq(1.5)}px)`,
            }}
          >
            {settings.introSub}
          </div>
        ) : null}
      </div>
      <PhotoCard
        item={item}
        local={local}
        zoomDelay={settings.introZoomDelay}
        zoomDur={settings.introZoomDuration}
        cardDelay={settings.introZoomDelay}
        flashDelay={settings.introZoomDelay}
        showLens={false}
      />
      <IrisRing local={local} />
      <CloseRing local={local} duration={duration} />
      <Wordmark local={local} settings={settings} />
    </div>
  );
}

function Question({local, q, index, total, settings}) {
  const ir = iris(local, 'q', 14);
  const full = local >= settings.zoomStart + settings.zoomDuration - 0.02;
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
      <TopBar index={index} total={total} local={local} level={q.level} />
      <div style={{textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: cq(0.8)}}>
        <Words words={q.question} local={local} size={cq(7.4)} amberAt={q.highlight} />
      </div>
      <PhotoCard
        item={q}
        local={local}
        zoomDelay={settings.zoomStart}
        zoomDur={settings.zoomDuration}
        cardDelay={0.35}
        flashDelay={0.35}
        showLens
        locked={full}
      />
      <Timeline local={local} settings={settings} hint={q.hint} />
      <IrisRing local={local} />
    </div>
  );
}

function Reveal({local, q, index, total, settings, duration}) {
  const ir = iris(local, 'r', duration);
  const eye = gsapTween(local, 0.2, 0.4, expoOut);
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
      <TopBar index={index} total={total} local={local} level={q.level} />
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
            opacity: eye,
          }}
        >
          {settings.correctEyebrow}
        </div>
        <LetterSlam text={q.answer} local={local} size={cq(7.4)} />
      </div>
      <PhotoCard
        item={q}
        local={local}
        zoomDelay={0}
        zoomDur={0}
        cardDelay={0}
        flashDelay={99}
        showLens={false}
        locked
        punch
        forceScale={1}
      >
        <RevealFX local={local} />
      </PhotoCard>
      <div style={{flex: 'none', height: cq(12)}} />
      <CloseRing local={local} duration={duration} />
    </div>
  );
}

function Outro({local, duration, settings, total}) {
  const ir = iris(local, 'outro', duration);
  const eye = gsapTween(local, 0.2, 0.4, expoOut);
  const big = gsapTween(local, 0.6, 0.5, backOut);
  const rule = gsapTween(local, 0.55, 0.5, expoOut);
  const sub = gsapTween(local, 0.7, 0.5, power3Out);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        clipPath: ir.clipPath,
        transform: ir.transform,
        padding: `${cq(3.4)}px ${cq(5)}px ${cq(4.6)}px`,
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: cq(3),
          textAlign: 'center',
        }}
      >
        <div
          style={{
            font: `700 ${cq(2.8)}px/1 ${FONTS.mono}`,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            color: COLORS.amber,
            opacity: eye,
          }}
        >
          {settings.outroEyebrow}
        </div>
        <div
          style={{
            font: `400 ${cq(30)}px/.95 ${FONTS.display}`,
            color: COLORS.amber,
            opacity: big,
            transform: `scale(${lerp(0.94, 1, big)})`,
          }}
        >
          ?<small style={{fontSize: cq(9), color: '#fff', opacity: 0.8}}> /{total}</small>
        </div>
        <Words words={settings.outroTitle} local={local} size={cq(17)} />
        <div
          style={{
            width: cq(12),
            height: cq(1.3),
            borderRadius: cq(1),
            background: `linear-gradient(90deg, ${COLORS.amber}, ${COLORS.amber2})`,
            transformOrigin: 'left',
            transform: `scaleX(${rule})`,
          }}
        />
        <div
          style={{
            font: `700 ${cq(2.8)}px/1.4 ${FONTS.mono}`,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            opacity: sub,
            transform: `translateY(${(1 - sub) * cq(3)}px)`,
          }}
        >
          {settings.outroSub}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: cq(2),
            marginTop: cq(1.5),
            opacity: sub,
            font: `400 ${cq(7)}px/1 ${FONTS.display}`,
            letterSpacing: '0.02em',
          }}
        >
          <LensMark size={cq(7.5)} />
          <span>
            {String(settings.brandLeft).toUpperCase()} <span style={{color: COLORS.amber}}>{String(settings.brandRight).toUpperCase()}</span>
          </span>
        </div>
      </div>
      <IrisRing local={local} />
      <CloseRing local={local} duration={duration} />
    </div>
  );
}

function Sting({local, settings}) {
  const ir = iris(local, 'sting', settings.stingDuration);
  const lit = gsapTween(local, 0.15, 0.9, expoOut);
  const glow = gsapTween(local, 0.15, 0.9, expoOut);
  const flash = 1 - gsapTween(local, 0.15, 0.5, power3Out);
  const angles = [-150, -120, -90, -60, -30];
  const rays = angles.map((deg, i) => {
    const r = (deg * Math.PI) / 180;
    const p = gsapTween(local, 0.3 + i * 0.05, 0.45, expoOut);
    const x1 = 50 + 56 * Math.cos(r);
    const y1 = 52 + 56 * Math.sin(r);
    const x2 = 50 + 70 * Math.cos(r);
    const y2 = 52 + 70 * Math.sin(r);
    return (
      <path
        key={i}
        d={`M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`}
        pathLength="10"
        stroke="#ffe27a"
        strokeWidth="4.5"
        strokeLinecap="round"
        fill="none"
        strokeDasharray="10"
        strokeDashoffset={10 * (1 - p)}
      />
    );
  });
  const side = gsapTween(local, 0.3 + 5 * 0.05, 0.45, expoOut);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        clipPath: ir.clipPath,
        transform: ir.transform,
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: cq(3),
          textAlign: 'center',
        }}
      >
        <div style={{position: 'relative', width: cq(34), height: cq(36), display: 'grid', placeItems: 'center'}}>
          <div
            style={{
              position: 'absolute',
              inset: '-18%',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,224,110,.85), rgba(255,200,60,0) 62%)',
              opacity: lerp(0, 0.8, glow),
              transform: `scale(${lerp(0.4, 1, glow)})`,
            }}
          />
          <svg viewBox="-30 -26 160 170" style={{position: 'absolute', inset: '-4%', width: '108%', height: '108%', overflow: 'visible'}}>
            {rays}
            <path d="M-12 56L-26 58" pathLength="10" stroke="#ffe27a" strokeWidth="4.5" strokeLinecap="round" fill="none" strokeDasharray="10" strokeDashoffset={10 * (1 - side)} />
            <path d="M112 56L126 58" pathLength="10" stroke="#ffe27a" strokeWidth="4.5" strokeLinecap="round" fill="none" strokeDasharray="10" strokeDashoffset={10 * (1 - side)} />
          </svg>
          <div
            style={{
              position: 'relative',
              width: '62%',
              filter: `brightness(${lerp(0.55, 1, lit)}) saturate(${lerp(0.6, 1, lit)})`,
              transform: `scale(${lerp(0.9, 1, lit)})`,
            }}
          >
            <Img src={staticFile('images/logo.svg')} style={{width: '100%', height: 'auto', display: 'block'}} />
          </div>
        </div>
        <Words words={settings.stingWords} local={local} delay={0.1} size={cq(12)} />
      </div>
      <div style={{position: 'absolute', inset: 0, background: '#fff', opacity: flash * 0.55, pointerEvents: 'none'}} />
      <IrisRing local={local} />
    </div>
  );
}

export const Round = ({questions, settings}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const {scenes} = buildScenes(settings, questions);
  const k = sceneAt(t, scenes);
  const s = scenes[k];
  const local = t - s.start;
  const n = questions.length;

  let scene = null;
  if (s.type === 'intro') scene = <Intro local={local} duration={s.d} settings={settings} />;
  else if (s.type === 'level') scene = <LevelCard local={local} duration={s.d} questions={questions} level={s.level} />;
  else if (s.type === 'q') scene = <Question local={local} q={questions[s.i]} index={s.i} total={n} settings={settings} />;
  else if (s.type === 'r') scene = <Reveal local={local} q={questions[s.i]} index={s.i} total={n} settings={settings} duration={s.d} />;
  else if (s.type === 'outro') scene = <Outro local={local} duration={s.d} settings={settings} total={n} />;
  else scene = <Sting local={local} settings={settings} />;

  return (
    <AbsoluteFill>
      <Fonts />
      <QuizAudio />
      <Stage t={t} series={settings.series}>
        {scene}
        <Watermark t={t} settings={settings} />
      </Stage>
    </AbsoluteFill>
  );
};

export default Round;
