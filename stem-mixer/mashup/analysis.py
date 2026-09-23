"""Stage 2 — analysis: tempo, beat grid, downbeats, key and Camelot code."""

from __future__ import annotations

from dataclasses import asdict, dataclass

import librosa
import numpy as np

ANALYSIS_SR = 22050  # analysis doesn't need 44.1k; half the rate is twice as fast
NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]

# Krumhansl–Kessler key profiles: how strongly each scale degree "belongs" to a key.
MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
MAJOR_SCALE = (0, 2, 4, 5, 7, 9, 11)
MINOR_SCALE = (0, 2, 3, 5, 7, 8, 10)


@dataclass(frozen=True)
class Key:
    tonic: int  # pitch class, 0 = C
    mode: str  # "major" or "minor"

    @property
    def name(self) -> str:
        return f"{NOTE_NAMES[self.tonic]} {self.mode}"

    @property
    def camelot_number(self) -> int:
        # The Camelot wheel is the circle of fifths. Relative major/minor share
        # a number, so first find the relative major's tonic...
        rel_major = self.tonic if self.mode == "major" else (self.tonic + 3) % 12
        # ...then step round the circle of fifths so that C major lands on 8.
        return (7 * rel_major % 12 + 7) % 12 + 1

    @property
    def camelot(self) -> str:
        return f"{self.camelot_number}{'B' if self.mode == 'major' else 'A'}"

    @property
    def scale(self) -> set[int]:
        steps = MAJOR_SCALE if self.mode == "major" else MINOR_SCALE
        return {(self.tonic + s) % 12 for s in steps}

    def transpose(self, semitones: int) -> "Key":
        return Key((self.tonic + semitones) % 12, self.mode)

    @staticmethod
    def from_camelot(code: str) -> "Key":
        code = code.strip().upper()
        number, letter = int(code[:-1]), code[-1]
        mode = "major" if letter == "B" else "minor"
        for tonic in range(12):
            k = Key(tonic, mode)
            if k.camelot_number == number:
                return k
        raise ValueError(f"bad Camelot code {code!r}")


ALL_KEYS = [Key(t, m) for m in ("minor", "major") for t in range(12)]


@dataclass
class Analysis:
    tempo: float  # BPM
    beats: np.ndarray  # beat times in seconds
    downbeats: np.ndarray  # bar start times in seconds
    downbeat_phase: int  # which beat (0–3) of the beat list is the first downbeat
    key: Key
    key_confidence: float

    def to_json(self) -> dict:
        d = asdict(self)
        d["beats"] = self.beats.tolist()
        d["downbeats"] = self.downbeats.tolist()
        d["key"] = {"tonic": self.key.tonic, "mode": self.key.mode}
        return d

    @staticmethod
    def from_json(d: dict) -> "Analysis":
        return Analysis(
            tempo=d["tempo"],
            beats=np.array(d["beats"]),
            downbeats=np.array(d["downbeats"]),
            downbeat_phase=d["downbeat_phase"],
            key=Key(**d["key"]),
            key_confidence=d["key_confidence"],
        )


def detect_key(y: np.ndarray, sr: int) -> tuple[Key, float]:
    """Chroma CENS -> average pitch-class profile -> best-correlating key."""
    harmonic = librosa.effects.harmonic(y, margin=2.0)
    chroma = librosa.feature.chroma_cens(y=harmonic, sr=sr)
    profile = chroma.mean(axis=1)
    scores = []
    for key in ALL_KEYS:
        template = MAJOR_PROFILE if key.mode == "major" else MINOR_PROFILE
        scores.append(np.corrcoef(profile, np.roll(template, key.tonic))[0, 1])
    order = np.argsort(scores)[::-1]
    best = ALL_KEYS[order[0]]
    confidence = float(scores[order[0]] - scores[order[1]])
    return best, confidence


def detect_beats(y: np.ndarray, sr: int) -> tuple[float, np.ndarray, np.ndarray, int]:
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    _, beat_frames = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)
    beats = librosa.frames_to_time(beat_frames, sr=sr)
    if len(beats) < 8:
        raise ValueError("couldn't find a steady beat — is this track very ambient/rubato?")
    tempo = 60.0 / float(np.median(np.diff(beats)))

    # librosa has no downbeat tracker, so use a common heuristic: the kick drum
    # usually hits hardest on beat one. Measure low-frequency onsets at each beat
    # and pick the 1-in-4 phase that is strongest.
    low = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=16, fmax=200)
    low_env = librosa.onset.onset_strength(S=librosa.power_to_db(low), sr=sr)
    at_beats = low_env[np.clip(beat_frames, 0, len(low_env) - 1)]
    phase = int(np.argmax([at_beats[p::4].mean() for p in range(4)]))
    downbeats = beats[phase::4]
    return tempo, beats, downbeats, phase


def analyse(mono: np.ndarray, sr: int) -> Analysis:
    y = librosa.resample(mono, orig_sr=sr, target_sr=ANALYSIS_SR)
    tempo, beats, downbeats, phase = detect_beats(y, ANALYSIS_SR)
    key, conf = detect_key(y, ANALYSIS_SR)
    return Analysis(tempo, beats, downbeats, phase, key, conf)
