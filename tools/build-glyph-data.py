#!/usr/bin/env python3
# Slim GLYPH data: from the heavy data/kanji-geometry.json (~4.6 MB, all
# per-stroke geometry), extract ONLY what the GLYPH quadrant/component drill
# needs — each kanji's top-level components with their element char + spatial
# position (+ the 2x2 quadrant occupancy for region hinting). Keep only kanji
# with a clean 2-3 component split whose positions are distinct and in
# {left,right,top,bottom}. Output is keyed by idx and mirrors the geometry
# shape ({ idx: { components: [...] } }) so the mode reads `geo[idx].components`
# unchanged — just far smaller, so it can be precached + parsed in-browser.
#
# Run:  python tools/build-glyph-data.py   (regenerate after geometry changes)

import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'data', 'kanji-geometry.json')
DST = os.path.join(ROOT, 'data', 'glyph-components.json')

POS = {'left', 'right', 'top', 'bottom'}

def main():
    geo = json.load(open(SRC, encoding='utf-8'))
    out = {}
    skipped = 0
    for idx, entry in geo.items():
        comps = [c for c in (entry.get('components') or [])
                 if c.get('el') and c.get('pos') in POS]
        positions = [c['pos'] for c in comps]
        # need 2-3 components, each in a distinct positioned region
        if not (2 <= len(comps) <= 3) or len(set(positions)) != len(positions):
            skipped += 1
            continue
        out[idx] = {
            'n': entry.get('n'),  # stroke count, for the mode's difficulty ramp
            'components': [{'el': c['el'], 'pos': c['pos']} for c in comps],
        }
    json.dump(out, open(DST, 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
    size = os.path.getsize(DST)
    by_n = {}
    for v in out.values():
        n = len(v['components'])
        by_n[n] = by_n.get(n, 0) + 1
    print(f'glyph-eligible kanji: {len(out)}  (skipped {skipped})')
    print(f'component-count split: {dict(sorted(by_n.items()))}')
    print(f'wrote {DST}  ({size} bytes, {size/1024:.1f} KiB)')

if __name__ == '__main__':
    main()
