// Daily Run orchestrator: weighted 5-card deck, learn → quiz phase split.

const TWEAK_DEFAULTS = {
  scanlines: 'off',
};

// XP weights for Run mode — miss penalizes, easy rewards confidence,
// clean sweep and 90%+ accuracy give meaningful completion bonuses.
const RUN_XP = { miss: -3, hard: 6, ok: 14, easy: 22 };
const RUN_BONUS_CLEAN = 25;
const RUN_BONUS_ACC90 = 15;

const shuffle = (arr) => arr
  .map(v => ({ v, k: Math.random() }))
  .sort((a, b) => a.k - b.k)
  .map(x => x.v);

const RunTopbar = ({ phase, timer, onQuit, idx, total, isOverclock }) => {
  const dotClr = isOverclock ? 'var(--accent-magenta)' : 'var(--accent-cyan)';
  const dotShadow = isOverclock ? '0 0 6px var(--accent-magenta)' : '0 0 6px var(--accent-cyan)';
  return (
    <header className="run-top">
      <div className="run-top-l">
        <button className="run-quit" onClick={onQuit}>‹ quit</button>
        <span className="run-lbl">▸ {isOverclock ? 'OVERCLOCK' : 'RUN'}</span>
      </div>
      <div className="run-timer">
        {phase === 'quiz'  ? `${String(idx+1).padStart(2,'0')} / ${String(total).padStart(2,'0')} · ${timer}`
          : phase === 'intro' ? `LEARN · ${idx + 1} / ${total}`
          : phase === 'pre'   ? 'PRE-FLIGHT'
          : 'COMPLETE'}
      </div>
      <div className="run-top-r">
        <span style={{display:'inline-flex',alignItems:'center',gap:4,color:dotClr}}>
          <span style={{width:6,height:6,background:dotClr,boxShadow:dotShadow}} />
          {isOverclock ? 'EXTRA' : 'LIVE'}
        </span>
      </div>
    </header>
  );
};

const RunApp = ({ cards }) => {
  const [tweaks] = React.useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('kb-tweaks') || '{}');
      return { ...TWEAK_DEFAULTS, ...saved };
    } catch(e) { return { ...TWEAK_DEFAULTS }; }
  });

  const [deck, setDeck] = React.useState([]);        // weighted 5-card deck, new → due → leech
  const [newCards, setNewCards] = React.useState([]); // subset of deck with _bucket === 'new'
  const [quizOrder, setQuizOrder] = React.useState([]); // shuffled deck for quiz phase
  const [composition, setComposition] = React.useState({ new:0, due:0, leech:0, total:0 });
  const [user, setUser] = React.useState(null);
  const [streakBefore, setStreakBefore] = React.useState(0);

  const [phase, setPhase] = React.useState('loading'); // loading | pre | intro | quiz | end
  const [introIdx, setIntroIdx] = React.useState(0);
  const [quizIdx, setQuizIdx] = React.useState(0);
  const [revealed, setRevealed] = React.useState(false);
  const [results, setResults] = React.useState([]);
  const [flash, setFlash] = React.useState(null);
  const [combo, setCombo] = React.useState(0);
  const [comboPulse, setComboPulse] = React.useState(false);
  const [startedAt, setStartedAt] = React.useState(null);
  const [cardStartedAt, setCardStartedAt] = React.useState(null);
  const [now, setNow] = React.useState(Date.now());
  const [duration, setDuration] = React.useState(0);
  const [xpGained, setXpGained] = React.useState(0);
  const [confirmQuit, setConfirmQuit] = React.useState(false);
  const [isOverclock, setIsOverclock] = React.useState(false);

  // Build the weighted deck once, after DB + cards are ready.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cards || !cards.length || !window.DB || !window.Daily) return;
      try {
        await window.DB.open();
        const [u, states] = await Promise.all([
          window.DB.getUser(),
          window.DB.getAllCardStates(),
        ]);
        if (cancelled) return;
        setUser(u);
        setStreakBefore(u?.current_streak ?? 0);
        // Overclock = "I already cleared today's quota and I'm coming back for more."
        // Detect by mirroring App.jsx's daily-done gate so Home and Run agree on
        // when the cycle is bonus territory.
        const todayStr = new Date().toDateString();
        const reviewedToday = (states || []).filter(s =>
          s.last_reviewed && new Date(s.last_reviewed).toDateString() === todayStr
        ).length;
        setIsOverclock(reviewedToday >= (window.Daily.DECK_SIZE || 5));
        const selected = window.Daily.selectDailyDeck(cards, states);
        const composed = {
          new:   selected.filter(c => c._bucket === 'new').length,
          due:   selected.filter(c => c._bucket === 'due').length,
          leech: selected.filter(c => c._bucket === 'leech').length,
          total: selected.length,
        };
        setDeck(selected);
        setNewCards(selected.filter(c => c._bucket === 'new'));
        setComposition(composed);
        setPhase('pre');
      } catch (e) {
        // Fallback: first-N slice so the UI still works without DB.
        const fallback = cards.slice(0, window.Daily?.DECK_SIZE || 5)
          .map(c => ({ ...c, _bucket: 'new' }));
        setDeck(fallback);
        setNewCards(fallback);
        setComposition({ new: fallback.length, due: 0, leech: 0, total: fallback.length });
        setPhase('pre');
      }
    })();
    return () => { cancelled = true; };
  }, [cards]);

  React.useEffect(() => {
    document.body.dataset.scanlines = tweaks.scanlines;
  }, [tweaks]);

  // live timer during quiz
  React.useEffect(() => {
    if (phase !== 'quiz') return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [phase]);

  // save session + XP when quiz ends
  React.useEffect(() => {
    if (phase !== 'end' || !window.DB || !startedAt) return;
    const c = { miss:0, hard:0, ok:0, easy:0 };
    results.forEach(r => { if (c[r] != null) c[r]++; });
    const total = results.length;
    const hits = c.ok + c.easy + c.hard;
    const acc = total === 0 ? 0 : Math.round(100 * hits / total);
    const base = c.miss * RUN_XP.miss + c.hard * RUN_XP.hard + c.ok * RUN_XP.ok + c.easy * RUN_XP.easy;
    const cleanBonus = (total > 0 && c.miss === 0) ? RUN_BONUS_CLEAN : 0;
    const accBonus   = (total > 0 && acc >= 90) ? RUN_BONUS_ACC90 : 0;
    const earned = Math.max(0, base + cleanBonus + accBonus);
    setXpGained(earned);
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
      .then(() => window.DB.getUser())
      .then(u => setUser(u))
      .catch(() => {});
  }, [phase]);

  const beginSession = () => {
    if (newCards.length > 0) {
      setIntroIdx(0);
      setPhase('intro');
    } else {
      startQuiz();
    }
  };

  const advanceIntro = () => {
    const next = introIdx + 1;
    if (next >= newCards.length) startQuiz();
    else setIntroIdx(next);
  };

  const startQuiz = () => {
    setQuizOrder(shuffle(deck));
    setQuizIdx(0);
    setResults([]);
    setRevealed(false);
    setCombo(0);
    setFlash(null);
    const t = Date.now();
    setStartedAt(t);
    setCardStartedAt(t);
    setNow(t);
    setPhase('quiz');
  };

  const reveal = () => setRevealed(true);

  const verdict = (v) => {
    if (!revealed) return;
    const nextResults = [...results, v];
    setResults(nextResults);

    const card = quizOrder[quizIdx];
    if (window.DB && window.Srs && card) {
      window.DB.getCardState(card.idx).then(existing => {
        const next = window.Srs.schedule(existing, v);
        return window.DB.upsertCardState({ idx: card.idx, ...next });
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

    setTimeout(() => {
      if (quizIdx + 1 >= quizOrder.length) {
        setDuration(Math.round((Date.now() - startedAt) / 1000));
        setPhase('end');
      } else {
        setQuizIdx(quizIdx + 1);
        setRevealed(false);
        setCardStartedAt(Date.now());
      }
    }, v === 'miss' ? 360 : 260);
  };

  const restart = () => {
    setResults([]); setRevealed(false); setCombo(0); setFlash(null);
    setXpGained(0); setIntroIdx(0); setQuizIdx(0);
    beginSession();
  };

  const goHome = () => { window.location.href = 'Home.html'; };
  const quit = () => {
    if (phase === 'quiz' || phase === 'intro') { setConfirmQuit(true); return; }
    goHome();
  };

  React.useEffect(() => {
    const onKey = (e) => {
      if (phase === 'pre') {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); beginSession(); }
      } else if (phase === 'intro') {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); advanceIntro(); }
        else if (e.key === 'Escape') { quit(); }
      } else if (phase === 'quiz') {
        if (e.key === ' ') { e.preventDefault(); if (!revealed) reveal(); }
        else if (e.key === '1') { if (revealed) verdict('miss'); }
        else if (e.key === '2') { if (revealed) verdict('hard'); }
        else if (e.key === '3') { if (revealed) verdict('ok'); }
        else if (e.key === '4') { if (revealed) verdict('easy'); }
        else if (e.key === 'Escape') { quit(); }
      } else if (phase === 'end') {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); restart(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const timer = React.useMemo(() => {
    if (!startedAt) return '00:00';
    const s = Math.floor((now - startedAt)/1000);
    return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  }, [now, startedAt]);

  const cardLatency = cardStartedAt ? Math.floor((now - cardStartedAt)/1000) : 0;
  const shellCls = `run-shell variant-game${isOverclock ? ' is-overclock' : ''}`;

  if (phase === 'loading') {
    return (
      <div className={shellCls} data-overclock={isOverclock ? 'true' : undefined}>
        <RunTopbar phase="pre" idx={0} total={0} onQuit={quit} timer="00:00" isOverclock={isOverclock} />
        <main className="run-main" data-screen-label="run-loading">
          <div style={{padding:'var(--sp-5)', color:'var(--fg-2)', textAlign:'center', fontFamily:'var(--font-mono)', letterSpacing:'.14em'}}>
            ▸ MOUNTING QUEUE...
          </div>
        </main>
      </div>
    );
  }

  const activeIntro = phase === 'intro' ? newCards[introIdx] : null;
  const activeQuiz  = phase === 'quiz'  ? quizOrder[quizIdx] : null;

  return (
    <div className={shellCls} data-overclock={isOverclock ? 'true' : undefined}>
      <RunTopbar
        phase={phase}
        timer={timer}
        idx={phase === 'intro' ? introIdx : quizIdx}
        total={phase === 'intro' ? newCards.length : quizOrder.length}
        onQuit={quit}
        isOverclock={isOverclock}
      />
      {phase === 'quiz' && (
        <SegProgress results={results} current={quizIdx} total={quizOrder.length} />
      )}
      <main className="run-main" data-screen-label={`run-${phase}`}>
        {phase === 'pre' && (
          <PreRun composition={composition} onStart={beginSession} isOverclock={isOverclock} />
        )}
        {phase === 'intro' && activeIntro && (
          <IntroCard
            card={activeIntro}
            index={introIdx}
            total={newCards.length}
            onNext={advanceIntro}
          />
        )}
        {phase === 'quiz' && activeQuiz && (
          <>
            <Card
              card={activeQuiz}
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
            cards={quizOrder}
            duration={duration}
            onAgain={restart}
            onHome={() => window.location.href = 'Home.html'}
            user={user ? { ...user, _streakBefore: streakBefore } : null}
            xpGained={xpGained}
            isOverclock={isOverclock}
          />
        )}
      </main>
      {phase === 'quiz' && <ComboChip combo={combo} pulse={comboPulse} />}

      <ConfirmModal
        open={confirmQuit}
        title="QUIT THE RUN?"
        body="Progress this session won't save."
        confirmLabel="QUIT"
        cancelLabel="STAY"
        onConfirm={goHome}
        onCancel={() => setConfirmQuit(false)}
      />
    </div>
  );
};

Object.assign(window, { RunApp });
