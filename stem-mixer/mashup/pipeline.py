"""Wires the seven stages together. Used by both app.py (UI) and cli.py."""

from __future__ import annotations

import json
import shutil
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import numpy as np

from . import ROLES, SR
from . import analysis as an
from . import assemble, compat, generate, melody, separate
from .audio import Track, load_track, rms, write_wav

STEM_FOR_ROLE = {"drums": "drums", "bass": "bass", "vocals": "vocals", "music": "other", "texture": "other"}


@dataclass
class Settings:
    separator: str = "demucs"  # or "lite"
    strict_key: bool = False
    target_key: str | None = None  # Camelot code like "8A"; None = auto
    target_bpm: float | None = None  # None = median of the songs
    loop_bars: int = 8
    max_shift: int = 3
    max_seconds: float | None = None  # only use this much from the middle of each song
    roles: dict[str, int] = field(default_factory=dict)  # role -> song number (1-based), 0 = leave out
    melody: bool = True
    creativity: float = 0.5
    min_confidence: float = 0.35
    seed: int = 0
    cache_dir: Path = Path("cache")
    out_dir: Path = Path("output")


@dataclass
class Result:
    bpm: float
    key: an.Key
    mix_wav: Path
    mix_mp3: Path | None
    melody_wav: Path | None
    melody_mid: Path | None
    layer_wavs: dict[str, Path]
    zip_path: Path
    report: str
    log: list[str]


Progress = Callable[[float, str], None]


def _noop(_f: float, _m: str) -> None:
    pass


# ---- stages 1–3 ---------------------------------------------------------------


def load_and_analyse(paths: list[Path], s: Settings, log: Callable[[str], None], progress: Progress = _noop) -> list[Track]:
    tracks = []
    for i, p in enumerate(paths):
        progress(0.02 + 0.18 * i / len(paths), f"Loading + analysing {Path(p).name}")
        t = load_track(p, i + 1, s.max_seconds)
        cache = s.cache_dir / "analysis" / f"{t.file_hash}.json"
        if cache.exists():
            t.analysis = an.Analysis.from_json(json.loads(cache.read_text()))
        else:
            t.analysis = an.analyse(t.mono, t.sr)
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_text(json.dumps(t.analysis.to_json()))
        a = t.analysis
        log(f"  {t.label}: {a.tempo:.1f} BPM, {a.key.name} ({a.key.camelot}), {len(a.downbeats)} bars")
        tracks.append(t)
    return tracks


def analysis_rows(tracks: list[Track]) -> list[list]:
    return [
        [
            t.index,
            t.name,
            f"{t.duration / 60:.0f}:{t.duration % 60:02.0f}",
            round(t.analysis.tempo, 1),
            t.analysis.key.name,
            t.analysis.key.camelot,
            round(t.analysis.key_confidence, 3),
        ]
        for t in tracks
    ]


ANALYSIS_HEADERS = ["#", "Song", "Length", "BPM", "Key", "Camelot", "Key confidence"]


def compat_rows(tracks: list[Track], max_shift: int) -> tuple[list[str], list[list[str]]]:
    keys = [t.analysis.key for t in tracks]
    matrix = compat.compat_matrix(keys, max_shift)
    headers = [""] + [f"{t.index} ({t.analysis.key.camelot})" for t in tracks]
    return headers, [[f"{t.index} ({t.analysis.key.camelot})"] + row for t, row in zip(tracks, matrix)]


def target_tempo(tracks: list[Track], s: Settings) -> float:
    return float(s.target_bpm) if s.target_bpm else float(np.median([t.analysis.tempo for t in tracks]))


def tempo_multiplier(track_bpm: float, target: float) -> float:
    """Beat trackers often lock onto half or double time. Pick whichever of
    ×0.5, ×1, ×2 needs the least stretching (a 70 BPM song works as 140)."""
    return min((0.5, 1.0, 2.0), key=lambda m: abs(np.log(track_bpm * m / target)))


# ---- the whole thing ---------------------------------------------------------


def presence(t: Track) -> dict[str, float]:
    """0..1: how much of each stem there is, relative to the full mix."""
    mix = rms(t.mono)
    ref = {"drums": 0.45, "bass": 0.4, "vocals": 0.35, "other": 0.45}
    level = {s: min(1.0, rms(t.stems[s]) / mix / ref[s]) for s in ref}
    return {role: level[STEM_FOR_ROLE[role]] for role in ROLES}


def build(paths: list[Path], s: Settings, progress: Progress = _noop) -> Result:
    lines: list[str] = []

    def log(msg: str) -> None:
        print(msg, flush=True)
        lines.append(msg)

    notes_md: list[str] = []
    if len(paths) < 2:
        raise ValueError("Upload at least two songs.")

    log("Stage 1–2 · ingest + analysis")
    tracks = load_and_analyse(paths, s, log, progress)
    bpm = target_tempo(tracks, s)
    log(f"Target tempo: {bpm:.1f} BPM")

    log(f"Stage 4 · separation ({s.separator})")
    for i, t in enumerate(tracks):
        progress(0.2 + 0.4 * i / len(tracks), f"Separating {t.name} ({s.separator}) — the slow bit")
        separate.separate(t, s.separator, s.cache_dir, log)

    log("Stage 3 · compatibility + plan")
    progress(0.6, "Choosing key and stems")
    keys = [t.analysis.key for t in tracks]
    fixed_roles: dict[str, int | None | str] = {}
    for role in ROLES:
        n = s.roles.get(role)
        if n is None:
            fixed_roles[role] = "auto"
        elif n == 0 or n > len(tracks):
            fixed_roles[role] = None
        else:
            fixed_roles[role] = n - 1
    fixed_key = an.Key.from_camelot(s.target_key) if s.target_key else None
    target, assign, shifts = compat.plan(
        keys, [presence(t) for t in tracks], s.max_shift, s.strict_key, fixed_key, fixed_roles
    )
    log(f"Target key: {target.name} ({target.camelot})")

    loops: dict[str, np.ndarray] = {}
    role_rows = []
    n_loop = int(round(s.loop_bars * assemble.bar_samples(bpm)))
    progress(0.65, "Stretching + shifting loops")
    log("Stage 7a · loops")
    for role, i in assign.items():
        t = tracks[i]
        shift = 0 if role == "drums" else shifts[i]
        if abs(shift) > s.max_shift:
            log(f"  {role}: skipped — {t.label} would need {shift:+d} semitones (cap is ±{s.max_shift})")
            notes_md.append(f"- **{role}** left out: song {t.index} needs {shift:+d} st, over the ±{s.max_shift} cap.")
            continue
        mult = tempo_multiplier(t.analysis.tempo, bpm)
        src_bars = max(1, int(round(s.loop_bars / mult)))
        loop = assemble.make_loop(t.stems[STEM_FOR_ROLE[role]], t.analysis, s.loop_bars, bpm, shift, src_bars)
        loops[role] = assemble.level_match(loop.audio, assemble.TARGET_DB[role])
        stretch = (1 / loop.rate - 1) * 100
        role_rows.append(
            f"| {role} | {t.index}: {t.name} ({STEM_FOR_ROLE[role]}) | bar {loop.start_bar} | "
            f"{t.analysis.tempo * mult:.1f} → {bpm:.1f} ({stretch:+.1f}% length) | {shift:+d} st |"
        )
        log(f"  {role}: {t.label} bar {loop.start_bar}, rate {loop.rate:.3f}, shift {shift:+d}")

    stamp = time.strftime("%Y%m%d-%H%M%S")
    out = s.out_dir / f"mashup-{stamp}"
    out.mkdir(parents=True, exist_ok=True)

    melody_wav = melody_mid = None
    melody_md = "_Melody generation was switched off._"
    if s.melody:
        log("Stage 5 · melody extraction (Basic Pitch)")
        phrases: dict[tuple[int, str], list[generate.Phrase]] = {}
        for k, t in enumerate(tracks):
            if abs(shifts[k]) > s.max_shift:
                continue
            for stem in ("vocals", "other"):
                progress(0.7 + 0.1 * k / len(tracks), f"Transcribing {t.name} / {stem}")
                notes = melody.extract(t.stem_paths[stem], t.analysis, shifts[k], s.min_confidence)
                phrases[(k, stem)] = generate.phrases_from(notes, f"{t.index}: {t.name} / {stem}")
                log(f"  {t.label} {stem}: {len(notes)} notes → {len(phrases[(k, stem)])} two-bar phrases")
        all_phrases = [p for ps in phrases.values() for p in ps]
        voc, mus = assign.get("vocals"), assign.get("music")
        pool_a = phrases.get((voc, "vocals")) or [p for (k, st), ps in phrases.items() if st == "vocals" for p in ps]
        pool_b = phrases.get((mus, "other")) or [p for (k, st), ps in phrases.items() if st == "other" for p in ps]
        pool_a, pool_b = pool_a or all_phrases, pool_b or all_phrases
        if len(all_phrases) < 6:
            melody_md = f"_Not enough clean melodic material ({len(all_phrases)} phrases) to train on — try lowering the confidence threshold._"
            log("  skipped generation: " + melody_md)
        else:
            log(f"Stage 6 · training melody VAE on {len(all_phrases)} phrases")
            progress(0.82, "Training the melody model")
            gen = generate.generate(pool_a, pool_b, all_phrases, target, s.loop_bars, s.creativity, s.seed, log)
            synth = generate.render(gen.notes, bpm, s.loop_bars)
            melody_wav = write_wav(out / "generated_melody.wav", synth)
            melody_mid = out / "generated_melody.mid"
            generate.write_midi(gen.notes, bpm, melody_mid)
            padded = np.pad(synth, ((0, 0), (0, assemble.XFADE)))
            loops["melody"] = assemble.level_match(padded, assemble.TARGET_DB["melody"])
            melody_md = (
                f"Interpolated from **{gen.phrase_a}** to **{gen.phrase_b}** "
                f"({len(gen.notes)} notes, creativity {s.creativity:.2f}). "
                f"Closest match to any source phrase: **{gen.closest_match:.0%}** "
                "(lower = more original)."
            )

    log("Stage 7b · arrange, side-chain, mix down")
    progress(0.9, "Mixing down")
    master, layers = assemble.mix(loops, bpm, n_loop)
    mix_wav = write_wav(out / "mashup.wav", master)
    layer_wavs = {name: write_wav(out / "layers" / f"{name}.wav", audio) for name, audio in layers.items()}
    mix_mp3 = None
    try:
        from pydub import AudioSegment

        mix_mp3 = out / "mashup.mp3"
        AudioSegment.from_wav(mix_wav).export(mix_mp3, format="mp3", bitrate="320k")
    except Exception as e:  # ffmpeg missing etc. — the WAV is the real output anyway
        mix_mp3 = None
        log(f"  (mp3 export skipped: {e.__class__.__name__})")

    if s.separator == "lite":
        notes_md.append("- Stems came from the **lite** separator — expect bleed. Switch to Demucs for the real thing.")
    if not assemble.has_rubberband():
        notes_md.append("- Rubber Band isn't installed, so librosa's phase vocoder did the stretching (softer transients).")

    arrangement = "\n".join(
        f"| {name} | {bars} | {', '.join(k for k in gains if k in loops) or '—'} |"
        for name, bars, gains in assemble.ARRANGEMENT
    )
    report = f"""## Your mashup

**{bpm:.1f} BPM · {target.name} ({target.camelot}) · {assemble.TOTAL_BARS} bars · {master.shape[1] / SR / 60:.0f}:{master.shape[1] / SR % 60:02.0f}**

### Where each layer came from
| Layer | Source | Loop starts | Tempo | Pitch |
|---|---|---|---|---|
{chr(10).join(role_rows)}

### Generated melody
{melody_md}

### Arrangement
| Section | Bars | Layers |
|---|---|---|
{arrangement}

{chr(10).join(notes_md)}
"""
    (out / "report.md").write_text(report)
    (out / "log.txt").write_text("\n".join(lines))
    zip_path = Path(shutil.make_archive(str(out), "zip", out))
    progress(1.0, "Done")
    log(f"Done → {out}")
    return Result(bpm, target, mix_wav, mix_mp3, melody_wav, melody_mid, layer_wavs, zip_path, report, lines)
