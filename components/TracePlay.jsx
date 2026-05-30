// TRACE — Play surface. The KanjiVG ghost sits on a 田字格 grid; the operator
// traces one stroke at a time, in canonical order. Each captured stroke is
// scored against the reference geometry pulled live from the SVG path
// (getPointAtLength sampling) using a resampled-pointwise comparison — the $1
// unistroke approach: forgiving on touch, yet it flags reversed direction and
// (because we only ever accept the NEXT expected stroke) enforces stroke order.
//
// Pedagogy guardrail (PMC9403612): we do NOT auto-stack a draw-on animation
// with color-coding during learning — the default is a STATIC ghost + active
// tracing. The draw-on animation is opt-in (the HINT button) and shown once.

// ── tuning ──────────────────────────────────────────────────────────
const TR_SAMPLES   = 24;   // points each stroke is resampled to before compare
const TR_TOL       = 17;   // mean deviation tolerance, in 0..109 viewBox units
const TR_REV_MARGIN = 2;   // how much closer the reversed fit must be to flag a reversal
const TR_MIN_PTS   = 3;    // fewer captured points than this = a tap, ignored
const TR_VB        = 109;  // KanjiVG viewBox is 0 0 109 109

// ── pure geometry helpers (also exported for testing) ────────────────
function trDist(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }

function trPolyLen(pts) {
  let t = 0;
  for (let i = 1; i < pts.length; i++) t += trDist(pts[i - 1], pts[i]);
  return t;
}

// Parse a KanjiVG svg string into an ordered array of stroke `d` paths. DOM
// order === canonical stroke order, and the only <path> elements are strokes
// (the numbered <text> labels live in a separate group). Absolute coords, no
// group transforms, so we can re-render them flat into our own viewBox.
function parseStrokes(svgString) {
  if (!svgString) return [];
  try {
    const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
    if (doc.querySelector('parsererror')) return [];
    return Array.from(doc.querySelectorAll('path'))
      .map(p => p.getAttribute('d'))
      .filter(Boolean);
  } catch (e) { return []; }
}

// Arc-length resample a captured polyline to exactly n evenly-spaced points so
// it can be compared index-for-index against the reference sampling.
function trResample(pts, n) {
  if (!pts.length) return [];
  if (pts.length === 1) return Array.from({ length: n }, () => ({ x: pts[0].x, y: pts[0].y }));
  const cum = [0];
  let total = 0;
  for (let i = 1; i < pts.length; i++) { total += trDist(pts[i - 1], pts[i]); cum.push(total); }
  if (total === 0) return Array.from({ length: n }, () => ({ x: pts[0].x, y: pts[0].y }));
  const out = [];
  for (let i = 0; i < n; i++) {
    const target = (total * i) / (n - 1);
    let j = 1;
    while (j < cum.length - 1 && cum[j] < target) j++;
    const seg = cum[j] - cum[j - 1] || 1;
    const f = (target - cum[j - 1]) / seg;
    out.push({
      x: pts[j - 1].x + (pts[j].x - pts[j - 1].x) * f,
      y: pts[j - 1].y + (pts[j].y - pts[j - 1].y) * f,
    });
  }
  return out;
}

// Sample a live SVGPathElement to n points via the geometry API.
function trSamplePathEl(el, n) {
  if (!el || !el.getTotalLength) return [];
  let len = 0;
  try { len = el.getTotalLength(); } catch (e) { return []; }
  const out = [];
  for (let i = 0; i < n; i++) {
    let p;
    try { p = el.getPointAtLength(n === 1 ? 0 : (len * i) / (n - 1)); }
    catch (e) { p = { x: 0, y: 0 }; }
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

// Compare a captured user stroke against a reference stroke. Returns whether it
// passes, plus the failure flavour so the UI can say WHY (wrong way / off track
// / too short) rather than a generic miss.
function trScoreStroke(userPts, refPts, opts) {
  const o = opts || {};
  const tol = o.tol != null ? o.tol : TR_TOL;
  const N = refPts.length;
  if (N === 0) return { ok: true, reason: null, dev: 0 };
  const u = trResample(userPts, N);
  let fwd = 0, rev = 0;
  for (let i = 0; i < N; i++) {
    fwd += trDist(u[i], refPts[i]);
    rev += trDist(u[i], refPts[N - 1 - i]);
  }
  fwd /= N; rev /= N;
  const reversed = rev < fwd - TR_REV_MARGIN;     // clearly a better fit drawn backwards
  const ulen = trPolyLen(u), rlen = trPolyLen(refPts);
  const tooShort = rlen > 14 && ulen < rlen * 0.35; // a stub can't pass a long stroke
  const ok = fwd <= tol && !reversed && !tooShort;
  const reason = ok ? null : reversed ? 'rev' : tooShort ? 'short' : 'off';
  return { ok, reason, dev: fwd };
}

// ── play component ───────────────────────────────────────────────────
// Keyed by card.idx in the orchestrator, so every local ref/state below
// resets cleanly when the kanji advances.
const TracePlay = ({ card, index, total, onKanjiDone, onStroke }) => {
  const ds = React.useMemo(() => parseStrokes(card.svg), [card.svg]);
  const count = ds.length;

  const [strokeIdx, setStrokeIdx] = React.useState(0); // next expected stroke
  const [inkPts, setInkPts]       = React.useState([]); // live drag, viewBox coords
  const [reason, setReason]       = React.useState(null); // last fail flavour
  const [shake, setShake]         = React.useState(0);    // bump to retrigger shake
  const [hint, setHint]           = React.useState(null); // {i, len} for the draw-on
  const [starts, setStarts]       = React.useState([]);   // per-stroke start points
  const [complete, setComplete]   = React.useState(false);

  const svgRef     = React.useRef(null);
  const ghostRefs  = React.useRef([]);
  const inkRef     = React.useRef([]);
  const drawingRef = React.useRef(false);
  const retriesRef = React.useRef([]);          // retries[i] = wrong attempts on stroke i
  const hintedRef  = React.useRef(new Set());   // strokes the operator revealed
  const cleanStrokesRef = React.useRef(0);
  const doneRef    = React.useRef(false);       // guards the single onKanjiDone call
  const startedAt  = React.useRef(Date.now());

  const stageRef     = React.useRef(null);
  // Live mirrors so the imperatively-attached input handlers read current
  // state/logic without re-binding on every stroke (no stale closures).
  const completeRef  = React.useRef(false);
  const strokeIdxRef = React.useRef(0);
  const finalizeRef  = React.useRef(() => {});

  // Measure each stroke's start point once the ghost paths are in the DOM, so
  // we can drop a "begin here" dot on the next stroke (start point matters).
  React.useEffect(() => {
    const s = ds.map((_, i) => {
      const el = ghostRefs.current[i];
      if (!el || !el.getPointAtLength) return null;
      try { const p = el.getPointAtLength(0); return { x: p.x, y: p.y }; }
      catch (e) { return null; }
    });
    setStarts(s);
  }, [ds]);

  // Degenerate guard: a card with no parseable strokes shouldn't stall the run.
  React.useEffect(() => {
    if (count === 0 && !doneRef.current) {
      doneRef.current = true;
      onKanjiDone({ idx: card.idx, clean: false, cleanStrokes: 0, strokeCount: 0, retries: 0, assisted: false, ms: 0, skipped: true });
    }
  }, [count, card.idx, onKanjiDone]);

  const finishKanji = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    const retries = retriesRef.current.reduce((a, b) => a + (b || 0), 0);
    const cleanStrokes = cleanStrokesRef.current;
    const assisted = hintedRef.current.size > 0;
    const clean = cleanStrokes === count && !assisted;
    setComplete(true);
    onStroke && onStroke({ type: 'complete', clean });
    setTimeout(() => {
      onKanjiDone({
        idx: card.idx, clean, cleanStrokes, strokeCount: count,
        retries, assisted, ms: Date.now() - startedAt.current,
      });
    }, 520);
  };

  const finalize = (pts) => {
    if (complete || doneRef.current) return;
    if (strokeIdx >= count) return;
    if (pts.length < TR_MIN_PTS) { setInkPts([]); inkRef.current = []; return; }

    const refPts = trSamplePathEl(ghostRefs.current[strokeIdx], TR_SAMPLES);
    const res = trScoreStroke(pts, refPts, { tol: TR_TOL });

    setInkPts([]); inkRef.current = [];

    if (res.ok) {
      const wasClean = (retriesRef.current[strokeIdx] || 0) === 0 && !hintedRef.current.has(strokeIdx);
      if (wasClean) cleanStrokesRef.current += 1;
      setReason(null);
      onStroke && onStroke({ type: 'hit', stroke: strokeIdx, clean: wasClean });
      const nextI = strokeIdx + 1;
      setStrokeIdx(nextI);
      if (nextI >= count) finishKanji();
    } else {
      retriesRef.current[strokeIdx] = (retriesRef.current[strokeIdx] || 0) + 1;
      setReason(res.reason);
      setShake(s => s + 1);
      onStroke && onStroke({ type: 'miss', stroke: strokeIdx, reason: res.reason });
    }
  };

  // Keep the imperative input handlers pointed at current state + logic.
  React.useEffect(() => {
    completeRef.current = complete;
    strokeIdxRef.current = strokeIdx;
    finalizeRef.current = finalize;
  });

  // Drawing input — attached as NATIVE listeners (not React synthetic) so we can
  // preventDefault on move (React forces touch listeners passive), and we track
  // move/up on `window` WITHOUT setPointerCapture. iOS Safari's pointer capture
  // is broken: capture "succeeds" but pointermove/up then stop firing once the
  // finger moves, and a touch frequently gets pointercancel — which silently
  // killed every stroke. Window-level tracking + no capture is the reliable
  // cross-platform pattern (with a touch-events fallback for legacy iOS). Re-
  // binds when the stage element remounts on the `shake` key.
  React.useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let active = false;

    const map = (cx, cy) => {
      const svg = svgRef.current;
      if (!svg) return null;
      const r = svg.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return { x: ((cx - r.left) / r.width) * TR_VB, y: ((cy - r.top) / r.height) * TR_VB };
    };
    const begin = (cx, cy) => {
      if (completeRef.current || strokeIdxRef.current >= count) return false;
      const pt = map(cx, cy);
      if (!pt) return false;
      active = true; drawingRef.current = true;
      inkRef.current = [pt]; setInkPts([pt]); setReason(null);
      return true;
    };
    const extend = (cx, cy) => {
      if (!active) return;
      const pt = map(cx, cy);
      if (!pt) return;
      inkRef.current.push(pt); setInkPts(inkRef.current.slice());
    };
    const finish = () => {
      if (!active) return;
      active = false; drawingRef.current = false;
      finalizeRef.current(inkRef.current);
    };

    const off = [];
    if (window.PointerEvent) {
      const down = (e) => { if (e.isPrimary === false) return; if (begin(e.clientX, e.clientY)) e.preventDefault(); };
      const move = (e) => { if (!active) return; e.preventDefault(); extend(e.clientX, e.clientY); };
      const up   = (e) => { if (!active) return; e.preventDefault(); finish(); };
      stage.addEventListener('pointerdown', down, { passive: false });
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', up, { passive: false });
      window.addEventListener('pointercancel', up, { passive: false });
      off.push(
        () => stage.removeEventListener('pointerdown', down),
        () => window.removeEventListener('pointermove', move),
        () => window.removeEventListener('pointerup', up),
        () => window.removeEventListener('pointercancel', up),
      );
    } else {
      // Legacy iOS / no Pointer Events — native touch + mouse.
      const ts = (e) => { const t = e.changedTouches[0]; if (t && begin(t.clientX, t.clientY)) e.preventDefault(); };
      const tm = (e) => { if (!active) return; const t = e.changedTouches[0]; if (t) { e.preventDefault(); extend(t.clientX, t.clientY); } };
      const te = (e) => { if (!active) return; e.preventDefault(); finish(); };
      stage.addEventListener('touchstart', ts, { passive: false });
      stage.addEventListener('touchmove', tm, { passive: false });
      stage.addEventListener('touchend', te, { passive: false });
      stage.addEventListener('touchcancel', te, { passive: false });
      const md = (e) => { if (begin(e.clientX, e.clientY)) e.preventDefault(); };
      const mm = (e) => { if (!active) return; extend(e.clientX, e.clientY); };
      const mu = () => finish();
      stage.addEventListener('mousedown', md);
      window.addEventListener('mousemove', mm);
      window.addEventListener('mouseup', mu);
      off.push(
        () => stage.removeEventListener('touchstart', ts),
        () => stage.removeEventListener('touchmove', tm),
        () => stage.removeEventListener('touchend', te),
        () => stage.removeEventListener('touchcancel', te),
        () => stage.removeEventListener('mousedown', md),
        () => window.removeEventListener('mousemove', mm),
        () => window.removeEventListener('mouseup', mu),
      );
    }
    return () => off.forEach(fn => fn());
  }, [count, shake]);

  // HINT — draw the next stroke on, once. Marks the stroke as assisted so it
  // can't count toward a clean trace. (Opt-in, never auto-played.)
  const onHint = () => {
    if (complete || strokeIdx >= count) return;
    const el = ghostRefs.current[strokeIdx];
    let len = 60;
    if (el && el.getTotalLength) { try { len = el.getTotalLength(); } catch (e) {} }
    hintedRef.current.add(strokeIdx);
    setHint({ i: strokeIdx, len });
    setTimeout(() => setHint(h => (h && h.i === strokeIdx ? null : h)), 760);
  };

  // SKIP — bail on the current kanji. Counts as not-clean.
  const onSkip = () => {
    if (complete || doneRef.current) return;
    doneRef.current = true;
    onKanjiDone({
      idx: card.idx, clean: false, cleanStrokes: cleanStrokesRef.current,
      strokeCount: count, retries: retriesRef.current.reduce((a, b) => a + (b || 0), 0),
      assisted: true, ms: Date.now() - startedAt.current, skipped: true,
    });
  };

  const meaning = (card.mean || '').split(',').slice(0, 2).join(', ').trim();
  const reading = card.mainKun || card.mainOn || '';
  const startPt = !complete && strokeIdx < count ? starts[strokeIdx] : null;
  const inkStr = inkPts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <div className="tr-play" data-screen-label="tr-play">
      {/* Prompt — the ghost shows the form (TRACE = template visible); meaning
          + reading give it a recall hook without being the answer. */}
      <div className="tr-prompt">
        <div className="tr-prompt-eyebrow">▸ TRACE TARGET · {String(index + 1).padStart(2, '0')}/{String(total).padStart(2, '0')}</div>
        <div className="tr-prompt-mean">{meaning || '—'}</div>
        {reading && <div className="tr-prompt-read">{reading}</div>}
      </div>

      {/* Stage — grid + ghost + live ink. Pointer events captured on the stage. */}
      <div
        ref={stageRef}
        className={`tr-stage${complete ? ' is-complete' : ''}${reason ? ` is-bad is-${reason}` : ''}`}
        key={shake}
      >
        <svg ref={svgRef} className="tr-svg" viewBox={`0 0 ${TR_VB} ${TR_VB}`} aria-hidden>
          {/* 田字格 frame + center cross, plus faint 米字格 diagonals */}
          <g className="tr-grid">
            <rect className="tr-grid-frame" x="2" y="2" width="105" height="105" />
            <line className="tr-grid-diag" x1="2" y1="2" x2="107" y2="107" />
            <line className="tr-grid-diag" x1="107" y1="2" x2="2" y2="107" />
            <line className="tr-grid-axis" x1="54.5" y1="2" x2="54.5" y2="107" />
            <line className="tr-grid-axis" x1="2" y1="54.5" x2="107" y2="54.5" />
          </g>

          {/* Strokes: done (cyan, locked) · next (magenta) · future (dim ghost) */}
          {ds.map((d, i) => {
            const state = complete ? 'done' : i < strokeIdx ? 'done' : i === strokeIdx ? 'next' : 'future';
            const isHint = hint && hint.i === i;
            const style = isHint
              ? { '--tr-len': hint.len, strokeDasharray: hint.len, animation: 'tr-draw .7s var(--ease-out)' }
              : undefined;
            return (
              <path
                key={i}
                ref={el => { ghostRefs.current[i] = el; }}
                d={d}
                className={`tr-stroke is-${state}${isHint ? ' is-hint' : ''}`}
                style={style}
              />
            );
          })}

          {/* Begin-here dot on the next stroke's start point */}
          {startPt && <circle className="tr-startdot" cx={startPt.x} cy={startPt.y} r="3.4" />}

          {/* Live ink */}
          {inkPts.length > 1 && <polyline className="tr-ink" points={inkStr} />}
        </svg>

        {complete && <div className="tr-stage-flash" aria-hidden />}
      </div>

      {/* Controls — HINT (reveal once) · status · SKIP */}
      <div className="tr-controls">
        <button className="tr-ctl tr-ctl-hint" onClick={onHint} disabled={complete || strokeIdx >= count} title="reveal the next stroke once · won't count as clean">
          ◐ HINT
        </button>
        <div className="tr-controls-status" aria-live="polite">
          {complete
            ? <span className="tr-status-ok">▲ GLYPH LOCKED</span>
            : reason === 'rev'
              ? <span className="tr-status-bad">✖ WRONG WAY · reverse it</span>
              : reason === 'short'
                ? <span className="tr-status-bad">✖ TOO SHORT · full stroke</span>
                : reason === 'off'
                  ? <span className="tr-status-bad">✖ OFF TRACE · follow the rail</span>
                  : <span className="tr-status-dim">STROKE {Math.min(strokeIdx + 1, count)}/{count} · trace in order</span>}
        </div>
        <button className="tr-ctl tr-ctl-skip" onClick={onSkip} disabled={complete} title="skip this kanji">
          SKIP ▸
        </button>
      </div>
    </div>
  );
};

Object.assign(window, {
  TracePlay,
  parseStrokes, trResample, trSamplePathEl, trScoreStroke, trPolyLen, trDist,
});
