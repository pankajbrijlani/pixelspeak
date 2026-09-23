"""Stage 1 — ingest.

Every file is loaded at 44.1 kHz. We keep the stereo original for rendering
and make a mono copy for analysis.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

from . import SR


@dataclass
class Track:
    index: int  # 1-based, matches the upload order shown in the UI
    name: str
    path: Path
    file_hash: str
    stereo: np.ndarray  # shape (2, n), float32
    mono: np.ndarray  # shape (n,)
    sr: int = SR
    # filled in by later stages
    analysis: "object | None" = None
    stems: dict[str, np.ndarray] = field(default_factory=dict)
    stem_paths: dict[str, Path] = field(default_factory=dict)

    @property
    def label(self) -> str:
        return f"{self.index}: {self.name}"

    @property
    def duration(self) -> float:
        return self.stereo.shape[1] / self.sr


def file_hash(path: Path) -> str:
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()[:16]


def load_track(path: str | Path, index: int, max_seconds: float | None = None) -> Track:
    """Load a song as stereo 44.1 kHz. Optionally keep only `max_seconds`
    taken from the middle of the song (much faster while experimenting)."""
    path = Path(path)
    y, _ = librosa.load(path, sr=SR, mono=False)
    if y.ndim == 1:
        y = np.stack([y, y])
    elif y.shape[0] > 2:
        y = y[:2]
    if max_seconds:
        n = int(max_seconds * SR)
        if y.shape[1] > n:
            start = (y.shape[1] - n) // 2
            y = y[:, start : start + n]
    y = np.ascontiguousarray(y, dtype=np.float32)
    h = file_hash(path)
    if max_seconds:
        h = f"{h}_m{int(max_seconds)}"
    return Track(
        index=index,
        name=path.stem,
        path=path,
        file_hash=h,
        stereo=y,
        mono=y.mean(axis=0),
    )


def write_wav(path: Path, audio: np.ndarray, sr: int = SR) -> Path:
    """Write (channels, n) or (n,) audio as 24-bit WAV."""
    path.parent.mkdir(parents=True, exist_ok=True)
    data = audio.T if audio.ndim == 2 else audio
    sf.write(path, data, sr, subtype="PCM_24")
    return path


def read_wav(path: Path) -> np.ndarray:
    data, _ = sf.read(path, dtype="float32", always_2d=True)
    return np.ascontiguousarray(data.T)


def rms(x: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(x), dtype=np.float64)) + 1e-12)


def db(x: float) -> float:
    return 20 * np.log10(max(x, 1e-12))
