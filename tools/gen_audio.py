#!/usr/bin/env python3
"""
gen_audio.py — Generate Kanji-buddy's DARK retro audio set into ./audio/.

PURE STDLIB — only `wave`, `struct`, `math`, `random`. No numpy, no SciPy, so
this runs on any Python 3 install (and in CI) with zero deps.

AESTHETIC — "above 8-bit but still BIT-LIKE". The palette stays hard
pulse/square/triangle/noise (so it still reads "retro / hacker-infiltration"),
but the engine adds motion and space so it isn't flat-happy NES:

  • output is 32000 Hz / MONO / 16-bit SIGNED PCM (headroom + a quieter noise
    floor than the old 8-bit-unsigned files — the grit now comes from the
    synth, not from the quantiser);
  • dual DETUNED oscillators (+7 / -9 cents — deliberately asymmetric beating);
  • pulse-width modulation (PWM) doubling as a CPU-cheap vibrato;
  • pitch vibrato / LFO;
  • a one-pole LOWPASS to kill the ice-pick top end that makes chiptune "chipper";
  • a short feedback DELAY/echo that turns a dry bleep into a "dungeon";
  • longer-release ADSR so notes decay into silence (the genre depends on it);
  • optional bit-CRUSH (quantize to N bits) to keep machine texture.

MUSIC — everything lives in A NATURAL MINOR (Aeolian), tonal center A
(55/110/220/440 Hz anchors), at 75 BPM (quarter = 0.8 s). Leads/SFX are
coloured with the Phrygian b2 (Bb) and Phrygian-dominant (Bb + C#); the
harmonic-minor leading tone (G#) is reserved for the E-major cadence and the
rank-up flourish. No major thirds anywhere except the fleeting one inside the
Phrygian-dominant rank-up sting. Confirmation resolves DOWNWARD into the tonic;
failure uses the tritone / a descending semitone; everything sits lower and
darker (lowpassed) than a typical arcade UI.

The BED (amb_challenge) is a 7.2 s seamless loop in 9/8 at 75 BPM (9 × 0.8 s =
exactly 4 × the app's 1.8 s --kb-beat): detuned-pulse power-drone (A1+A2+E2, no
3rd → modal ambiguity), a sparse syncopated heartbeat bass, an eerie half-loop
arpeggio that brushes the Phrygian b2, and a lowpass-swept noise "wind" plus a
single soft heartbeat thud. It is mastered ~6 dB under the SFX so a correct/
wrong always reads above it.

Run from the repo root (or anywhere — paths resolve relative to this file):

    python tools/gen_audio.py

Outputs (over)written into <repo>/audio/:
    sfx_tick / sfx_correct / sfx_wrong / sfx_nav / sfx_rankup / sfx_hot /
    sfx_milestone  (SFX, <= ~1 s each)
    amb_challenge  (7.2 s seamless dark bed)

The convert step (tools/convert_audio.py) can later transcode these to
.ogg/.m4a; AudioManager (data/audio.js) falls back to .wav, so the wavs are
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

SAMPLE_RATE = 32000           # Hz, mono — up from 22050 for headroom & cleaner top
BEAT = 1.8                    # seconds — mirrors the app's shared --kb-beat
BPM = 75                      # dark, brooding tempo
QUARTER = 60.0 / BPM          # 0.800 s
EIGHTH = QUARTER / 2.0        # 0.400 s
SIXTEENTH = QUARTER / 4.0     # 0.200 s

# Master targets. The final master() leaves headroom so 16-bit signed never
# clips (peak ~ -3 dBFS for SFX, ~ -9 dBFS for the bed so it sits under them).
SFX_PEAK = 0.70               # ≈ -3.1 dBFS
BED_PEAK = 0.35               # ≈ -9.1 dBFS — sits ~6 dB under the SFX

# Deterministic noise so regenerating produces byte-identical files (the .wav
# outputs are committed, like icons / kanji-words.json).
_RNG = random.Random(0x8B17AD)

CENT = 2.0 ** (1.0 / 1200.0)  # one cent as a frequency ratio


# ─────────────────────────────────────────────────────────────────────────
# Equal-tempered note helper. A4 = 440 Hz. f = 440 * 2^((midi-69)/12).
# ─────────────────────────────────────────────────────────────────────────
_NOTE_SEMITONE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def note(name):
    """'A4' / 'C#5' / 'Bb3' -> frequency in Hz."""
    letter = name[0].upper()
    i = 1
    semis = _NOTE_SEMITONE[letter]
    if i < len(name) and name[i] in "#b":
        semis += 1 if name[i] == "#" else -1
        i += 1
    octave = int(name[i:])
    midi = semis + (octave + 1) * 12      # MIDI: C-1 = 0, so C4 = 60
    return 440.0 * (2.0 ** ((midi - 69) / 12.0))


def cents(freq, c):
    """Detune a frequency by `c` cents (+ up, - down)."""
    return freq * (CENT ** c)


# ─────────────────────────────────────────────────────────────────────────
# Core oscillator. Everything works on plain python lists of floats roughly in
# [-1, 1]; the final master()/write_wav() clamps + quantises to 16-bit signed.
# ─────────────────────────────────────────────────────────────────────────

def _wave_at(phase, wave_type, duty):
    """One sample of a normalised [-1,1] waveform at the given phase [0,1)."""
    p = phase % 1.0
    if wave_type == "square":
        return 1.0 if p < 0.5 else -1.0
    if wave_type == "pulse":
        return 1.0 if p < duty else -1.0
    if wave_type == "triangle":
        return 4.0 * abs(p - 0.5) - 1.0
    if wave_type == "saw":
        return 2.0 * p - 1.0
    if wave_type == "sine":
        return math.sin(2.0 * math.pi * p)
    if wave_type == "noise":
        return _RNG.uniform(-1.0, 1.0)
    raise ValueError(f"unknown wave type: {wave_type!r}")


def osc(freq, dur, wave_type="pulse", vol=0.8, duty=0.5,
        vib_hz=0.0, vib_cents=0.0, vib_delay=0.0,
        pwm_hz=0.0, pwm_lo=None, pwm_hi=None,
        pitch_glide=None):
    """Single-oscillator voice with optional pitch-vibrato and PWM.

      freq         base frequency in Hz (ignored for noise)
      dur          seconds
      vib_hz       pitch-vibrato rate (Hz); vib_cents = depth in ± cents
      vib_delay    seconds before vibrato fades in (so attacks stay solid)
      pwm_hz       pulse-width-modulation rate (Hz); sweeps duty pwm_lo..pwm_hi
                   (PWM-as-vibrato — the classic Metroid/Brinstar timbre trick)
      pitch_glide  (start_hz, end_hz) linear glide overriding `freq` if given
    """
    n = max(1, int(round(dur * SAMPLE_RATE)))
    out = [0.0] * n
    if wave_type == "noise":
        for i in range(n):
            out[i] = _RNG.uniform(-1.0, 1.0) * vol
        return out

    phase = 0.0
    for i in range(n):
        t = i / SAMPLE_RATE
        # Base frequency (with optional linear glide).
        if pitch_glide is not None:
            f0, f1 = pitch_glide
            f = f0 + (f1 - f0) * (i / (n - 1) if n > 1 else 0.0)
        else:
            f = freq
        # Pitch vibrato (cents → ratio), delayed onset, ramped in over 80 ms.
        if vib_hz > 0.0 and vib_cents != 0.0 and t >= vib_delay:
            ramp = min(1.0, (t - vib_delay) / 0.080)
            depth = vib_cents * ramp
            f *= CENT ** (depth * math.sin(2.0 * math.pi * vib_hz * t))
        # PWM-as-vibrato: sweep the pulse duty cycle.
        d = duty
        if pwm_hz > 0.0 and pwm_lo is not None and pwm_hi is not None:
            mid = 0.5 * (pwm_lo + pwm_hi)
            amp = 0.5 * (pwm_hi - pwm_lo)
            d = mid + amp * math.sin(2.0 * math.pi * pwm_hz * t)
        out[i] = _wave_at(phase, wave_type, d) * vol
        phase += f / SAMPLE_RATE
    return out


def detuned(freq, dur, wave_type="pulse", vol=0.8, duty=0.5,
            det1=7.0, det2=-9.0, **kw):
    """Dual DETUNED oscillator — sum two slightly-mistuned voices for thick,
    uneven beating. det1/det2 are cents (default +7 / -9 = asymmetric, so the
    beat wanders and unsettles). All osc() kwargs pass through to both voices."""
    a = osc(cents(freq, det1), dur, wave_type, vol * 0.5, duty, **kw)
    b = osc(cents(freq, det2), dur, wave_type, vol * 0.5, duty, **kw)
    n = max(len(a), len(b))
    out = [0.0] * n
    for i in range(len(a)):
        out[i] += a[i]
    for i in range(len(b)):
        out[i] += b[i]
    return out


# ─────────────────────────────────────────────────────────────────────────
# Envelopes, filters, effects.
# ─────────────────────────────────────────────────────────────────────────

def adsr(samples, a=0.01, d=0.02, s=0.7, r=0.05):
    """Linear ADSR envelope (returns a new list). a/d/r seconds, s = 0..1
    sustain LEVEL. The sustain SEGMENT fills the remaining time; if the note is
    too short for all phases they scale down so we never overrun, and the tail
    always lands on ~0 to avoid clicks."""
    n = len(samples)
    if n == 0:
        return samples
    a_n = int(a * SAMPLE_RATE)
    d_n = int(d * SAMPLE_RATE)
    r_n = int(r * SAMPLE_RATE)
    fixed = a_n + d_n + r_n
    if fixed >= n:
        scale = max(0.0, (n - 1)) / max(1, fixed)
        a_n = int(a_n * scale)
        d_n = int(d_n * scale)
        r_n = int(r_n * scale)
    sus_n = max(0, n - a_n - d_n - r_n)

    out = [0.0] * n
    i = 0
    for k in range(a_n):
        out[i] = samples[i] * (k / a_n if a_n else 1.0); i += 1
    for k in range(d_n):
        out[i] = samples[i] * (1.0 - (1.0 - s) * (k / d_n if d_n else 1.0)); i += 1
    for _ in range(sus_n):
        out[i] = samples[i] * s; i += 1
    for k in range(r_n):
        out[i] = samples[i] * s * (1.0 - (k / r_n if r_n else 1.0)); i += 1
    while i < n:
        out[i] = 0.0; i += 1
    return out


def lowpass(samples, cutoff_hz, resonance=0.0):
    """One-pole lowpass — mandatory on every voice to tame the buzz that reads
    as "happy". `cutoff_hz` may be a constant or a list (per-sample sweep, e.g.
    a filter LFO). Optional gentle one-pole resonance via a feedback term."""
    n = len(samples)
    out = [0.0] * n
    y = 0.0
    prev = 0.0
    is_seq = isinstance(cutoff_hz, (list, tuple))
    for i in range(n):
        fc = cutoff_hz[i] if is_seq else cutoff_hz
        if fc <= 0.0:
            fc = 1.0
        # One-pole coefficient from cutoff. dt = 1/SR.
        rc = 1.0 / (2.0 * math.pi * fc)
        alpha = (1.0 / SAMPLE_RATE) / (rc + 1.0 / SAMPLE_RATE)
        x = samples[i]
        if resonance > 0.0:
            x = x + resonance * (y - prev)   # mild emphasis near cutoff
        prev = y
        y = y + alpha * (x - y)
        out[i] = y
    return out


def delay(samples, time_s, feedback=0.35, mix_wet=0.5, octave_tap=False):
    """Short feedback DELAY/echo — turns a dry bleep into a "dungeon". If
    octave_tap, the wet signal is also sampled an octave up (half the delay
    index step) at reduced level for a cavernous canon, per the spec."""
    n = len(samples)
    d = max(1, int(round(time_s * SAMPLE_RATE)))
    # Run the buffer out past the source so the tail rings.
    tail = d * 4
    total = n + tail
    buf = list(samples) + [0.0] * tail
    out = [0.0] * total
    for i in range(total):
        dry = buf[i]
        echo = out[i - d] * feedback if i - d >= 0 else 0.0
        wet = echo
        if octave_tap and (i - d) >= 0:
            # Octave-up tap: read the echo buffer at 2× rate from the same delay.
            idx = i - d
            j = idx // 2
            if 0 <= j < total:
                wet += out[j] * feedback * 0.5
        out[i] = dry + wet
    # Blend dry/wet.
    res = [0.0] * total
    for i in range(total):
        res[i] = samples[i] if i < n else 0.0
        res[i] = res[i] * (1.0 - mix_wet) + out[i] * mix_wet
    return res


def bitcrush(samples, bits):
    """Quantise to N bits to retain machine texture. Keep mild on bass (crush
    eats low-end weight), heavier on leads/SFX (grit reads as "machine")."""
    if bits >= 16:
        return list(samples)
    levels = float(2 ** bits)
    out = [0.0] * len(samples)
    for i, v in enumerate(samples):
        if v > 1.0:
            v = 1.0
        elif v < -1.0:
            v = -1.0
        out[i] = round(v * (levels / 2.0)) / (levels / 2.0)
    return out


def tremolo(samples, rate_hz, depth=0.5):
    """Amplitude tremolo (for the hot sting's pulse)."""
    n = len(samples)
    out = [0.0] * n
    for i in range(n):
        t = i / SAMPLE_RATE
        m = 1.0 - depth * 0.5 * (1.0 - math.cos(2.0 * math.pi * rate_hz * t))
        out[i] = samples[i] * m
    return out


# ─────────────────────────────────────────────────────────────────────────
# Arrangement helpers.
# ─────────────────────────────────────────────────────────────────────────

def mix(*tracks):
    """Sum tracks; output length is the longest input (shorter = silence past
    their end). No normalisation here — master() handles peak control."""
    if not tracks:
        return []
    n = max(len(t) for t in tracks)
    out = [0.0] * n
    for t in tracks:
        for i, v in enumerate(t):
            out[i] += v
    return out


def concat(*tracks):
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


def place(track, layers):
    """Overlay (sample, start_seconds) layers onto a base `track` (list)."""
    out = list(track)
    for samp, start in layers:
        s0 = int(round(start * SAMPLE_RATE))
        end = s0 + len(samp)
        if end > len(out):
            out.extend([0.0] * (end - len(out)))
        for i, v in enumerate(samp):
            out[s0 + i] += v
    return out


# ─────────────────────────────────────────────────────────────────────────
# Seamless loop builder.
# ─────────────────────────────────────────────────────────────────────────

def trim_tail(samples, max_dur=None, thresh=0.004, min_dur=0.0):
    """Trim trailing near-silence (below `thresh` absolute) so delay/reverb
    tails don't pad files with inaudible ringing, then hard-cap to `max_dur`
    seconds if given. A short fade-out is applied at the new end so the cut is
    click-free."""
    s = list(samples)
    if max_dur is not None:
        cap = int(round(max_dur * SAMPLE_RATE))
        if len(s) > cap:
            s = s[:cap]
    end = len(s)
    while end > 1 and abs(s[end - 1]) < thresh:
        end -= 1
    min_n = int(round(min_dur * SAMPLE_RATE))
    end = max(end, min_n)
    s = s[:end]
    # Click-free end: 5 ms fade-out.
    fade = min(len(s), int(0.005 * SAMPLE_RATE))
    for k in range(fade):
        s[len(s) - 1 - k] *= (k / fade) if fade else 1.0
    return s


def make_loop(samples, loop_dur, wrap_ms=40.0):
    """Return a length-`target` loop that wraps `last sample -> first sample`
    with no discontinuity click, using the canonical "render long, crossfade the
    overlap" technique.

    The caller renders `samples` to AT LEAST `target + wrap` samples — i.e. the
    audio is allowed to continue past the loop point (delay/reverb tails, the
    drone's continued oscillation, etc.). We then build:

        out[i] = s[i]                              for wrap <= i < target
        out[i] = s[i]*fade_in(i) + s[target+i]*fade_out(i)   for 0 <= i < wrap

    The head therefore blends (head content) with (the SAME content one loop
    period later). Because s[target-1] -> s[target] is continuous in the source,
    and out[0] carries the s[target+0] component, the wrap point out[target-1]
    -> out[0] is continuous in BOTH value and slope. Equal-power (sin/cos)
    weights keep loudness flat across the seam. If the source is shorter than
    target+wrap it's zero-extended (graceful, but seam quality depends on the
    overlap actually carrying continued audio)."""
    target = int(round(loop_dur * SAMPLE_RATE))
    wrap = int(round((wrap_ms / 1000.0) * SAMPLE_RATE))
    wrap = max(1, min(wrap, target // 4))

    s = list(samples)
    need = target + wrap
    if len(s) < need:
        s = s + [0.0] * (need - len(s))

    out = s[:target]
    for i in range(wrap):
        t = i / wrap
        f_in = math.sin(0.5 * math.pi * t)     # head fades IN  0 -> 1
        f_out = math.cos(0.5 * math.pi * t)    # overlap fades OUT 1 -> 0
        out[i] = out[i] * f_in + s[target + i] * f_out
    return out


# ─────────────────────────────────────────────────────────────────────────
# Mastering + WAV writer — 32000 Hz, mono, 16-bit SIGNED PCM.
# ─────────────────────────────────────────────────────────────────────────

def dcblock(samples, cutoff_hz=18.0):
    """One-pole DC-blocking high-pass. Narrow pulse widths (12.5%) and the
    lowpass leave a large DC bias that wastes headroom and can thump on
    start/stop. An ~18 Hz high-pass recenters the waveform on zero without
    touching the audible bass."""
    n = len(samples)
    if n == 0:
        return samples
    # Standard DC blocker: y[n] = x[n] - x[n-1] + R*y[n-1].
    rc = 1.0 / (2.0 * math.pi * cutoff_hz)
    r = rc / (rc + 1.0 / SAMPLE_RATE)
    out = [0.0] * n
    x_prev = 0.0
    y_prev = 0.0
    for i in range(n):
        x = samples[i]
        y = x - x_prev + r * y_prev
        out[i] = y
        x_prev = x
        y_prev = y
    return out


def master(samples, peak=SFX_PEAK, block_dc=True):
    """DC-block (recenter on zero → recover headroom), normalise to a target
    peak (leaves headroom so 16-bit never clips), then soft-limit the extremes
    with a gentle tanh-ish knee for safety.

    block_dc defaults True for SFX; the seamless BED passes block_dc=False so the
    high-pass transient can't disturb its carefully-matched loop seam (its DC is
    already negligible)."""
    if not samples:
        return samples
    if block_dc:
        samples = dcblock(samples)
    m = max(abs(v) for v in samples)
    if m <= 1e-9:
        return list(samples)
    g = peak / m
    out = [v * g for v in samples]
    # Safety soft-knee above the target peak (essentially never triggers given
    # the normalisation, but guards against any stray accumulation).
    lim = peak
    for i, v in enumerate(out):
        if v > lim:
            out[i] = lim + (1.0 - math.exp(-(v - lim))) * (1.0 - lim)
        elif v < -lim:
            out[i] = -lim - (1.0 - math.exp(-(-v - lim))) * (1.0 - lim)
    return out


def write_wav(path, samples):
    """Clamp to [-1,1], quantise to 16-bit signed PCM, write."""
    frames = bytearray(len(samples) * 2)
    peak_q = 0
    for i, v in enumerate(samples):
        if v > 1.0:
            v = 1.0
        elif v < -1.0:
            v = -1.0
        q = int(round(v * 32767.0))
        if q > 32767:
            q = 32767
        elif q < -32768:
            q = -32768
        if abs(q) > peak_q:
            peak_q = abs(q)
        struct.pack_into("<h", frames, i * 2, q)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)            # 16-bit
        w.setframerate(SAMPLE_RATE)
        w.writeframes(bytes(frames))
    return peak_q


# ─────────────────────────────────────────────────────────────────────────
# THE SFX — dark, lowpassed, no jingles. Minor / tritone / semitone intervals
# only; confirmation resolves DOWN into the tonic; failure uses the tritone.
# ─────────────────────────────────────────────────────────────────────────

def sfx_tick():
    """Single muted low click — A2 (110 Hz), one cycle gated, through a low LP.
    Felt, barely heard. ~30 ms."""
    t = detuned(note("A2"), 0.030, "pulse", vol=0.9, duty=0.125,
                det1=6.0, det2=-6.0)
    t = adsr(t, a=0.001, d=0.012, s=0.35, r=0.015)
    t = lowpass(t, 800.0)
    return bitcrush(t, 12)


def sfx_nav():
    """Soft low blip — E3 (165 Hz, the 5th: neutral, not tonic), slight pitch
    dip 165→155 through a 1.2 kHz LP. ~70 ms."""
    t = osc(0, 0.070, "triangle", vol=0.85,
            pitch_glide=(note("E3"), 155.0))
    t = adsr(t, a=0.003, d=0.025, s=0.4, r=0.030)
    t = lowpass(t, 1200.0)
    return t


def sfx_correct():
    """A RESOLVING minor interval — confirmation, not a jingle. The b3 (C4)
    settles DOWN into the root (A3): 262 → 220 Hz. Soft LP, ~0.25 s."""
    n1 = detuned(note("C4"), 0.090, "pulse", vol=0.85, duty=0.25,
                 det1=7.0, det2=-7.0)
    n1 = adsr(n1, a=0.004, d=0.02, s=0.6, r=0.04)
    n2 = detuned(note("A3"), 0.150, "pulse", vol=0.9, duty=0.25,
                 det1=7.0, det2=-7.0)
    n2 = adsr(n2, a=0.004, d=0.03, s=0.6, r=0.12)
    out = concat(n1, n2)
    out = lowpass(out, 2600.0)
    return bitcrush(out, 12)


def sfx_wrong():
    """Ominous dissonance — a TRITONE (A3 + D#4, ratio 1.498) held, then the top
    voice slithers DOWN a semitone (Eb4 → D4). Noise burst + heavier crush.
    ~0.35 s."""
    # Tritone body.
    low = osc(note("A3"), 0.34, "pulse", vol=0.7, duty=0.125)
    # Top voice: hold Eb4 then glide down to D4 over the back half.
    top_hold = osc(note("Eb4"), 0.12, "pulse", vol=0.6, duty=0.125)
    top_glide = osc(0, 0.22, "pulse", vol=0.6, duty=0.125,
                    pitch_glide=(note("Eb4"), note("D4")))
    top = concat(top_hold, top_glide)
    body = mix(low, top)
    body = adsr(body, a=0.002, d=0.04, s=0.7, r=0.15)
    # Noise crunch on the front.
    crunch = osc(0, 0.10, "noise", vol=0.22)
    crunch = adsr(crunch, a=0.001, d=0.03, s=0.3, r=0.05)
    out = mix(body, crunch)
    out = lowpass(out, 2200.0)
    return bitcrush(out, 9)


def sfx_rankup():
    """Brooding-arcane ascending flourish — "you unlocked something forbidden".
    PHRYGIAN DOMINANT (A Bb C# D E…): A3 → C#4 → E4 → A4 → Bb4 — the b2 (Bb) on
    top so it's never "safe". Detuned pulses, PWM sweep, 0.3 s delay tail.
    ~0.8 s + tail."""
    steps = [
        (note("A3"), 0.130),
        (note("C#4"), 0.120),
        (note("E4"), 0.115),
        (note("A4"), 0.110),
        (note("Bb4"), 0.200),    # the b2 — rings longest
    ]
    seq = []
    for i, (f, dur) in enumerate(steps):
        last = (i == len(steps) - 1)
        v = detuned(f, dur, "pulse", vol=0.8, duty=0.25,
                    det1=7.0, det2=-9.0,
                    pwm_hz=5.5, pwm_lo=0.25, pwm_hi=0.5,
                    vib_hz=5.5, vib_cents=10.0 if last else 0.0, vib_delay=0.05)
        rel = 0.35 if last else 0.04
        v = adsr(v, a=0.006, d=0.03, s=0.7, r=rel)
        seq.extend(v)
    # Phrygian-dominant pedal underneath (A major-with-b2 colour: A + low fifth).
    pedal = detuned(note("A2"), len(seq) / SAMPLE_RATE, "triangle",
                    vol=0.35, det1=5.0, det2=-7.0)
    pedal = adsr(pedal, a=0.02, d=0.1, s=0.55, r=0.25)
    body = mix(seq, pedal)
    body = lowpass(body, 3800.0)
    body = delay(body, 0.30, feedback=0.30, mix_wet=0.32, octave_tap=True)
    body = bitcrush(body, 11)
    # Keep the audible delay echo, trim the long inaudible feedback tail.
    return trim_tail(body, max_dur=1.10)


def sfx_hot():
    """Tense sting — hot-challenge alarm. A TRITONE stab (A3 + Eb4) with fast
    8 Hz tremolo, pitch rising a whole-step at the tail (A3 → B3) and the LP
    opening for a "rising threat". ~0.45 s."""
    a_low = osc(0, 0.42, "pulse", vol=0.7, duty=0.125,
                pitch_glide=(note("A3"), note("B3")))
    eb = osc(note("Eb4"), 0.30, "pulse", vol=0.55, duty=0.125)
    body = mix(a_low, eb)
    body = tremolo(body, 8.0, depth=0.7)
    body = adsr(body, a=0.002, d=0.05, s=0.8, r=0.15)
    # A touch of noise grit.
    grit = osc(0, 0.20, "noise", vol=0.10)
    grit = adsr(grit, a=0.002, d=0.05, s=0.3, r=0.10)
    body = mix(body, grit)
    # Filter sweep that OPENS toward the end (rising threat).
    n = len(body)
    cutoff = [1100.0 + 2400.0 * (i / max(1, n - 1)) for i in range(n)]
    body = lowpass(body, cutoff)
    return bitcrush(body, 10)


def sfx_milestone():
    """Mysterious minor bell/chime — harmonic-minor colour. An Am triad struck
    (A4 + C5 + E5 = 440/523/659) with a faint G#5 (831) leading-tone shimmer
    tapped 80 ms later. Long bell tail, 0.35 s delay, LP @ 5 kHz. ~1.0 s."""
    dur = 0.55
    # Bell partials = triangle + sine for a slightly inharmonic strike.
    a4 = mix(osc(note("A4"), dur, "triangle", vol=0.55),
             osc(note("A4"), dur, "sine", vol=0.25))
    c5 = mix(osc(note("C5"), dur, "triangle", vol=0.45),
             osc(note("C5"), dur, "sine", vol=0.20))
    e5 = mix(osc(note("E5"), dur, "triangle", vol=0.40),
             osc(note("E5"), dur, "sine", vol=0.18))
    triad = mix(a4, c5, e5)
    triad = adsr(triad, a=0.005, d=0.10, s=0.5, r=0.70)
    # The harmonic-minor leading-tone shimmer, tapped 80 ms in.
    gsharp = mix(osc(note("G#5"), 0.40, "triangle", vol=0.22),
                 osc(note("G#5"), 0.40, "sine", vol=0.10))
    gsharp = adsr(gsharp, a=0.004, d=0.08, s=0.4, r=0.30)
    body = place(triad, [(gsharp, 0.080)])
    body = lowpass(body, 5000.0)
    body = delay(body, 0.35, feedback=0.30, mix_wet=0.30, octave_tap=False)
    # Long bell tail, but trim the inaudible ring so the file stays ~1 s.
    return trim_tail(body, max_dur=1.10)


# ─────────────────────────────────────────────────────────────────────────
# THE BED — amb_challenge. Dark hypnotic 7.2 s loop in 9/8 at 75 BPM
# (9 × 0.8 s = 4 × the 1.8 s --kb-beat). Drone + sparse heartbeat bass +
# half-loop eerie arp + lowpass-swept noise wind + one soft heartbeat thud.
# Loop C harmony (Am – F – G – Am) implied by drifting colour notes, not hard
# chord changes.
# ─────────────────────────────────────────────────────────────────────────

def _wind(dur, period=None):
    """Lowpass-swept noise "wind" — cutoff LFO-sweeps 300 Hz↔1.2 kHz, at low
    level. Reads as menacing isolation (the Metroid negative-space move). The
    sweep/swell `period` (defaults to `dur`) locks to the loop period so a
    slightly-longer render still phase-aligns at the wrap.

    NOTE: the noise source past the loop point won't match the noise at t=0
    (it's random), so the wind level is kept very low and the make_loop overlap
    crossfade smears the two together — at -24 dB this is inaudible."""
    n = int(round(dur * SAMPLE_RATE))
    p = int(round((period if period is not None else dur) * SAMPLE_RATE))
    raw = [_RNG.uniform(-1.0, 1.0) for _ in range(n)]
    # One full sweep per loop period so it phase-aligns at the wrap.
    cutoff = [750.0 + 450.0 * math.sin(2.0 * math.pi * (i / p) - math.pi / 2.0)
              for i in range(n)]
    w = lowpass(raw, cutoff)
    # Gentle amplitude swell once per loop period.
    out = [0.0] * n
    for i in range(n):
        env = 0.6 + 0.4 * (0.5 - 0.5 * math.cos(2.0 * math.pi * (i / p)))
        out[i] = w[i] * 0.16 * env
    return out


def _heartbeat_thud(dur):
    """One soft low-tom/kick thud — sine pitch-drop 90 → 45 Hz over 80 ms, no
    click, fast decay. The only percussion; a loop marker."""
    # Build explicitly so the pitch drop only spans the first 80 ms then holds.
    n = int(round(dur * SAMPLE_RATE))
    out = [0.0] * n
    phase = 0.0
    drop_n = int(0.080 * SAMPLE_RATE)
    for i in range(n):
        if i < drop_n:
            f = 90.0 + (45.0 - 90.0) * (i / drop_n)
        else:
            f = 45.0
        out[i] = math.sin(2.0 * math.pi * phase) * 0.9
        phase += f / SAMPLE_RATE
    return adsr(out, a=0.002, d=0.06, s=0.3, r=0.10)


def amb_challenge():
    """Dark hypnotic bed — see the module/section docstrings. 7.2 s seamless
    loop in 9/8 at 75 BPM."""
    loop_dur = 4 * BEAT                 # 7.2 s = 9 × 0.8 s
    n = int(round(loop_dur * SAMPLE_RATE))
    # Render the CONTINUOUS layers a hair past the loop point so make_loop's
    # overlap crossfade has real "next-pass" audio to blend with. Every LFO
    # period is a divisor of loop_dur, so at t∈[loop_dur, loop_dur+overlap) the
    # content equals what t∈[0, overlap) will be — a true seam.
    overlap_dur = 0.060                  # > wrap_ms (48 ms) used below
    ext_dur = loop_dur + overlap_dur
    ext_n = int(round(ext_dur * SAMPLE_RATE))

    # — DRONE: A1 + A2 + E2 power-drone (no 3rd → modal ambiguity). 3-voice
    #   detuned stack, slow PWM 45↔55% breathing, 0.14 Hz amplitude swell,
    #   LP @ 1.8 kHz with a slow ±400 Hz filter sweep. The floor. —
    def drone_voice(freq, det, vol):
        # Detune applied via cents(); very-slow PWM (one breath per loop).
        return osc(cents(freq, det), ext_dur, "pulse", vol=vol, duty=0.5,
                   pwm_hz=1.0 / loop_dur, pwm_lo=0.45, pwm_hi=0.55)

    drone = mix(
        drone_voice(note("A1"), +0.0, 0.30),
        drone_voice(note("A1"), -6.0, 0.22),
        drone_voice(note("A2"), +5.0, 0.20),
        drone_voice(note("E2"), -8.0, 0.18),
        # triangle sub for weight without buzz
        osc(note("A1"), ext_dur, "triangle", vol=0.22),
    )
    # Amplitude swell once per loop (0.139 Hz = 1/7.2 s → phase-aligned). Phase
    # is referenced to `n` (the loop period) so it continues smoothly past it.
    swelled = [0.0] * len(drone)
    for i in range(len(drone)):
        env = 0.72 + 0.28 * (0.5 - 0.5 * math.cos(2.0 * math.pi * (i / n)))
        swelled[i] = drone[i] * env
    # Slow filter sweep ±400 Hz around 1.6 kHz, one cycle per loop.
    cutoff = [1600.0 + 400.0 * math.sin(2.0 * math.pi * (i / n))
              for i in range(len(swelled))]
    drone = lowpass(swelled, cutoff)

    # — HARMONY: imply Loop C (Am – F – G – Am) by fading in colour dyads over
    #   the drone. 9/8 split into 3 phases of 3 beats. Slow crossfades. —
    #   beats 1–3 = Am (drone only); beats 4–6 add C3+F3 (F); beats 7–9 add
    #   B2+G3 (G); resolving back at the wrap.
    def colour(freqs, t0, t1):
        seg_dur = t1 - t0
        v = mix(*[osc(cents(f, c), seg_dur, "pulse", vol=0.10, duty=0.5,
                      pwm_hz=0.4, pwm_lo=0.45, pwm_hi=0.55)
                  for f, c in freqs])
        # crossfade in/out (0.5 s ramps) so chords don't hard-switch.
        ramp = int(0.5 * SAMPLE_RATE)
        for i in range(len(v)):
            g = 1.0
            if i < ramp:
                g = i / ramp
            elif i > len(v) - ramp:
                g = max(0.0, (len(v) - i) / ramp)
            v[i] *= g
        v = lowpass(v, 1500.0)
        return v
    f_chord = colour([(note("C3"), +5.0), (note("F3"), -7.0)],
                     3 * QUARTER, 6 * QUARTER)
    g_chord = colour([(note("B2"), +5.0), (note("G3"), -7.0)],
                     6 * QUARTER, 9 * QUARTER)
    harmony = place(silence(ext_dur), [
        (f_chord, 3 * QUARTER),
        (g_chord, 6 * QUARTER),
    ])

    # — BASS: sparse syncopated heartbeat. Root on beats 1, 4, 7 only
    #   (A1 / F1 / G1 = 55 / 43.65 / 49 Hz), 12.5% pulse +7c detune, gate 70%,
    #   LP @ 2.5 kHz. Pulses under the drone like a slow pulse-rate. —
    def bass_hit(freq):
        g = QUARTER * 0.70               # gate length
        v = detuned(freq, g, "pulse", vol=0.55, duty=0.125,
                    det1=7.0, det2=0.0)
        v = adsr(v, a=0.003, d=0.05, s=0.55, r=0.06)
        v = lowpass(v, 2500.0)
        return bitcrush(v, 12)
    bass = place(silence(loop_dur), [
        (bass_hit(note("A1")), 0 * QUARTER),
        (bass_hit(note("F1")), 3 * QUARTER),
        (bass_hit(note("G1")), 6 * QUARTER),
    ])

    # — ARP: eerie motif, only in the SECOND HALF of the loop (beats 5–9) so
    #   across two passes it's call-and-silence. 25% pulse, −9c detune, PWM
    #   vibrato, 0.3 s dotted-8th delay + octave echo, long 250 ms release.
    #   Notes brush the Phrygian b2 (Bb): A4 · C5 · E5 · Bb4 · A4. —
    arp_notes = [
        (note("A4"), 4.0),     # beat index (0-based) within the 9/8 loop
        (note("C5"), 5.0),
        (note("E5"), 6.0),
        (note("Bb4"), 7.0),    # the b2 brushing through
        (note("A4"), 8.0),
    ]
    arp_layers = []
    for f, beat in arp_notes:
        v = detuned(f, SIXTEENTH * 2.4, "pulse", vol=0.40, duty=0.25,
                    det1=8.0, det2=-9.0,
                    pwm_hz=5.0, pwm_lo=0.25, pwm_hi=0.5,
                    vib_hz=5.5, vib_cents=8.0, vib_delay=0.05)
        v = adsr(v, a=0.008, d=0.04, s=0.5, r=0.25)
        v = lowpass(v, 4000.0)
        arp_layers.append((v, beat * QUARTER))
    arp = place(silence(loop_dur), arp_layers)
    # Keep the delay overhang past loop_dur — make_loop folds it back onto the
    # (arp-silent) head so the echo wraps into the next pass instead of cutting.
    arp = delay(arp, 0.30, feedback=0.30, mix_wet=0.30, octave_tap=True)

    # — ATMOSPHERE: wind (rendered long, period locked to the loop) + one soft
    #   heartbeat thud on beat 1. —
    wind = _wind(ext_dur, period=loop_dur)
    thud = _heartbeat_thud(0.30)
    atmos = place(wind, [(thud, 0.0)])

    # — MIX & MASTER (quiet — the bed sits under the SFX). NOTE: do NOT pad/
    #   truncate to loop_dur here — `bed` is intentionally longer than loop_dur
    #   (the arp delay overhang), and make_loop folds that overhang back onto the
    #   head before applying the equal-power wrap crossfade. —
    bed = mix(
        gain(drone, 1.0),
        gain(harmony, 1.0),
        gain(bass, 1.0),
        gain(arp, 0.9),
        gain(atmos, 1.0),
    )
    bed = make_loop(bed, loop_dur, wrap_ms=48.0)
    return bed


# ─────────────────────────────────────────────────────────────────────────
# Generator registry. Each is mastered to its peak target on the way out.
# ─────────────────────────────────────────────────────────────────────────

# (generator, peak_target, block_dc)
GENERATORS = {
    "sfx_tick":      (sfx_tick,      SFX_PEAK, True),
    "sfx_correct":   (sfx_correct,   SFX_PEAK, True),
    "sfx_wrong":     (sfx_wrong,     SFX_PEAK, True),
    "sfx_nav":       (sfx_nav,       SFX_PEAK, True),
    "sfx_rankup":    (sfx_rankup,    SFX_PEAK, True),
    "sfx_hot":       (sfx_hot,       SFX_PEAK, True),
    "sfx_milestone": (sfx_milestone, SFX_PEAK, True),
    "amb_challenge": (amb_challenge, BED_PEAK, False),
}


def _stable_seed(name):
    """Process-independent per-asset seed (Python's built-in hash() is salted by
    PYTHONHASHSEED, which would make the committed WAVs non-reproducible)."""
    h = 0x8B17AD
    for ch in name:
        h = (h * 131 + ord(ch)) & 0xFFFFFFFF
    return h


def main():
    os.makedirs(AUDIO_DIR, exist_ok=True)
    print(f"Generating DARK audio into {AUDIO_DIR}")
    print(f"  format: {SAMPLE_RATE} Hz, mono, 16-bit signed PCM")
    print(f"  key/tempo: A natural minor, {BPM} BPM (quarter {QUARTER:.3f}s)\n")
    total = 0
    for name, (fn, peak, block_dc) in GENERATORS.items():
        # Reseed per-asset (stable) so each file is byte-deterministic.
        _RNG.seed(_stable_seed(name))
        samples = master(fn(), peak, block_dc=block_dc)
        path = os.path.join(AUDIO_DIR, name + ".wav")
        peak_q = write_wav(path, samples)
        size = os.path.getsize(path)
        total += size
        dur = len(samples) / SAMPLE_RATE
        dbfs = 20.0 * math.log10(peak_q / 32768.0) if peak_q > 0 else -99.0
        print(f"  wrote {name + '.wav':<20} {dur:5.2f}s  "
              f"{size:>7} bytes  peak {peak_q:>6}/32767 ({dbfs:+.1f} dBFS)")
    print(f"\n  total: {total} bytes ({total / 1024.0:.1f} KiB) "
          f"across {len(GENERATORS)} files")


if __name__ == "__main__":
    main()
