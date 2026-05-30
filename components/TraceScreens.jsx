// TRACE — Pre + End screens. PreTitle / PreTicker / PreArm / TAReady are shared
// with TimeAttack (TAScreens.jsx, loaded earlier). XP constants are duplicated
// here so the end-screen breakdown sums exactly to what Trace.jsx granted.

const TR_XP_PER_KANJI_R = 5;
const TR_XP_CLEAN_R     = 4;
const TR_XP_FLAWLESS_R  = 15;
const TR_XP_PB_R        = 25;

// Mini 田字格 diagram glyph (三) — stroke 1 locked, stroke 2 next, stroke 3 ghost.
const TracePreDiagram = () => (
  <div className="tr-pre-diagram" aria-hidden>
    <svg className="tr-pre-diag-svg" viewBox="0 0 109 109">
      <g className="tr-grid">
        <rect className="tr-grid-frame" x="2" y="2" width="105" height="105" />
        <line className="tr-grid-diag" x1="2" y1="2" x2="107" y2="107" />
        <line className="tr-grid-diag" x1="107" y1="2" x2="2" y2="107" />
        <line className="tr-grid-axis" x1="54.5" y1="2" x2="54.5" y2="107" />
        <line className="tr-grid-axis" x1="2" y1="54.5" x2="107" y2="54.5" />
      </g>
      <path className="tr-stroke is-done"   d="M30,32 L80,32" />
      <path className="tr-stroke is-next"   d="M24,55 L86,55" />
      <path className="tr-stroke is-future" d="M18,80 L92,80" />
      <circle className="tr-startdot" cx="24" cy="55" r="3.4" />
    </svg>
  </div>
);

const TracePre = ({ pb, onStart }) => (
  <div className="tr-pre" data-screen-label="tr-pre">
    <div className="tr-pre-head">
      <div className="tr-pre-eyebrow">▸ TRACE · BUILD THE MOTOR PATTERN</div>
      <PreTitle cls="tr-pre" text="INK ▒ STROKE // ORDER" />
      <div className="tr-pre-sub">trace each stroke on the grid · in order · the way the hand learns it.</div>
      <PreTicker cls="tr-pre" text="› STROKE ENGINE ARMED &nbsp; › ORDER ENFORCED &nbsp; › DIRECTION CHECKED &nbsp; › 田字格 GRID LIVE &nbsp; › CLEAN = NO RETRIES, NO HINTS &nbsp; › WRITING STRENGTHENS RECOGNITION &nbsp; › ENGAGE WHEN READY &nbsp;&nbsp;" />
    </div>

    <TracePreDiagram />

    <div className="tr-pre-rules">
      <div className="tr-pre-rule">
        <span className="tr-rk">◉</span>
        <span>drag each stroke from its <b className="tr-mark-mag">start dot</b> · the next stroke glows magenta</span>
      </div>
      <div className="tr-pre-rule">
        <span className="tr-rk tr-rk-ok">▲</span>
        <span>order &amp; direction matter — wrong way gets flagged, not accepted</span>
      </div>
      <div className="tr-pre-rule">
        <span className="tr-rk tr-rk-neutral">◐</span>
        <span><b>HINT</b> draws the next stroke once · <b>SKIP</b> moves on — both forfeit a clean trace</span>
      </div>
    </div>

    <div className={`tr-pre-meta ${pb > 0 ? 'tr-pre-meta-2' : 'tr-pre-meta-1'}`}>
      <div className="tr-pre-meta-cell">
        <div className="tr-pre-meta-lbl">set size</div>
        <div className="tr-pre-meta-val">{8}</div>
      </div>
      {pb > 0 && (
        <div className="tr-pre-meta-cell is-pb">
          <div className="tr-pre-meta-lbl">best clean</div>
          <div className="tr-pre-meta-val">{pb}</div>
        </div>
      )}
    </div>

    <PreArm cls="tr-pre" readyLabel="▸ STYLUS // ARMED" lockedLabel="◌ STYLUS // COLD" />
    <button className="tr-pre-start" onClick={onStart}>
      <span>▸ ENGAGE</span>
      <span className="arrow">◉</span>
    </button>

    <div className="tr-pre-hint kbd-hint">
      <kbd>SPACE</kbd> start · <kbd>ESC</kbd> quit · drag to trace
    </div>
  </div>
);

const TraceEnd = ({ deckSize, kanjiDone, cleanKanji, totalStrokes, cleanStrokes, results, beatPb, pb, xpGained, onAgain, onHome }) => {
  const allClean = kanjiDone > 0 && cleanKanji === kanjiDone && kanjiDone >= deckSize;
  const acc = totalStrokes > 0 ? Math.round((100 * cleanStrokes) / totalStrokes) : 0;

  // Mirror Trace.jsx grant formula exactly so the breakdown sums to xpGained.
  const xpKanji = kanjiDone * TR_XP_PER_KANJI_R;
  const xpClean = cleanKanji * TR_XP_CLEAN_R;
  const xpFlaw  = allClean ? TR_XP_FLAWLESS_R : 0;
  const xpPbRow = beatPb ? TR_XP_PB_R : 0;
  const xpTotal = xpGained != null ? xpGained : Math.max(0, xpKanji + xpClean + xpFlaw + xpPbRow);

  const ribbon = acc >= 95 ? 'CALLIGRAPHER'
    : acc >= 80 ? 'STEADY HAND'
    : acc >= 60 ? 'WARMING UP'
    : 'SHAKY LINE';
  const ribbonClr = acc >= 95 ? 'var(--accent-magenta)'
    : acc >= 80 ? 'var(--accent-cyan)'
    : acc >= 60 ? 'var(--accent-amber)'
    : 'var(--fg-2)';

  const recent = (results || []).slice(-8);

  return (
    <div className="tr-end" data-screen-label="tr-end">
      <div className="tr-end-ribbon" style={{ '--ribbon-clr': ribbonClr }}>
        <div className="tr-end-eyebrow">▸ TRACE · DEBRIEF</div>
        <div className="tr-end-ribbon-title">{ribbon}</div>
      </div>

      <div className="tr-end-hero">
        <div className="tr-end-hero-score">
          <div className="tr-end-hero-lbl">ACCURACY</div>
          <div className="tr-end-hero-val">{acc}<span className="pct">%</span></div>
          {beatPb
            ? <div className="tr-end-hero-pb">▲ NEW BEST · {cleanKanji} clean</div>
            : pb > 0
              ? <div className="tr-end-hero-pb-prev">best {pb} clean · {Math.max(0, pb - cleanKanji + 1)} to beat</div>
              : <div className="tr-end-hero-pb-prev">first set</div>}
        </div>
        <div className="tr-end-hero-stats">
          <div className="tr-end-hero-stat">
            <div className="tr-end-hero-stat-lbl">clean</div>
            <div className="tr-end-hero-stat-val is-good">{cleanKanji}/{kanjiDone}</div>
          </div>
          <div className="tr-end-hero-stat">
            <div className="tr-end-hero-stat-lbl">strokes</div>
            <div className="tr-end-hero-stat-val">{cleanStrokes}/{totalStrokes}</div>
          </div>
          <div className="tr-end-hero-stat">
            <div className="tr-end-hero-stat-lbl">kanji</div>
            <div className="tr-end-hero-stat-val">{kanjiDone}</div>
          </div>
        </div>
      </div>

      {recent.length > 0 && (
        <div className="tr-end-group">
          <div className="tr-end-group-head">
            <span>▸ THE SET</span>
            <span className="tr-end-group-count">{cleanKanji} clean</span>
          </div>
          <div className="tr-end-row">
            {recent.map((h, i) => (
              <div key={i} className={`tr-end-chip${h.clean ? ' is-ok' : h.skipped ? ' is-skip' : ' is-bad'}`} title={h.mean || ''}>
                <span className="tr-end-chip-k">{h.k}</span>
                <span className="tr-end-chip-tag">{h.clean ? '✓' : h.skipped ? '⤼' : `${h.retries}✗`}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="tr-end-xp">
        <div className="tr-end-xp-head">
          <span>▸ XP EARNED</span>
          <span className="tr-end-xp-total">+{xpTotal}</span>
        </div>
        <div className="tr-end-xp-rows">
          {xpKanji > 0 && <div className="tr-end-xp-row"><span>traced · {kanjiDone}×{TR_XP_PER_KANJI_R}</span><b>+{xpKanji}</b></div>}
          {xpClean > 0 && <div className="tr-end-xp-row"><span>clean · {cleanKanji}×{TR_XP_CLEAN_R}</span><b>+{xpClean}</b></div>}
          {xpFlaw > 0 && <div className="tr-end-xp-row is-pb"><span>flawless set</span><b>+{xpFlaw}</b></div>}
          {xpPbRow > 0 && <div className="tr-end-xp-row is-pb"><span>new personal best</span><b>+{xpPbRow}</b></div>}
          <div className="tr-end-xp-row tr-end-xp-streak"><span>daily streak</span><b>▲ +1</b></div>
        </div>
      </div>

      <div className="tr-end-actions">
        <button className="run-end-btn" onClick={onHome}>‹ HOME</button>
        <button className="run-end-btn primary" onClick={onAgain}>TRACE AGAIN ▸</button>
      </div>
    </div>
  );
};

Object.assign(window, { TracePre, TraceEnd });
