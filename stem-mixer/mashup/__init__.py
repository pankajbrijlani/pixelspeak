"""Stem Mashup Lab — turn 2–5 songs into one new track, stage by stage.

Stages (one module each, so you can read them in order):
    1. ingest      -> mashup.audio
    2. analysis    -> mashup.analysis
    3. compat      -> mashup.compat
    4. separation  -> mashup.separate
    5. melody      -> mashup.melody
    6. generation  -> mashup.generate
    7. assembly    -> mashup.assemble
The whole thing is wired together in mashup.pipeline.
"""

SR = 44100
ROLES = ("drums", "bass", "vocals", "music", "texture")
