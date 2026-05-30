// GLYPH — Pre + End screens. PreTitle / PreTicker / PreArm / TAReady are shared
// with TimeAttack (TAScreens.jsx, loaded earlier). XP constants are duplicated
// here so the end-screen breakdown sums exactly to what Glyph.jsx granted.

const GL_XP_PER_KANJI_R = 6;
const GL_XP_CLEAN_R     = 4;
const GL_XP_FLAWLESS_R  = 15;
const GL_XP_PB_R        = 25;

// Mini 米字格 diagram — 休 (亻 left, 木 right) shown mid-assembly: left part
// locked (cyan), right region still an empty dashed target.
const GlyphPreDiagram = () => (
  <div className="gl-pre-diagram" aria-hidden>
    <svg className="gl-pre-diag-svg" viewBox="0 0 100 100">
      <g className="gl-grid">
        <rect className="gl-grid-frame" x="1" y="1" width="98" height="98" />
        <line className="gl-grid-diag" x1="1" y1="1" x2="99" y2="99" />
        <line className="gl-grid-diag" x1="99" y1="1" x2="1" y2="99" />
        <line className="gl-grid-axis" x1="50" y1="1" x2="50" y2="99" />
        <line className="gl-grid-axis" x1="1" y1="50" x2="99" y2="50" />
      </g>
      {/* left region locked */}
      <g className="gl-region is-locked">
        <rect className="gl-region-outline" x="4" y="4" width="44" height="92" />
        <text className="gl-region-glyph" x="25" y="50">亻</text>
      </g>
      {/* right region still an open target */}
      <g className="gl-region is-armed">
        <rect className="gl-region-outline" x="52" y="4" width="44" height="92" />
        <text className="gl-region-tag" x="75" y="50">右</text>
      </g>
    </svg>
  </div>
);

const GlyphPre = ({ pb, onStart }) => (
  <div className="gl-pre" data-screen-label="gl-pre">
    <div className="gl-pre-head">
      <div className="gl-pre-eyebrow">▸ GLYPH · DECOMPOSE THE FORM</div>
      <PreTitle cls="gl-pre" text="PART ▒ PLACE // ASSEMBLE" />
      <div className="gl-pre-sub">read the meaning · drop each part where it lives on the grid · rebuild the kanji.</div>
      <PreTicker cls="gl-pre" text="› DECOMPOSITION ENGINE ARMED &nbsp; › 米字格 GRID LIVE &nbsp; › LEFT/RIGHT · TOP/BOTTOM SPLITS &nbsp; › POSITION MATTERS &nbsp; › CLEAN = NO MISPLACEMENTS &nbsp; › SPATIAL MEMORY STRENGTHENS RECALL &nbsp; › ENGAGE WHEN READY &nbsp;&nbsp;" />
    </div>

    <GlyphPreDiagram />

    <div className="gl-pre-rules">
      <div className="gl-pre-rule">
        <span className="gl-rk">◉</span>
        <span>tap a <b className="gl-mark-mag">part</b> from the tray, then tap the region where it belongs</span>
      </div>
      <div className="gl-pre-rule">
        <span className="gl-rk gl-rk-ok">▲</span>
        <span>position is the answer — left vs right, top vs bottom · wrong region flashes</span>
      </div>
      <div className="gl-pre-rule">
        <span className="gl-rk gl-rk-neutral">米</span>
        <span>all parts placed correctly → <b>clean</b> · any misplacement forfeits it</span>
      </div>
    </div>

    <div className={`gl-pre-meta ${pb > 0 ? 'gl-pre-meta-2' : 'gl-pre-meta-1'}`}>
      <div className="gl-pre-meta-cell">
        <div className="gl-pre-meta-lbl">set size</div>
        <div className="gl-pre-meta-val">{8}</div>
      </div>
      {pb > 0 && (
        <div className="gl-pre-meta-cell is-pb">
          <div className="gl-pre-meta-lbl">best clean</div>
          <div className="gl-pre-meta-val">{pb}</div>
        </div>
      )}
    </div>

    <PreArm cls="gl-pre" readyLabel="▸ GRID // ARMED" lockedLabel="◌ GRID // COLD" />
    <button className="gl-pre-start" onClick={onStart}>
      <span>▸ ENGAGE</span>
      <span className="arrow">◉</span>
    </button>

    <div className="gl-pre-hint kbd-hint">
      <kbd>SPACE</kbd> start · <kbd>ESC</kbd> quit · tap to place
    </div>
  </div>
);

const GlyphEnd = ({ deckSize, kanjiDone, cleanKanji, totalErrors, results, beatPb, pb, xpGained, onAgain, onHome }) => {
  const allClean = kanjiDone > 0 && cleanKanji === kanjiDone && kanjiDone >= deckSize;
  const rate = kanjiDone > 0 ? Math.round((100 * cleanKanji) / kanjiDone) : 0;

  // Mirror Glyph.jsx grant formula exactly so the breakdown sums to xpGained.
  const xpKanji = kanjiDone * GL_XP_PER_KANJI_R;
  const xpClean = cleanKanji * GL_XP_CLEAN_R;
  const xpFlaw  = allClean ? GL_XP_FLAWLESS_R : 0;
  const xpPbRow = beatPb ? GL_XP_PB_R : 0;
  const xpTotal = xpGained != null ? xpGained : Math.max(0, xpKanji + xpClean + xpFlaw + xpPbRow);

  const ribbon = rate >= 100 ? 'ARCHITECT'
    : rate >= 80 ? 'STRUCTURAL'
    : rate >= 50 ? 'BLUEPRINTING'
    : 'SCATTERED';
  const ribbonClr = rate >= 100 ? 'var(--accent-magenta)'
    : rate >= 80 ? 'var(--accent-cyan)'
    : rate >= 50 ? 'var(--accent-amber)'
    : 'var(--fg-2)';

  const recent = (results || []).slice(-8);

  return (
    <div className="gl-end" data-screen-label="gl-end">
      <div className="gl-end-ribbon" style={{ '--ribbon-clr': ribbonClr }}>
        <div className="gl-end-eyebrow">▸ GLYPH · DEBRIEF</div>
        <div className="gl-end-ribbon-title">{ribbon}</div>
      </div>

      <div className="gl-end-hero">
        <div className="gl-end-hero-score">
          <div className="gl-end-hero-lbl">CLEAN RATE</div>
          <div className="gl-end-hero-val">{rate}<span className="pct">%</span></div>
          {beatPb
            ? <div className="gl-end-hero-pb">▲ NEW BEST · {cleanKanji} clean</div>
            : pb > 0
              ? <div className="gl-end-hero-pb-prev">best {pb} clean · {Math.max(0, pb - cleanKanji + 1)} to beat</div>
              : <div className="gl-end-hero-pb-prev">first set</div>}
        </div>
        <div className="gl-end-hero-stats">
          <div className="gl-end-hero-stat">
            <div className="gl-end-hero-stat-lbl">clean</div>
            <div className="gl-end-hero-stat-val is-good">{cleanKanji}/{kanjiDone}</div>
          </div>
          <div className="gl-end-hero-stat">
            <div className="gl-end-hero-stat-lbl">misplaced</div>
            <div className="gl-end-hero-stat-val">{totalErrors}</div>
          </div>
          <div className="gl-end-hero-stat">
            <div className="gl-end-hero-stat-lbl">kanji</div>
            <div className="gl-end-hero-stat-val">{kanjiDone}</div>
          </div>
        </div>
      </div>

      {recent.length > 0 && (
        <div className="gl-end-group">
          <div className="gl-end-group-head">
            <span>▸ THE SET</span>
            <span className="gl-end-group-count">{cleanKanji} clean</span>
          </div>
          <div className="gl-end-row">
            {recent.map((h, i) => (
              <div key={i} className={`gl-end-chip${h.clean ? ' is-ok' : h.skipped ? ' is-skip' : ' is-bad'}`} title={h.mean || ''}>
                <span className="gl-end-chip-k">{h.k}</span>
                <span className="gl-end-chip-tag">{h.clean ? '✓' : h.skipped ? '⤼' : `${h.placeErrors}✗`}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="gl-end-xp">
        <div className="gl-end-xp-head">
          <span>▸ XP EARNED</span>
          <span className="gl-end-xp-total">+{xpTotal}</span>
        </div>
        <div className="gl-end-xp-rows">
          {xpKanji > 0 && <div className="gl-end-xp-row"><span>assembled · {kanjiDone}×{GL_XP_PER_KANJI_R}</span><b>+{xpKanji}</b></div>}
          {xpClean > 0 && <div className="gl-end-xp-row"><span>clean · {cleanKanji}×{GL_XP_CLEAN_R}</span><b>+{xpClean}</b></div>}
          {xpFlaw > 0 && <div className="gl-end-xp-row is-pb"><span>flawless set</span><b>+{xpFlaw}</b></div>}
          {xpPbRow > 0 && <div className="gl-end-xp-row is-pb"><span>new personal best</span><b>+{xpPbRow}</b></div>}
          <div className="gl-end-xp-row gl-end-xp-streak"><span>daily streak</span><b>▲ +1</b></div>
        </div>
      </div>

      <div className="gl-end-actions">
        <button className="run-end-btn" onClick={onHome}>‹ HOME</button>
        <button className="run-end-btn primary" onClick={onAgain}>BUILD AGAIN ▸</button>
      </div>
    </div>
  );
};

Object.assign(window, { GlyphPre, GlyphEnd });
