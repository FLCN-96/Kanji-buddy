#!/usr/bin/env python3
"""
build-kanji-words.py — Generate data/kanji-words.json from JMdict_e.

Maps each kanji in data/cards.json (by idx) to its top 25 most-frequent
real-world words sourced from JMdict (EDRDG, CC-BY-SA-4.0).

Run from repo root:
    python tools/build-kanji-words.py

Outputs:
    data/kanji-words.json        — the dictionary
    tools/kanji-words-stats.md   — coverage / quality report
    tools/cache/JMdict_e.gz      — cached download (gitignored)
"""

import gzip
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

# Windows consoles default to cp1252 — force UTF-8 so the progress prints survive.
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except (AttributeError, OSError):
    pass

ROOT = Path(__file__).resolve().parents[1]
CACHE_DIR = ROOT / "tools" / "cache"
CARDS_PATH = ROOT / "data" / "cards.json"
OUTPUT_PATH = ROOT / "data" / "kanji-words.json"
STATS_PATH = ROOT / "tools" / "kanji-words-stats.md"

JMDICT_URL = "http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz"
JMDICT_GZ = CACHE_DIR / "JMdict_e.gz"

# Priority weights from JMdict's <ke_pri>/<re_pri> tags. Sum-stacking is the
# right model here: an entry tagged in multiple priority lists (news1 AND
# ichi1 AND spec1) really is more common than one tagged in only one. The
# nf-band gives fine-grained ranking within the news corpus (lower = more
# frequent).
PRI_WEIGHTS = {
    "news1": 50, "news2": 30,
    "ichi1": 50, "ichi2": 30,
    "spec1": 50, "spec2": 30,
    "gai1": 50,  "gai2": 30,
}

# Entries tagged ichi1 (Ichimango Goi Bunruishuu — hand-curated 10k everyday
# vocabulary list) but lacking news priority get a per-kanji boost: the
# news corpus systematically under-represents core spoken verbs like
# 生まれる, 行く, 食べる. Applied only when the target kanji is the LEADING
# character of the word, so 持って行く (a 持つ compound) doesn't pollute 行's
# bucket while 食べる still surfaces in 食's bucket.
ICHI1_ONLY_BOOST = 100

# Skip headwords containing ASCII or fullwidth digits — JMdict ships variants
# like ９日 / ５日 as parallel kanji forms of date words, but they're not
# kanji-form vocabulary, just digit substitutions.
DIGIT_RE = re.compile(r"[0-9０-９]")

# No score boosts: we trust JMdict's tier-1 + nf-band signal as the ground-
# truth frequency ranking, and use quotas (below) to guarantee that the
# kanji's standalone-word meaning and 2 basic short verbs are present even
# when the news corpus doesn't surface them in the natural top 25.
SINGLE_KANJI_BOOST = 0
INFLECTABLE_BOOST = 0

INFLECTABLE_POS_PREFIXES = ("ichidan verb", "godan verb")
INFLECTABLE_POS_EXACT = ("adjective (keiyoushi)",)

# Post-pass quotas — guarantee at least this many of each category in top 25,
# substituting the lowest-ranked non-quota entry if necessary.
QUOTA_SINGLE_KANJI = 1
QUOTA_CANONICAL_VERB = 5  # 1 kanji + 1-3 kana okurigana, inflectable

# CJK Unified Ideographs ranges (incl. Extension A) — used to count kanji
# inside a word so we can distinguish basic verb forms (1 kanji + okurigana)
# from compound verbs (2+ kanji).
def _is_kanji(c):
    o = ord(c)
    return 0x4E00 <= o <= 0x9FFF or 0x3400 <= o <= 0x4DBF

# Reject entries whose headword is actually a proverb / sentence fragment.
# JMdict ships these but they aren't vocabulary — they pollute the top-25.
PROVERB_CHARS = set("、。…！？「」『』〜")

# After internal-entity expansion these are the human-readable misc strings
# we treat as "skip this sense".
ARCHAIC_MARKERS = (
    "archaism", "archaic", "obsolete", "obscure", "rare term",
)

# JMdict's `&uk;` ("usually written using kana alone"). Words like 生る (なる),
# 為る (する), 居る (いる) carry full news/ichi priority on their kanji form,
# but in real text the word appears in kana, not kanji. Including them in
# the top-25 wastes a slot — the learner won't encounter the kanji form.
USUALLY_KANA_MARKER = "usually written using kana alone"

# ke_inf strings (after entity expansion) that mark a kanji form as not
# worth surfacing to a learner.
SKIP_KE_INFO = (
    "search-only kanji form",
    "rarely-used kanji form",
    "out-dated kanji form",
)

KANA_RE = re.compile(r"^[぀-ゟ゠-ヿー・・]+$")


def download_jmdict():
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    if JMDICT_GZ.exists():
        print(f"Using cached {JMDICT_GZ} ({JMDICT_GZ.stat().st_size / 1024 / 1024:.1f} MB)")
        return
    print(f"Downloading {JMDICT_URL} ...")
    urllib.request.urlretrieve(JMDICT_URL, JMDICT_GZ)
    print(f"  → {JMDICT_GZ} ({JMDICT_GZ.stat().st_size / 1024 / 1024:.1f} MB)")


def load_jmdict_expanded():
    """Read JMdict, inline-expand its internal DOCTYPE entities, strip the
    DOCTYPE block, and return the resulting XML bytes. Doing it ourselves
    sidesteps differences in how various Python releases handle internal
    entity expansion via expat."""
    print("Reading and pre-processing JMdict ...")
    with gzip.open(JMDICT_GZ, "rb") as f:
        raw = f.read().decode("utf-8")

    ent_pat = re.compile(r'<!ENTITY\s+(\S+)\s+"([^"]*)">')
    entities = dict(ent_pat.findall(raw))
    print(f"  → {len(entities)} entity definitions parsed from DOCTYPE")

    doctype_pat = re.compile(r"<!DOCTYPE[^\[]*\[.*?\]>", re.DOTALL)
    body = doctype_pat.sub("", raw, count=1)

    # Substitute &name; references. Only ones declared in the DOCTYPE — leave
    # standard XML entities (&amp; &lt; &gt; &quot; &apos;) for the parser.
    def sub_entity(m):
        name = m.group(1)
        return entities.get(name, m.group(0))

    ref_pat = re.compile(r"&([A-Za-z][\w\-]*);")
    body = ref_pat.sub(sub_entity, body)
    print(f"  → {len(body) / 1024 / 1024:.1f} MB of XML ready to parse")
    return body


def score_tag_list(tags):
    total = 0.0
    has_pri = False
    for t in tags:
        if t in PRI_WEIGHTS:
            total += PRI_WEIGHTS[t]
            has_pri = True
        elif t.startswith("nf"):
            try:
                band = int(t[2:])
                total += max(0.0, (49 - band) * 0.5)
                has_pri = True
            except ValueError:
                pass
    return total, has_pri


def score_priorities(ke_pris, re_pris):
    """Score a (kanji-form, reading) pair. Returns (base_score, has_pri,
    ichi1_only). The ichi1-only boost is NOT applied here — it gets added
    at bucketing time, only when the target kanji is the leading kanji."""
    ke_score, has_ke = score_tag_list(ke_pris)
    re_score, has_re = score_tag_list(re_pris)
    if not has_ke:
        return re_score * 0.3, has_re, False
    score = ke_score + re_score
    has_news = any(t in ("news1", "news2") for t in ke_pris + re_pris)
    has_ichi = any(t in ("ichi1", "ichi2") for t in ke_pris + re_pris)
    return score, True, (has_ichi and not has_news)


def process_entry(entry):
    """Yield candidate {w, r, m, raw_score, has_pri} dicts for one <entry>."""
    k_eles = []
    for k_ele in entry.findall("k_ele"):
        keb = k_ele.findtext("keb")
        if not keb:
            continue
        if any(c in PROVERB_CHARS for c in keb):
            continue
        if DIGIT_RE.search(keb):
            continue
        pris = [p.text for p in k_ele.findall("ke_pri") if p.text]
        info = [(i.text or "") for i in k_ele.findall("ke_inf")]
        if any(any(skip in i.lower() for skip in SKIP_KE_INFO) for i in info):
            continue
        k_eles.append({"keb": keb, "pris": pris})
    if not k_eles:
        return

    r_eles = []
    for r_ele in entry.findall("r_ele"):
        reb = r_ele.findtext("reb")
        if not reb:
            continue
        pris = [p.text for p in r_ele.findall("re_pri") if p.text]
        restr = [(r.text or "") for r in r_ele.findall("re_restr")]
        nokanji = r_ele.find("re_nokanji") is not None
        r_eles.append({"reb": reb, "pris": pris, "restr": restr, "nokanji": nokanji})
    if not r_eles:
        return

    senses = []
    any_inflectable = False
    any_non_uk = False
    any_non_archaic = False
    for sense in entry.findall("sense"):
        miscs = [(m.text or "").lower() for m in sense.findall("misc")]
        is_archaic = any(
            any(mark in m for mark in ARCHAIC_MARKERS) for m in miscs
        )
        is_uk = any(USUALLY_KANA_MARKER in m for m in miscs)
        if not is_archaic:
            any_non_archaic = True
            if not is_uk:
                any_non_uk = True
        glosses = [g.text for g in sense.findall("gloss") if g.text]
        stagk = [(s.text or "") for s in sense.findall("stagk")]
        pos_texts = [(p.text or "").lower() for p in sense.findall("pos")]
        is_inflectable = any(
            p.startswith(prefix) for prefix in INFLECTABLE_POS_PREFIXES for p in pos_texts
        ) or any(p in INFLECTABLE_POS_EXACT for p in pos_texts)
        if is_inflectable and not is_archaic and not is_uk:
            any_inflectable = True
        senses.append({"glosses": glosses, "archaic": is_archaic, "stagk": stagk, "uk": is_uk})

    # If every sense is archaic, skip — no useful kanji form here.
    if not any_non_archaic:
        return
    # If every (non-archaic) sense is "usually written in kana alone", the
    # kanji form is rare. Heavily down-weight so it only surfaces for kanji
    # with no other coverage (e.g. 且, where every entry is uk).
    uk_penalty = 0.1 if not any_non_uk else 1.0

    fallback_meaning = None
    for s in senses:
        if s["glosses"] and not s["archaic"]:
            fallback_meaning = s["glosses"][0]
            break
    if not fallback_meaning:
        return

    for k in k_eles:
        matching_r = None
        for r in r_eles:
            if r["nokanji"]:
                continue
            if not r["restr"] or k["keb"] in r["restr"]:
                matching_r = r
                break
        if not matching_r:
            continue

        meaning = fallback_meaning
        for s in senses:
            if s["archaic"] or not s["glosses"]:
                continue
            if s["stagk"] and k["keb"] in s["stagk"]:
                meaning = s["glosses"][0]
                break

        score, has_pri, ichi1_only = score_priorities(k["pris"], matching_r["pris"])
        score *= uk_penalty

        if has_pri and len(k["keb"]) == 1:
            score += SINGLE_KANJI_BOOST
        if has_pri and any_inflectable and len(k["keb"]) <= 5:
            score += INFLECTABLE_BOOST

        yield {
            "w": k["keb"],
            "r": matching_r["reb"],
            "m": meaning,
            "raw_score": score,
            "has_pri": has_pri,
            "inflectable": any_inflectable,
            "ichi1_only": ichi1_only,
        }


def enforce_quotas(ranked, target_kanji, target=25):
    """Take top `target` entries from `ranked` (already sorted by score),
    but guarantee minimum diversity quotas:

    - At least QUOTA_SINGLE_KANJI standalone single-kanji entries for the
      target kanji (e.g. 上 alone, 行 alone).
    - At least QUOTA_SHORT_VERB_STARTSWITH inflectable forms of length ≤4
      that begin with the target kanji (e.g. 上がる, 食べる, 行く).

    Substitutes the lowest-ranked entry in the current top-N with a quota
    candidate from the remainder pool. Quota promotion only happens if the
    candidate has any priority signal (no random rare-reading promotions).
    """
    top = ranked[: target]
    rest = ranked[target:]

    def is_single(e):
        return len(e["w"]) == 1 and e["w"] == target_kanji

    def is_canonical_verb(e):
        # A canonical basic verb for this kanji has exactly 1 kanji (the
        # target) followed by 1-2 kana of okurigana. Excludes compound verbs
        # like 見送る / 引き上げる where the target kanji combines with another
        # kanji that's the real semantic head.
        w = e["w"]
        return (
            e.get("inflectable")
            and 2 <= len(w) <= 4
            and w.startswith(target_kanji)
            and sum(1 for c in w if _is_kanji(c)) == 1
        )

    def promote(predicate, quota):
        nonlocal top, rest
        have = sum(1 for e in top if predicate(e))
        if have >= quota:
            return
        candidates = [e for e in rest if predicate(e) and e["has_pri"]]
        needed = quota - have
        for cand in candidates[:needed]:
            for i in range(len(top) - 1, -1, -1):
                e = top[i]
                if not is_single(e) and not is_canonical_verb(e):
                    top[i] = cand
                    rest.append(e)
                    break
        top.sort(key=lambda x: (-int(x["has_pri"]), -x["raw_score"], len(x["w"])))

    promote(is_single, QUOTA_SINGLE_KANJI)
    promote(is_canonical_verb, QUOTA_CANONICAL_VERB)
    return top


def build():
    download_jmdict()

    print("Loading cards.json ...")
    cards = json.loads(CARDS_PATH.read_text(encoding="utf-8"))
    kanji_to_idx = {c["k"]: c["idx"] for c in cards}
    target_set = set(kanji_to_idx)
    print(f"  → {len(cards)} kanji")

    xml_body = load_jmdict_expanded()

    print("Parsing JMdict and bucketing by target kanji ...")
    root = ET.fromstring(xml_body)
    buckets = defaultdict(list)
    entry_count = 0
    for entry in root.findall("entry"):
        entry_count += 1
        for cand in process_entry(entry):
            # Find leading kanji in the word — used to decide whether the
            # ichi1-only boost applies to a given target kanji's bucket.
            leading_kanji = None
            for c in cand["w"]:
                if _is_kanji(c):
                    leading_kanji = c
                    break
            # Add to every target kanji that appears in the word.
            seen = set()
            for ch in cand["w"]:
                if ch in target_set and ch not in seen:
                    # Per-bucket score: apply ichi1-only boost only when
                    # (a) the target kanji is the word's leading kanji and
                    # (b) the entry is inflectable (verb/i-adj). News corpus
                    # under-represents these specifically; ichi1-only nouns
                    # like 小羊 stay at their natural rank.
                    score = cand["raw_score"]
                    if (
                        cand["ichi1_only"]
                        and cand["inflectable"]
                        and ch == leading_kanji
                    ):
                        score += ICHI1_ONLY_BOOST
                    buckets[ch].append({**cand, "raw_score": score})
                    seen.add(ch)
    print(f"  → {entry_count} JMdict entries scanned, {len(buckets)} target kanji matched")

    print("Ranking and trimming to top 25 per kanji ...")
    output = {}
    for ch, entries in buckets.items():
        # Dedupe by (w, r) keeping highest-scoring instance.
        best = {}
        for e in entries:
            key = (e["w"], e["r"])
            if key not in best or e["raw_score"] > best[key]["raw_score"]:
                best[key] = e
        ranked = sorted(
            best.values(),
            key=lambda x: (-int(x["has_pri"]), -x["raw_score"], len(x["w"])),
        )
        ranked = enforce_quotas(ranked, ch, target=25)

        max_score = ranked[0]["raw_score"] if ranked and ranked[0]["raw_score"] > 0 else 1.0
        idx = kanji_to_idx[ch]
        output[str(idx)] = [
            {
                "w": e["w"],
                "r": e["r"],
                "m": e["m"],
                "pri": round(100 * e["raw_score"] / max_score) if max_score > 0 else 0,
            }
            for e in ranked
        ]

    for c in cards:
        output.setdefault(str(c["idx"]), [])

    print(f"Writing {OUTPUT_PATH} ...")
    OUTPUT_PATH.write_text(
        json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    size = OUTPUT_PATH.stat().st_size
    print(f"  → {size / 1024 / 1024:.2f} MB raw")

    write_stats(cards, output, size)
    print("Done.")


def write_stats(cards, output, size_bytes):
    counts_by_jlpt = defaultdict(list)
    empty = []
    low = []
    for c in cards:
        n = len(output[str(c["idx"])])
        jlpt = c.get("jlpt") or 0
        counts_by_jlpt[jlpt].append((n, c["k"]))
        if n == 0:
            empty.append(c["k"])
        elif n < 10:
            low.append((c["k"], n, jlpt))

    lines = ["# kanji-words.json — generation stats", ""]
    lines.append(f"- Source: JMdict_e (EDRDG, CC-BY-SA-4.0)")
    lines.append(f"- Output: `data/kanji-words.json`")
    lines.append(f"- Raw size: {size_bytes / 1024 / 1024:.2f} MB")
    lines.append(f"- Kanji with ≥1 entry: {sum(1 for c in cards if output[str(c['idx'])])} / {len(cards)}")
    lines.append("")
    lines.append("## Coverage by JLPT tier")
    lines.append("")
    lines.append("| JLPT | kanji | mean | min | max | <10 entries |")
    lines.append("|------|-------|------|-----|-----|-------------|")
    for jlpt in sorted(counts_by_jlpt.keys(), reverse=True):
        rows = counts_by_jlpt[jlpt]
        ns = [n for n, _ in rows]
        mean = sum(ns) / len(ns)
        label = f"N{jlpt}" if jlpt else "—"
        under10 = sum(1 for n in ns if n < 10)
        lines.append(f"| {label} | {len(ns)} | {mean:.1f} | {min(ns)} | {max(ns)} | {under10} |")

    if empty:
        lines.append("")
        lines.append(f"## Kanji with zero JMdict matches ({len(empty)})")
        lines.append("")
        lines.append(" ".join(empty))

    if low:
        lines.append("")
        lines.append(f"## Kanji with fewer than 10 entries ({len(low)})")
        lines.append("")
        lines.append("| kanji | entries | jlpt |")
        lines.append("|-------|---------|------|")
        for k, n, jlpt in low[:80]:
            lines.append(f"| {k} | {n} | {('N' + str(jlpt)) if jlpt else '—'} |")
        if len(low) > 80:
            lines.append(f"| ... | ({len(low) - 80} more) | |")

    STATS_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"  → stats: {STATS_PATH}")


if __name__ == "__main__":
    try:
        build()
    except KeyboardInterrupt:
        print("Interrupted.", file=sys.stderr)
        sys.exit(130)
