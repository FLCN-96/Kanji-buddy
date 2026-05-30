// GLYPH — spatial component-decomposition drill ("QUADRANT LOCK"). Rebuild a
// kanji by dropping its component glyphs into the correct region on a 米字格
// grid. Evidence-only: writes card_events (outcome 'hit' when a kanji is
// assembled with zero misplacements, else 'miss'), NEVER card_states — SM-2
// scheduling stays a Run-only concern. NOT a bed mode (study mode, SFX only)
// and NOT hot-eligible (kept out of Daily.CHALLENGE_ORDER), so XP is flat.
//
// Lifecycle mirrors TRACE exactly: a mount effect records the mode-start and
// loads card_states into a ref, a pre|ready|play|end phase machine with the
// shared TAReady 3-2-1 countdown, and a finishedRef-guarded end-phase effect
// that saves the session + grants XP exactly once.

const TWEAK_DEFAULTS_GL = {
  scanlines: 'off',
  countdown: 'dissolve',
};

const PB_KEY_GL = 'kb-gl-pb';      // best clean-kanji count in a set
const GL_DECK_SIZE = 8;

// Geometry positions that map to a clean half-grid region. Anything else
// (kamae/tare/nyo/middle/⿵…) doesn't decompose into a simple left|right or
// top|bottom split, so we skip those kanji entirely.
const GL_DIRS = { left: true, right: true, top: true, bottom: true };

// XP — flat (no hot multiplier). Tuned to land a clean 8-kanji set near ~90,
// in the same Run-to-challenge band TRACE targets so rank thresholds aren't
// compressed. Keep in sync with the duplicated GL_*_R constants in
// GlyphScreens.jsx so the end-screen breakdown sums to what was granted.
const GL_XP_PER_KANJI = 6;
const GL_XP_CLEAN     = 4;
const GL_XP_FLAWLESS  = 15;
const GL_XP_PB        = 25;

// Fire-and-forget audio. Guarded so GLYPH works without AudioManager.
function glAudio(method, arg) {
  const am = window.AudioManager;
  if (am && typeof am[method] === 'function') {
    try { am[method](arg); } catch (e) {}
  }
}

// Pull the clean directional components for an idx out of the geometry blob.
// Returns null unless the kanji decomposes into a usable 2-component (left/
// right or top/bottom) split with distinct positions and non-empty glyphs.
function glCleanComps(geo, idx) {
  const e = geo && geo[String(idx)];
  if (!e || !Array.isArray(e.components)) return null;
  const dir = e.components.filter(c =>
    c && GL_DIRS[c.pos] && (c.el || '').trim() && c.el.length <= 2
  );
  if (dir.length !== 2) return null;
  const poses = dir.map(c => c.pos);
  const set = new Set(poses);
  if (set.size !== 2) return null;                       // must be distinct
  const isLR = set.has('left') && set.has('right');
  const isTB = set.has('top') && set.has('bottom');
  if (!isLR && !isTB) return null;                       // no mixed axes
  return dir.map(c => ({ el: c.el, pos: c.pos }));
}

// Build a focused set of qualifying kanji. Prefer ones the operator has met
// (statesMap reviews>0 — reinforce parts they're actually learning), top up
// with fresh frequency-ordered glyphs, then ramp the chosen handful easy→hard
// by component count, then stroke count.
function selectGlyphDeck(cards, geo, statesMap, size) {
  const eligible = [];
  for (const c of (cards || [])) {
    if (!c) continue;
    const comps = glCleanComps(geo, c.idx);
    if (!comps) continue;
    const st = statesMap.get(c.idx);
    const seen = !!(st && (st.reviews || 0) > 0);
    const n = (geo[String(c.idx)] && geo[String(c.idx)].n) || c.strokes || 99;
    eligible.push({ card: c, comps, seen, n });
  }
  const shuffle = (arr) => {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const seenPool  = shuffle(eligible.filter(e => e.seen));
  // Fresh stays in frequency order (cards.json is roughly frequency/JLPT) so we
  // pull the most common unseen kanji first.
  const freshPool = eligible.filter(e => !e.seen);
  let chosen = seenPool.length >= size
    ? seenPool.slice(0, size)
    : [...seenPool, ...freshPool.slice(0, size - seenPool.length)];
  // Ramp: fewer components first, then fewer strokes.
  return chosen
    .sort((a, b) => (a.comps.length - b.comps.length) || (a.n - b.n))
    .map(e => ({ card: e.card, comps: e.comps }));
}

// ────────────────────────────────────────────────────────────────────
// Topbar — abort · GLYPH label · set progress · clean count
// ────────────────────────────────────────────────────────────────────
const GLTopbar = ({ phase, index, total, clean, best, onQuit }) => {
  const playing = phase === 'play';
  return (
    <header className={`run-top gl-top${playing ? ' is-play' : ''}`}>
      <div className="run-top-l">
        <button className="run-quit gl-quit" onClick={onQuit} aria-label="abort glyph">
          {playing ? '[ABORT]' : '‹ abort'}
        </button>
        {!playing && <span className="run-lbl gl-lbl">// GLYPH</span>}
      </div>
      <div className="gl-top-mid" aria-hidden>
        {playing && (
          <div className="gl-top-prog">
            {Array.from({ length: total }).map((_, i) => (
              <span key={i} className={`gl-pip${i < index ? ' is-done' : ''}${i === index ? ' is-cur' : ''}`} />
            ))}
          </div>
        )}
      </div>
      <div className="run-top-r">
        {playing
          ? <span className="gl-top-clean">CLEAN · <b>{String(clean).padStart(2, '0')}</b></span>
          : <span className="gl-top-best">BEST · <b>{String(best).padStart(2, '0')}</b></span>}
      </div>
    </header>
  );
};

// ────────────────────────────────────────────────────────────────────
// Orchestrator
// ────────────────────────────────────────────────────────────────────
const GlyphApp = ({ cards, geo }) => {
  const [tweaks] = React.useState(() => {
    try {
      const shared = JSON.parse(localStorage.getItem('kb-tweaks') || '{}');
      return { ...TWEAK_DEFAULTS_GL, ...shared };
    } catch (e) { return { ...TWEAK_DEFAULTS_GL }; }
  });

  const [phase, setPhase] = React.useState('pre'); // pre | ready | play | end
  const [countdown, setCountdown] = React.useState(3);

  const [deck, setDeck] = React.useState([]);
  const [idx, setIdx] = React.useState(0);
  const [results, setResults] = React.useState([]);

  const [pb, setPb] = React.useState(() => {
    try { return parseInt(localStorage.getItem(PB_KEY_GL) || '0', 10) || 0; }
    catch (e) { return 0; }
  });
  const [beatPb, setBeatPb] = React.useState(false);
  const [xpGained, setXpGained] = React.useState(0);
  const [confirmQuit, setConfirmQuit] = React.useState(false);

  const statesMapRef = React.useRef(new Map());
  const finishedRef = React.useRef(false);
  const startedAt = React.useRef(0);

  // Mount: register the funnel start, load card_states. NOT a bed mode — GLYPH
  // is a study mode (SFX only), so we never call setBedForMode.
  React.useEffect(() => {
    if (window.DB) {
      window.DB.recordModeStart('glyph').catch(() => {});
      window.DB.open()
        .then(() => window.DB.getAllCardStates())
        .then(s => {
          const m = new Map();
          for (const st of (s || [])) if (st && st.idx != null) m.set(st.idx, st);
          statesMapRef.current = m;
        })
        .catch(() => {});
    }
    glAudio('init');
  }, []);

  React.useEffect(() => {
    document.body.dataset.scanlines = tweaks.scanlines;
  }, [tweaks]);

  // 3-2-1 countdown → deal the set
  React.useEffect(() => {
    if (phase !== 'ready') return;
    setCountdown(3);
    let n = 3;
    const tick = () => {
      n -= 1;
      if (n <= 0) {
        setCountdown(0);
        const d = selectGlyphDeck(cards, geo, statesMapRef.current, GL_DECK_SIZE);
        setDeck(d);
        setIdx(0);
        setResults([]);
        setBeatPb(false);
        setXpGained(0);
        finishedRef.current = false;
        startedAt.current = Date.now();
        if (!d.length) { setPhase('end'); return; }
        setPhase('play');
      } else {
        setCountdown(n);
        setTimeout(tick, 700);
      }
    };
    const t = setTimeout(tick, 700);
    return () => clearTimeout(t);
  }, [phase, cards, geo]);

  // A kanji finished (assembled or skipped). Log per-kanji evidence and advance
  // — logging here (not at end) so an early abort still keeps earned evidence.
  const onKanjiDone = React.useCallback((r) => {
    const entry = deck[idx];
    if (!entry) return;
    const card = entry.card;
    if (window.DB) {
      window.DB.recordCardEvent({
        idx: card.idx, mode: 'glyph', outcome: r.clean ? 'hit' : 'miss',
        meta: {
          components: r.components || [],
          placeErrors: r.placeErrors || 0,
          skipped: !!r.skipped,
          ms: r.ms,
        },
      }).catch(() => {});
    }
    setResults(prev => [...prev, {
      idx: card.idx, k: card.k, mean: card.mean,
      clean: !!r.clean, placeErrors: r.placeErrors || 0, skipped: !!r.skipped,
      components: r.components || [],
    }]);
    if (idx + 1 < deck.length) setIdx(idx + 1);
    else setPhase('end');
  }, [deck, idx]);

  // Per-interaction audio cues (guarded no-ops without AudioManager).
  const onEvent = React.useCallback((ev) => {
    if (!ev) return;
    if (ev.type === 'select') glAudio('tick');
    else if (ev.type === 'lock') glAudio('correct');
    else if (ev.type === 'wrong') glAudio('wrong');
    else if (ev.type === 'complete') glAudio('correct');
  }, []);

  // End-of-set save. Captures final stats off `results` (closure-safe via deps).
  React.useEffect(() => {
    if (phase !== 'end' || !window.DB) return;
    if (finishedRef.current) return;
    if (!results.length) return; // aborted before any kanji landed
    finishedRef.current = true;

    const kanjiDone  = results.length;
    const cleanKanji = results.filter(r => r.clean).length;
    const totalErrors = results.reduce((a, r) => a + (r.placeErrors || 0), 0);
    const allClean = cleanKanji === kanjiDone && kanjiDone >= GL_DECK_SIZE;

    // End tone keyed to the same clean-rate the debrief ribbon shows.
    const rate = kanjiDone > 0 ? cleanKanji / kanjiDone : 0;
    const endTier = rate >= 0.8 ? 'good' : rate >= 0.5 ? 'mid' : 'bad';
    glAudio('end', endTier);

    const newBeatPb = cleanKanji > pb;
    if (newBeatPb) {
      setBeatPb(true);
      try { localStorage.setItem(PB_KEY_GL, String(cleanKanji)); } catch (e) {}
      setPb(cleanKanji);
    }

    const earned = Math.max(0,
      kanjiDone * GL_XP_PER_KANJI
      + cleanKanji * GL_XP_CLEAN
      + (allClean ? GL_XP_FLAWLESS : 0)
      + (newBeatPb ? GL_XP_PB : 0)
    );
    setXpGained(earned);
    if (newBeatPb) glAudio('milestone');

    window.DB.saveScore({ mode: 'glyph', score: cleanKanji }).catch(() => {});
    window.DB.saveSession({
      mode: 'glyph',
      duration_s: Math.round((Date.now() - startedAt.current) / 1000),
      cards_reviewed: kanjiDone,
      hits: cleanKanji,
      misses: kanjiDone - cleanKanji,
      hard: totalErrors,
      xp_earned: earned,
    })
      .then(() => window.DB.grantXp(earned))
      .then(() => window.DB.recordSessionStreak())
      .catch(() => {});
  }, [phase, results, pb]);

  const start = () => setPhase('ready');
  const restart = () => {
    setDeck([]); setIdx(0); setResults([]);
    setBeatPb(false); setXpGained(0);
    finishedRef.current = false;
    setPhase('ready');
  };
  const goHome = () => { window.location.href = 'Home.html'; };
  const quit = () => {
    if (phase === 'play') { setConfirmQuit(true); return; }
    goHome();
  };

  React.useEffect(() => {
    const onKey = (e) => {
      if (phase === 'pre') {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); start(); }
      } else if (phase === 'play') {
        if (e.key === 'Escape') quit();
      } else if (phase === 'end') {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); restart(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const cleanSoFar = results.filter(r => r.clean).length;
  const kanjiDone  = results.length;
  const cleanKanji = results.filter(r => r.clean).length;
  const totalErrors = results.reduce((a, r) => a + (r.placeErrors || 0), 0);

  return (
    <>
      <div className="run-shell gl-shell variant-game" data-phase={phase}>
        <GLTopbar
          phase={phase}
          index={idx}
          total={deck.length || GL_DECK_SIZE}
          clean={cleanSoFar}
          best={pb}
          onQuit={quit}
        />

        <main className="run-main gl-main" data-screen-label={`gl-${phase}`}>
          {phase === 'pre' && <GlyphPre pb={pb} onStart={start} />}
          {phase === 'ready' && <TAReady n={countdown} variant={tweaks.countdown} />}
          {phase === 'play' && deck[idx] && (
            <GlyphPlay
              key={deck[idx].card.idx}
              card={deck[idx].card}
              comps={deck[idx].comps}
              index={idx}
              total={deck.length}
              onKanjiDone={onKanjiDone}
              onEvent={onEvent}
            />
          )}
          {phase === 'end' && (
            <GlyphEnd
              deckSize={GL_DECK_SIZE}
              kanjiDone={kanjiDone}
              cleanKanji={cleanKanji}
              totalErrors={totalErrors}
              results={results}
              beatPb={beatPb}
              pb={pb}
              xpGained={xpGained}
              onAgain={restart}
              onHome={goHome}
            />
          )}
        </main>
      </div>

      <ConfirmModal
        open={confirmQuit}
        title="ABORT GLYPH?"
        body="The set won't save · parts placed so far stay logged."
        confirmLabel="BURN SET"
        cancelLabel="KEEP BUILDING"
        onConfirm={goHome}
        onCancel={() => setConfirmQuit(false)}
      />
    </>
  );
};

Object.assign(window, { GlyphApp, selectGlyphDeck, glCleanComps });
