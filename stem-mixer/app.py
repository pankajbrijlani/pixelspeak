"""Stem Mashup Lab — local web UI.

    python app.py      then open http://127.0.0.1:7860
"""

from __future__ import annotations

import traceback
from pathlib import Path

import gradio as gr

from mashup import ROLES
from mashup.analysis import ALL_KEYS
from mashup.pipeline import (
    ANALYSIS_HEADERS,
    Settings,
    analysis_rows,
    build,
    compat_rows,
    load_and_analyse,
    target_tempo,
)

HERE = Path(__file__).parent
AUTO, OFF = "auto", "leave out"
KEY_CHOICES = ["auto"] + [f"{k.camelot} — {k.name}" for k in sorted(ALL_KEYS, key=lambda k: (k.camelot_number, k.mode))]
ROLE_HELP = {
    "drums": "Drums",
    "bass": "Bass",
    "vocals": "Vocals",
    "music": "Music (other stem)",
    "texture": "Texture (5th song's other stem)",
}


def _paths(files) -> list[Path]:
    return [Path(f if isinstance(f, str) else f.name) for f in (files or [])]


def _settings(sep, strict, key, bpm, bars, shift, seconds, melody, creativity, conf, seed, *roles) -> Settings:
    role_map = {}
    for role, choice in zip(ROLES, roles):
        if choice == OFF:
            role_map[role] = 0
        elif choice and choice != AUTO:
            role_map[role] = int(choice.split(":")[0])
    return Settings(
        separator="lite" if sep.startswith("lite") else "demucs",
        strict_key=strict.startswith("strict"),
        target_key=None if key == "auto" else key.split(" ")[0],
        target_bpm=float(bpm) if bpm else None,
        loop_bars=int(bars),
        max_shift=int(shift),
        max_seconds=float(seconds) if seconds else None,
        roles=role_map,
        melody=melody,
        creativity=float(creativity),
        min_confidence=float(conf),
        seed=int(seed),
        cache_dir=HERE / "cache",
        out_dir=HERE / "output",
    )


def on_files(files):
    labels = [f"{i + 1}: {p.stem}" for i, p in enumerate(_paths(files))]
    choices = [AUTO, OFF] + labels
    return [gr.update(choices=choices, value=AUTO) for _ in ROLES]


def on_analyse(files, *args, progress=gr.Progress()):
    paths = _paths(files)
    if len(paths) < 2:
        raise gr.Error("Upload at least two songs.")
    s = _settings(*args)
    tracks = load_and_analyse(paths, s, lambda m: None, lambda f, m: progress(f / 0.2, desc=m))
    headers, rows = compat_rows(tracks, s.max_shift)
    summary = f"Median tempo **{target_tempo(tracks, s):.1f} BPM** — that's the default target."
    return (
        gr.update(value=analysis_rows(tracks), headers=ANALYSIS_HEADERS),
        gr.update(value=rows, headers=headers),
        summary,
    )


def on_build(files, *args, progress=gr.Progress()):
    paths = _paths(files)
    if len(paths) < 2:
        raise gr.Error("Upload at least two songs.")
    s = _settings(*args)
    try:
        r = build(paths, s, lambda f, m: progress(f, desc=m))
    except Exception as e:
        traceback.print_exc()  # full details in the terminal
        raise gr.Error(f"{type(e).__name__}: {e}", duration=None) from e
    downloads = [str(r.zip_path), str(r.mix_wav)] + ([str(r.melody_mid)] if r.melody_mid else [])
    layers = [str(p) for p in r.layer_wavs.values()]
    return (
        str(r.mix_mp3 or r.mix_wav),
        str(r.melody_wav) if r.melody_wav else None,
        r.report,
        downloads + layers,
        "\n".join(r.log),
    )


with gr.Blocks(title="Stem Mashup Lab") as demo:
    gr.Markdown(
        "# Stem Mashup Lab\n"
        "Drop in 2–5 songs. The app finds tempo, key and Camelot code, splits every song into "
        "drums / bass / vocals / other, picks the best-fitting stem from each, writes a new melody "
        "from the songs' own phrases, and arranges it all into one track."
    )
    files = gr.File(label="Songs (2–5, mp3/wav/flac/m4a)", file_count="multiple", file_types=["audio"])

    with gr.Accordion("Settings", open=True):
        with gr.Row():
            sep = gr.Radio(
                ["demucs — best quality (slow on CPU)", "lite — fast rough preview"],
                value="demucs — best quality (slow on CPU)",
                label="Stage 4 · separation",
            )
            strict = gr.Radio(
                ["harmonic — allow ±1 on the wheel", "strict — same notes only"],
                value="harmonic — allow ±1 on the wheel",
                label="Stage 3 · key matching",
            )
        with gr.Row():
            key = gr.Dropdown(KEY_CHOICES, value="auto", label="Target key (Camelot)")
            bpm = gr.Number(value=0, label="Target BPM (0 = median of songs)")
            bars = gr.Dropdown([4, 8, 16], value=8, label="Loop length (bars)")
            shift = gr.Slider(0, 6, value=3, step=1, label="Max pitch shift (semitones)")
            seconds = gr.Slider(0, 300, value=0, step=15, label="Use only N seconds from the middle of each song (0 = all)")
        with gr.Row():
            melody = gr.Checkbox(value=True, label="Stage 5–6 · generate a new melody")
            creativity = gr.Slider(0, 1, value=0.5, step=0.05, label="Melody creativity")
            conf = gr.Slider(0.1, 0.8, value=0.35, step=0.05, label="Note confidence threshold")
            seed = gr.Number(value=0, precision=0, label="Random seed")
        gr.Markdown("**Which song supplies each layer** (auto = let the app choose from key fit + how much of that stem the song has)")
        with gr.Row():
            role_boxes = [gr.Dropdown([AUTO, OFF], value=AUTO, label=ROLE_HELP[r]) for r in ROLES]

    settings = [sep, strict, key, bpm, bars, shift, seconds, melody, creativity, conf, seed, *role_boxes]
    with gr.Row():
        analyse_btn = gr.Button("1 · Analyse (quick)")
        build_btn = gr.Button("2 · Make the mashup", variant="primary")

    summary = gr.Markdown()
    analysis_df = gr.Dataframe(label="Stage 2 · analysis", interactive=False)
    compat_df = gr.Dataframe(label="Stage 3 · compatibility (row song → column song)", interactive=False)

    mix_audio = gr.Audio(label="Your mashup", type="filepath")
    melody_audio = gr.Audio(label="Generated melody on its own", type="filepath")
    report = gr.Markdown()
    downloads = gr.File(label="Downloads (zip with everything, full mix, MIDI, each layer)", file_count="multiple")
    with gr.Accordion("Log", open=False):
        log = gr.Textbox(lines=18, show_label=False)

    files.change(on_files, files, role_boxes)
    analyse_btn.click(on_analyse, [files, *settings], [analysis_df, compat_df, summary])
    build_btn.click(on_analyse, [files, *settings], [analysis_df, compat_df, summary]).then(
        on_build, [files, *settings], [mix_audio, melody_audio, report, downloads, log]
    )


if __name__ == "__main__":
    demo.queue().launch(theme=gr.themes.Soft())
