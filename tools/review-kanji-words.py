#!/usr/bin/env python3
"""
review-kanji-words.py — Quality audit for data/kanji-words.json.

Runs automated structural checks plus a hand-pickable spot-check report.
Exits non-zero if any structural check fails.
"""

import json
import re
import sys
from pathlib import Path
from collections import Counter

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, OSError):
    pass

ROOT = Path(__file__).resolve().parents[1]
CARDS = json.loads((ROOT / "data" / "cards.json").read_text(encoding="utf-8"))
WORDS = json.loads((ROOT / "data" / "kanji-words.json").read_text(encoding="utf-8"))

CARD_BY_IDX = {c["idx"]: c for c in CARDS}

KANA_RE = re.compile(r"^[぀-ゟ゠-ヿー・゠]+$")
HAS_KANJI_RE = re.compile(r"[一-鿿㐀-䶿豈-﫿]")

problems = Counter()
samples_printed = 0


def kata_to_hira(s: str) -> str:
    return "".join(
        chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in s
    )


def check_structure():
    """Top-level shape and per-entry field validity."""
    print("\n=== Structural checks ===")

    if not isinstance(WORDS, dict):
        print("FAIL: top-level is not a dict")
        problems["structure"] += 1
        return

    missing_keys = [c["idx"] for c in CARDS if str(c["idx"]) not in WORDS]
    if missing_keys:
        print(f"FAIL: {len(missing_keys)} cards missing from kanji-words.json")
        problems["missing_keys"] += len(missing_keys)
    else:
        print(f"OK: all {len(CARDS)} cards have an entry list")

    extra = [k for k in WORDS if not k.isdigit() or int(k) not in CARD_BY_IDX]
    if extra:
        print(f"FAIL: {len(extra)} keys in kanji-words.json not in cards.json")
        problems["extra_keys"] += len(extra)

    too_long = [(k, len(v)) for k, v in WORDS.items() if len(v) > 25]
    if too_long:
        print(f"FAIL: {len(too_long)} kanji exceed 25 entries (first: {too_long[0]})")
        problems["too_long"] += len(too_long)
    else:
        print("OK: no kanji has more than 25 entries")

    bad_reading = []
    bad_meaning = []
    no_kanji_in_w = []
    wrong_kanji = []

    for key, entries in WORDS.items():
        idx = int(key)
        kanji_char = CARD_BY_IDX[idx]["k"]
        for e in entries:
            if not isinstance(e, dict):
                problems["bad_entry"] += 1
                continue
            if not all(k in e for k in ("w", "r", "m", "pri")):
                problems["bad_entry"] += 1
                continue
            if not KANA_RE.match(e["r"]):
                bad_reading.append((kanji_char, e["w"], e["r"]))
            if not e["m"] or not isinstance(e["m"], str):
                bad_meaning.append((kanji_char, e["w"], e["m"]))
            if kanji_char not in e["w"]:
                wrong_kanji.append((kanji_char, e["w"]))
            if not HAS_KANJI_RE.search(e["w"]):
                no_kanji_in_w.append((kanji_char, e["w"]))

    if bad_reading:
        print(f"FAIL: {len(bad_reading)} entries have non-kana readings")
        for row in bad_reading[:5]:
            print(f"    {row}")
        problems["bad_reading"] += len(bad_reading)
    else:
        print("OK: all readings are pure kana")

    if bad_meaning:
        print(f"FAIL: {len(bad_meaning)} entries have empty/non-string meanings")
        problems["bad_meaning"] += len(bad_meaning)
    else:
        print("OK: all meanings are non-empty strings")

    if wrong_kanji:
        print(f"FAIL: {len(wrong_kanji)} entries listed under a kanji that does not appear in the word")
        for row in wrong_kanji[:5]:
            print(f"    {row}")
        problems["wrong_kanji"] += len(wrong_kanji)
    else:
        print("OK: every entry's word contains its kanji")

    if no_kanji_in_w:
        print(f"FAIL: {len(no_kanji_in_w)} entries have a kana-only word")
        problems["no_kanji_in_w"] += len(no_kanji_in_w)
    else:
        print("OK: every word contains at least one kanji")


def check_ex_coverage():
    """How often do the existing curated 'ex' words appear in kanji-words?"""
    print("\n=== Cross-validation with cards.json's `ex` field ===")
    hit = 0
    miss = 0
    miss_samples = []
    for card in CARDS:
        ex = card.get("ex") or []
        if not ex:
            continue
        entries = WORDS[str(card["idx"])]
        word_set = {e["w"] for e in entries}
        for example in ex:
            ew = example.get("w")
            if not ew:
                continue
            if ew in word_set:
                hit += 1
            else:
                miss += 1
                if len(miss_samples) < 15:
                    miss_samples.append((card["k"], ew))
    total = hit + miss
    if total:
        print(f"  {hit}/{total} curated examples appear in JMdict top-25 ({100*hit/total:.1f}%)")
    if miss_samples:
        print("  Sample misses (curated example NOT in JMdict top-25):")
        for k, w in miss_samples:
            print(f"    {k}: {w}")


def check_reading_consistency():
    """For every top-5 entry, verify the reading overlaps the kanji's on/kun list."""
    print("\n=== Reading consistency vs on/kun (top-5 per kanji) ===")
    no_overlap = []
    checked = 0
    for card in CARDS:
        readings = set()
        for src in (card.get("on") or []):
            r = src.get("r") or ""
            readings.add(kata_to_hira(r).replace(".", ""))
        for src in (card.get("kun") or []):
            r = src.get("r") or ""
            readings.add(kata_to_hira(r).split(".")[0])
        readings = {r for r in readings if r}
        if not readings:
            continue
        for e in WORDS[str(card["idx"])][:5]:
            checked += 1
            reb_hira = kata_to_hira(e["r"])
            if not any(part and part in reb_hira for part in readings):
                no_overlap.append((card["k"], e["w"], e["r"]))
    print(f"  Top-5 entries checked: {checked}")
    print(f"  No on/kun overlap: {len(no_overlap)} ({100*len(no_overlap)/max(checked,1):.1f}%)")
    if no_overlap:
        print("  Sample (typically rendaku, irregular jukujikun, or alt-reading words — review individually):")
        for row in no_overlap[:10]:
            print(f"    {row[0]}: {row[1]} ({row[2]})")


def print_spot_check(label, kanji_chars):
    print(f"\n=== Spot-check: {label} ===")
    for ch in kanji_chars:
        card = next((c for c in CARDS if c["k"] == ch), None)
        if not card:
            print(f"  {ch}: NOT IN cards.json")
            continue
        entries = WORDS[str(card["idx"])]
        jlpt = f"N{card['jlpt']}" if card.get("jlpt") else "—"
        print(f"\n  {ch}  (idx {card['idx']}, {jlpt}, mean='{card.get('mean')}') — {len(entries)} entries")
        for i, e in enumerate(entries[:10], 1):
            print(f"    {i:>2}. {e['w']:<10} {e['r']:<20} {e['m'][:60]}")


def main():
    check_structure()
    check_ex_coverage()
    check_reading_consistency()

    # Iconic kanji where I have strong priors on what the top entries should be.
    print_spot_check(
        "Iconic kanji — sanity floor",
        ["一", "食", "行", "生", "人", "上", "国", "出", "大", "小"],
    )
    # One representative kanji from each JLPT tier.
    print_spot_check(
        "Tier representatives",
        ["日", "週", "歴", "績", "幻", "璧"],
    )
    # Sparse / pathological cases.
    print_spot_check(
        "Sparse coverage cases",
        ["朕", "摯", "弐", "岬", "訃"],
    )

    print("\n=== Summary ===")
    if problems:
        print("PROBLEMS:")
        for k, v in problems.items():
            print(f"  {k}: {v}")
        sys.exit(1)
    print("All structural checks passed.")


if __name__ == "__main__":
    main()
