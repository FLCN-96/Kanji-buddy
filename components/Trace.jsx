// TRACE — stroke-order muscle memory. Trace the KanjiVG ghost stroke-by-stroke,
// in canonical order, on a 田字格 grid. Evidence-only: writes card_events
// (outcome 'hit' when a kanji is traced clean, else 'miss'), NEVER card_states —
// SM-2 scheduling stays a Run-only concern. Not hot-eligible (kept out of
// Daily.CHALLENGE_ORDER), so XP is granted flat with no daily multiplier.
//
// Lifecycle mirrors the canonical challenge pattern (Decipher/Match): mount
// effect records the mode-start, card_states load into a ref, a pre|ready|play|
// end phase machine, and an end-phase effect (guarded by finishedRef) saves the
// session + grants XP exactly once.

const TWEAK_DEFAULTS_TR = {
  scanlines: 'off',
  countdown: 'dissolve',
};

const PB_KEY_TR = 'kb-tr-pb';      // best clean-kanji count in a set
const TR_DECK_SIZE = 8;

// XP — flat (no hot multiplier). Tuned to land a clean 8-kanji set near ~90,
// inside the Run-to-Match band so the rank thresholds aren't compressed. Keep
// in sync with the duplicated TR_*_R constants in TraceScreens.jsx.
const TR_XP_PER_KANJI = 5;
const TR_XP_CLEAN     = 4;
const TR_XP_FLAWLESS  = 15;
const TR_XP_PB        = 25;

// Fire-and-forget audio. AudioManager may not be loaded (Trace works without
// it); every call is guarded so this is a no-op until data/audio.js ships.
function trAudio(method, arg) {
  const am = window.AudioManager;
  if (am && typeof am[method] === 'function') {
    try { am[method](arg); } catch (e) {}
  }
}

// Build a focused set: prefer kanji the operator has actually met (reinforce the
// writing of readings they're learning), top up with fresh frequency-ordered
// glyphs, then ramp the chosen set by stroke count so it eases in.
function selectTraceDeck(cards, statesMap, size, prioritySet) {
  const traceable = (cards || []).filter(c => c && c.svg);
  const seen = [], fresh = [];
  for (const c of traceable) {
    const st = statesMap.get(c.idx);
    if (st && (st.reviews || 0) > 0) seen.push(c); else fresh.push(c);
  }
  const shuffle = (arr) => {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  // Deleveled cards (queued by Home's SRS recalibration) jump the seen pool so
  // the motor pattern gets re-traced before it's demanded blind again.
  const seenOrdered = (prioritySet && prioritySet.size)
    ? [...shuffle(seen.filter(c => prioritySet.has(c.idx))),
       ...shuffle(seen.filter(c => !prioritySet.has(c.idx)))]
    : shuffle(seen);
  let chosen = seenOrdered.length >= size
    ? seenOrdered.slice(0, size)
    : [...seenOrdered, ...fresh.slice(0, size - seenOrdered.length)];
  // Parse the stroke count only for the chosen handful (cheap) and ramp.
  return chosen
    .map(c => ({ card: c, n: (parseStrokes(c.svg).length || c.strokes || 99) }))
    .sort((a, b) => a.n - b.n)
    .map(x => x.card);
}

// ────────────────────────────────────────────────────────────────────
// Topbar — abort · TRACE label · set progress · clean count
// ────────────────────────────────────────────────────────────────────
const TRTopbar = ({ phase, index, total, clean, best, onQuit }) => {
  const playing = phase === 'play';
  return (
    <header className={`run-top tr-top${playing ? ' is-play' : ''}`}>
      <div className="run-top-l">
        <button className="run-quit tr-quit" onClick={onQuit} aria-label="abort trace">
          {playing ? '[ABORT]' : '‹ abort'}
        </button>
        {!playing && <span className="run-lbl tr-lbl">// TRACE</span>}
      </div>
      <div className="tr-top-mid" aria-hidden>
        {playing && (
          <div className="tr-top-prog">
            {Array.from({ length: total }).map((_, i) => (
              <span key={i} className={`tr-pip${i < index ? ' is-done' : ''}${i === index ? ' is-cur' : ''}`} />
            ))}
          </div>
        )}
      </div>
      <div className="run-top-r">
        {playing
          ? <span className="tr-top-clean">CLEAN · <b>{String(clean).padStart(2, '0')}</b></span>
          : <span className="tr-top-best">BEST · <b>{String(best).padStart(2, '0')}</b></span>}
      </div>
    </header>
  );
};

// ────────────────────────────────────────────────────────────────────
// Orchestrator
// ────────────────────────────────────────────────────────────────────
const TraceApp = ({ cards }) => {
  const [tweaks] = React.useState(() => {
    try {
      const shared = JSON.parse(localStorage.getItem('kb-tweaks') || '{}');
      return { ...TWEAK_DEFAULTS_TR, ...shared };
    } catch (e) { return { ...TWEAK_DEFAULTS_TR }; }
  });

  const [phase, setPhase] = React.useState('pre'); // pre | ready | play | end
  const [countdown, setCountdown] = React.useState(3);

  const [deck, setDeck] = React.useState([]);
  const [idx, setIdx] = React.useState(0);
  const [results, setResults] = React.useState([]);

  const [pb, setPb] = React.useState(() => {
    try { return parseInt(localStorage.getItem(PB_KEY_TR) || '0', 10) || 0; }
    catch (e) { return 0; }
  });
  const [beatPb, setBeatPb] = React.useState(false);
  const [xpGained, setXpGained] = React.useState(0);
  const [confirmQuit, setConfirmQuit] = React.useState(false);

  const statesMapRef = React.useRef(new Map());
  const finishedRef = React.useRef(false);
  const startedAt = React.useRef(0);

  // Mount: register the funnel start, load card_states, prime audio (no bed —
  // TRACE is a study mode, SFX only).
  React.useEffect(() => {
    if (window.DB) {
      window.DB.recordModeStart('trace').catch(() => {});
      window.DB.open()
        .then(() => window.DB.getAllCardStates())
        .then(s => {
          const m = new Map();
          for (const st of (s || [])) if (st && st.idx != null) m.set(st.idx, st);
          statesMapRef.current = m;
        })
        .catch(() => {});
    }
    trAudio('init');
    trAudio('setBedForMode', 'trace');
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
        // Re-expose deleveled cards (queued by Home's SRS recalibration) first,
        // then consume the ones we actually dealt from the queue.
        let priority = new Set();
        try { priority = new Set(JSON.parse(localStorage.getItem('kb-delevel-trace-queue') || '[]')); } catch (e) {}
        const d = selectTraceDeck(cards, statesMapRef.current, TR_DECK_SIZE, priority);
        setDeck(d);
        if (priority.size) {
          try {
            const dealt = new Set(d.map(c => c.idx));
            localStorage.setItem('kb-delevel-trace-queue',
              JSON.stringify([...priority].filter(idx => !dealt.has(idx))));
          } catch (e) {}
        }
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
  }, [phase, cards]);

  // A kanji finished (traced through, or skipped). Log per-kanji evidence and
  // advance — logging here (not at end) so an early abort still keeps the
  // evidence already earned.
  const onKanjiDone = React.useCallback((r) => {
    const card = deck[idx];
    if (!card) return;
    const accuracy = r.strokeCount > 0 ? r.cleanStrokes / r.strokeCount : 0;
    if (window.DB) {
      window.DB.recordCardEvent({
        idx: card.idx, mode: 'trace', outcome: r.clean ? 'hit' : 'miss',
        meta: {
          accuracy: Math.round(accuracy * 100) / 100,
          strokes: r.strokeCount, retries: r.retries,
          assisted: !!r.assisted, skipped: !!r.skipped, ms: r.ms,
        },
      }).catch(() => {});
    }
    setResults(prev => [...prev, {
      idx: card.idx, k: card.k, mean: card.mean,
      clean: !!r.clean, retries: r.retries || 0, skipped: !!r.skipped,
      strokeCount: r.strokeCount || 0, cleanStrokes: r.cleanStrokes || 0,
    }]);
    if (idx + 1 < deck.length) setIdx(idx + 1);
    else setPhase('end');
  }, [deck, idx]);

  // Per-stroke audio cues (guarded no-ops without AudioManager).
  const onStroke = React.useCallback((ev) => {
    if (!ev) return;
    if (ev.type === 'hit') trAudio('tick');
    else if (ev.type === 'miss') trAudio('wrong');
    else if (ev.type === 'complete') trAudio('correct');
  }, []);

  // End-of-set save. Captures final stats off `results` (closure-safe via deps).
  React.useEffect(() => {
    if (phase !== 'end' || !window.DB) return;
    if (finishedRef.current) return;
    if (!results.length) return; // aborted before any kanji landed
    finishedRef.current = true;

    const kanjiDone   = results.length;
    const cleanKanji  = results.filter(r => r.clean).length;
    const totalStrokes = results.reduce((a, r) => a + (r.strokeCount || 0), 0);
    const cleanStrokes = results.reduce((a, r) => a + (r.cleanStrokes || 0), 0);
    const allClean = cleanKanji === kanjiDone && kanjiDone >= TR_DECK_SIZE;

    // End tone: stop the bed and play a result chime keyed to the same accuracy
    // ribbon the debrief shows (CALLIGRAPHER/STEADY HAND → good, WARMING UP →
    // mid, SHAKY LINE → bad). Mirror TraceEnd's `acc` so tone matches ribbon.
    const acc = totalStrokes > 0 ? Math.round((100 * cleanStrokes) / totalStrokes) : 0;
    const endTier = acc >= 80 ? 'good' : acc >= 60 ? 'mid' : 'bad';
    trAudio('end', endTier);

    const newBeatPb = cleanKanji > pb;
    if (newBeatPb) {
      setBeatPb(true);
      try { localStorage.setItem(PB_KEY_TR, String(cleanKanji)); } catch (e) {}
      setPb(cleanKanji);
    }

    const earned = Math.max(0,
      kanjiDone * TR_XP_PER_KANJI
      + cleanKanji * TR_XP_CLEAN
      + (allClean ? TR_XP_FLAWLESS : 0)
      + (newBeatPb ? TR_XP_PB : 0)
    );
    setXpGained(earned);
    if (newBeatPb) trAudio('milestone');

    window.DB.saveScore({ mode: 'trace', score: cleanKanji }).catch(() => {});
    window.DB.saveSession({
      mode: 'trace',
      duration_s: Math.round((Date.now() - startedAt.current) / 1000),
      cards_reviewed: kanjiDone,
      hits: cleanKanji,
      misses: kanjiDone - cleanKanji,
      hard: 0,
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
  const kanjiDone = results.length;
  const cleanKanji = results.filter(r => r.clean).length;
  const totalStrokes = results.reduce((a, r) => a + (r.strokeCount || 0), 0);
  const cleanStrokes = results.reduce((a, r) => a + (r.cleanStrokes || 0), 0);

  return (
    <>
      <div className="run-shell tr-shell variant-game" data-phase={phase}>
        <TRTopbar
          phase={phase}
          index={idx}
          total={deck.length || TR_DECK_SIZE}
          clean={cleanSoFar}
          best={pb}
          onQuit={quit}
        />

        <main className="run-main tr-main" data-screen-label={`tr-${phase}`}>
          {phase === 'pre' && <TracePre pb={pb} onStart={start} />}
          {phase === 'ready' && <TAReady n={countdown} variant={tweaks.countdown} />}
          {phase === 'play' && deck[idx] && (
            <TracePlay
              key={deck[idx].idx}
              card={deck[idx]}
              index={idx}
              total={deck.length}
              onKanjiDone={onKanjiDone}
              onStroke={onStroke}
            />
          )}
          {phase === 'end' && (
            <TraceEnd
              deckSize={TR_DECK_SIZE}
              kanjiDone={kanjiDone}
              cleanKanji={cleanKanji}
              totalStrokes={totalStrokes}
              cleanStrokes={cleanStrokes}
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
        title="ABORT TRACE?"
        body="The set won't save · strokes logged so far stay."
        confirmLabel="BURN SET"
        cancelLabel="KEEP TRACING"
        onConfirm={goHome}
        onCancel={() => setConfirmQuit(false)}
      />
    </>
  );
};

Object.assign(window, { TraceApp, selectTraceDeck });
