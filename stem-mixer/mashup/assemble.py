"""Stage 7 — assembly: stretch, shift, loop, arrange, side-chain, mix down.

For each chosen stem we take the strongest `loop_bars`-bar stretch of it,
cut exactly on the song's own downbeats, then time-stretch that slice so it
is *exactly* loop_bars bars long at the target tempo (Rubber Band), and
pitch-shift it into the target key in the same pass. Because every loop is now
the same length and starts on beat one, they line up on one shared grid.
"""

from __future__ import annotations

import shutil
from dataclasses import dataclass

import librosa
import numpy as np
from scipy.signal import butter, sosfilt

from . import SR
from .analysis import Analysis
from .audio import db, rms

XFADE = int(0.02 * SR)  # 20 ms crossfade at loop seams: no clicks

# Target loudness per layer (dBFS RMS of the audible parts), so songs mastered
# at very different levels sit together.
TARGET_DB = {"drums": -15, "bass": -17, "vocals": -16, "music": -19, "texture": -23, "melody": -21}
# How hard the kick pushes each layer down (0 = not at all).
SIDECHAIN = {"bass": 0.45, "music": 0.3, "texture": 0.3, "melody": 0.3, "vocals": 0.08}

# (name, bars, {layer: gain})
ARRANGEMENT = [
    ("intro", 8, {"drums": 0.8, "music": 0.7}),
    ("build", 8, {"drums": 1.0, "bass": 1.0, "music": 0.8}),
    ("verse", 16, {"drums": 1.0, "bass": 1.0, "music": 0.7, "vocals": 1.0}),
    ("breakdown", 8, {"music": 0.8, "texture": 0.9, "melody": 0.9, "vocals": 0.6}),
    ("drop", 16, {"drums": 1.0, "bass": 1.0, "music": 0.8, "vocals": 1.0, "melody": 0.6, "texture": 0.5}),
    ("outro", 8, {"drums": 0.9, "music": 0.6, "texture": 0.4}),
]
TOTAL_BARS = sum(b for _, b, _ in ARRANGEMENT)


def has_rubberband() -> bool:
    try:
        import pyrubberband  # noqa: F401
    except ImportError:
        return False
    return shutil.which("rubberband") is not None


def stretch_shift(y: np.ndarray, rate: float, semitones: int) -> np.ndarray:
    """rate > 1 speeds up. y is (2, n)."""
    if abs(rate - 1) < 1e-4 and semitones == 0:
        return y
    if has_rubberband():
        import pyrubberband as pyrb

        args = {"--pitch": str(semitones)} if semitones else None
        out = pyrb.time_stretch(y.T, SR, rate, rbargs=args)
        return np.ascontiguousarray(out.T, dtype=np.float32)
    # fallback: librosa's phase vocoder — works, but smears transients more
    chans = []
    for ch in y:
        ch = librosa.effects.time_stretch(ch, rate=rate)
        if semitones:
            ch = librosa.effects.pitch_shift(ch, sr=SR, n_steps=semitones)
        chans.append(ch)
    return np.stack(chans).astype(np.float32)


def bar_samples(bpm: float) -> float:
    return 4 * 60.0 / bpm * SR


def strongest_section(stem: np.ndarray, analysis: Analysis, bars: int) -> int:
    """Index of the downbeat that starts the loudest `bars`-bar window of this stem."""
    mono = stem.mean(axis=0)
    idx = (analysis.downbeats * SR).astype(int)
    bar_rms = np.array([rms(mono[a:b]) if b > a else 0.0 for a, b in zip(idx[:-1], idx[1:])])
    if len(bar_rms) <= bars:
        return 0
    window = np.convolve(bar_rms, np.ones(bars) / bars, mode="valid")
    return int(np.argmax(window))


@dataclass
class Loop:
    audio: np.ndarray  # (2, n_loop + XFADE)
    start_bar: int  # where in the source song it came from (1-based)
    rate: float
    semitones: int


def make_loop(
    stem: np.ndarray, analysis: Analysis, bars: int, bpm: float, semitones: int, src_bars: int | None = None
) -> Loop:
    """src_bars: how many of the song's *detected* bars make `bars` target bars
    (differs from `bars` when the song is half/double time relative to the target)."""
    src_bars = src_bars or bars
    k = strongest_section(stem, analysis, src_bars)
    downbeats = analysis.downbeats
    t0 = downbeats[k]
    if k + src_bars < len(downbeats):
        t1 = downbeats[k + src_bars]
    else:
        t1 = t0 + src_bars * 4 * 60 / analysis.tempo
    n_loop = int(round(bars * bar_samples(bpm)))
    src_len = (t1 - t0) * SR
    rate = src_len / n_loop
    a = int(t0 * SR)
    b = a + int(src_len + XFADE * rate) + 1
    segment = stem[:, a:b]
    if segment.shape[1] < b - a:  # ran off the end of the song: pad with silence
        segment = np.pad(segment, ((0, 0), (0, b - a - segment.shape[1])))
    out = stretch_shift(segment, rate, semitones)
    out = librosa.util.fix_length(out, size=n_loop + XFADE, axis=1)
    return Loop(out, k + 1, rate, semitones)


def level_match(audio: np.ndarray, target_db: float) -> np.ndarray:
    """Scale so the *audible* parts hit target_db RMS (quiet gaps are ignored)."""
    mono = audio.mean(axis=0)
    frames = librosa.util.frame(np.pad(mono, (0, 2048)), frame_length=2048, hop_length=2048)
    frame_rms = np.sqrt((frames**2).mean(axis=0))
    loud = frame_rms[frame_rms > frame_rms.max() * 0.05]
    if len(loud) == 0:
        return audio
    current = db(float(np.sqrt((loud**2).mean())))
    return audio * 10 ** ((target_db - current) / 20)


def tile(loop: np.ndarray, n_loop: int, total: int) -> np.ndarray:
    out = np.zeros((2, total), dtype=np.float32)
    ramp = np.linspace(0, 1, XFADE, dtype=np.float32)
    window = np.ones(n_loop + XFADE, dtype=np.float32)
    window[:XFADE] = ramp
    window[n_loop:] = 1 - ramp
    shaped = loop * window
    for start in range(0, total, n_loop):
        end = min(total, start + n_loop + XFADE)
        out[:, start:end] += shaped[:, : end - start]
    return out


def gain_curve(layer: str, total: int, bpm: float) -> np.ndarray:
    per_bar = np.concatenate([np.full(bars, gains.get(layer, 0.0)) for _, bars, gains in ARRANGEMENT])
    bar_idx = np.minimum((np.arange(total) / bar_samples(bpm)).astype(int), len(per_bar) - 1)
    curve = per_bar[bar_idx]
    # smooth each on/off change over one beat so layers glide in and out
    w = int(60.0 / bpm * SR)
    c = np.cumsum(np.concatenate([np.full(w, curve[0]), curve]))
    return ((c[w:] - c[:-w]) / w).astype(np.float32)


def kick_envelope(drums: np.ndarray, bpm: float) -> np.ndarray:
    """0..1 envelope that jumps on each kick and releases over about an 8th note."""
    sos = butter(4, 120, btype="low", fs=SR, output="sos")
    low = np.abs(sosfilt(sos, drums.mean(axis=0)))
    block = 256
    peaks = np.pad(low, (0, -len(low) % block)).reshape(-1, block).max(axis=1)
    release_seconds = 0.5 * 60.0 / bpm
    release = np.exp(-block / (release_seconds * SR))
    env = np.empty_like(peaks)
    level = 0.0
    for i, p in enumerate(peaks):
        level = p if p > level else level * release
        env[i] = level
    ref = np.percentile(env, 99) + 1e-9
    env = np.clip(env / ref, 0, 1)
    return np.repeat(env, block)[: drums.shape[1]].astype(np.float32)


def soft_limit(x: np.ndarray, ceiling: float = 0.97) -> np.ndarray:
    peak = np.percentile(np.abs(x), 99.95) + 1e-9
    x = x * (0.9 / peak)
    knee = 0.8
    mag = np.abs(x)
    over = mag > knee
    x[over] = np.sign(x[over]) * (knee + (1 - knee) * np.tanh((mag[over] - knee) / (1 - knee)))
    return x * ceiling


def mix(loops: dict[str, np.ndarray], bpm: float, n_loop: int) -> tuple[np.ndarray, dict[str, np.ndarray]]:
    """loops: layer name -> level-matched (2, n_loop + XFADE) audio."""
    total = int(round(TOTAL_BARS * bar_samples(bpm)))
    layers = {name: tile(loop, n_loop, total) * gain_curve(name, total, bpm) for name, loop in loops.items()}
    if "drums" in layers:
        env = kick_envelope(layers["drums"], bpm)
        for name, depth in SIDECHAIN.items():
            if name in layers:
                layers[name] *= 1 - depth * env
    master = sum(layers.values())
    fade = int(4 * bar_samples(bpm))
    master[:, -fade:] *= np.linspace(1, 0, fade, dtype=np.float32)
    return soft_limit(master).astype(np.float32), layers
