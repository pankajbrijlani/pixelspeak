"""Stage 5 — melody extraction: audio stem -> clean, quantised note sequence.

Basic Pitch (Spotify) turns the vocal and "other" stems into note events.
We then:
    * drop notes below a confidence threshold,
    * move every note onto the song's own beat grid, quantised to 16ths
      (using the beat grid rather than a fixed BPM copes with tempo drift),
    * keep only the top voice ("skyline") so each step has at most one note,
    * transpose by the track's key shift so every song ends up in the target key.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import librosa
import numpy as np

from .analysis import Analysis

STEPS_PER_BEAT = 4  # 16th notes
STEPS_PER_BAR = 16

_bp_model = None


@dataclass
class Note:
    step: int  # 16th-note index from the first downbeat
    length: int  # in 16ths
    pitch: int  # MIDI note number
    velocity: float = 0.8  # 0..1


def _basic_pitch_events(path: Path) -> list[tuple[float, float, int, float]]:
    global _bp_model
    from basic_pitch import ICASSP_2022_MODEL_PATH
    from basic_pitch.inference import predict

    if _bp_model is None:
        try:
            from basic_pitch.inference import Model

            _bp_model = Model(ICASSP_2022_MODEL_PATH)
        except ImportError:  # older basic-pitch
            _bp_model = ICASSP_2022_MODEL_PATH
    _, _, events = predict(
        str(path),
        _bp_model,
        onset_threshold=0.5,
        frame_threshold=0.3,
        minimum_note_length=100,
        minimum_frequency=70,
        maximum_frequency=1600,
        melodia_trick=True,
    )
    return [(float(s), float(e), int(p), float(a)) for s, e, p, a, *_ in events]


def _pyin_events(path: Path) -> list[tuple[float, float, int, float]]:
    """Fallback when basic-pitch isn't installed: monophonic pitch tracking."""
    y, sr = librosa.load(path, sr=22050, mono=True)
    hop = 512
    f0, voiced, prob = librosa.pyin(y, fmin=70, fmax=1000, sr=sr, frame_length=2048, hop_length=hop)
    midi = np.where(voiced, np.round(librosa.hz_to_midi(np.nan_to_num(f0, nan=1.0))), -1)
    events, start = [], None
    for i in range(len(midi) + 1):
        cur = midi[i] if i < len(midi) else -1
        if start is not None and cur != midi[start]:
            if midi[start] > 0:
                t0, t1 = start * hop / sr, i * hop / sr
                events.append((t0, t1, int(midi[start]), float(np.mean(prob[start:i]))))
            start = None
        if start is None and cur > 0:
            start = i
    return [e for e in events if e[1] - e[0] >= 0.08]


def note_events(stem_path: Path) -> list[tuple[float, float, int, float]]:
    """Raw (start_s, end_s, midi_pitch, confidence) events, cached beside the stem."""
    cache = stem_path.with_suffix(".notes.json")
    if cache.exists():
        return [tuple(e) for e in json.loads(cache.read_text())]
    try:
        events = _basic_pitch_events(stem_path)
    except ImportError:
        events = _pyin_events(stem_path)
    cache.write_text(json.dumps(events))
    return events


def quantise(events, analysis: Analysis, shift: int, min_confidence: float) -> list[Note]:
    beats = analysis.beats
    beat_index = np.arange(len(beats)) - analysis.downbeat_phase  # 0 = first downbeat
    notes = []
    for start, end, pitch, conf in events:
        if conf < min_confidence or start < beats[0] or start > beats[-1]:
            continue
        b0 = np.interp(start, beats, beat_index)
        b1 = np.interp(min(end, beats[-1]), beats, beat_index)
        step = int(round(b0 * STEPS_PER_BEAT))
        length = max(1, int(round(b1 * STEPS_PER_BEAT)) - step)
        if step >= 0:
            notes.append(Note(step, length, pitch + shift, min(1.0, 0.4 + conf)))
    return skyline(notes)


def skyline(notes: list[Note]) -> list[Note]:
    """Keep the highest note at each step and stop notes overlapping."""
    by_step: dict[int, Note] = {}
    for n in notes:
        if n.step not in by_step or n.pitch > by_step[n.step].pitch:
            by_step[n.step] = n
    out = sorted(by_step.values(), key=lambda n: n.step)
    for a, b in zip(out, out[1:]):
        a.length = max(1, min(a.length, b.step - a.step))
    return out


def extract(stem_path: Path, analysis: Analysis, shift: int, min_confidence: float = 0.35) -> list[Note]:
    return quantise(note_events(stem_path), analysis, shift, min_confidence)
