// StreakGuard — triage 12 leaking cards before they expire.
// Each card has decayMs (random 15–45s). When picked, player answers 4-tile meaning quiz.
// Correct = SAVED (locked). Wrong = LEAKED immediately. Decay timeout = LEAKED.

const TWEAK_DEFAULTS_SG = {
  accent: 'cyan',
  scanlines: 'off',
  density: 'comfortable',
  countdown: 'dissolve',
  cellCount: 12,
  difficulty: 'mix',
};

const PB_KEY_SG = 'kb-sg-pb';

function buildDeck(cards, n, difficulty, cardStates) {
  const nearPool = (window.Daily && window.Daily.nearUserPool)
    ? window.Daily.nearUserPool(cards, cardStates || [])
    : cards.slice();
  let pool;
  if (difficulty === 'easy') pool = nearPool.filter(c => c.jlpt >= 4);
  else if (difficulty === 'hard') pool = nearPool.filter(c => c.jlpt <= 3);
  else pool = nearPool.slice();
  if (pool.length < n) pool = nearPool.slice();
  const shuffled = pool.map(c => ({c, k: Math.random()})).sort((a,b)=>a.k-b.k).map(x=>x.c);
  return shuffled.slice(0, n).map((c, i) => {
    // spread decay windows: first few drain fastest to create urgency
    const baseMs = 22000 + Math.random() * 22000;
    const urgency = i < 3 ? 0.6 : i < 6 ? 0.85 : 1; // first cells start closer to death
    return {
      id: `cell-${i}`,
      card: c,
      totalMs: baseMs,
      remainMs: baseMs * urgency,
      status: 'live', // live | saved | leaked | active
      tiles: null,
      correctIdx: -1,
    };
  });
}

function dealQuiz(card, pool) {
  const correct = card.mean.split(',')[0].trim();
  const candidates = pool.filter(c => c.idx !== card.idx && c.jlpt === card.jlpt);
  const dsrc = candidates.length >= 3 ? candidates : pool.filter(c => c.idx !== card.idx);
  const seen = new Set([correct.toLowerCase()]);
  const dis = [];
  while (dis.length < 3 && dsrc.length) {
    const p = dsrc[Math.floor(Math.random()*dsrc.length)];
    const m = p.mean.split(',')[0].trim();
    if (seen.has(m.toLowerCase())) continue;
    seen.add(m.toLowerCase()); dis.push(m);
  }
  const tilesRaw = [correct, ...dis];
  const tiles = tilesRaw.map(t=>({t,k:Math.random()})).sort((a,b)=>a.k-b.k).map(x=>x.t);
  return { tiles, correctIdx: tiles.indexOf(correct) };
}

const SGTopbar = ({ saved, leaked, atRisk, onQuit }) => (
  <header className="run-top sg-top">
    <div className="run-top-l">
      <button className="run-quit" onClick={onQuit}>‹ quit</button>
      <span className="run-lbl sg-lbl">▸ STREAK GUARD</span>
    </div>
    <div className="sg-top-counts">
      <span className="sg-pill sg-pill-saved">✓ {saved}</span>
      <span className="sg-pill sg-pill-risk">◌ {atRisk}</span>
      <span className="sg-pill sg-pill-leak">✗ {leaked}</span>
    </div>
  </header>
);

const StreakGuardApp = ({ cards }) => {
  const [tweaks] = React.useState(() => {
    try {
      const shared = JSON.parse(localStorage.getItem('kb-tweaks') || '{}');
      return { ...TWEAK_DEFAULTS_SG, ...shared };
    } catch(e) { return { ...TWEAK_DEFAULTS_SG }; }
  });

  const [phase, setPhase] = React.useState('pre'); // pre | ready | play | end
  const [countdown, setCountdown] = React.useState(3);
  const [deck, setDeck] = React.useState([]);
  const [activeId, setActiveId] = React.useState(null);
  const [feedback, setFeedback] = React.useState(null);
  const [flashLeak, setFlashLeak] = React.useState(null);
  const [pb, setPb] = React.useState(() => {
    try { return parseInt(localStorage.getItem(PB_KEY_SG) || '0', 10) || 0; } catch(e) { return 0; }
  });
  const [beatPb, setBeatPb] = React.useState(false);
  const tickRef = React.useRef(null);
  const lastTickRef = React.useRef(null);
  const lockRef = React.useRef(false);
  // Ref (not state) so the ready-phase countdown effect doesn't restart when
  // card_states finish loading — buildDeck/dealQuiz only read it at deal time.
  const cardStatesRef = React.useRef([]);
  const nearPoolRef = React.useRef(cards);

  React.useEffect(() => {
    if (!window.DB) return;
    window.DB.open()
      .then(() => window.DB.getAllCardStates())
      .then(s => { cardStatesRef.current = s || []; })
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    document.body.dataset.accent = tweaks.accent;
    document.body.dataset.scanlines = tweaks.scanlines;
    document.body.dataset.density = tweaks.density;
  }, [tweaks]);

  // 3-2-1 countdown → start play
  React.useEffect(() => {
    if (phase !== 'ready') return;
    setCountdown(3);
    let n = 3;
    const tick = () => {
      n -= 1;
      if (n <= 0) {
        setCountdown(0);
        nearPoolRef.current = (window.Daily && window.Daily.nearUserPool)
          ? window.Daily.nearUserPool(cards, cardStatesRef.current)
          : cards;
        const d = buildDeck(cards, tweaks.cellCount, tweaks.difficulty, cardStatesRef.current);
        setDeck(d);
        setActiveId(null);
        setFeedback(null);
        setBeatPb(false);
        lastTickRef.current = performance.now();
        setPhase('play');
      } else { setCountdown(n); setTimeout(tick, 700); }
    };
    const t = setTimeout(tick, 700);
    return () => clearTimeout(t);
  }, [phase, cards, tweaks.cellCount, tweaks.difficulty]);

  // Drain loop
  React.useEffect(() => {
    if (phase !== 'play') return;
    const step = (now) => {
      const dt = now - (lastTickRef.current || now);
      lastTickRef.current = now;
      setDeck(prev => {
        let anyLeakedThisTick = null;
        const next = prev.map(cell => {
          if (cell.status !== 'live') return cell;
          if (cell.id === activeId) return cell; // frozen while active
          const r = cell.remainMs - dt;
          if (r <= 0) {
            anyLeakedThisTick = cell;
            return { ...cell, remainMs: 0, status: 'leaked' };
          }
          return { ...cell, remainMs: r };
        });
        if (anyLeakedThisTick) {
          setFlashLeak({ card: anyLeakedThisTick.card, t: Date.now() });
          setTimeout(() => setFlashLeak(null), 900);
        }
        return next;
      });
      tickRef.current = requestAnimationFrame(step);
    };
    tickRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(tickRef.current);
  }, [phase, activeId]);

  // End condition: all cells resolved
  React.useEffect(() => {
    if (phase !== 'play' || deck.length === 0) return;
    const unresolved = deck.filter(c => c.status === 'live').length;
    if (unresolved === 0 && !activeId) {
      const savedCount = deck.filter(c => c.status === 'saved').length;
      const leakedCount = deck.filter(c => c.status === 'leaked').length;
      if (savedCount > pb) {
        setBeatPb(true);
        try { localStorage.setItem(PB_KEY_SG, String(savedCount)); } catch(e) {}
        setPb(savedCount);
      }
      if (window.DB && deck.length > 0) {
        const isHot = window.Daily && window.Daily.hotChallengeId() === 'streak';
        // Pay per saved card, with a clean-sweep bonus for the full grid.
        const base = 40 + savedCount * 8;
        const cleanBonus = (savedCount === deck.length) ? 20 : 0;
        const pbBonus = (savedCount > pb) ? 20 : 0;
        const earned = Math.round((base + cleanBonus + pbBonus) * (isHot ? window.Daily.HOT_MULTIPLIER : 1));
        window.DB.saveScore({ mode: 'streak_guard', score: savedCount }).catch(() => {});
        window.DB.saveSession({
          mode: 'streak_guard',
          duration_s: 0,
          cards_reviewed: deck.length,
          hits: savedCount,
          misses: leakedCount,
          hard: 0,
          xp_earned: earned,
        })
          .then(() => window.DB.grantXp(earned))
          .then(() => window.DB.recordSessionStreak())
          .catch(() => {});
      }
      setTimeout(() => setPhase('end'), 500);
    }
  }, [deck, phase, activeId, pb]);

  const pickCell = (id) => {
    if (phase !== 'play' || activeId || lockRef.current) return;
    const cell = deck.find(c => c.id === id);
    if (!cell || cell.status !== 'live') return;
    const { tiles, correctIdx } = dealQuiz(cell.card, nearPoolRef.current);
    setDeck(prev => prev.map(c => c.id === id ? { ...c, tiles, correctIdx, status: 'active' } : c));
    setActiveId(id);
    setFeedback(null);
    lockRef.current = false;
  };

  const onTilePick = (tileIdx) => {
    if (!activeId || lockRef.current) return;
    const cell = deck.find(c => c.id === activeId);
    if (!cell) return;
    lockRef.current = true;
    const ok = tileIdx === cell.correctIdx;
    setFeedback({ picked: tileIdx, correct: cell.correctIdx, ok });
    setTimeout(() => {
      setDeck(prev => prev.map(c => c.id === activeId
        ? { ...c, status: ok ? 'saved' : 'leaked', remainMs: ok ? c.totalMs : 0 }
        : c
      ));
      setActiveId(null);
      setFeedback(null);
      lockRef.current = false;
    }, ok ? 520 : 780);
  };

  const backToGrid = () => {
    if (!activeId) return;
    // abort — cell returns to live with remaining time intact
    setDeck(prev => prev.map(c => c.id === activeId ? { ...c, status: 'live' } : c));
    setActiveId(null);
    setFeedback(null);
    lockRef.current = false;
  };

  const start = () => { setPhase('ready'); };
  const restart = () => {
    setDeck([]); setActiveId(null); setFeedback(null); setBeatPb(false);
    setPhase('ready');
  };
  const quit = () => {
    if (phase === 'play' && !confirm('Quit? Unsaved cards will leak.')) return;
    window.location.href = 'Home.html';
  };

  React.useEffect(() => {
    const onKey = (e) => {
      if (phase === 'pre') {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); start(); }
      } else if (phase === 'play') {
        if (activeId) {
          if (['1','2','3','4'].includes(e.key)) onTilePick(Number(e.key)-1);
          else if (e.key === 'Escape') backToGrid();
        } else {
          if (e.key === 'Escape') quit();
        }
      } else if (phase === 'end') {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); restart(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const saved = deck.filter(c => c.status === 'saved').length;
  const leaked = deck.filter(c => c.status === 'leaked').length;
  const live = deck.filter(c => c.status === 'live').length;
  const atRisk = deck.filter(c => c.status === 'live' && c.remainMs / c.totalMs < 0.4).length;
  const activeCell = deck.find(c => c.id === activeId);

  return (
    <>
      <div className="run-shell sg-shell variant-game" data-phase={phase}>
        <SGTopbar saved={saved} leaked={leaked} atRisk={atRisk} onQuit={quit} />

        <main className="run-main sg-main" data-screen-label={`sg-${phase}`}>
          {phase === 'pre' && <SGPre pb={pb} cellCount={tweaks.cellCount} difficulty={tweaks.difficulty} onStart={start} />}
          {phase === 'ready' && <TAReady n={countdown} variant={tweaks.countdown} />}
          {phase === 'play' && (
            <SGGrid
              deck={deck}
              activeId={activeId}
              onPickCell={pickCell}
              live={live}
            />
          )}
          {phase === 'play' && activeCell && (
            <SGQuiz
              cell={activeCell}
              onPick={onTilePick}
              onCancel={backToGrid}
              feedback={feedback}
            />
          )}
          {phase === 'end' && (
            <SGEnd
              deck={deck}
              saved={saved}
              leaked={leaked}
              total={deck.length}
              beatPb={beatPb}
              pb={pb}
              onAgain={restart}
              onHome={() => window.location.href = 'Home.html'}
            />
          )}

          {flashLeak && (
            <div key={flashLeak.t} className="sg-leak-flash">
              <span className="sg-leak-k">{flashLeak.card.k}</span>
              <span className="sg-leak-v">LEAKED · {flashLeak.card.mean.split(',')[0]}</span>
            </div>
          )}
        </main>
      </div>
    </>
  );
};

Object.assign(window, { StreakGuardApp });
