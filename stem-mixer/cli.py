"""Command-line version of the app.

    python cli.py song1.mp3 song2.mp3 song3.mp3 --bars 8 --creativity 0.6
"""

from __future__ import annotations

import argparse
from pathlib import Path

from mashup import ROLES
from mashup.pipeline import Settings, build

HERE = Path(__file__).parent


def main() -> None:
    p = argparse.ArgumentParser(description="Make one track out of 2–5 songs.")
    p.add_argument("songs", nargs="+", type=Path)
    p.add_argument("--lite", action="store_true", help="fast DSP separation instead of Demucs")
    p.add_argument("--strict", action="store_true", help="only blend identical/relative keys")
    p.add_argument("--key", help="target Camelot code, e.g. 8A (default: auto)")
    p.add_argument("--bpm", type=float, help="target tempo (default: median)")
    p.add_argument("--bars", type=int, default=8, choices=(4, 8, 16))
    p.add_argument("--max-shift", type=int, default=3)
    p.add_argument("--seconds", type=float, help="only use this many seconds from the middle of each song")
    p.add_argument("--no-melody", action="store_true")
    p.add_argument("--creativity", type=float, default=0.5)
    p.add_argument("--confidence", type=float, default=0.35)
    p.add_argument("--seed", type=int, default=0)
    for role in ROLES:
        p.add_argument(f"--{role}", type=int, help=f"song number (1-based) for {role}; 0 = leave out")
    p.add_argument("--out", type=Path, default=HERE / "output")
    a = p.parse_args()

    result = build(
        a.songs,
        Settings(
            separator="lite" if a.lite else "demucs",
            strict_key=a.strict,
            target_key=a.key,
            target_bpm=a.bpm,
            loop_bars=a.bars,
            max_shift=a.max_shift,
            max_seconds=a.seconds,
            roles={r: getattr(a, r) for r in ROLES if getattr(a, r) is not None},
            melody=not a.no_melody,
            creativity=a.creativity,
            min_confidence=a.confidence,
            seed=a.seed,
            cache_dir=HERE / "cache",
            out_dir=a.out,
        ),
    )
    print()
    print(result.report)
    print(f"Mix: {result.mix_wav}")


if __name__ == "__main__":
    main()
