#!/usr/bin/env python3
"""
convert_audio.py — OPTIONAL transcode of audio/*.wav to .ogg + .m4a.

The .wav files written by gen_audio.py are the working assets (AudioManager
falls back to .wav and they're tiny 8-bit mono). This step is a nicety: .ogg
(libvorbis) and .m4a (aac) are a touch smaller and broaden codec coverage
(Safari prefers aac/m4a, Firefox prefers ogg), and AudioManager probes
ogg -> m4a -> wav in that order.

This tool shells out to ffmpeg. If ffmpeg is NOT installed it degrades
gracefully: prints a clear note and exits 0 (NOT a crash) — CI / contributors
without ffmpeg are unaffected and the .wav assets keep working.

Run from the repo root (paths resolve relative to this file):

    python tools/convert_audio.py
"""

import os
import shutil
import subprocess
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except (AttributeError, OSError):
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO_DIR = os.path.join(ROOT, "audio")


def find_ffmpeg():
    """Return the ffmpeg executable path, or None if it isn't on PATH."""
    return shutil.which("ffmpeg")


def convert_one(ffmpeg, wav_path):
    """Transcode one .wav to sibling .ogg and .m4a. Returns list of (path, ok)."""
    base = os.path.splitext(wav_path)[0]
    results = []

    targets = [
        # (extension, ffmpeg args after input)
        ("ogg", ["-c:a", "libvorbis", "-qscale:a", "4"]),
        ("m4a", ["-c:a", "aac", "-b:a", "96k"]),
    ]
    for ext, codec_args in targets:
        out_path = base + "." + ext
        cmd = [ffmpeg, "-y", "-loglevel", "error", "-i", wav_path] + codec_args + [out_path]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True)
            ok = proc.returncode == 0 and os.path.exists(out_path)
            if not ok and proc.stderr:
                # Most common cause: the ffmpeg build lacks the encoder
                # (e.g. no libvorbis). Surface it but keep going.
                print(f"    ! {ext}: {proc.stderr.strip().splitlines()[-1] if proc.stderr.strip() else 'failed'}")
            results.append((out_path, ok))
        except Exception as e:  # noqa: BLE001 — never crash the whole run
            print(f"    ! {ext}: {e}")
            results.append((out_path, False))
    return results


def main():
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        print("convert_audio: ffmpeg not found on PATH — skipping transcode.")
        print("  The .wav files in audio/ are the working assets; AudioManager")
        print("  falls back to .wav, so nothing is broken. Install ffmpeg and")
        print("  re-run if you want smaller .ogg/.m4a variants.")
        return 0

    if not os.path.isdir(AUDIO_DIR):
        print(f"convert_audio: no audio dir at {AUDIO_DIR} — run gen_audio.py first.")
        return 0

    wavs = sorted(f for f in os.listdir(AUDIO_DIR) if f.lower().endswith(".wav"))
    if not wavs:
        print(f"convert_audio: no .wav files in {AUDIO_DIR} — run gen_audio.py first.")
        return 0

    print(f"convert_audio: using {ffmpeg}")
    print(f"  transcoding {len(wavs)} file(s) in {AUDIO_DIR}\n")
    made = 0
    for wav in wavs:
        wav_path = os.path.join(AUDIO_DIR, wav)
        print(f"  {wav}")
        for out_path, ok in convert_one(ffmpeg, wav_path):
            if ok:
                size = os.path.getsize(out_path)
                print(f"    -> {os.path.basename(out_path):<22} {size:>7} bytes")
                made += 1
    print(f"\n  done — wrote {made} transcoded file(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
