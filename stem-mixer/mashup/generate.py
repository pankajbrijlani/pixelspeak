"""Stage 6 — generation: a tiny MusicVAE-style model trained on your songs.

About MusicVAE: Magenta's original needs a TensorFlow 1.x-era stack that no
longer installs on current Python, so this is a small re-implementation of the
same idea in PyTorch (already installed for Demucs):

    2-bar melody (32 sixteenth-note tokens)
        -> bidirectional GRU encoder -> latent vector z (16 numbers)
        -> GRU decoder conditioned on z -> 2-bar melody again

Trained as a variational autoencoder, nearby points in z give similar melodies,
so walking from melody A's z to melody B's z gives phrases that morph from one
into the other — new material rather than a copy. We measure that too: every
generated phrase is compared with every training phrase and the report shows
the closest match.

Tokens per 16th step: 0 = rest, 1 = hold previous note, 2.. = MIDI pitch 48–84.
"""

from __future__ import annotations

import random
from dataclasses import dataclass

import numpy as np

from . import SR
from .analysis import Key
from .melody import STEPS_PER_BAR, Note

REST, HOLD, LOW, HIGH = 0, 1, 48, 84
VOCAB = 2 + HIGH - LOW + 1
START = VOCAB  # extra decoder-only token
WINDOW = 2 * STEPS_PER_BAR


@dataclass
class Phrase:
    tokens: np.ndarray  # (32,) int
    source: str  # e.g. "2: songname / vocals @ bar 17"


def to_tokens(notes: list[Note], start: int) -> np.ndarray:
    grid = np.full(WINDOW, REST, dtype=np.int64)
    for n in notes:
        pos = n.step - start
        if not 0 <= pos < WINDOW:
            continue
        p = n.pitch
        while p < LOW:
            p += 12
        while p > HIGH:
            p -= 12
        grid[pos] = 2 + p - LOW
        for k in range(1, n.length):
            if pos + k < WINDOW and grid[pos + k] == REST:
                grid[pos + k] = HOLD
    return grid


def from_tokens(tokens: np.ndarray, offset: int = 0) -> list[Note]:
    notes: list[Note] = []
    current = None
    for i, t in enumerate(tokens):
        if t >= 2:
            current = Note(offset + i, 1, LOW + int(t) - 2)
            notes.append(current)
        elif t == HOLD and current is not None:
            current.length += 1
        else:
            current = None
    return notes


def phrases_from(notes: list[Note], source: str, min_onsets: int = 4) -> list[Phrase]:
    if not notes:
        return []
    last_bar = notes[-1].step // STEPS_PER_BAR
    out = []
    for bar in range(0, last_bar, 1):
        tok = to_tokens(notes, bar * STEPS_PER_BAR)
        if (tok >= 2).sum() >= min_onsets:
            out.append(Phrase(tok, f"{source} @ bar {bar + 1}"))
    return out


def snap_to_scale(notes: list[Note], key: Key) -> list[Note]:
    scale = key.scale
    for n in notes:
        for d in (0, -1, 1, -2, 2):
            if (n.pitch + d) % 12 in scale:
                n.pitch += d
                break
    return notes


def similarity(a: np.ndarray, b: np.ndarray) -> float:
    active = (a != REST) | (b != REST)
    return float((a[active] == b[active]).mean()) if active.any() else 1.0


# ---- the model --------------------------------------------------------------


def _build_model():
    import torch
    from torch import nn

    class MelodyVAE(nn.Module):
        def __init__(self, emb=48, hid=128, zdim=16):
            super().__init__()
            self.emb = nn.Embedding(VOCAB + 1, emb)
            self.enc = nn.GRU(emb, hid, batch_first=True, bidirectional=True)
            self.to_mu = nn.Linear(2 * hid, zdim)
            self.to_logvar = nn.Linear(2 * hid, zdim)
            self.z_to_h = nn.Linear(zdim, hid)
            self.dec = nn.GRU(emb + zdim, hid, batch_first=True)
            self.out = nn.Linear(hid, VOCAB)

        def encode(self, x):
            _, h = self.enc(self.emb(x))
            h = torch.cat([h[0], h[1]], dim=-1)
            return self.to_mu(h), self.to_logvar(h)

        def decode_teacher(self, z, x, word_dropout=0.0):
            prev = torch.cat([torch.full_like(x[:, :1], START), x[:, :-1]], dim=1)
            if word_dropout:
                # hide some of the true previous notes so the decoder must lean on z
                prev = torch.where(torch.rand(prev.shape) < word_dropout, torch.full_like(prev, REST), prev)
            e = self.emb(prev)
            zz = z[:, None, :].expand(-1, x.shape[1], -1)
            h0 = torch.tanh(self.z_to_h(z))[None]
            o, _ = self.dec(torch.cat([e, zz], dim=-1), h0)
            return self.out(o)

        @torch.no_grad()
        def sample(self, z, temperature=1.0, generator=None):
            tok = torch.full((z.shape[0],), START, dtype=torch.long)
            h = torch.tanh(self.z_to_h(z))[None]
            result = []
            for t in range(WINDOW):
                inp = torch.cat([self.emb(tok), z], dim=-1)[:, None]
                o, h = self.dec(inp, h)
                logits = self.out(o[:, 0]) / max(temperature, 1e-3)
                if t == 0:
                    logits[:, HOLD] = -1e9
                else:
                    logits[tok == REST, HOLD] = -1e9  # can't hold a rest
                tok = torch.multinomial(torch.softmax(logits, -1), 1, generator=generator)[:, 0]
                result.append(tok)
            return torch.stack(result, dim=1)

    return MelodyVAE()


def _octave_augment(x):
    import torch

    x = x.clone()
    for row in x:
        pitched = row >= 2
        if not pitched.any():
            continue
        lo, hi = int(row[pitched].min()), int(row[pitched].max())
        options = [o for o in (-12, 0, 12) if lo + o >= 2 and hi + o < VOCAB]
        row[pitched] += random.choice(options)
    return x


def train(phrases: list[Phrase], seed: int, steps: int = 700, log=print):
    import torch
    import torch.nn.functional as F

    torch.manual_seed(seed)
    random.seed(seed)
    model = _build_model()
    opt = torch.optim.Adam(model.parameters(), lr=2e-3)
    data = torch.tensor(np.stack([p.tokens for p in phrases]))
    batch = min(64, len(data))
    for it in range(steps):
        x = _octave_augment(data[torch.randint(0, len(data), (batch,))])
        mu, logvar = model.encode(x)
        z = mu + torch.randn_like(mu) * torch.exp(0.5 * logvar)
        logits = model.decode_teacher(z, x, word_dropout=0.5)
        recon = F.cross_entropy(logits.reshape(-1, VOCAB), x.reshape(-1))
        kl_dims = -0.5 * torch.mean(1 + logvar - mu**2 - logvar.exp(), dim=0)
        kl = kl_dims.sum()
        # "free bits": don't penalise the first 0.25 nats per dimension. Without
        # this, a tiny dataset lets the decoder ignore z entirely (posterior
        # collapse) and interpolation would do nothing.
        beta = 0.2 * min(1.0, it / (steps / 2))  # KL warm-up
        loss = recon + beta * torch.clamp(kl_dims, min=0.25).sum()
        opt.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()
        if it % 175 == 0 or it == steps - 1:
            log(f"    step {it:4d}  reconstruction {recon.item():.3f}  KL {kl.item():.3f}")
    model.eval()
    return model


def _slerp(a, b, t):
    import torch

    an, bn = a / a.norm(), b / b.norm()
    omega = torch.acos(torch.clamp((an * bn).sum(), -1, 1))
    if omega.abs() < 1e-4:
        return (1 - t) * a + t * b
    return (torch.sin((1 - t) * omega) * a + torch.sin(t * omega) * b) / torch.sin(omega)


@dataclass
class Generated:
    notes: list[Note]
    phrase_a: str
    phrase_b: str
    closest_match: float  # 0..1, highest similarity of any generated phrase to any source phrase


def generate(
    pool_a: list[Phrase],
    pool_b: list[Phrase],
    all_phrases: list[Phrase],
    key: Key,
    bars: int,
    creativity: float,
    seed: int,
    log=print,
) -> Generated:
    """Interpolate from a phrase in pool_a to one in pool_b across `bars` bars."""
    import torch

    model = train(all_phrases, seed, log=log)
    rng = random.Random(seed)

    def pick(pool):  # favour busier phrases: they make better hooks
        ranked = sorted(pool, key=lambda p: int((p.tokens >= 2).sum()), reverse=True)
        return rng.choice(ranked[: max(1, len(ranked) // 3)])

    a, b = pick(pool_a), pick(pool_b)
    with torch.no_grad():
        za, _ = model.encode(torch.tensor(a.tokens)[None])
        zb, _ = model.encode(torch.tensor(b.tokens)[None])
    gen = torch.Generator().manual_seed(seed)
    temperature = 0.4 + 0.9 * creativity
    n_phrases = max(1, bars // 2)
    ts = np.linspace(0.15, 0.85, n_phrases) if n_phrases > 1 else [0.5]

    notes, closest = [], 0.0
    for i, t in enumerate(ts):
        z = _slerp(za[0], zb[0], float(t))[None]
        z = z + torch.randn(z.shape, generator=gen) * 0.4 * creativity
        for _ in range(8):  # retry a few times if the decoder gives us silence
            tokens = model.sample(z, temperature, gen)[0].numpy()
            if (tokens >= 2).sum() >= 3:
                break
        closest = max(closest, max(similarity(tokens, p.tokens) for p in all_phrases))
        notes += from_tokens(tokens, offset=i * WINDOW)
    return Generated(snap_to_scale(notes, key), a.source, b.source, closest)


# ---- rendering ----------------------------------------------------------------


def render(notes: list[Note], bpm: float, bars: int, sr: int = SR) -> np.ndarray:
    """A small soft synth: two detuned band-limited saws, ADSR, dotted-8th delay."""
    step = 60.0 / bpm / 4
    n_total = int(round(bars * STEPS_PER_BAR * step * sr))
    out = np.zeros((2, n_total), dtype=np.float32)
    attack, decay, sustain, release = 0.006, 0.15, 0.55, 0.12
    for n in notes:
        dur = n.length * step
        length = int((dur + release) * sr)
        t = np.arange(length) / sr
        env = np.where(
            t < attack,
            t / attack,
            np.where(t < attack + decay, 1 - (1 - sustain) * (t - attack) / decay, sustain),
        )
        env = np.where(t > dur, env * np.clip(1 - (t - dur) / release, 0, 1), env)
        base = 440.0 * 2 ** ((n.pitch - 69) / 12)
        for ch, cents in enumerate((-7, 7)):
            f = base * 2 ** (cents / 1200)
            wave = np.zeros(length)
            for k in range(1, int(min(12, 9000 / f)) + 1):
                wave += np.sin(2 * np.pi * k * f * t) / k * np.exp(-0.18 * k)
            start = int(n.step * step * sr)
            seg = (wave * env * n.velocity * 0.25).astype(np.float32)
            end = min(n_total, start + length)
            if start < n_total:
                out[ch, start:end] += seg[: end - start]
    # ping-pong dotted-8th delay: odd repeats swap left and right
    d = int(0.75 * 60.0 / bpm * sr)
    wet = np.zeros_like(out)
    for i in range(1, 4):
        if d * i < n_total:
            src = out[::-1] if i % 2 else out
            wet[:, d * i :] += (0.35**i) * src[:, : n_total - d * i]
    return out + wet


def write_midi(notes: list[Note], bpm: float, path) -> None:
    import pretty_midi

    pm = pretty_midi.PrettyMIDI(initial_tempo=bpm)
    inst = pretty_midi.Instrument(program=81, name="Generated lead")
    step = 60.0 / bpm / 4
    for n in notes:
        inst.notes.append(
            pretty_midi.Note(int(n.velocity * 110), n.pitch, n.step * step, (n.step + n.length) * step)
        )
    pm.instruments.append(inst)
    pm.write(str(path))
