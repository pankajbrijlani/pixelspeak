from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from mashup import analysis as an
from mashup import compat, generate
from mashup.analysis import Key
from mashup.pipeline import Settings, build

from .synth_songs import SR, make_song

A_MINOR, C_MAJOR, E_MINOR, G_MAJOR = Key(9, "minor"), Key(0, "major"), Key(4, "minor"), Key(7, "major")


def test_camelot_codes():
    assert A_MINOR.camelot == "8A"
    assert C_MAJOR.camelot == "8B"
    assert E_MINOR.camelot == "9A"
    assert G_MAJOR.camelot == "9B"
    assert Key(2, "minor").camelot == "7A"  # D minor
    assert Key(11, "major").camelot == "1B"  # B major
    for k in an.ALL_KEYS:
        assert Key.from_camelot(k.camelot) == k


def test_key_scores():
    assert compat.key_score(A_MINOR, A_MINOR) == 1.0
    assert compat.key_score(A_MINOR, C_MAJOR) == 0.9
    assert compat.key_score(A_MINOR, E_MINOR) == 0.85
    assert compat.key_score(Key(0, "minor"), A_MINOR) < 0.5


def test_best_shift_prefers_no_shift_when_compatible():
    assert compat.best_shift(E_MINOR, A_MINOR)[0] == 0
    shift, _ = compat.best_shift(Key(11, "minor"), A_MINOR, strict=True)  # B minor -> A minor
    assert shift == -2


def test_plan_assigns_distinct_tracks():
    keys = [A_MINOR, C_MAJOR, E_MINOR, Key(3, "minor")]
    presence = [{r: 0.5 for r in compat.SHIFT_COST} for _ in keys]
    presence[3]["drums"] = 1.0
    target, assign, shifts = compat.plan(keys, presence, max_shift=3)
    assert assign["drums"] == 3
    assert len({assign[r] for r in ("drums", "bass", "vocals", "music")}) == 4
    assert "texture" not in assign  # only four songs


def test_plan_uses_every_song_when_fewer_songs_than_layers():
    keys = [A_MINOR, C_MAJOR, E_MINOR]
    presence = [{r: 0.6 for r in compat.SHIFT_COST} for _ in keys]
    presence[0] = {r: 0.9 for r in compat.SHIFT_COST}  # song 1 is "best" at everything
    _, assign, _ = compat.plan(keys, presence, max_shift=3)
    assert set(assign.values()) == {0, 1, 2}


@pytest.mark.parametrize("bpm,tonic,mode", [(120, 9, "minor"), (128, 0, "major")])
def test_analysis_finds_tempo_and_key(bpm, tonic, mode):
    song = make_song(bpm, tonic, mode, seconds=30)
    a = an.analyse(song.mean(axis=0), SR)
    assert a.tempo == pytest.approx(bpm, rel=0.03)
    assert compat.key_score(a.key, Key(tonic, mode)) >= 0.9  # exact key or its relative


def test_tokens_round_trip():
    notes = [generate.Note(0, 4, 60), generate.Note(8, 2, 64), generate.Note(20, 6, 67)]
    back = generate.from_tokens(generate.to_tokens(notes, 0))
    assert [(n.step, n.length, n.pitch) for n in back] == [(0, 4, 60), (8, 2, 64), (20, 6, 67)]


def test_end_to_end_lite(tmp_path: Path):
    songs = [(118, 9, "minor"), (124, 0, "major"), (122, 4, "minor")]
    paths = []
    for i, (bpm, tonic, mode) in enumerate(songs):
        p = tmp_path / f"song{i + 1}.wav"
        sf.write(p, make_song(bpm, tonic, mode, seconds=45, seed=i).T, SR)
        paths.append(p)
    r = build(
        paths,
        Settings(separator="lite", loop_bars=4, cache_dir=tmp_path / "cache", out_dir=tmp_path / "out", seed=1),
    )
    audio, sr = sf.read(r.mix_wav)
    assert sr == SR
    assert r.bpm == pytest.approx(np.median([s[0] for s in songs]), rel=0.03)
    expected = 64 * 4 * 60 / r.bpm
    assert audio.shape[0] / sr == pytest.approx(expected, abs=0.05)
    assert np.abs(audio).max() <= 1.0
    assert np.abs(audio).max() > 0.3
    assert r.zip_path.exists()
    assert "Your mashup" in r.report
