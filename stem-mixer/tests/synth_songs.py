"""Synthetic test songs with a known tempo and key (no copyrighted audio needed)."""

from __future__ import annotations

import numpy as np

SR = 44100
MAJOR = [0, 2, 4, 5, 7, 9, 11]
MINOR = [0, 2, 3, 5, 7, 8, 10]


def _tone(freq, dur, harmonics=6, decay=3.0):
    t = np.arange(int(dur * SR)) / SR
    wave = sum(np.sin(2 * np.pi * freq * k * t) / k for k in range(1, harmonics + 1))
    return wave * np.exp(-decay * t) * np.minimum(1, t / 0.005)


def make_song(bpm: float, tonic: int, mode: str, seconds: float = 40, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    scale = MAJOR if mode == "major" else MINOR
    beat = 60 / bpm
    n = int(seconds * SR)
    drums, bass, chords, lead = (np.zeros(n) for _ in range(4))

    def add(buf, sig, start):
        a = int(start * SR)
        if a < n:
            buf[a : a + len(sig)] += sig[: n - a]

    t = np.arange(int(0.25 * SR)) / SR
    kick = np.sin(2 * np.pi * (50 + 100 * np.exp(-30 * t)) * t) * np.exp(-12 * t)
    hat = rng.standard_normal(int(0.04 * SR)) * np.exp(-np.linspace(0, 8, int(0.04 * SR))) * 0.2
    degrees = [0, 5, 2, 6] if mode == "minor" else [0, 4, 5, 3]  # i-VI-III-VII / I-V-vi-IV
    n_beats = int(seconds / beat)
    for b in range(n_beats):
        add(drums, kick * (1.0 if b % 4 == 0 else 0.7), b * beat)
        add(drums, hat, (b + 0.5) * beat)
        if b % 4 == 0:
            deg = degrees[(b // 4) % 4]
            for voice in (0, 2, 4):
                s = scale[(deg + voice) % 7] + 12 * ((deg + voice) // 7)
                add(chords, _tone(440 * 2 ** ((tonic + s + 60 - 69) / 12), 4 * beat, decay=0.6) * 0.12, b * beat)
            root = tonic + scale[deg] + 36
            for e in range(8):
                add(bass, _tone(440 * 2 ** ((root - 69) / 12), beat / 2, harmonics=3, decay=6) * 0.3, (b + e / 2) * beat)
        for half in (0, 0.5):
            if rng.random() < 0.7:
                deg = int(rng.integers(0, 7))
                p = tonic + scale[deg] + 72
                add(lead, _tone(440 * 2 ** ((p - 69) / 12), beat / 2, harmonics=4, decay=4) * 0.15, (b + half) * beat)
    left = drums + bass + lead + chords * 1.3
    right = drums + bass + lead + chords * 0.7
    out = np.stack([left, right])
    return (out / np.abs(out).max() * 0.9).astype(np.float32)
