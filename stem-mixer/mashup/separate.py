"""Stage 4 — source separation into drums / bass / vocals / other.

"demucs" uses Meta's Hybrid Transformer Demucs (htdemucs) — proper quality,
but slow on a CPU (roughly the length of the song, per song). A GPU makes it
10–20× faster. Results are cached on disk by file hash, so each song is only
ever separated once.

"lite" is a quick-and-dirty DSP fallback for previewing ideas in seconds:
harmonic/percussive split for drums, a low-pass for bass, and a
"what's in the centre of the stereo image" mask for vocals. It leaks a lot —
that's the point of comparing it with Demucs.
"""

from __future__ import annotations

from pathlib import Path
from typing import Callable

import librosa
import numpy as np

from . import SR
from .audio import Track, read_wav, write_wav

STEMS = ("drums", "bass", "vocals", "other")

_demucs_model = None


def _get_demucs():
    global _demucs_model
    if _demucs_model is None:
        from demucs.pretrained import get_model

        _demucs_model = get_model("htdemucs")
        _demucs_model.eval()
    return _demucs_model


def _device() -> str:
    import torch

    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def separate_demucs(stereo: np.ndarray) -> dict[str, np.ndarray]:
    import torch
    from demucs.apply import apply_model

    model = _get_demucs()
    wav = torch.from_numpy(stereo)
    if model.samplerate != SR:
        raise RuntimeError(f"expected a {SR} Hz Demucs model")
    ref = wav.mean(0)
    mean, std = ref.mean(), ref.std() + 1e-8
    with torch.no_grad():
        out = apply_model(model, ((wav - mean) / std)[None], device=_device(), split=True, overlap=0.25, progress=False)[0]
    out = out * std + mean
    return {name: out[i].cpu().numpy().astype(np.float32) for i, name in enumerate(model.sources)}


def separate_lite(stereo: np.ndarray) -> dict[str, np.ndarray]:
    n_fft, hop = 4096, 1024
    specs = [librosa.stft(ch, n_fft=n_fft, hop_length=hop) for ch in stereo]
    freqs = librosa.fft_frequencies(sr=SR, n_fft=n_fft)[:, None]

    harm, perc = zip(*(librosa.decompose.hpss(D, margin=1.0) for D in specs))
    low = freqs < 180
    bass = [H * low for H in harm]
    upper = [H * ~low for H in harm]

    # vocals: energy that sits in the middle of the stereo field, 200 Hz – 6 kHz
    mid = (upper[0] + upper[1]) / 2
    side = (upper[0] - upper[1]) / 2
    centred = np.abs(mid) ** 2 / (np.abs(mid) ** 2 + np.abs(side) ** 2 + 1e-10)
    band = (freqs > 200) & (freqs < 6000)
    vocal_mask = np.clip((centred - 0.6) / 0.4, 0, 1) ** 2 * band
    vocals = [U * vocal_mask for U in upper]
    other = [U - V for U, V in zip(upper, vocals)]

    def back(parts):
        n = stereo.shape[1]
        return np.stack([librosa.istft(p, hop_length=hop, length=n) for p in parts]).astype(np.float32)

    return {"drums": back(perc), "bass": back(bass), "vocals": back(vocals), "other": back(other)}


def separate(track: Track, method: str, cache_dir: Path, log: Callable[[str], None] = print) -> None:
    """Fill track.stems and track.stem_paths, using the disk cache when possible."""
    folder = cache_dir / "stems" / track.file_hash / method
    paths = {s: folder / f"{s}.wav" for s in STEMS}
    if all(p.exists() for p in paths.values()):
        log(f"  {track.name}: stems loaded from cache")
    else:
        log(f"  {track.name}: separating with {method}…")
        if method == "demucs":
            try:
                stems = separate_demucs(track.stereo)
            except OSError as e:  # first run downloads ~80 MB of weights
                raise RuntimeError(
                    "Demucs couldn't load its model (the first run needs internet to download it). "
                    "Check your connection, or use the 'lite' separator for now."
                ) from e
        else:
            stems = separate_lite(track.stereo)
        for s in STEMS:
            write_wav(paths[s], stems[s])
    track.stem_paths = paths
    track.stems = {s: read_wav(p) for s, p in paths.items()}
