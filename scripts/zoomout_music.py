#!/usr/bin/env python3
"""
Zoom Out — continuous background music.

One groove runs under the WHOLE video (it does not restart or rebuild for each round).
A seamless 16-bar loop is rendered in four mixes (base / +melody / full / breather) and
chained in a long-form order so it feels alive for 10+ minutes without ever resetting.

  python3 zoomout_music.py --rounds 50 --zoom 8 --lead 1 --hold 2 --answer 3 --out public/sounds/background

The timing flags only decide the total length (use the same values as settings.json).
Needs: numpy, scipy (ffmpeg optional, for the .mp3).
"""
import argparse, shutil, subprocess, wave
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

ap = argparse.ArgumentParser()
ap.add_argument('--rounds', type=int, default=4)
ap.add_argument('--zoom', type=float, default=12.0)
ap.add_argument('--lead', type=float, default=1.5)
ap.add_argument('--hold', type=float, default=0.5)
ap.add_argument('--answer', type=float, default=4.0)
ap.add_argument('--intro', type=float, default=5.5)
ap.add_argument('--outro', type=float, default=4.0)
ap.add_argument('--sting', type=float, default=1.3)
ap.add_argument('--cards', type=int, default=0, help='number of level title cards')
ap.add_argument('--card', type=float, default=2.5, help='length of each level card')
ap.add_argument('--bonus', type=int, default=0, help='number of bonus rounds spliced in')
ap.add_argument('--bonus-dur', type=float, default=13.0, help='length of each bonus round')
ap.add_argument('--level', type=float, default=-22.0, help='average loudness in dBFS RMS (quiet bed under the SFX)')
ap.add_argument('--bpm', type=float, default=120.0)
ap.add_argument('--out', default='zoomout_music')
a = ap.parse_args()

SR = 44100
QLEN = a.lead + a.zoom + a.hold
TOTAL = a.intro + a.cards * a.card + max(1, a.rounds) * (QLEN + a.answer) + a.bonus * a.bonus_dur + a.outro + a.sting


def plan_total():
    """Real video length from src/plan.cjs (source of truth). Falls back to None."""
    import os
    root = os.path.dirname(os.path.abspath(__file__)) + '/..'
    try:
        r = subprocess.run(
            ['node', '--input-type=module', '-e',
             "import {getTotalSeconds} from './src/timing.js'; import fs from 'fs'; "
             "const q = JSON.parse(fs.readFileSync('questions.json')); "
             "const s = JSON.parse(fs.readFileSync('settings.json')); "
             "console.log(getTotalSeconds(s, q));"],
            capture_output=True, text=True, cwd=root)
        v = float(r.stdout.strip())
        return v if v > 0 else None
    except Exception:
        return None


# The timing flags above are only an approximation; when the scene plan is
# available it always wins (needs +1s headroom for SFX tails).
_real = plan_total()
if _real:
    TOTAL = max(TOTAL, _real + 1.0)
    print(f'scene plan total {_real:.2f}s -> music length {TOTAL:.2f}s')
else:
    print(f'timing flags only -> music length {TOTAL:.2f}s')

BAR = 4 * 60.0 / a.bpm
BARS = 16
NL = int(round(BARS * BAR * SR))
TAIL = int(2.5 * SR)
rng = np.random.default_rng(11)


def hz(m): return 440.0 * 2 ** ((m - 69) / 12)
def hp(x, f): return sosfilt(butter(2, f, 'high', fs=SR, output='sos'), x)
def bp(x, lo, hi): return sosfilt(butter(2, [lo, hi], 'band', fs=SR, output='sos'), x)


# ---------------------------------------------------------------- instruments
def marimba(m, d=.5):
    n = int(d * SR); t = np.arange(n) / SR; f = hz(m)
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / .11)
    x += .35 * np.sin(8 * np.pi * f * t) * np.exp(-t / .025) + .12 * np.sin(4 * np.pi * f * t) * np.exp(-t / .06)
    return x * np.minimum(t / .003, 1)

def pluck(m, d=.35):
    n = int(d * SR); t = np.arange(n) / SR; f = hz(m)
    x = np.sin(2 * np.pi * f * t) + .35 * np.sin(4 * np.pi * f * t) * np.exp(-t / .05)
    return x * np.exp(-t / .12) * np.minimum(t / .004, 1)

def bell(m, d=.9):
    n = int(d * SR); t = np.arange(n) / SR; f = hz(m)
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / .30) + .28 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / .10)
    return x * np.minimum(t / .002, 1)

def pad(m, d):
    n = int(d * SR); t = np.arange(n) / SR; f = hz(m)
    x = np.sin(2 * np.pi * f * t) + .4 * np.sin(2 * np.pi * f * 2 * t) + .15 * np.sin(2 * np.pi * f * 3 * t)
    return x * np.minimum(t / .4, 1) * np.minimum((d - t) / .4, 1)

def woodblock(f=950):
    n = int(.07 * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * f * t) * np.exp(-t / .014) + .3 * np.sin(2 * np.pi * f * 1.5 * t) * np.exp(-t / .01)

def hat():
    n = int(.045 * SR); t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 6500) * np.exp(-t / .012)

def shaker():
    n = int(.05 * SR); t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 8000) * np.minimum(t / .012, 1) * np.exp(-t / .02)

def clap():
    n = int(.12 * SR); t = np.arange(n) / SR
    return bp(rng.standard_normal(n), 1200, 3500) * np.exp(-t / .035)

def kick():
    n = int(.18 * SR); t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t * 12)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / .06)


# ---------------------------------------------------------------- harmony: 16 bars, C major
C_ = (60, [0, 4, 7]); G_ = (55, [0, 4, 7]); Am = (57, [0, 3, 7]); F_ = (53, [0, 4, 7])
PROG = [C_, G_, Am, F_,  C_, G_, F_, G_,  Am, F_, C_, G_,  Am, F_, G_, G_]
MA = [0, None, 1, None, 2, 1, 0, None]
MB = [2, None, 1, None, 0, 1, 2, 'top']
MFAST = [0, 1, 2, 'top', 2, 1, 0, 1]
MELODY = {                       # one bar of hook per chord (8th-note slots)
    id(C_): [76, None, 79, None, 81, 79, 76, None],
    id(G_): [74, None, 79, None, 83, 79, 74, None],
    id(Am): [72, None, 76, None, 81, 76, 72, None],
    id(F_): [72, None, 77, None, 81, 77, 72, None],
}
RUN = [79, 81, 83, 84, 83, 81, 79, None]    # turnaround at the end of every 4-bar phrase


def render_loop(v):
    """v: 0 base, 1 +melody, 2 full, 3 breather. Returns seamless (L, R) of NL samples."""
    Lb = np.zeros(NL + TAIL); Rb = np.zeros(NL + TAIL)

    def add(sig, t, g=1.0, pan=0.0):
        i = int(t * SR)
        if i < 0 or i >= len(Lb): return
        s = sig[:len(Lb) - i]
        Lb[i:i + len(s)] += s * g * (1 - max(0, pan)); Rb[i:i + len(s)] += s * g * (1 + min(0, pan))

    slot = BAR / 8
    for b in range(BARS):
        root, iv = PROG[b]
        phrase_end = (b % 4 == 3)
        first_half = b < 8
        kick_on = v in (0, 1, 2) or (v == 3 and not first_half)
        bells_on = v in (1, 2) or (v == 3 and not first_half)
        full = v == 2
        pat = MA if b % 2 == 0 else MB
        if full and phrase_end: pat = MFAST
        for n in iv:                                         # warm pad under every bar
            add(pad(root + n, BAR * 1.08), b * BAR, .028 if v != 3 else .04, pan=.0)
        for s8 in range(8):
            tt = b * BAR + s8 * slot
            bv = {0: root - 12, 3: root - 5, 4: root - 12, 6: root - 5}
            if s8 in bv: add(pluck(bv[s8]), tt, .42, pan=-.1)
            idx = pat[s8]
            if idx is not None:
                m = root + 12 + (12 if idx == 'top' else iv[idx])
                add(marimba(m), tt, .15, pan=.2)
                if full: add(marimba(m + 12), tt + .012, .06, pan=-.2)
            if s8 in (2, 6): add(woodblock(950 if s8 == 2 else 780), tt, .12, pan=.35)
            if s8 % 2 == 0: add(hat(), tt, .045 if v != 3 else .03, pan=-.3)
            if full and s8 % 2 == 1: add(hat(), tt, .028, pan=.3)
            if full: add(shaker(), tt + slot / 2, .02, pan=.15)
            if full and s8 in (2, 6): add(clap(), tt, .045)
            if kick_on and s8 in (0, 4): add(kick(), tt, .26)
            if bells_on:
                mel = RUN if phrase_end else MELODY[id(PROG[b])]
                note = mel[s8]
                if note is not None: add(bell(note), tt, .075, pan=.1)
    L = Lb[:NL].copy(); R = Rb[:NL].copy()
    L[:TAIL] += Lb[NL:NL + TAIL]; R[:TAIL] += Rb[NL:NL + TAIL]      # fold tails -> seamless loop
    ir_n = int(.6 * SR)
    ir = rng.standard_normal(ir_n) * np.exp(-np.arange(ir_n) / (.14 * SR)); ir[0] = 0
    def circ(x):                                                     # circular reverb: no seam
        y = fftconvolve(np.tile(x, 3), ir)[NL:2 * NL]
        return x + .06 * y
    return circ(L), circ(R)


SEQ = [0, 1, 1, 2, 1, 2, 2, 3]          # long-form order, repeats for the whole video
need = int(np.ceil(TOTAL * SR / NL))
cache = {}
Ls, Rs = [], []
for k in range(need):
    v = SEQ[k % len(SEQ)]
    if v not in cache: cache[v] = render_loop(v)
    Ls.append(cache[v][0]); Rs.append(cache[v][1])
n_out = int(TOTAL * SR)
Lm = np.concatenate(Ls)[:n_out]; Rm = np.concatenate(Rs)[:n_out]

fi, fo = int(1.0 * SR), int(2.0 * SR)
Lm[:fi] *= np.linspace(0, 1, fi); Rm[:fi] *= np.linspace(0, 1, fi)
Lm[-fo:] *= np.linspace(1, 0, fo); Rm[-fo:] *= np.linspace(1, 0, fo)
gain = 10 ** (a.level / 20) / np.sqrt(np.mean(np.concatenate([Lm, Rm]) ** 2))
Lm *= gain; Rm *= gain
pk = max(abs(Lm).max(), abs(Rm).max()); cap = 10 ** (-3 / 20)
if pk > cap: Lm *= cap / pk; Rm *= cap / pk
pcm = (np.stack([Lm, Rm], 1) * 32767).astype('<i2')
wav = a.out + '.wav'
with wave.open(wav, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print(f'rounds={a.rounds} duration={TOTAL:.1f}s ({int(TOTAL // 60)}:{int(TOTAL % 60):02d}) loop={BARS * BAR:.1f}s x{need} -> {wav}')
if shutil.which('ffmpeg'):
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '192k', a.out + '.mp3'])
    print('also wrote', a.out + '.mp3')
