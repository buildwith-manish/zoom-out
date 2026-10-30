#!/usr/bin/env python3
"""
Zoom Out Quiz - funny / playful background music generator.

Makes a background track that fits the video timeline for ANY number of rounds
and ANY zoom length. Every scene is a whole number of bars, so the music never
cuts or jumps at a scene change.

Timeline (same as the HTML video):
  Intro  = 5.5 s
  Round  = QUESTION (LEAD 1.5 + ZOOM 12 + HOLD 0.5) + ANSWER (4.0)   (repeated N times)
  Outro  = 4.0 s
  Sting  = 1.3 s  (logo flash at the very end)
  Total  = 5.5 + N * (LEAD + ZOOM + HOLD + 4) + 4 + 1.3

Usage:
  python3 zoomout_music.py                              -> 4 rounds, 12 s zoom  (82.8 s)
  python3 zoomout_music.py --rounds 10                  -> 10 rounds
  python3 zoomout_music.py --rounds 6 --zoom 8          -> shorter 8 s zooms
  python3 zoomout_music.py --rounds 8 --level -26       -> quieter bed (for voice-over)
  python3 zoomout_music.py --rounds 5 --out my_quiz     -> my_quiz.wav (+ my_quiz.mp3 if ffmpeg exists)

Needs: pip install numpy scipy      (ffmpeg optional, only for the mp3)
Tip: the duration printed at the end must equal your video length. If it does not,
check --rounds, --zoom (and --lead / --hold if you changed them in the video).
No sound effects: only music (marimba, plucked bass, woodblock, hats, soft drums).
"""
import argparse, shutil, subprocess, wave
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

ap = argparse.ArgumentParser()
ap.add_argument('--rounds', type=int, default=4, help='number of questions (min 1)')
ap.add_argument('--zoom', type=float, default=12.0, help='zoom-out length in seconds (video default 12)')
ap.add_argument('--lead', type=float, default=1.5, help='seconds before the zoom starts (video default 1.5)')
ap.add_argument('--hold', type=float, default=0.5, help='seconds after the zoom ends (video default 0.5)')
ap.add_argument('--answer', type=float, default=4.0, help='answer screen length (video default 4.0)')
ap.add_argument('--intro', type=float, default=5.5, help='intro length (video default 5.5)')
ap.add_argument('--outro', type=float, default=4.0, help='score screen length (video default 4.0)')
ap.add_argument('--sting', type=float, default=1.3, help='final logo sting length (video default 1.3)')
ap.add_argument('--level', type=float, default=-20.0, help='average loudness in dBFS RMS, lower = quieter')
ap.add_argument('--bpm', type=float, default=120.0, help='target tempo; nudged slightly so each scene is whole bars')
ap.add_argument('--out', default='zoomout_music', help='output name without extension')
a = ap.parse_args()

SR = 44100
NR = max(1, a.rounds)
QLEN = a.lead + a.zoom + a.hold
TOTAL = a.intro + NR * (QLEN + a.answer) + a.outro + a.sting
N = int(round(TOTAL * SR)) + SR
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(7)


def bars_for(length):
    """whole bars closest to the target tempo, so every scene ends exactly on a downbeat"""
    return max(1, int(round(length * a.bpm / 240.0)))


# ------------------------------------------------------------------ helpers
def hz(m): return 440.0 * 2 ** ((m - 69) / 12)
def hp(x, f): return sosfilt(butter(2, f, 'high', fs=SR, output='sos'), x)
def bp(x, lo, hi): return sosfilt(butter(2, [lo, hi], 'band', fs=SR, output='sos'), x)


def add(sig, t, g=1.0, pan=0.0):
    i = int(t * SR)
    if i < 0 or i >= N: return
    s = sig[:N - i]
    L[i:i + len(s)] += s * g * (1 - max(0, pan))
    R[i:i + len(s)] += s * g * (1 + min(0, pan))


# ------------------------------------------------------------------ instruments
def marimba(m, d=.5):
    n = int(d * SR); t = np.arange(n) / SR; f = hz(m)
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / .11)
    x += .35 * np.sin(8 * np.pi * f * t) * np.exp(-t / .025)
    x += .12 * np.sin(4 * np.pi * f * t) * np.exp(-t / .06)
    return x * np.minimum(t / .003, 1)


def pluck(m, d=.35):
    n = int(d * SR); t = np.arange(n) / SR; f = hz(m)
    x = np.sin(2 * np.pi * f * t) + .35 * np.sin(4 * np.pi * f * t) * np.exp(-t / .05)
    return x * np.exp(-t / .12) * np.minimum(t / .004, 1)


def woodblock(f=950):
    n = int(.07 * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * f * t) * np.exp(-t / .014) + .3 * np.sin(2 * np.pi * f * 1.5 * t) * np.exp(-t / .01)


def hat():
    n = int(.045 * SR); t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 6500) * np.exp(-t / .012)


def clap():
    n = int(.12 * SR); t = np.arange(n) / SR
    return bp(rng.standard_normal(n), 1200, 3500) * np.exp(-t / .035)


def kick():
    n = int(.18 * SR); t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t * 12)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / .06)


# ------------------------------------------------------------------ harmony (C major, cartoon-bouncy)
CHORDS = [(60, [0, 4, 7]), (57, [0, 3, 7]), (53, [0, 4, 7]), (55, [0, 4, 7])]   # C  Am  F  G
MA = [0, None, 1, None, 2, 1, 0, None]
MB = [2, None, 1, None, 0, 1, 2, 'top']
MFAST = [0, 1, 2, 'top', 2, 1, 0, 1]


def play_scene(kind, t0, length, gbar0, ridx=0):
    """Fill one scene with music. Returns the next global bar number."""
    nb = bars_for(length)
    bar = length / nb
    slot = bar / 8
    gb = gbar0
    for b in range(nb):
        root, iv = CHORDS[gb % 4]
        for s8 in range(8):
            tt = t0 + b * bar + s8 * slot
            loc = tt - t0
            bass_on = mar_on = wood = hats = hat16 = clp = kck = octv = False
            pat = MA if gb % 2 == 0 else MB
            if kind == 'intro':
                bass_on = mar_on = wood = True
                hats = loc > length * .35
                kck = loc > length * .7
            elif kind == 'q':
                if loc >= a.lead + a.zoom:          # short breath before the answer
                    continue
                p = float(np.clip((loc - a.lead) / a.zoom, 0, 1))
                bass_on = wood = True
                mar_on = loc >= a.lead * .9
                hats = p > .35
                kck = p > .5
                octv = p > .6
                hat16 = p > .75
                if p > .8: pat = MFAST
            elif kind == 'a':
                bass_on = mar_on = wood = hats = clp = kck = octv = True
                pat = MFAST
            elif kind == 'outro':
                bass_on = mar_on = wood = hats = clp = kck = True
                hat16 = False

            bv = {0: root - 12, 3: root - 5, 4: root - 12, 6: root - 5}
            if bass_on and s8 in bv:
                add(pluck(bv[s8]), tt, .45, pan=-.1)
            if mar_on:
                idx = pat[s8]
                if idx is not None:
                    m = root + 12 + (12 if idx == 'top' else iv[idx])
                    add(marimba(m), tt, .16, pan=.2)
                    if octv: add(marimba(m + 12), tt + .012, .07, pan=-.2)
            if wood and s8 in (2, 6):
                add(woodblock(950 if s8 == 2 else 780), tt, .14, pan=.35)
            if hats and s8 % 2 == 0:
                add(hat(), tt, .05, pan=-.3)
            if hat16 and s8 % 2 == 1:
                add(hat(), tt, .03, pan=.3)
            if clp and s8 in (2, 6):
                add(clap(), tt, .05)
            if kck and s8 in (0, 4):
                add(kick(), tt, .30)
        gb += 1
    return gb


# ================================================================== BUILD THE TIMELINE
t = 0.0
g = 0
g = play_scene('intro', t, a.intro, g); t += a.intro
for r in range(NR):
    g = play_scene('q', t, QLEN, g, r); t += QLEN
    g = play_scene('a', t, a.answer, g, r); t += a.answer
g = play_scene('outro', t, a.outro, g); t += a.outro
for j, off in enumerate([0, 4, 7, 12]):                 # closing sting chord
    add(marimba(72 + off, 1.2), t + j * .05, .12, pan=-.2 + .13 * j)
add(pluck(48, .9), t, .4)

# ================================================================== MASTER
ir_n = int(.35 * SR)
ir = rng.standard_normal(ir_n) * np.exp(-np.arange(ir_n) / (.08 * SR)); ir[0] = 0
Lm = (L + .05 * fftconvolve(L, ir)[:N])[:int(TOTAL * SR)]
Rm = (R + .05 * fftconvolve(R, ir)[:N])[:int(TOTAL * SR)]
fi, fo = int(.3 * SR), int(.8 * SR)
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
print(f'rounds={NR} zoom={a.zoom:g}s  duration={TOTAL:.1f}s  ({int(TOTAL // 60)}:{int(TOTAL % 60):02d})  -> {wav}')
if shutil.which('ffmpeg'):
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '192k', a.out + '.mp3'])
    print('also wrote', a.out + '.mp3')
