"""Original chiptune BGM for the promo (no samples, no licensing).

python promo/bgm.py promo/out/bgm.wav [seconds]
120 BPM, 2 s bars, C-G-Am-F. Layers come in with the video's sections:
intro arp -> + bass/kick (problem) -> + lead/snare (demo) -> final chord.
"""
import sys
import wave

import numpy as np

SR = 44100
BPM = 120
BEAT = 60 / BPM
BAR = 4 * BEAT
OUT = sys.argv[1] if len(sys.argv) > 1 else "bgm.wav"
LENGTH = float(sys.argv[2]) if len(sys.argv) > 2 else 38.0

N = int(LENGTH * SR) + SR
L = np.zeros(N)
R = np.zeros(N)
rng = np.random.default_rng(7)


def hz(note):
    names = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
    name, octave = note[:-1], int(note[-1])
    return 440 * 2 ** ((names[name] + 12 * (octave + 1) - 69) / 12)


def env(n, a=0.005, d=0.08, s=0.6, r=0.05):
    t = np.arange(n) / SR
    e = np.ones(n) * s
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    e[:na] = np.linspace(0, 1, na) if na else e[:na]
    e[na:na + nd] = np.linspace(1, s, len(e[na:na + nd]))
    if nr and n > nr:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def pulse(f, dur, duty=0.25):
    t = np.arange(int(dur * SR)) / SR
    ph = (t * f) % 1
    w = np.where(ph < duty, 1.0, -1.0)
    # soften the edges a little so the squares aren't harsh
    k = np.ones(6) / 6
    return np.convolve(w, k, mode="same")


def tri(f, dur):
    t = np.arange(int(dur * SR)) / SR
    return 2 * np.abs(2 * ((t * f) % 1) - 1) - 1


def add(buf, start, sig, gain, pan=0.0):
    i = int(start * SR)
    j = min(i + len(sig), N)
    if i >= N:
        return
    s = sig[: j - i] * gain
    L[i:j] += s * (1 - max(pan, 0))
    R[i:j] += s * (1 + min(pan, 0))


CHORDS = [  # (bass root, arp notes)
    ("C2", ["C4", "E4", "G4", "C5"]),
    ("G1", ["B3", "D4", "G4", "B4"]),
    ("A1", ["C4", "E4", "A4", "C5"]),
    ("F1", ["A3", "C4", "F4", "A4"]),
]

# lead phrases: (note or None, beats)
PHRASE_A = [
    [("E5", 1), ("G5", 1), ("A5", .5), ("G5", .5), ("E5", 1)],
    [("D5", 1), ("B4", .5), ("D5", .5), ("G5", 2)],
    [("C5", 1), ("E5", 1), ("A5", .5), ("G5", .5), ("E5", 1)],
    [("F5", 1), ("E5", .5), ("D5", .5), ("C5", 2)],
]
PHRASE_B = [
    [("G5", .5), ("E5", .5), ("G5", .5), ("C6", .5), ("B5", 1), ("G5", 1)],
    [("D5", .5), ("G5", .5), ("B5", .5), ("D6", .5), ("C6", 1), ("B5", 1)],
    [("A5", .5), ("E5", .5), ("A5", .5), ("C6", .5), ("B5", 1), ("A5", 1)],
    [("F5", 1), ("A5", .5), ("G5", .5), ("E5", 1), ("D5", 1)],
]

bars = int(LENGTH // BAR)
last = bars - 1  # final bar: one ringing chord
for b in range(bars):
    t0 = b * BAR
    root, arp = CHORDS[b % 4]
    if b == last:
        for k, n in enumerate(["C4", "E4", "G4", "C5"]):
            add(None, t0 + k * 0.03, pulse(hz(n), BAR) * env(int(BAR * SR), d=1.2, s=0.0, r=0.1), 0.05, pan=(k - 1.5) * 0.3)
        add(None, t0, tri(hz("C2"), BAR) * env(int(BAR * SR), d=1.5, s=0.0), 0.22)
        add(None, t0, np.sin(2 * np.pi * np.cumsum(np.linspace(120, 40, int(0.25 * SR))) / SR) * env(int(0.25 * SR), d=0.22, s=0), 0.5)
        break

    # arpeggio, 16ths, from the start
    arp_gain = 0.13 if b < 2 else 0.045
    for s in range(16):
        n = arp[[0, 1, 2, 3, 2, 1, 2, 3][s % 8]]
        d = BEAT / 4
        add(None, t0 + s * d, pulse(hz(n), d, duty=0.125) * env(int(d * SR), d=0.06, s=0.25, r=0.01), arp_gain, pan=0.35 if s % 2 else -0.35)

    # hats on 8ths from the start, open-ish on offbeats
    for s in range(8):
        d = 0.04 if s % 2 == 0 else 0.07
        nz = rng.uniform(-1, 1, int(d * SR))
        nz = np.diff(nz, prepend=0)  # crude high-pass
        add(None, t0 + s * BEAT / 2, nz * env(len(nz), a=0.001, d=d, s=0), 0.08)

    if b < 2:  # intro: held bass under the arp
        add(None, t0, tri(hz(root) * 2, BAR) * env(int(BAR * SR), a=0.05, d=0.4, s=0.8, r=0.1), 0.2)

    if b >= 2:  # bass: root, octave bounce on 8ths
        for s in range(8):
            f = hz(root) * (2 if s % 2 else 1)
            d = BEAT / 2
            add(None, t0 + s * d, tri(f, d) * env(int(d * SR), d=0.1, s=0.7, r=0.02), 0.2)
        for s in (0, 2) if b < 6 else (0, 1.5, 2):  # kick
            n = int(0.22 * SR)
            f = np.linspace(140, 45, n)
            kick = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, a=0.001, d=0.2, s=0)
            add(None, t0 + s * BEAT, kick, 0.38)

    if b >= 6:  # snare on 2 and 4
        for s in (1, 3):
            n = int(0.16 * SR)
            body = rng.uniform(-1, 1, n) * 0.8 + np.sin(2 * np.pi * 190 * np.arange(n) / SR) * 0.4
            add(None, t0 + s * BEAT, body * env(n, a=0.001, d=0.15, s=0), 0.16)

        phrase = PHRASE_A if b < 14 else PHRASE_B
        tt = t0
        for n, beats in phrase[b % 4]:
            d = beats * BEAT
            if n:
                tone = pulse(hz(n), d, duty=0.25) * env(int(d * SR), a=0.004, d=0.12, s=0.55, r=0.03)
                # light vibrato-free echo for space
                add(None, tt, tone, 0.085, pan=0.1)
                add(None, tt + 0.375, tone, 0.022, pan=-0.4)
            tt += d

# gentle low-pass (one pole) to round off the chip edges, then master fades
def lowpass(x, fc=7500):
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


n_out = int(LENGTH * SR)
L, R = L[:n_out], R[:n_out]
L, R = lowpass(L), lowpass(R)
fade_in, fade_out = int(0.4 * SR), int(1.8 * SR)
for ch in (L, R):
    ch[:fade_in] *= np.linspace(0, 1, fade_in)
    ch[-fade_out:] *= np.linspace(1, 0, fade_out) ** 1.5
peak = max(np.abs(L).max(), np.abs(R).max())
L, R = L / peak * 0.89, R / peak * 0.89

data = (np.stack([L, R], axis=1) * 32767).astype("<i2")
with wave.open(OUT, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(data.tobytes())
print(f"wrote {OUT}: {LENGTH:.1f} s, {bars} bars")
