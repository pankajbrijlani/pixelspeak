"""Stage 3 — compatibility scoring on the Camelot wheel.

Rules of thumb (the same ones DJs use):
    same code (8A–8A)                 -> 1.00  perfect
    relative major/minor (8A–8B)      -> 0.90  same notes, different mood
    ±1 on the wheel, same letter      -> 0.85  one note differs, blends well
    ±1 and letter swap (8A–9B)        -> 0.60  usable, a bit of tension
    anything else                     -> pitch-shift it, capped at ±3 semitones
"""

from __future__ import annotations

import itertools

from .analysis import ALL_KEYS, Key

GOOD_BLEND = 0.85


def wheel_distance(a: Key, b: Key) -> int:
    d = abs(a.camelot_number - b.camelot_number)
    return min(d, 12 - d)


def key_score(a: Key, b: Key) -> float:
    d, same_letter = wheel_distance(a, b), a.mode == b.mode
    if d == 0:
        return 1.0 if same_letter else 0.9
    if d == 1:
        return 0.85 if same_letter else 0.6
    if d == 2 and same_letter:
        return 0.35
    return 0.1


def best_shift(src: Key, target: Key, strict: bool = False) -> tuple[int, float]:
    """Smallest pitch shift (semitones) that makes `src` sit well with `target`.

    strict=False accepts anything scoring >= 0.85 (same, relative, or ±1).
    strict=True only accepts the same set of notes (same code or relative).
    Returns (shift, score after shifting).
    """
    need = 0.9 if strict else GOOD_BLEND
    best = None
    for s in sorted(range(-6, 7), key=abs):
        score = key_score(src.transpose(s), target)
        if score >= need and (best is None or abs(s) < abs(best[0]) or (abs(s) == abs(best[0]) and score > best[1])):
            best = (s, score)
    assert best is not None  # any key can be moved onto any other within ±6
    return best


def pair_label(a: Key, b: Key, max_shift: int) -> tuple[float, str]:
    """Score for blending two tracks, and a short human-readable reason."""
    direct = key_score(a, b)
    if direct >= GOOD_BLEND:
        why = {1.0: "same key", 0.9: "relative maj/min", 0.85: "±1 on wheel"}[direct]
        return direct, why
    s, _ = best_shift(b, a)
    if abs(s) <= max_shift:
        return round(0.75 - 0.1 * abs(s), 2), f"shift {s:+d} st"
    return 0.0, f"clash (needs {s:+d} st)"


def compat_matrix(keys: list[Key], max_shift: int) -> list[list[str]]:
    rows = []
    for a in keys:
        row = []
        for b in keys:
            score, why = pair_label(a, b, max_shift)
            row.append(f"{score:.2f} · {why}")
        rows.append(row)
    return rows


# ---- choosing a target key + which track supplies which stem ---------------

# How much each role cares about pitch shifting. Drums are unpitched.
SHIFT_COST = {"drums": 0.0, "bass": 0.08, "vocals": 0.15, "music": 0.08, "texture": 0.05}


def plan(
    keys: list[Key],
    presence: list[dict[str, float]],
    max_shift: int,
    strict: bool = False,
    fixed_key: Key | None = None,
    fixed_roles: dict[str, int | None] | None = None,
) -> tuple[Key, dict[str, int], dict[int, int]]:
    """Jointly pick a target key and a track for each role.

    presence[i][role] is 0..1: how much usable material track i has for that role.
    fixed_roles maps role -> track index (0-based), or None to leave the role out.
    Tries every key × every assignment (tiny search space for ≤5 tracks) and
    keeps the one with the most material and the least pitch shifting.
    Returns (target key, role -> track index, track index -> semitone shift).
    """
    fixed_roles = dict(fixed_roles or {})
    n = len(keys)
    if n < 5 and fixed_roles.get("texture", "auto") == "auto":
        fixed_roles["texture"] = None  # texture is the 5th song's extra layer
    roles = [r for r in SHIFT_COST if fixed_roles.get(r, "auto") is not None]
    auto_roles = [r for r in roles if fixed_roles.get(r, "auto") == "auto"]
    candidate_keys = [fixed_key] if fixed_key else ALL_KEYS

    best = None
    for target in candidate_keys:
        shifts = {i: best_shift(k, target, strict)[0] for i, k in enumerate(keys)}
        # with fewer tracks than roles, allow a track to supply several stems
        pools = (
            itertools.permutations(range(n), len(auto_roles))
            if n >= len(auto_roles)
            else itertools.product(range(n), repeat=len(auto_roles))
        )
        for combo in pools:
            assign = {r: fixed_roles[r] for r in roles if r not in auto_roles}
            assign.update(zip(auto_roles, combo))
            score = 0.0
            for role, i in assign.items():
                if role != "drums" and abs(shifts[i]) > max_shift:
                    score -= 5  # would need too much shifting: effectively banned
                score += presence[i].get(role, 0.0) - SHIFT_COST[role] * abs(shifts[i])
            # it's a mashup: prefer spreading layers across as many songs as possible
            score -= 0.4 * (len(assign) - len(set(assign.values())))
            if "texture" in assign and assign["texture"] == assign.get("music"):
                score -= 1  # both are the "other" stem: same track would just double it
            if best is None or score > best[0]:
                best = (score, target, assign, shifts)
    _, target, assign, shifts = best
    return target, assign, shifts
