#!/usr/bin/env python3
"""
gen_audio.py — Generate the 8-bit / chiptune audio starter set into ./audio/.

PURE STDLIB — only `wave`, `struct`, `math`, `random`. No numpy, no SciPy, so
this runs on any Python 3 install (and in CI) with zero deps. 8-bit unsigned
PCM at 22050 Hz mono is deliberate: it IS the aesthetic (gritty NES/Game Boy
voicing) AND keeps every file tiny (a 0.3 s SFX is ~6.6 KB, the 5.4 s bed is
~119 KB).

Run from the repo root (or anywhere — paths are resolved relative to this file):

    python tools/gen_audio.py

Outputs (created if missing) into <repo>/audio/:

    SFX  (<= ~0.4 s each)
      sfx_tick       tiny blip — stroke lock / keypress
      sfx_correct    bright rising 2-3 note hit
      sfx_wrong      short descending buzz / noise
      sfx_nav        soft UI tap
      sfx_rankup     triumphant ascending arpeggio sting (~0.8 s)
      sfx_hot        punchy gold/silver sting
      sfx_milestone  streak chime

    BED  (seamless loop, integer multiple of 1.8 s to match --kb-beat)
      amb_challenge  chipper arcade loop: bouncy arp + bass + noise hat (5.4 s)

The convert step (tools/convert_audio.py) can later transcode these .wav files
to .ogg/.m4a; AudioManager (data/audio.js) falls back to .wav, so the wavs are
fully functional on their own.
"""

import math
import os
import random
import struct
import sys
import wave

# Windows consoles default to cp1252 — force UTF-8 so any unicode in prints
# survives (mirrors tools/build-kanji-words.py).
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except (AttributeError, OSError):
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO_DIR = os.path.join(ROOT, "audio")

SAMPLE_RATE = 22050           # Hz, mono
BEAT = 1.8                    # seconds — mirrors the app's shared --kb-beat

# Deterministic noise so regenerating produces byte-identical files (the .wav
# outputs are committed, like icons / kanji-words.json).
_RNG = random.Random(0x8B17AD)


# ─────────────────────────────────────────────────────────────────────────
# Core synth vocabulary. Everything works on plain python lists of floats in
# roughly [-1, 1]; the final write_wav() clamps + quantises to 8-bit unsigned.
# ─────────────────────────────────────────────────────────────────────────

def _osc(phase, wave_type, duty):
    """One sample of a normalised [-1,1] waveform at the given phase [0,1)."""
    if wave_type == "square":
        return 1.0 if (phase % 1.0) < 0.5 else -1.0
    if wave_type == "pulse":
        return 1.0 if (phase % 1.0) < duty else -1.0
    if wave_type == "triangle":
        p = phase % 1.0
        # /\  ramp up 0..0.5 then down — classic triangle.
        return 4.0 * abs(p - 0.5) - 1.0
    if wave_type == "saw":
        p = phase % 1.0
        return 2.0 * p - 1.0
    if wave_type == "noise":
        return _RNG.uniform(-1.0, 1.0)
    raise ValueError(f"unknown wave type: {wave_type!r}")


def tone(freq, dur, wave_type="square", vol=0.8, duty=0.5):
    """Generate a tone. freq in Hz (ignored for noise), dur in seconds.

    Returns a list of float samples. For 'noise', freq is unused. To soften
    the raw 8-bit edge, square/pulse get a hair of phase quantisation removed
    by just running the oscillator continuously (no anti-aliasing — that's the
    point of chiptune).
    """
    n = max(1, int(round(dur * SAMPLE_RATE)))
    out = [0.0] * n
    if wave_type == "noise":
        for i in range(n):
            out[i] = _osc(0.0, "noise", duty) * vol
        return out
    step = freq / SAMPLE_RATE
    phase = 0.0
    for i in range(n):
        out[i] = _osc(phase, wave_type, duty) * vol
        phase += step
    return out


def adsr(samples, a=0.01, d=0.02, s=0.7, r=0.05):
    """Apply a linear ADSR envelope in-place-ish (returns a new list).

    a/d/r are seconds; s is the 0..1 sustain LEVEL. The sustain SEGMENT fills
    whatever time is left after attack+decay+release; if the note is too short
    to fit all phases, attack/decay/release scale down proportionally so we
    never index past the buffer (and the tail still returns to ~0 to avoid
    clicks).
    """
    n = len(samples)
    if n == 0:
        return samples
    a_n = int(a * SAMPLE_RATE)
    d_n = int(d * SAMPLE_RATE)
    r_n = int(r * SAMPLE_RATE)
    # If the fixed phases overflow the note, squeeze them to fit (keep ~10%
    # for release so the tail always lands on zero).
    fixed = a_n + d_n + r_n
    if fixed >= n:
        scale = max(0.0, (n - 1)) / max(1, fixed)
        a_n = int(a_n * scale)
        d_n = int(d_n * scale)
        r_n = int(r_n * scale)
    sus_n = n - a_n - d_n - r_n
    if sus_n < 0:
        sus_n = 0

    out = [0.0] * n
    i = 0
    # Attack 0 -> 1
    for k in range(a_n):
        out[i] = samples[i] * (k / a_n if a_n else 1.0)
        i += 1
    # Decay 1 -> s
    for k in range(d_n):
        out[i] = samples[i] * (1.0 - (1.0 - s) * (k / d_n if d_n else 1.0))
        i += 1
    # Sustain s
    for _ in range(sus_n):
        out[i] = samples[i] * s
        i += 1
    # Release s -> 0
    for k in range(r_n):
        out[i] = samples[i] * s * (1.0 - (k / r_n if r_n else 1.0))
        i += 1
    # Any rounding remainder -> silence
    while i < n:
        out[i] = 0.0
        i += 1
    return out


def mix(*tracks):
    """Sum any number of equal-or-unequal-length tracks; output length is the
    longest input. Shorter tracks are treated as silence past their end. No
    normalisation here — keep voice volumes sane and rely on write_wav's
    soft-clamp."""
    if not tracks:
        return []
    n = max(len(t) for t in tracks)
    out = [0.0] * n
    for t in tracks:
        for i, v in enumerate(t):
            out[i] += v
    return out


def concat(*tracks):
    """End-to-end concatenation."""
    out = []
    for t in tracks:
        out.extend(t)
    return out


def silence(dur):
    return [0.0] * max(0, int(round(dur * SAMPLE_RATE)))


def gain(samples, g):
    return [s * g for s in samples]


def pad_to(samples, dur):
    """Pad with trailing silence to an exact duration (truncates if longer)."""
    n = int(round(dur * SAMPLE_RATE))
    if len(samples) >= n:
        return samples[:n]
    return samples + [0.0] * (n - len(samples))


# Equal-tempered note helper. A4 = 440 Hz. note('C4'), note('A4'), etc.
_NOTE_SEMITONE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def note(name):
    """'A4' / 'C#5' / 'Eb3' -> frequency in Hz."""
    letter = name[0].upper()
    i = 1
    semis = _NOTE_SEMITONE[letter]
    if i < len(name) and name[i] in "#b":
        semis += 1 if name[i] == "#" else -1
        i += 1
    octave = int(name[i:])
    midi = semis + (octave + 1) * 12      # MIDI: C-1 = 0, so C4 = 60
    return 440.0 * (2.0 ** ((midi - 69) / 12.0))


def arp(chord, dur, wave_type="pulse", vol=0.7, duty=0.5,
        a=0.005, d=0.01, s=0.6, r=0.02):
    """Arpeggiate a chord — play each note for dur/len(chord) seconds in turn,
    each with its own short ADSR. `chord` is a list of note names or Hz floats.
    Returns one concatenated track of total length ~dur."""
    if not chord:
        return silence(dur)
    step = dur / len(chord)
    out = []
    for c in chord:
        f = c if isinstance(c, (int, float)) else note(c)
        out.extend(adsr(tone(f, step, wave_type, vol, duty), a, d, s, r))
    return out


# ─────────────────────────────────────────────────────────────────────────
# Seamless loop builder.
# ─────────────────────────────────────────────────────────────────────────

def make_loop(samples, loop_dur, wrap_ms=12.0):
    """Force `samples` to an exact integer-sample length matching loop_dur and
    apply a tiny wrap crossfade so the END blends into the START — when the
    player wraps `last sample -> first sample` there's no discontinuity click.

    How the wrap crossfade works: take the first `wrap` samples (the head) and
    crossfade them OVER the last `wrap` samples (the tail), so the tail morphs
    into exactly what the head sounds like. On wrap, tail[end] ≈ head[0], and
    the slope matches too, killing the click.
    """
    target = int(round(loop_dur * SAMPLE_RATE))
    s = list(samples)
    if len(s) < target:
        s = s + [0.0] * (target - len(s))
    else:
        s = s[:target]

    wrap = int(round((wrap_ms / 1000.0) * SAMPLE_RATE))
    wrap = max(1, min(wrap, target // 4))
    # Crossfade: for the last `wrap` samples, fade tail out while fading the
    # head's first `wrap` samples in on top.
    for k in range(wrap):
        t = k / wrap                      # 0..1 across the wrap region
        tail_i = target - wrap + k
        head_v = s[k]
        s[tail_i] = s[tail_i] * (1.0 - t) + head_v * t
    return s


# ─────────────────────────────────────────────────────────────────────────
# WAV writer — 22050 Hz, mono, 8-bit UNSIGNED PCM.
# ─────────────────────────────────────────────────────────────────────────

def write_wav(path, samples):
    """Clamp to [-1,1], quantise to 8-bit unsigned (0..255, center 128), write."""
    frames = bytearray(len(samples))
    for i, v in enumerate(samples):
        if v > 1.0:
            v = 1.0
        elif v < -1.0:
            v = -1.0
        # Map [-1,1] -> [0,255], center at 128 (unsigned 8-bit PCM).
        q = int(round((v + 1.0) * 127.5))
        if q < 0:
            q = 0
        elif q > 255:
            q = 255
        frames[i] = q
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(1)            # 8-bit
        w.setframerate(SAMPLE_RATE)
        w.writeframes(bytes(frames))


# ─────────────────────────────────────────────────────────────────────────
# The starter set.
# ─────────────────────────────────────────────────────────────────────────

def sfx_tick():
    """Tiny blip — stroke lock / keypress. ~0.05 s, very dry."""
    t = tone(note("A6"), 0.045, "square", vol=0.55)
    return adsr(t, a=0.001, d=0.008, s=0.4, r=0.03)


def sfx_nav():
    """Soft UI tap — a touch lower & rounder than the tick (triangle)."""
    t = tone(note("E5"), 0.07, "triangle", vol=0.6)
    return adsr(t, a=0.002, d=0.02, s=0.45, r=0.045)


def sfx_correct():
    """Bright rising 2-3 note hit. C5 -> E5 -> G5, quick and punchy."""
    n1 = adsr(tone(note("C5"), 0.06, "pulse", vol=0.7, duty=0.5), a=0.002, d=0.01, s=0.7, r=0.02)
    n2 = adsr(tone(note("E5"), 0.06, "pulse", vol=0.7, duty=0.5), a=0.002, d=0.01, s=0.7, r=0.02)
    n3 = adsr(tone(note("G5"), 0.12, "pulse", vol=0.75, duty=0.5), a=0.002, d=0.02, s=0.7, r=0.06)
    return concat(n1, n2, n3)


def sfx_wrong():
    """Short descending buzz — two low square notes + a noise crunch."""
    n1 = adsr(tone(note("A3"), 0.08, "square", vol=0.6), a=0.002, d=0.02, s=0.6, r=0.03)
    n2 = adsr(tone(note("F3"), 0.13, "square", vol=0.6), a=0.002, d=0.02, s=0.55, r=0.06)
    crunch = adsr(tone(0, 0.10, "noise", vol=0.28), a=0.001, d=0.03, s=0.3, r=0.05)
    body = concat(n1, n2)
    return mix(body, concat(silence(0.04), crunch))


def sfx_rankup():
    """Triumphant ascending arpeggio sting (~0.8 s). Major arp + octave cap,
    with a sustained top note and a sparkle on top."""
    a = arp(["C5", "E5", "G5", "C6", "E6"], 0.45, wave_type="pulse",
            vol=0.62, duty=0.5, a=0.003, d=0.02, s=0.7, r=0.03)
    # Held shining top note.
    top = adsr(tone(note("G6"), 0.32, "pulse", vol=0.6, duty=0.25),
               a=0.01, d=0.04, s=0.7, r=0.18)
    # Underlying bass thump for body.
    bass = adsr(tone(note("C3"), 0.5, "triangle", vol=0.45),
                a=0.005, d=0.1, s=0.5, r=0.3)
    tail = mix(top, gain(bass[:len(top)], 1.0))
    return mix(concat(a, tail), gain(pad_to(bass, (len(a) + len(tail)) / SAMPLE_RATE), 1.0))


def sfx_hot():
    """Punchy gold/silver sting — a tight, bright stab with a shimmer."""
    stab = adsr(tone(note("E6"), 0.09, "pulse", vol=0.7, duty=0.25), a=0.001, d=0.02, s=0.6, r=0.04)
    up = adsr(tone(note("B6"), 0.14, "pulse", vol=0.65, duty=0.25), a=0.001, d=0.03, s=0.6, r=0.07)
    shimmer = adsr(tone(0, 0.06, "noise", vol=0.18), a=0.001, d=0.02, s=0.3, r=0.03)
    return mix(concat(stab, up), shimmer)


def sfx_milestone():
    """Streak chime — sparkly two-note bell with a triangle tail."""
    n1 = adsr(tone(note("G5"), 0.1, "triangle", vol=0.6), a=0.002, d=0.03, s=0.6, r=0.05)
    n2 = adsr(tone(note("C6"), 0.22, "triangle", vol=0.62), a=0.002, d=0.05, s=0.6, r=0.12)
    # A fifth above ringing under the top note for a bell-ish beat.
    ring = adsr(tone(note("G6"), 0.22, "triangle", vol=0.3), a=0.002, d=0.06, s=0.5, r=0.12)
    return concat(n1, mix(n2, ring))


def amb_challenge():
    """Chipper arcade loop: bouncy pulse arpeggio + simple square bass + light
    noise hat. Length = 3 * BEAT = 5.4 s for a roomy, non-repetitive-feeling
    loop that still lands exactly on the --kb-beat grid.

    Structure: 3 bars of 1.8 s. Each bar is a 4-on-the-floor bass with an
    eighth-note arpeggio riding on top and a hat ticking the offbeats.
    """
    loop_dur = 3 * BEAT                    # 5.4 s
    bar = BEAT                             # 1.8 s per bar
    eighth = bar / 8.0                     # 8 eighth-notes per bar

    # — Bass: root notes per bar, a simple I-vi-IV-ish motion (C, A, F) —
    bar_roots = ["C3", "A2", "F2"]
    bass = []
    for root in bar_roots:
        # Quarter-note pulse: 4 hits per bar, each an eighth-note long with a
        # gap for bounce.
        for _ in range(4):
            hit = adsr(tone(note(root), eighth * 0.9, "square", vol=0.5, duty=0.5),
                       a=0.002, d=0.03, s=0.55, r=0.04)
            bass.extend(pad_to(hit, eighth * 2))  # hit + rest = quarter note

    # — Lead arpeggio: bouncy eighth-note pulse riding a chord per bar —
    bar_chords = [
        ["C5", "E5", "G5", "E5", "C5", "E5", "G5", "C6"],   # C major
        ["A4", "C5", "E5", "C5", "A4", "C5", "E5", "A5"],   # A minor
        ["F4", "A4", "C5", "A4", "F4", "A4", "C5", "F5"],   # F major
    ]
    lead = []
    for chord in bar_chords:
        for nm in chord:
            v = adsr(tone(note(nm), eighth * 0.85, "pulse", vol=0.4, duty=0.33),
                     a=0.002, d=0.02, s=0.5, r=0.03)
            lead.extend(pad_to(v, eighth))

    # — Hat: light noise on the offbeats (every other eighth) —
    hat = []
    for b in range(3):
        for e in range(8):
            if e % 2 == 1:
                h = adsr(tone(0, eighth * 0.35, "noise", vol=0.12),
                         a=0.001, d=0.01, s=0.2, r=0.02)
                hat.extend(pad_to(h, eighth))
            else:
                hat.extend(silence(eighth))

    bed = mix(bass, lead, hat)
    bed = pad_to(bed, loop_dur)
    # Slightly larger wrap region for a musical bed so the seam is inaudible.
    return make_loop(bed, loop_dur, wrap_ms=18.0)


GENERATORS = {
    "sfx_tick":      sfx_tick,
    "sfx_correct":   sfx_correct,
    "sfx_wrong":     sfx_wrong,
    "sfx_nav":       sfx_nav,
    "sfx_rankup":    sfx_rankup,
    "sfx_hot":       sfx_hot,
    "sfx_milestone": sfx_milestone,
    "amb_challenge": amb_challenge,
}


def main():
    os.makedirs(AUDIO_DIR, exist_ok=True)
    print(f"Generating audio into {AUDIO_DIR}")
    print(f"  format: {SAMPLE_RATE} Hz, mono, 8-bit unsigned PCM\n")
    total = 0
    for name, fn in GENERATORS.items():
        # Reseed per-asset so each file is deterministic regardless of order.
        _RNG.seed(0x8B17AD ^ hash(name) & 0xFFFFFFFF)
        samples = fn()
        path = os.path.join(AUDIO_DIR, name + ".wav")
        write_wav(path, samples)
        size = os.path.getsize(path)
        total += size
        dur = len(samples) / SAMPLE_RATE
        print(f"  wrote {name + '.wav':<20} {dur:5.2f}s  {size:>7} bytes")
    print(f"\n  total: {total} bytes across {len(GENERATORS)} files")


if __name__ == "__main__":
    main()
