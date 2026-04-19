// Run orchestrator

const TWEAK_DEFAULTS = {
  variant: 'hud',
  accent: 'cyan',
  scanlines: 'off',
  density: 'comfortable',
};

const RUN_SIZE = 12;

const RunTopbar = ({ phase, timer, onQuit, idx, total }) => (
  <header className="run-top">
    <div className="run-top-l">
      <button className="run-quit" onClick={onQuit}>‹ quit</button>
      <span className="run-lbl">▸ RUN</span>
    </div>
    <div className="run-timer">
      {phase === 'run' ? `${String(idx+1).padStart(2,'0')} / ${String(total).padStart(2,'0')} · ${timer}` : phase === 'pre' ? 'PRE-FLIGHT' : 'COMPLETE'}
    </div>
    <div className="run-top-r">
      <span style={{display:'inline-flex',alignItems:'center',gap:4,color:'var(--accent-cyan)'}}>
        <span style={{width:6,height:6,background:'var(--accent-cyan)',boxShadow:'0 0 6px var(--accent-cyan)'}} /> LIVE
      </span>
    </div>
  </header>
);

const RunStatusbar = ({ results, combo }) => {
  const c = { miss:0, hard:0, ok:0, easy:0 };
  results.forEach(r => { if (c[r] != null) c[r]++; });
  const hits = c.ok + c.easy + c.hard;
  return (
    <footer className="run-statusbar">
      <div className="run-statusbar-l">
        <span className="run-pill hit">HIT · <b>{hits}</b></span>
        <span className="run-pill miss">MISS · <b>{c.miss}</b></span>
        <span className="run-pill skip">HARD · <b>{c.hard}</b></span>
      </div>
      <span>{combo >= 2 ? `combo ×${combo}` : 'kanji-buddy · 0.3.1'}</span>
    </footer>
  );
};

const RunApp = ({ cards }) => {
  const [tweaks] = React.useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('kb-tweaks') || '{}');
      return { ...TWEAK_DEFAULTS, ...saved };
    } catch(e) { return { ...TWEAK_DEFAULTS }; }
  });
  const [phase, setPhase] = React.useState('pre'); // pre | run | end
  const [idx, setIdx] = React.useState(0);
  const [revealed, setRevealed] = React.useState(false);
  const [results, setResults] = React.useState([]);
  const [flash, setFlash] = React.useState(null);
  const [combo, setCombo] = React.useState(0);
  const [comboPulse, setComboPulse] = React.useState(false);
  const [startedAt, setStartedAt] = React.useState(null);
  const [cardStartedAt, setCardStartedAt] = React.useState(null);
  const [now, setNow] = React.useState(Date.now());
  const [duration, setDuration] = React.useState(0);

  // Run deck — simple first-N slice until a proper SRS queue is wired in.
  const runDeck = React.useMemo(() => (cards || []).slice(0, RUN_SIZE), [cards]);

  React.useEffect(() => {
    document.body.dataset.accent = tweaks.accent;
    document.body.dataset.scanlines = tweaks.scanlines;
    document.body.dataset.density = tweaks.density;
  }, [tweaks]);

  // live timer
  React.useEffect(() => {
    if (phase !== 'run') return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [phase]);

  // save session + XP to DB when run ends
  React.useEffect(() => {
    if (phase !== 'end' || !window.DB || !startedAt) return;
    const c = { miss:0, hard:0, ok:0, easy:0 };
    results.forEach(r => { if (c[r] != null) c[r]++; });
    const hits = c.ok + c.easy;
    const earned = (hits * 15) + (c.easy * 5) + (c.hard * 3);
    window.DB.saveSession({
      mode: 'run',
      duration_s: duration,
      cards_reviewed: results.length,
      hits,
      misses: c.miss,
      hard: c.hard,
      xp_earned: earned,
    })
      .then(() => window.DB.grantXp(earned))
      .then(() => window.DB.recordSessionStreak())
      .catch(() => {});
  }, [phase]);

  const startRun = () => {
    setPhase('run'); setIdx(0); setResults([]); setRevealed(false);
    setCombo(0); setFlash(null);
    const t = Date.now();
    setStartedAt(t); setCardStartedAt(t); setNow(t);
  };

  const reveal = () => setRevealed(true);

  const verdict = (v) => {
    if (!revealed) return;
    const nextResults = [...results, v];
    setResults(nextResults);

    // stub: persist card state with simple interval (full SM-2 in future pass)
    if (window.DB && runDeck[idx]) {
      const card = runDeck[idx];
      window.DB.getCardState(card.idx).then(existing => {
        const base = existing || { idx: card.idx, interval_days: 1, ease_factor: 2.5, reviews: 0, lapses: 0 };
        const intervalMap = { easy: 4, ok: 1, hard: 0.25, miss: 0 };
        const daysAhead = intervalMap[v] ?? 1;
        const due = new Date();
        due.setDate(due.getDate() + daysAhead);
        return window.DB.upsertCardState({
          ...base,
          reviews: base.reviews + 1,
          lapses: v === 'miss' ? base.lapses + 1 : base.lapses,
          due_date: due.toISOString(),
          last_reviewed: new Date().toISOString(),
        });
      }).catch(() => {});
    }

    if (v === 'ok' || v === 'easy') {
      setFlash('hit');
      const c = combo + 1;
      setCombo(c);
      setComboPulse(true);
      setTimeout(() => setComboPulse(false), 340);
    } else if (v === 'miss') {
      setFlash('miss'); setCombo(0);
    } else {
      setFlash(null); setCombo(0);
    }
    setTimeout(() => setFlash(null), 340);

    // advance
    setTimeout(() => {
      if (idx + 1 >= runDeck.length) {
        setDuration(Math.round((Date.now() - startedAt) / 1000));
        setPhase('end');
      } else {
        setIdx(idx + 1);
        setRevealed(false);
        setCardStartedAt(Date.now());
      }
    }, v === 'miss' ? 360 : 260);
  };

  // keyboard
  React.useEffect(() => {
    const onKey = (e) => {
      if (phase === 'pre') {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); startRun(); }
      } else if (phase === 'run') {
        if (e.key === ' ') { e.preventDefault(); if (!revealed) reveal(); }
        else if (e.key === '1') { if (revealed) verdict('miss'); }
        else if (e.key === '2') { if (revealed) verdict('hard'); }
        else if (e.key === '3') { if (revealed) verdict('ok'); }
        else if (e.key === '4') { if (revealed) verdict('easy'); }
        else if (e.key === 'Escape') { setPhase('pre'); setResults([]); }
      } else if (phase === 'end') {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); startRun(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, revealed, idx, runDeck, results, combo, startedAt]);

  const quit = () => {
    if (phase === 'run' && !confirm('Quit run? Progress will be lost.')) return;
    window.location.href = 'Home.html';
  };

  const timer = React.useMemo(() => {
    if (!startedAt) return '00:00';
    const s = Math.floor((now - startedAt)/1000);
    return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  }, [now, startedAt]);

  const cardLatency = cardStartedAt ? Math.floor((now - cardStartedAt)/1000) : 0;
  const shellCls = `run-shell variant-${tweaks.variant}`;

  return (
    <div className={shellCls}>
      <RunTopbar phase={phase} timer={timer} idx={idx} total={runDeck.length} onQuit={quit} />
      {phase === 'run' && (
        <SegProgress results={results} current={idx} total={runDeck.length} />
      )}
      <main className="run-main" data-screen-label={`run-${phase}`}>
        {phase === 'pre' && <PreRun total={runDeck.length} onStart={startRun} />}
        {phase === 'run' && runDeck[idx] && (
          <>
            <Card
              card={runDeck[idx]}
              revealed={revealed}
              onReveal={reveal}
              latency={cardLatency}
              flash={flash}
            />
            <VerdictBar enabled={revealed} onVerdict={verdict} />
          </>
        )}
        {phase === 'end' && (
          <EndRun
            results={results}
            cards={runDeck}
            duration={duration}
            onAgain={startRun}
            onHome={() => window.location.href = 'Home.html'}
            variant={tweaks.variant}
          />
        )}
      </main>
      <RunStatusbar results={results} combo={combo} />
      {phase === 'run' && <ComboChip combo={combo} pulse={comboPulse} />}
    </div>
  );
};

Object.assign(window, { RunApp });
