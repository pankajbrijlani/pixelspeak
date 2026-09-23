# Stem Mashup Lab

A personal learning tool. Drop in 2–5 songs and it makes **one new track**:
drums from one song, bass from another, vocals from a third, music from a
fourth, plus a new melody written by a small model trained on the songs' own
phrases. It all runs on your own machine and nothing is uploaded anywhere.

It's standalone and separate from the PixelSpeak web app in this repo.

## Setup (once)

You need Python 3.10–3.11, plus two command-line programs:

```bash
# macOS
brew install rubberband ffmpeg
# Ubuntu / WSL
sudo apt install rubberband-cli ffmpeg
# Windows (without WSL): get ffmpeg from ffmpeg.org and Rubber Band from breakfastquay.com,
# and put both on your PATH. Without Rubber Band the app still works using librosa's stretcher.

cd stem-mixer
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

The first Demucs run downloads its model (about 80 MB).

## Run it

```bash
python app.py        # then open http://127.0.0.1:7860
```

1. Drop in your songs.
2. Click **Analyse** to see each song's BPM, key and Camelot code, plus the
   compatibility grid.
3. Change any settings you like, then click **Make the mashup**.

Or use it from the terminal:

```bash
python cli.py a.mp3 b.mp3 c.mp3 d.mp3 e.mp3 --bars 8 --creativity 0.6
python cli.py a.mp3 b.mp3 --lite --seconds 60          # quick rough preview
python cli.py a.mp3 b.mp3 c.mp3 --vocals 2 --drums 3   # pick the sources yourself
```

Each run is saved to `output/mashup-<time>/`:

- `mashup.wav` and `mashup.mp3`
- `layers/*.wav`, each layer on its own and ready to drag into a DAW
- `generated_melody.mid` and `generated_melody.wav`
- `report.md`, which lists where every layer came from

A zip of the whole folder is saved next to it.

**Speed:** Demucs is the slow step. On a CPU it takes roughly as long as the
song plays, per song. A GPU (NVIDIA or Apple Silicon) is 10–20× faster.
Separated stems are cached in `cache/`, so re-mixing the same songs with
different settings takes seconds. Use **lite** or **Use only N seconds** to
try ideas quickly.

## The seven stages, and where they live in the code

| Stage | File | What happens |
|---|---|---|
| 1. Ingest | `mashup/audio.py` | Loads at 44.1 kHz. Keeps the stereo file for rendering and a mono copy for analysis. |
| 2. Analysis | `mashup/analysis.py` | librosa beat tracking gives the tempo and beat grid. The downbeat is taken as the beat with the strongest kick. Chroma CENS is matched against Krumhansl key profiles to get the key and its Camelot code (A minor = 8A, C major = 8B). |
| 3. Compatibility | `mashup/compat.py` | Scores every pair: same code 1.0, relative major/minor 0.9, ±1 on the wheel 0.85. Anything else is pitch-shifted, up to ±3 semitones. Then it tries every target key against every way of assigning songs to layers, and keeps the one with the most material and the least shifting. |
| 4. Separation | `mashup/separate.py` | Demucs (htdemucs) splits each song into drums, bass, vocals and other, so 5 songs give 20 stems. "lite" is a rough DSP version for comparison. |
| 5. Melody extraction | `mashup/melody.py` | Basic Pitch turns the vocals and other stems into notes. Low-confidence notes are dropped, the rest are snapped to 16ths on the song's own beat grid, only the top voice is kept, and everything is transposed into the target key. |
| 6. Generation | `mashup/generate.py` | A tiny MusicVAE-style model (GRU encoder and decoder, 16-number latent space) trains on your 2-bar phrases in about 20 s. It then moves through latent space from a vocal phrase to an instrumental phrase, is played by a small built-in synth, and is saved as MIDI too. The report shows how close the result is to any source phrase. |
| 7. Assembly | `mashup/assemble.py` | Target tempo is the median of the songs. For each layer it takes the strongest N-bar section, cut on downbeats, and Rubber Band stretches it to exactly N bars and shifts its pitch into the target key in one pass. Layers are level-matched, looped on a shared grid, arranged into sections, side-chained to the kick, and soft-limited. |

`mashup/pipeline.py` connects the stages, and `app.py` / `cli.py` are the two front ends.

**Why not the real MusicVAE?** Magenta's MusicVAE needs an old TensorFlow 1.x
stack that won't install on current Python. `generate.py` rebuilds the same
idea in about 150 lines of PyTorch, which you'd have installed for Demucs
anyway, and it's much easier to read.

### Arrangement (64 bars)

| intro 8 | build 8 | verse 16 | breakdown 8 | drop 16 | outro 8 |
|---|---|---|---|---|---|
| drums, music | + bass | + vocals | music, texture, melody, soft vocals | everything | drums, music, fade |

The section plan is the `ARRANGEMENT` list at the top of `assemble.py`.
Change it to try other structures.

## Ideas to try

- Set **creativity** to 0 and then 1, with the same seed. At 0 the melody
  stays close to the source phrases. At 1 it drifts further away.
- Run the same songs with **lite** and then **demucs**, and solo `layers/vocals.wav`
  from each to hear how much bleed there is.
- Set **strict** key matching and see how the choices in the report change.
- Drag the `layers/` WAVs and the MIDI into your DAW and rework the arrangement yourself.

## Tests

```bash
pytest -q      # uses synthetic songs, so no audio files are needed; uses the lite separator
```

## Using other people's music

This is for private learning and experiments. If you want to play or release
a result (for example in a DJ set or online), you'll need rights to the
source songs, or use only your own stems and the generated melody.
