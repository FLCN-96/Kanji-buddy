// GLYPH — Play surface. "QUADRANT LOCK": the operator rebuilds a kanji by
// dropping its component glyphs into the correct spatial region on a 米字格
// grid. Evidence-only (writes card_events, never card_states). Geometry comes
// from data/kanji-geometry.json (component `pos` ∈ left|right|top|bottom),
// pre-filtered by the orchestrator's selectGlyphDeck so every dealt kanji is a
// clean 2-component left/right or top/bottom split.
//
// Interaction model (tap-to-place, touch-first — no drag, so it works the same
// on a phone as a trackpad):
//   1. tap a tray tile  → it's SELECTED (magenta highlight)
//   2. tap a region     → if region === selected tile's correct pos, LOCK it
//                         (glyph snaps in, cyan glow, tile leaves the tray);
//                         else flash that region danger-red + shake, deselect,
//                         bump placeErrors for that component.
//   3. all components locked → cyan sweep + assembled-glyph overlay → advance.

// ── grid geometry — a 0..100 square; center cross at 50, the 米 diagonals ──
const GL_VB = 100;
const GL_C  = 50;     // center of the 米字格

// The two region shapes we ever draw, expressed as {x,y,w,h} in viewBox units.
// left/right split the square vertically; top/bottom split it horizontally.
const GL_REGION_RECT = {
  left:   { x: 0,  y: 0,  w: 50, h: 100 },
  right:  { x: 50, y: 0,  w: 50, h: 100 },
  top:    { x: 0,  y: 0,  w: 100, h: 50 },
  bottom: { x: 0,  y: 50, w: 100, h: 50 },
};

// Fisher–Yates — local copy so the tray order is independent of deck order.
function glShuffle(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── play component ───────────────────────────────────────────────────
// Keyed by card.idx in the orchestrator, so every local ref/state below
// resets cleanly when the kanji advances.
const GlyphPlay = ({ card, comps, index, total, onKanjiDone, onEvent }) => {
  // comps: [{ el, pos }] — already filtered to a clean 2-region split.
  // Build a stable, shuffled tray of tiles (one per component).
  const tiles = React.useMemo(
    () => glShuffle(comps.map((c, i) => ({ id: i, el: c.el, pos: c.pos }))),
    [comps]
  );
  // Which of the two axes are we on? Decides which regions get rendered.
  const regions = React.useMemo(() => {
    const poses = comps.map(c => c.pos);
    if (poses.includes('left') || poses.includes('right')) return ['left', 'right'];
    return ['top', 'bottom'];
  }, [comps]);

  const [selected, setSelected] = React.useState(null);     // tile id, or null
  const [locked, setLocked]     = React.useState({});       // pos -> { el }
  const [justLocked, setJustLocked] = React.useState(null); // pos that just snapped in
  const [badPos, setBadPos]     = React.useState(null);     // region flashing red
  const [shake, setShake]       = React.useState(0);        // bump to retrigger shake
  const [complete, setComplete] = React.useState(false);

  const placeErrorsRef = React.useRef({}); // el -> wrong-placement count
  const doneRef        = React.useRef(false);
  const startedAt      = React.useRef(Date.now());
  const badTimer       = React.useRef(null);

  React.useEffect(() => () => { if (badTimer.current) clearTimeout(badTimer.current); }, []);

  // Degenerate guard: a kanji with no usable components shouldn't stall the set.
  React.useEffect(() => {
    if (comps.length === 0 && !doneRef.current) {
      doneRef.current = true;
      onKanjiDone({ idx: card.idx, clean: false, placeErrors: 0, components: [], ms: 0, skipped: true });
    }
  }, [comps.length, card.idx, onKanjiDone]);

  const lockedCount = Object.keys(locked).length;

  const finishKanji = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    const placeErrors = Object.values(placeErrorsRef.current).reduce((a, b) => a + (b || 0), 0);
    const clean = placeErrors === 0;
    setComplete(true);
    onEvent && onEvent({ type: 'complete', clean });
    setTimeout(() => {
      onKanjiDone({
        idx: card.idx,
        clean,
        placeErrors,
        components: comps.map(c => c.el),
        ms: Date.now() - startedAt.current,
      });
    }, 600);
  };

  const selectTile = (tile) => {
    if (complete || locked[tile.pos]) return;
    setBadPos(null);
    setSelected(prev => (prev === tile.id ? null : tile.id));
    onEvent && onEvent({ type: 'select' });
  };

  const placeAt = (pos) => {
    if (complete || locked[pos]) return;
    if (selected == null) return;
    const tile = tiles.find(t => t.id === selected);
    if (!tile) return;

    if (tile.pos === pos) {
      // Correct lock.
      const next = { ...locked, [pos]: { el: tile.el } };
      setLocked(next);
      setJustLocked(pos);
      setSelected(null);
      setBadPos(null);
      onEvent && onEvent({ type: 'lock' });
      if (Object.keys(next).length >= comps.length) finishKanji();
    } else {
      // Wrong region for the selected tile.
      placeErrorsRef.current[tile.el] = (placeErrorsRef.current[tile.el] || 0) + 1;
      setSelected(null);
      setJustLocked(null);   // so the shake remount doesn't re-pop a locked glyph
      setBadPos(pos);
      setShake(s => s + 1);
      onEvent && onEvent({ type: 'wrong' });
      if (badTimer.current) clearTimeout(badTimer.current);
      badTimer.current = setTimeout(() => setBadPos(null), 420);
    }
  };

  const meaning = (card.mean || '').split(',').slice(0, 2).join(', ').trim();
  const reading = card.mainKun || card.mainOn || '';
  const trayTiles = tiles.filter(t => !locked[t.pos]);

  return (
    <div className="gl-play" data-screen-label="gl-play">
      {/* Prompt — meaning + reading give the recall hook; the glyph itself stays
          hidden until the assembly completes (that's the reveal). */}
      <div className="gl-prompt">
        <div className="gl-prompt-eyebrow">▸ ASSEMBLE · {String(index + 1).padStart(2, '0')}/{String(total).padStart(2, '0')}</div>
        <div className="gl-prompt-mean">{meaning || '—'}</div>
        {reading && <div className="gl-prompt-read">{reading}</div>}
      </div>

      {/* Stage — 米字格 grid + dashed target regions + locked component glyphs. */}
      <div
        className={`gl-stage${complete ? ' is-complete' : ''}${badPos ? ' is-bad' : ''}`}
        key={shake}
      >
        <svg className="gl-svg" viewBox={`0 0 ${GL_VB} ${GL_VB}`} aria-hidden>
          {/* 米字格 frame + center cross + the two diagonals (the 米 grid) */}
          <g className="gl-grid">
            <rect className="gl-grid-frame" x="1" y="1" width="98" height="98" />
            <line className="gl-grid-diag" x1="1" y1="1" x2="99" y2="99" />
            <line className="gl-grid-diag" x1="99" y1="1" x2="1" y2="99" />
            <line className="gl-grid-axis" x1={GL_C} y1="1" x2={GL_C} y2="99" />
            <line className="gl-grid-axis" x1="1" y1={GL_C} x2="99" y2={GL_C} />
          </g>

          {/* Target regions for THIS kanji — dashed magenta tap-zones. */}
          {regions.map(pos => {
            const r = GL_REGION_RECT[pos];
            const isLocked = !!locked[pos];
            const isBad = badPos === pos;
            const armed = selected != null && !isLocked;
            const cls = `gl-region${isLocked ? ' is-locked' : ''}${isBad ? ' is-bad' : ''}${armed ? ' is-armed' : ''}`;
            return (
              <g key={pos} className={cls} onClick={() => placeAt(pos)} role="button">
                <rect className="gl-region-hit" x={r.x} y={r.y} width={r.w} height={r.h} />
                <rect
                  className="gl-region-outline"
                  x={r.x + 3} y={r.y + 3} width={r.w - 6} height={r.h - 6}
                />
                {isLocked
                  ? <text className={`gl-region-glyph${justLocked === pos ? ' is-snap' : ''}`} x={r.x + r.w / 2} y={r.y + r.h / 2}>{locked[pos].el}</text>
                  : <text className="gl-region-tag" x={r.x + r.w / 2} y={r.y + r.h / 2}>{glRegionLabel(pos)}</text>}
              </g>
            );
          })}
        </svg>

        {/* Completion overlay — the assembled kanji, briefly, then we advance. */}
        {complete && (
          <>
            <div className="gl-stage-flash" aria-hidden />
            <div className="gl-stage-reveal" aria-hidden>{card.k}</div>
          </>
        )}
      </div>

      {/* Tray — the shuffled component glyphs. Tap to select, then tap a region. */}
      <div className="gl-tray" aria-live="polite">
        {trayTiles.length === 0 && !complete && <div className="gl-tray-empty">—</div>}
        {trayTiles.map(t => (
          <button
            key={t.id}
            className={`gl-tile${selected === t.id ? ' is-selected' : ''}`}
            onClick={() => selectTile(t)}
            disabled={complete}
          >
            <span className="gl-tile-el">{t.el}</span>
          </button>
        ))}
      </div>

      {/* Status line — mirrors TRACE's controls-status band. */}
      <div className="gl-status" aria-live="polite">
        {complete
          ? <span className="gl-status-ok">▲ GLYPH ASSEMBLED</span>
          : badPos
            ? <span className="gl-status-bad">✖ WRONG REGION · try the other side</span>
            : selected != null
              ? <span className="gl-status-mag">◉ PLACE IT · tap the matching region</span>
              : <span className="gl-status-dim">PICK A PART · {lockedCount}/{comps.length} locked</span>}
      </div>
    </div>
  );
};

// Region placeholder label shown before a part is locked into it.
function glRegionLabel(pos) {
  return pos === 'left' ? '左' : pos === 'right' ? '右' : pos === 'top' ? '上' : '下';
}

Object.assign(window, { GlyphPlay, glShuffle, GL_REGION_RECT });
