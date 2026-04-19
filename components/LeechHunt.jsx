// LeechHunt — 3-stage cleanse per leech. 8 leeches, 3-miss fail limit.

const TWEAK_DEFAULTS_LH = {
  variant: 'game',
  accent: 'cyan',
  scanlines: 'off',
  density: 'comfortable',
  countdown: 'dissolve',
  leechCount: 8,
  missCap: 3,
};

const PB_KEY_LH = 'kb-lh-pb';

// Build a leech roster. Real leeches (card_states with lapses ≥ LEECH_LAPSES)
// come first, sorted by lapse count. If the user has fewer real leeches than
// the target count, we pad with synthetic practice targets (harder-JLPT cards
// they haven't lapsed on yet) so the mode still has enough meat to chew on.
function buildLeeches(cards, n, cardStates) {
  const LEECH_LAPSES = (window.Daily && window.Daily.LEECH_LAPSES) || 3;
  const byIdx = new Map(cards.map(c => [c.idx, c]));

  const realStates = (cardStates || [])
    .filter(s => (s.lapses || 0) >= LEECH_LAPSES && byIdx.has(s.idx))
    .sort((a, b) => (b.lapses || 0) - (a.lapses || 0))
    .slice(0, n);

  const realLeeches = realStates.map((state, i) => {
    const card    = byIdx.get(state.idx);
    const lapses  = state.lapses  || 0;
    const reviews = state.reviews || 0;
    const total   = Math.max(1, lapses + reviews);
    const missRate = lapses / total;
    const history = Array.from({length: 8}, () => Math.random() < missRate ? 'x' : 'o');
    // These ARE leeches — guarantee at least one visible miss in the history.
    if (!history.includes('x')) history[Math.floor(Math.random() * 8)] = 'x';
    return {
      id: `leech-${i}`,
      card,
      contamination: missRate,
      history,
      status: 'pending', // pending | active | purged | weakened | survived
      cleansed: 0,
      firstTry: true,
      synthetic: false,
    };
  });

  const needed = n - realLeeches.length;
  if (needed <= 0) return realLeeches;

  const realIdxSet = new Set(realLeeches.map(l => l.card.idx));
  // Pull synthetic targets from the user's study frontier (discovered cards +
  // upcoming JLPT-tier neighbours) instead of the full ~2200-card library, so
  // brand-new operators don't face JLPT-1 kanji they've never seen.
  const nearPool = (window.Daily && window.Daily.nearUserPool)
    ? window.Daily.nearUserPool(cards, cardStates)
    : cards;
  let pool = nearPool.filter(c => c.ex && c.ex.length >= 1 && !realIdxSet.has(c.idx));
  if (pool.length < needed) {
    pool = cards.filter(c => c.ex && c.ex.length >= 1 && !realIdxSet.has(c.idx));
  }
  const scored = pool.map(c => ({ c, s: Math.random() + (5 - c.jlpt) * 0.2 }));
  scored.sort((a, b) => b.s - a.s);

  const synthetic = scored.slice(0, needed).map((x, i) => {
    const card = x.c;
    const contamination = 0.58 + Math.random() * 0.32;
    const history = Array.from({length: 8}, () => Math.random() < contamination ? 'x' : 'o');
    while (history.filter(h => h === 'x').length < 4) {
      const j = Math.floor(Math.random() * 8);
      history[j] = 'x';
    }
    return {
      id: `leech-${realLeeches.length + i}`,
      card,
      contamination,
      history,
      status: 'pending',
      cleansed: 0,
      firstTry: true,
      synthetic: true,
    };
  });

  return [...realLeeches, ...synthetic];
}

function dealStage(leech, stageIdx, pool) {
  const card = leech.card;
  const sameJlpt = pool.filter(c => c.idx !== card.idx && c.jlpt === card.jlpt);
  const fallback = pool.filter(c => c.idx !== card.idx);
  const dsrc = sameJlpt.length >= 3 ? sameJlpt : fallback;

  if (stageIdx === 0) {
    // recognition — pick meaning
    const correct = card.mean.split(',')[0].trim();
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
    return { kind: 'recognition', tiles, correctIdx: tiles.indexOf(correct) };
  }
  if (stageIdx === 1) {
    // reading — pick reading
    const allReads = [...card.kun.map(r=>r.r), ...card.on.map(r=>r.r)].filter(Boolean);
    const correct = (allReads[0] || '').replace(/\./g,'');
    const seen = new Set([correct]);
    const dis = [];
    while (dis.length < 3 && dsrc.length) {
      const p = dsrc[Math.floor(Math.random()*dsrc.length)];
      const prs = [...p.kun.map(r=>r.r), ...p.on.map(r=>r.r)].filter(Boolean);
      const r = (prs[0] || '').replace(/\./g,'');
      if (!r || seen.has(r)) continue;
      seen.add(r); dis.push(r);
    }
    while (dis.length < 3) { dis.push('—'); } // safety
    const tilesRaw = [correct, ...dis];
    const tiles = tilesRaw.map(t=>({t,k:Math.random()})).sort((a,b)=>a.k-b.k).map(x=>x.t);
    return { kind: 'reading', tiles, correctIdx: tiles.indexOf(correct) };
  }
  // stage 2: application — pick right example sentence
  const ex = card.ex[0];
  const blanked = ex.w.replaceAll(card.k, '＿');
  const correct = { w: ex.w, r: ex.r, m: ex.m, blanked, show: ex.m };

  // distractors: another example meaning from a different card
  const dis = [];
  const used = new Set([correct.show.toLowerCase()]);
  while (dis.length < 1 && dsrc.length) {
    const p = dsrc[Math.floor(Math.random()*dsrc.length)];
    if (!p.ex || !p.ex.length) continue;
    const m = p.ex[0].m;
    if (used.has(m.toLowerCase())) continue;
    used.add(m.toLowerCase());
    dis.push({ show: m });
  }
  const tilesRaw = [correct, ...dis];
  const tiles = tilesRaw.map(t=>({t,k:Math.random()})).sort((a,b)=>a.k-b.k).map(x=>x.t);
  return { kind: 'application', tiles, correctIdx: tiles.findIndex(t => t === correct), blanked };
}

const LHTopbar = ({ purged, total, misses, missCap, onQuit }) => (
  <header className="run-top lh-top">
    <div className="run-top-l">
      <button className="run-quit" onClick={onQuit}>‹ abort</button>
      <span className="run-lbl lh-lbl">▸ LEECH HUNT</span>
    </div>
    <div className="lh-top-r">
      <span className="lh-pill lh-pill-purged">⊘ {purged}/{total}</span>
      <span className={`lh-pill lh-pill-miss${misses >= missCap ? ' is-danger' : misses >= missCap-1 ? ' is-warn' : ''}`}>
        × {misses}/{missCap === 99 ? '∞' : missCap}
      </span>
    </div>
  </header>
);

const LeechHuntApp = ({ cards }) => {
  const [tweaks] = React.useState(() => {
    try {
      const shared = JSON.parse(localStorage.getItem('kb-tweaks') || '{}');
      return { ...TWEAK_DEFAULTS_LH, ...shared };
    } catch(e) { return { ...TWEAK_DEFAULTS_LH }; }
  });

  const [phase, setPhase] = React.useState('pre'); // pre | ready | dossier | hunt | end
  const [countdown, setCountdown] = React.useState(3);
  const [roster, setRoster] = React.useState([]);
  const [activeIdx, setActiveIdx] = React.useState(-1);
  const [stageIdx, setStageIdx] = React.useState(0);
  const [stage, setStage] = React.useState(null);
  const [feedback, setFeedback] = React.useState(null);
  const [misses, setMisses] = React.useState(0);
  const [purgeFx, setPurgeFx] = React.useState(null);
  const [result, setResult] = React.useState(null); // 'complete' | 'fail'
  const [pb, setPb] = React.useState(() => {
    try { return parseInt(localStorage.getItem(PB_KEY_LH) || '0', 10) || 0; } catch(e) { return 0; }
  });
  const [beatPb, setBeatPb] = React.useState(false);
  const lockRef = React.useRef(false);
  const finishedRef = React.useRef(false);
  // Ref (not state) so the ready-phase countdown effect doesn't restart when
  // card_states finish loading — the hunt only reads it at roster-build time.
  const cardStatesRef = React.useRef([]);
  // Cached near-user pool used for synthetic padding + distractors. Computed
  // once per hunt (in the ready countdown) so dealStage stays cheap.
  const nearPoolRef = React.useRef(null);

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
        const r = buildLeeches(cards, tweaks.leechCount, cardStatesRef.current);
        setRoster(r);
        setMisses(0);
        setResult(null);
        setBeatPb(false);
        setPhase('dossier');
      } else { setCountdown(n); setTimeout(tick, 700); }
    };
    const t = setTimeout(tick, 700);
    return () => clearTimeout(t);
  }, [phase, cards, tweaks.leechCount]);

  const engage = (idx) => {
    if (phase !== 'dossier') return;
    const leech = roster[idx];
    if (!leech || leech.status !== 'pending') return;
    setRoster(r => r.map((l,i) => i === idx ? { ...l, status: 'active', cleansed: 0, firstTry: true } : l));
    setActiveIdx(idx);
    setStageIdx(0);
    setStage(dealStage(leech, 0, nearPoolRef.current || cards));
    setFeedback(null);
    lockRef.current = false;
    setPhase('hunt');
  };

  const finish = (purged, res) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (purged > pb) {
      setBeatPb(true);
      try { localStorage.setItem(PB_KEY_LH, String(purged)); } catch(e) {}
      setPb(purged);
    }
    setResult(res);
    setPhase('end');
    if (window.DB && roster.length > 0) {
      const isHot = window.Daily && window.Daily.hotChallengeId() === 'leech';
      // Per-leech pay + completion/PB bonuses to make full sweeps feel earned.
      const base = 30 + purged * 10;
      const completeBonus = res === 'complete' ? 20 : 0;
      const pbBonus = (purged > pb) ? 20 : 0;
      const earned = Math.round((base + completeBonus + pbBonus) * (isHot ? window.Daily.HOT_MULTIPLIER : 1));
      window.DB.saveScore({ mode: 'leech_hunt', score: purged, result: res }).catch(() => {});
      window.DB.saveSession({
        mode: 'leech_hunt',
        duration_s: 0,
        cards_reviewed: roster.length,
        hits: purged,
        misses: roster.length - purged,
        hard: 0,
        xp_earned: earned,
      })
        .then(() => window.DB.grantXp(earned))
        .then(() => window.DB.recordSessionStreak())
        .catch(() => {});
    }
  };

  const onStageAnswer = (tileIdx) => {
    if (!stage || lockRef.current || finishedRef.current) return;
    lockRef.current = true;
    const ok = tileIdx === stage.correctIdx;
    setFeedback({ picked: tileIdx, correct: stage.correctIdx, ok });

    // Snapshot the active leech. These fields aren't mutated between now
    // and the end-of-turn dispatch, so the closure reference is safe.
    const leech = roster[activeIdx];
    const idxAtAnswer = activeIdx;
    const newMisses = ok ? misses : misses + 1;
    if (!ok) setMisses(newMisses);
    const missCapHit = !ok && newMisses >= tweaks.missCap && tweaks.missCap !== 99;
    const lastStage = stageIdx >= 2;

    const nextFirstTry = leech.firstTry && ok;
    const nextCleansed = leech.cleansed + (ok ? 1 : 0);

    // Two reveal-pause durations: short when simply advancing a stage,
    // longer when we're about to resolve the leech or end the run.
    const resolving = lastStage || missCapHit;
    const revealMs = resolving ? 1200 : (ok ? 480 : 780);

    setTimeout(() => {
      if (resolving) {
        // Resolve the leech now. If we got here via miss-cap mid-run the
        // leech exits as 'weakened'; otherwise normal purge/weakened rules.
        const finalFirstTry = lastStage && nextFirstTry;
        const finalStatus = (lastStage && finalFirstTry) ? 'purged' : 'weakened';
        setPurgeFx({ id: leech.id, card: leech.card, status: finalStatus, t: Date.now() });

        // Use the updater form and derive end state from the *committed*
        // snapshot — never from the stale outer roster closure.
        setRoster(prev => {
          const next = prev.map((l, i) => i === idxAtAnswer
            ? { ...l, status: finalStatus, firstTry: finalFirstTry, cleansed: nextCleansed }
            : l
          );
          const remaining = next.filter(l => l.status === 'pending').length;
          const purgedCount = next.filter(l => l.status === 'purged').length;

          // Schedule the UI reset + end dispatch. Lock stays held until
          // dispatch runs, which prevents any second tap from entering
          // onStageAnswer and racing finish().
          setTimeout(() => {
            setPurgeFx(null);
            setActiveIdx(-1);
            setStageIdx(0);
            setStage(null);
            setFeedback(null);
            if (missCapHit) {
              finish(purgedCount, 'fail');
            } else if (remaining === 0) {
              finish(purgedCount, 'complete');
            } else {
              setPhase('dossier');
              lockRef.current = false;
            }
          }, 400);
          return next;
        });
      } else {
        // Normal stage advance.
        setRoster(r => r.map((l, i) => i === idxAtAnswer
          ? { ...l, firstTry: nextFirstTry, cleansed: nextCleansed }
          : l
        ));
        setStageIdx(stageIdx + 1);
        setStage(dealStage(leech, stageIdx + 1, nearPoolRef.current || cards));
        setFeedback(null);
        lockRef.current = false;
      }
    }, revealMs);
  };

  const start = () => setPhase('ready');
  const restart = () => {
    setRoster([]); setActiveIdx(-1); setStageIdx(0); setStage(null);
    setFeedback(null); setMisses(0); setResult(null); setBeatPb(false); setPurgeFx(null);
    finishedRef.current = false;
    lockRef.current = false;
    setPhase('ready');
  };
  const quit = () => {
    if ((phase === 'dossier' || phase === 'hunt') && !confirm('Abort mission? Leeches remain at large.')) return;
    window.location.href = 'Home.html';
  };

  React.useEffect(() => {
    const onKey = (e) => {
      if (phase === 'pre') {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); start(); }
      } else if (phase === 'hunt' && stage) {
        if (['1','2','3','4'].includes(e.key)) {
          const i = Number(e.key)-1;
          if (i < stage.tiles.length) onStageAnswer(i);
        } else if (e.key === 'Escape') { quit(); }
      } else if (phase === 'end') {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); restart(); }
      } else if (phase === 'dossier') {
        if (e.key === 'Escape') quit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const purged = roster.filter(l => l.status === 'purged').length;
  const weakened = roster.filter(l => l.status === 'weakened').length;
  const survived = roster.filter(l => l.status === 'pending' || l.status === 'survived').length;

  return (
    <>
      <div className={`run-shell lh-shell variant-${tweaks.variant}`} data-phase={phase}>
        <LHTopbar purged={purged} total={roster.length || tweaks.leechCount} misses={misses} missCap={tweaks.missCap} onQuit={quit} />

        <main className="run-main lh-main" data-screen-label={`lh-${phase}`}>
          {phase === 'pre' && <LHPre pb={pb} tweaks={tweaks} onStart={start} />}
          {phase === 'ready' && <TAReady n={countdown} variant={tweaks.countdown} />}
          {phase === 'dossier' && (
            <LHDossier roster={roster} onEngage={engage} purged={purged} misses={misses} missCap={tweaks.missCap} />
          )}
          {phase === 'hunt' && stage && activeIdx >= 0 && (
            <LHHunt
              leech={roster[activeIdx]}
              stage={stage}
              stageIdx={stageIdx}
              onPick={onStageAnswer}
              feedback={feedback}
            />
          )}
          {phase === 'end' && (
            <LHEnd
              roster={roster}
              purged={purged}
              weakened={weakened}
              survived={survived}
              result={result}
              beatPb={beatPb}
              pb={pb}
              misses={misses}
              onAgain={restart}
              onHome={() => window.location.href = 'Home.html'}
            />
          )}

          {purgeFx && (
            <div key={purgeFx.t} className={`lh-purge-fx is-${purgeFx.status}`}>
              <div className="lh-purge-fx-k">{purgeFx.card.k}</div>
              <div className="lh-purge-fx-lbl">{purgeFx.status === 'purged' ? 'PURGED' : 'WEAKENED'}</div>
              <div className="lh-purge-fx-sub">{purgeFx.card.mean.split(',')[0]}</div>
            </div>
          )}
        </main>
      </div>
    </>
  );
};

Object.assign(window, { LeechHuntApp });
