#!/usr/bin/env python3
"""
build-kanji-geometry.py — Precompute per-kanji stroke/component geometry (P3)
for the future GLYPH (quadrant / component) mode.

Reads data/cards.json (2136 cards). For each card it parses the bundled
KanjiVG `svg` string WITHOUT a heavy dependency (xml.dom.minidom + a tiny
hand-rolled path-`d` flattener) and derives:

  - per-stroke geometry (bbox, centroid, start/end, length, quadrant occupancy)
  - the TOP-LEVEL component split (direct <g ns1:element> children of the root
    character group), with each component's stroke range + aggregate geometry
  - both the Kangxi radical (card.rad) and the visual radical (the element
    flagged ns1:radical in the SVG), plus how often they disagree.

Pure standard library. Run from the repo root:

    python tools/build-kanji-geometry.py

Outputs (committed, like data/kanji-words.json):
    data/kanji-geometry.json        — keyed by idx
    data/kanji-components.json      — component inverse index
    tools/kanji-geometry-stats.md   — coverage / quality report

IMPORTANT geometry note: card.strokes is 0 on ~31.8% of cards, so it is NEVER
trusted. Stroke count `n` is always derived from the <path> elements.

KanjiVG path-`d` strings in this deck only ever use M/m, C/c, S/s (verified:
no L, Q, T, A, Z). The flattener still handles L/l, Q/q, T/t defensively so the
build won't silently drop strokes if a future cards.json adds them. Arcs (A/a)
and closepath (Z/z) do not occur and are not implemented.
"""

import json
import math
import re
import sys
from collections import defaultdict
from pathlib import Path
from xml.dom import minidom

# Windows consoles default to cp1252 — force UTF-8 so kanji in prints survive.
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except (AttributeError, OSError):
    pass

ROOT = Path(__file__).resolve().parents[1]
CARDS_PATH = ROOT / "data" / "cards.json"
GEOM_PATH = ROOT / "data" / "kanji-geometry.json"
COMP_PATH = ROOT / "data" / "kanji-components.json"
STATS_PATH = ROOT / "tools" / "kanji-geometry-stats.md"

# KanjiVG canvas is 109x109 with a 0..109 viewBox. The glyph "ink box" is the
# inner ~91px region (KanjiVG convention), so the visual center sits at 54.5 —
# we split the quadrant grids at the canvas center, matching the spec.
CENTER = 54.5

# Samples per stroke for the polyline approximation. ~24 keeps each curve
# faithful enough to assign quadrant occupancy without bloating runtime.
SAMPLES_PER_STROKE = 24

# Round coordinates to 2 decimals in the output — sub-0.01px precision on a
# 109px canvas is noise and just inflates the JSON.
RND = 2


# --------------------------------------------------------------------------- #
# Path-`d` parsing + flattening
# --------------------------------------------------------------------------- #

# Tokenise a `d` string into (command_letter, [floats]) is awkward because
# numbers can be packed without separators ("c0.41,1.03,0.82..." or
# "M17.25,25.47c..."). Pull command letters and number runs separately.
_CMD_RE = re.compile(r"[MmLlHhVvCcSsQqTtAaZz]")
# Matches an SVG number: optional sign, digits, optional fraction, optional
# exponent. Critically also splits "1.5-2.3" (implicit-minus) and ".5.5"
# (consecutive decimals) the way SVG path grammar requires.
_NUM_RE = re.compile(r"[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?")


def _tokenize(d):
    """Yield (cmd, [nums]) groups from a path `d` string."""
    i = 0
    n = len(d)
    out = []
    while i < n:
        ch = d[i]
        if ch in "MmLlHhVvCcSsQqTtAaZz":
            cmd = ch
            j = i + 1
            # grab the argument blob up to the next command letter
            k = j
            while k < n and d[k] not in "MmLlHhVvCcSsQqTtAaZz":
                k += 1
            nums = [float(x) for x in _NUM_RE.findall(d[j:k])]
            out.append((cmd, nums))
            i = k
        else:
            i += 1
    return out


def _cubic_point(p0, p1, p2, p3, t):
    u = 1 - t
    a = u * u * u
    b = 3 * u * u * t
    c = 3 * u * t * t
    e = t * t * t
    return (
        a * p0[0] + b * p1[0] + c * p2[0] + e * p3[0],
        a * p0[1] + b * p1[1] + c * p2[1] + e * p3[1],
    )


def _quad_point(p0, p1, p2, t):
    u = 1 - t
    a = u * u
    b = 2 * u * t
    c = t * t
    return (a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1])


def flatten_path(d, samples=SAMPLES_PER_STROKE):
    """Flatten one stroke's `d` into a list of (x, y) points.

    Handles M/m, L/l, H/h, V/v, C/c, S/s, Q/q, T/t. Reflection commands (S/T)
    track the previous control point. Curves are sampled at `samples` interior
    points; lines/moves contribute their endpoints. Arcs (A) and Z are not
    used by KanjiVG and are ignored if encountered.
    """
    pts = []
    cur = (0.0, 0.0)
    start = (0.0, 0.0)
    prev_cubic_ctrl = None  # for S/s reflection
    prev_quad_ctrl = None   # for T/t reflection

    def add(p):
        if not pts or (abs(p[0] - pts[-1][0]) > 1e-9 or abs(p[1] - pts[-1][1]) > 1e-9):
            pts.append(p)

    for cmd, nums in _tokenize(d):
        rel = cmd.islower()
        c = cmd.upper()

        if c == "M":
            # First pair is moveto; subsequent pairs are implicit linetos.
            it = iter(nums)
            first = True
            for x, y in zip(it, it):
                if rel:
                    x, y = cur[0] + x, cur[1] + y
                cur = (x, y)
                if first:
                    start = cur
                    add(cur)
                    first = False
                else:
                    add(cur)
            prev_cubic_ctrl = prev_quad_ctrl = None

        elif c == "L":
            it = iter(nums)
            for x, y in zip(it, it):
                if rel:
                    x, y = cur[0] + x, cur[1] + y
                cur = (x, y)
                add(cur)
            prev_cubic_ctrl = prev_quad_ctrl = None

        elif c == "H":
            for x in nums:
                nx = cur[0] + x if rel else x
                cur = (nx, cur[1])
                add(cur)
            prev_cubic_ctrl = prev_quad_ctrl = None

        elif c == "V":
            for y in nums:
                ny = cur[1] + y if rel else y
                cur = (cur[0], ny)
                add(cur)
            prev_cubic_ctrl = prev_quad_ctrl = None

        elif c == "C":
            it = iter(nums)
            for x1, y1, x2, y2, x, y in zip(it, it, it, it, it, it):
                if rel:
                    x1, y1 = cur[0] + x1, cur[1] + y1
                    x2, y2 = cur[0] + x2, cur[1] + y2
                    x, y = cur[0] + x, cur[1] + y
                p1, p2, p3 = (x1, y1), (x2, y2), (x, y)
                for s in range(1, samples + 1):
                    add(_cubic_point(cur, p1, p2, p3, s / samples))
                prev_cubic_ctrl = p2
                cur = p3
            prev_quad_ctrl = None

        elif c == "S":
            it = iter(nums)
            for x2, y2, x, y in zip(it, it, it, it):
                if rel:
                    x2, y2 = cur[0] + x2, cur[1] + y2
                    x, y = cur[0] + x, cur[1] + y
                # reflected first control point
                if prev_cubic_ctrl is not None:
                    p1 = (2 * cur[0] - prev_cubic_ctrl[0], 2 * cur[1] - prev_cubic_ctrl[1])
                else:
                    p1 = cur
                p2, p3 = (x2, y2), (x, y)
                for s in range(1, samples + 1):
                    add(_cubic_point(cur, p1, p2, p3, s / samples))
                prev_cubic_ctrl = p2
                cur = p3
            prev_quad_ctrl = None

        elif c == "Q":
            it = iter(nums)
            for x1, y1, x, y in zip(it, it, it, it):
                if rel:
                    x1, y1 = cur[0] + x1, cur[1] + y1
                    x, y = cur[0] + x, cur[1] + y
                p1, p2 = (x1, y1), (x, y)
                for s in range(1, samples + 1):
                    add(_quad_point(cur, p1, p2, s / samples))
                prev_quad_ctrl = p1
                cur = p2
            prev_cubic_ctrl = None

        elif c == "T":
            it = iter(nums)
            for x, y in zip(it, it):
                if rel:
                    x, y = cur[0] + x, cur[1] + y
                if prev_quad_ctrl is not None:
                    p1 = (2 * cur[0] - prev_quad_ctrl[0], 2 * cur[1] - prev_quad_ctrl[1])
                else:
                    p1 = cur
                p2 = (x, y)
                for s in range(1, samples + 1):
                    add(_quad_point(cur, p1, p2, s / samples))
                prev_quad_ctrl = p1
                cur = p2
            prev_cubic_ctrl = None

        # A/Z: not used by KanjiVG — ignore.

    if not pts:
        pts.append(cur)
    return pts


# --------------------------------------------------------------------------- #
# Geometry from a polyline
# --------------------------------------------------------------------------- #

def _quad2_index(x, y):
    """4-quadrant index, split at CENTER. Order: 0=TL,1=TR,2=BL,3=BR."""
    col = 1 if x >= CENTER else 0
    row = 1 if y >= CENTER else 0
    return row * 2 + col


def _quad3_index(x, y):
    """3x3 grid index 0..8, thirds of the 109px canvas (top-left=0)."""
    def band(v):
        if v < 109 / 3:
            return 0
        if v < 2 * 109 / 3:
            return 1
        return 2
    return band(y) * 3 + band(x)


def geom_from_points(points):
    """Compute bbox, centroid, start, end, len, quad2, quad3 from a polyline."""
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)

    # arc length
    length = 0.0
    for i in range(1, len(points)):
        length += math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])

    # centroid as mean of sampled points (length-weighted would over-emphasise
    # the curve-dense regions; plain mean of the even-ish sampling is fine)
    cx = sum(xs) / len(xs)
    cy = sum(ys) / len(ys)

    q2 = [0, 0, 0, 0]
    q3 = [0] * 9
    for x, y in points:
        q2[_quad2_index(x, y)] = 1
        q3[_quad3_index(x, y)] = 1

    return {
        "bbox": [round(x0, RND), round(y0, RND), round(x1, RND), round(y1, RND)],
        "centroid": [round(cx, RND), round(cy, RND)],
        "start": [round(points[0][0], RND), round(points[0][1], RND)],
        "end": [round(points[-1][0], RND), round(points[-1][1], RND)],
        "len": round(length, RND),
        "quad2": q2,
        "quad3": q3,
    }


def geom_from_strokes(stroke_points):
    """Aggregate geometry over several strokes' point lists (for a component)."""
    allpts = [p for sp in stroke_points for p in sp]
    return geom_from_points(allpts)


# --------------------------------------------------------------------------- #
# SVG walking
# --------------------------------------------------------------------------- #

def _is_element(node):
    return node.nodeType == node.ELEMENT_NODE


def _child_elements(node, tag=None):
    out = []
    for ch in node.childNodes:
        if _is_element(ch) and (tag is None or ch.tagName == tag):
            out.append(ch)
    return out


def _find_stroke_paths_group(doc):
    """Return the <g id='kvg:StrokePaths...'> element (the ink layer)."""
    for g in doc.getElementsByTagName("g"):
        gid = g.getAttribute("id")
        if gid.startswith("kvg:StrokePaths"):
            return g
    return None


def _find_root_char_group(strokepaths_g, kanji):
    """The root character group is the single direct <g> child of the
    StrokePaths group whose ns1:element equals the kanji. Fall back to the
    first direct <g> child if the element attribute is missing/odd."""
    direct = _child_elements(strokepaths_g, "g")
    for g in direct:
        if g.getAttribute("ns1:element") == kanji:
            return g
    return direct[0] if direct else None


def _paths_in_order(node):
    """All <path> descendants of node in document order."""
    return node.getElementsByTagName("path")


def parse_card(card):
    """Return (geometry_dict, list_of_top_level_component_elements) or None."""
    svg = card.get("svg") or ""
    if not svg:
        return None
    try:
        doc = minidom.parseString(svg)
    except Exception:
        return None

    sp = _find_stroke_paths_group(doc)
    if sp is None:
        return None
    root = _find_root_char_group(sp, card["k"])
    if root is None:
        return None

    # ---- strokes: count from <path> elements, never card.strokes ----
    all_paths = list(_paths_in_order(root))
    if not all_paths:
        return None

    # Map each path id -> 1-based index in stroke order, and flatten once.
    path_points = {}   # id(path) -> [points]
    strokes_out = []
    for i, p in enumerate(all_paths, start=1):
        d = p.getAttribute("d")
        pts = flatten_path(d)
        path_points[id(p)] = pts
        g = geom_from_points(pts)
        strokes_out.append({
            "i": i,
            "type": p.getAttribute("ns1:type") or "",
            **g,
        })

    # index lookup: path element -> 1-based stroke index
    path_to_idx = {id(p): i for i, p in enumerate(all_paths, start=1)}

    # ---- top-level component split: direct <g> children of root ----
    # These are the primary structural pieces (e.g. 明 -> 日, 月). If the root
    # has no <g> children (a single atomic radical kanji), the component list
    # is empty and the kanji is its own single component.
    components = []
    rad_visual = None  # the element flagged as the visual radical

    # The ns1:radical flag can live on the root char group itself or on a
    # descendant <g>. Search all descendant <g> for the radical marker; the
    # FIRST one found in document order is the visual radical.
    for g in root.getElementsByTagName("g"):
        if g.getAttribute("ns1:radical"):
            rad_visual = g.getAttribute("ns1:element") or rad_visual
            break

    for g in _child_elements(root, "g"):
        el = g.getAttribute("ns1:element")
        # collect this component's path indices
        idxs = sorted(path_to_idx[id(p)] for p in _paths_in_order(g) if id(p) in path_to_idx)
        if not idxs:
            continue
        comp_pts = [path_points[id(p)] for p in _paths_in_order(g) if id(p) in path_points]
        cg = geom_from_strokes(comp_pts)
        comp = {
            "el": el or "",
            "pos": g.getAttribute("ns1:position") or "",
            "radical": bool(g.getAttribute("ns1:radical")),
            "phon": bool(g.getAttribute("ns1:phon")),
            "part": g.getAttribute("ns1:part") or "",
            "range": [idxs[0], idxs[-1]],
            "bbox": cg["bbox"],
            "centroid": cg["centroid"],
            "quad2": cg["quad2"],
        }
        # 亻-style variant glyphs carry the canonical original (人) — keep it.
        original = g.getAttribute("ns1:original")
        if original:
            comp["original"] = original
        components.append(comp)

    geometry = {
        "n": len(all_paths),
        "strokes": strokes_out,
        "components": components,
        "radKangxi": card.get("rad") or "",
        "radVisual": rad_visual or "",
    }
    return geometry, components


# --------------------------------------------------------------------------- #
# Build
# --------------------------------------------------------------------------- #

def build():
    print("Loading cards.json ...")
    cards = json.loads(CARDS_PATH.read_text(encoding="utf-8"))
    print(f"  → {len(cards)} cards")

    geometry = {}
    by_kanji = {}       # idx -> [top-level element strings]
    by_component = defaultdict(set)  # element -> set of idx

    processed = 0
    failed = []
    total_strokes = 0
    n_with_components = 0   # >=2 top-level components
    n_position_labeled = 0  # any component carries a position
    n_phon = 0              # any component carries phon
    rad_disagree = 0
    rad_both_present = 0

    for card in cards:
        res = parse_card(card)
        idx = card["idx"]
        if res is None:
            failed.append((idx, card["k"]))
            continue
        geom, comps = res
        geometry[str(idx)] = geom
        processed += 1
        total_strokes += geom["n"]

        els = [c["el"] for c in comps if c["el"]]
        by_kanji[str(idx)] = els
        for el in els:
            by_component[el].add(idx)

        if len(comps) >= 2:
            n_with_components += 1
        if any(c["pos"] for c in comps):
            n_position_labeled += 1
        if any(c["phon"] for c in comps):
            n_phon += 1

        rk = geom["radKangxi"]
        rv = geom["radVisual"]
        if rk and rv:
            rad_both_present += 1
            if rk != rv:
                rad_disagree += 1

    # ---- write geometry ----
    print(f"Writing {GEOM_PATH} ...")
    GEOM_PATH.write_text(
        json.dumps(geometry, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    geom_size = GEOM_PATH.stat().st_size
    print(f"  → {geom_size / 1024 / 1024:.2f} MB")

    # ---- write component inverse index ----
    comp_index = {
        "byKanji": by_kanji,
        "byComponent": {el: sorted(idxs) for el, idxs in sorted(by_component.items())},
    }
    print(f"Writing {COMP_PATH} ...")
    COMP_PATH.write_text(
        json.dumps(comp_index, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    comp_size = COMP_PATH.stat().st_size
    print(f"  → {comp_size / 1024 / 1024:.2f} MB")

    # ---- stats ----
    write_stats(
        cards=cards,
        processed=processed,
        failed=failed,
        total_strokes=total_strokes,
        n_with_components=n_with_components,
        n_position_labeled=n_position_labeled,
        n_phon=n_phon,
        rad_disagree=rad_disagree,
        rad_both_present=rad_both_present,
        by_component=by_component,
        geom_size=geom_size,
        comp_size=comp_size,
    )
    print("Done.")


def write_stats(*, cards, processed, failed, total_strokes, n_with_components,
                n_position_labeled, n_phon, rad_disagree, rad_both_present,
                by_component, geom_size, comp_size):
    n = len(cards)
    pct = lambda x: (100.0 * x / processed) if processed else 0.0
    avg_strokes = (total_strokes / processed) if processed else 0.0

    # most common shared components
    top_components = sorted(by_component.items(), key=lambda kv: -len(kv[1]))[:25]

    lines = ["# kanji-geometry.json — generation stats", ""]
    lines.append("- Source: `data/cards.json` (KanjiVG `svg` field)")
    lines.append("- Outputs: `data/kanji-geometry.json`, `data/kanji-components.json`")
    lines.append(f"- Cards in deck: {n}")
    lines.append(f"- Cards processed: {processed}")
    lines.append(f"- Cards failed/skipped (no parseable strokes): {len(failed)}")
    lines.append(f"- Avg strokes per card (counted from <path>, NOT card.strokes): {avg_strokes:.2f}")
    lines.append(f"- Cards with ≥2 top-level components: {n_with_components} ({pct(n_with_components):.1f}%)")
    lines.append(f"- Cards with any position-labeled component: {n_position_labeled} ({pct(n_position_labeled):.1f}%)")
    lines.append(f"- Cards with any phonetic (phon) component: {n_phon} ({pct(n_phon):.1f}%)")
    lines.append("")
    lines.append("## Radical: Kangxi (card.rad) vs Visual (SVG ns1:radical)")
    lines.append("")
    lines.append(f"- Cards where both radicals are present: {rad_both_present}")
    disagree_pct = (100.0 * rad_disagree / rad_both_present) if rad_both_present else 0.0
    lines.append(f"- Disagreements (radKangxi != radVisual): {rad_disagree} ({disagree_pct:.1f}% of both-present)")
    lines.append("")
    lines.append("## File sizes")
    lines.append("")
    lines.append(f"- `kanji-geometry.json`: {geom_size / 1024 / 1024:.2f} MB ({geom_size} bytes)")
    lines.append(f"- `kanji-components.json`: {comp_size / 1024 / 1024:.2f} MB ({comp_size} bytes)")
    lines.append("")
    lines.append("## Most-shared components (top 25 by kanji count)")
    lines.append("")
    lines.append("| component | # kanji |")
    lines.append("|-----------|---------|")
    for el, idxs in top_components:
        lines.append(f"| {el} | {len(idxs)} |")

    if failed:
        lines.append("")
        lines.append(f"## Failed / skipped cards ({len(failed)})")
        lines.append("")
        lines.append(" ".join(f"{k}({idx})" for idx, k in failed[:60]))
        if len(failed) > 60:
            lines.append(f"... ({len(failed) - 60} more)")

    STATS_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"  → stats: {STATS_PATH}")


if __name__ == "__main__":
    try:
        build()
    except KeyboardInterrupt:
        print("Interrupted.", file=sys.stderr)
        sys.exit(130)
