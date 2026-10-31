#!/usr/bin/env python3
"""
Sidechain-style ducking: dips the background music while a sound effect (tick, hit, whoosh,
sparkle, ...) plays, so the cues stay clear WITHOUT making the music quieter overall.

Reads  public/sounds/background.wav  (raw music)  and  public/sounds/sfx.wav
Writes public/sounds/background.mp3  (ducked, loudness-matched)  and  public/sounds/sfx.mp3

Run via `npm run audio` (music -> synth-audio -> duck). Needs numpy, scipy, ffmpeg.
"""
import argparse, shutil, subprocess, wave
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('--dir', default='public/sounds')
ap.add_argument('--depth', type=float, default=0.6, help='max music reduction while an SFX plays (0.6 = about -8 dB)')
ap.add_argument('--release', type=float, default=0.4, help='seconds for the music to swell back')
ap.add_argument('--lookahead', type=float, default=0.03, help='music starts dipping this long before the SFX')
a = ap.parse_args()


def read(path):
    with wave.open(path) as w:
        sr, ch, n = w.getframerate(), w.getnchannels(), w.getnframes()
        x = np.frombuffer(w.readframes(n), '<i2').astype(np.float64) / 32768
    return sr, x.reshape(-1, ch)


sr, bg = read(f'{a.dir}/background.wav')
sr2, sfx = read(f'{a.dir}/sfx.wav')
assert sr == sr2
n = len(bg)
FR = int(sr * 0.01)                                  # 10 ms frames
nf = n // FR + 1
sm = np.abs(sfx).max(axis=1)
sm = np.pad(sm, (0, max(0, nf * FR - len(sm))))[:nf * FR]
peak = sm.reshape(nf, FR).max(axis=1)
from scipy.ndimage import uniform_filter1d
slow = uniform_filter1d(peak, size=80)                 # ~0.8 s average: long risers/sustains do NOT duck
trans = np.maximum(peak - 1.15 * slow, 0)              # only short, punchy cues (ticks, hits, whooshes) trigger it
ref = np.percentile(trans[trans > 1e-4], 75) if np.any(trans > 1e-4) else 1.0
target = np.clip(trans / ref, 0, 1)
target = np.roll(target, -int(round(a.lookahead / 0.01)))   # dip slightly BEFORE the cue
rel = np.exp(-0.01 / a.release)
env = np.zeros(nf)
for i in range(nf):                                   # instant attack, smooth release
    env[i] = max(target[i], env[i - 1] * rel if i else 0)
gain_f = 1 - a.depth * env
t_f = (np.arange(nf) + 0.5) * 0.01
gain = np.interp(np.arange(n) / sr, t_f, gain_f)[:, None]
duck = bg * gain

rms = lambda x: np.sqrt(np.mean(x ** 2))
makeup = rms(bg) / rms(duck)                          # keep the overall level the same
duck *= makeup
pk = np.abs(duck).max(); cap = 10 ** (-3 / 20)
if pk > cap: duck *= cap / pk
pcm = (duck * 32767).astype('<i2')
tmp = f'{a.dir}/_ducked.wav'
with wave.open(tmp, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr); w.writeframes(pcm.tobytes())
if shutil.which('ffmpeg'):
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-c:a', 'libmp3lame', '-b:a', '192k', f'{a.dir}/background.mp3'])
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', f'{a.dir}/sfx.wav', '-c:a', 'libmp3lame', '-b:a', '192k', f'{a.dir}/sfx.mp3'])
import os; os.remove(tmp)
print(f'ducked music: depth {a.depth:.2f} ({20*np.log10(1-a.depth):.1f} dB max), '
      f'music dipped more than 3 dB for {np.mean(gain_f < 10 ** (-3 / 20)) * 100:.0f}% of the video, loudness kept (makeup {20*np.log10(makeup):+.1f} dB)')
print('wrote', f'{a.dir}/background.mp3', 'and', f'{a.dir}/sfx.mp3')
