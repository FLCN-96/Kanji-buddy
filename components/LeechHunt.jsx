// LeechHunt — 3-stage cleanse per leech. 4 bounties (3 known + 1 challenge),
// 3-miss fail limit.

const TWEAK_DEFAULTS_LH = {
  scanlines: 'off',
  countdown: 'dissolve',
  leechCount: 4,
  missCap: 3,
};

const LH_KNOWN_SLOTS = 3;
const LH_CHALLENGE_SLOTS = 1;

const PB_KEY_LH = 'kb-lh-pb';

// Build a 4-card bounty roster: 3 "known" slots drawn from cards the operator
// has actually touched (real leeches first, then any reviewed card with a
// randomised priority nudge so repeat plays rotate targets), plus 1 "challenge"
// slot — an unseen card one JLPT tier harder than what they've seen, for fun.
//
// Brand-new operators (not enough reviewed cards to fill 3 known slots) get
// the remainder padded from the easy front of the deck so the hunt still deals.
function buildLeeches(cards, _n, cardStates) {
  const LEECH_LAPSES = (window.Daily && window.Daily.LEECH_LAPSES) || 3;
  const byIdx = new Map(cards.map(c => [c.idx, c]));
  const states = (cardStates || []).filter(s => s && s.idx != null && byIdx.has(s.idx));
  const seenIdx = new Set(states.map(s => s.idx));

  // Score reviewed cards: real leeches heavily prioritised, then lapses and
  // reviews, with a random nudge so identical-score cards shuffle between runs.
  const scored = states.map(s => {
    const lapses = s.lapses || 0;
    const reviews = s.reviews || 0;
    const base = lapses >= LEECH_LAPSES ? 100 : 0;
    return { s, k: base + lapses * 5 + reviews * 0.5 + Math.random() * 2 };
  }).sort((a, b) => b.k - a.k);

  const knownPicked = [];
  const usedIdx = new Set();
  for (const { s } of scored) {
    if (knownPicked.length >= LH_KNOWN_SLOTS) break;
    const card = byIdx.get(s.idx);
    if (!card || !card.ex || !card.ex.length) continue;
    knownPicked.push({ card, lapses: s.lapses || 0, synthetic: false });
    usedIdx.add(card.idx);
  }

  // Top up with easy novice-friendly cards if the operator hasn't reviewed
  // enough yet — brand-new users still get a playable hunt.
  if (knownPicked.length < LH_KNOWN_SLOTS) {
    const pad = cards
      .filter(c => !usedIdx.has(c.idx) && c.ex && c.ex.length >= 1)
      .slice(0, 40)
      .map(c => ({ c, k: Math.random() }))
      .sort((a, b) => a.k - b.k);
    for (const { c } of pad) {
      if (knownPicked.length >= LH_KNOWN_SLOTS) break;
      knownPicked.push({ card: c, lapses: 0, synthetic: true });
      usedIdx.add(c.idx);
    }
  }

  // Challenge slot: unseen card, prefer one JLPT tier harder than the
  // operator's hardest seen tier (JLPT 5 = easy, 1 = hard). Fall back to any
  // unseen near-frontier card if the preferred tier is thin.
  const seenJlpts = new Set(cards.filter(c => seenIdx.has(c.idx)).map(c => c.jlpt));
  const hardestSeen = seenJlpts.size ? Math.min(...seenJlpts) : 5;
  const targetJlpt = Math.max(1, hardestSeen - 1);

  const unseenWithEx = (extra) => cards.filter(c =>
    !seenIdx.has(c.idx) &&
    !usedIdx.has(c.idx) &&
    c.ex && c.ex.length >= 1 &&
    (!extra || extra(c))
  );

  let pool = unseenWithEx(c => c.jlpt === targetJlpt);
  if (pool.length < 4) pool = unseenWithEx(c => c.jlpt <= hardestSeen);
  if (pool.length < 4) pool = unseenWithEx();

  const challengePicked = [];
  if (pool.length) {
    // Bias toward earlier-idx cards (roughly more common) within the eligible
    // pool, then shuffle the top slice so repeat plays vary.
    const slice = pool.slice(0, Math.max(30, Math.min(pool.length, 200)));
    const shuffled = slice.map(c => ({ c, k: Math.random() })).sort((a, b) => a.k - b.k);
    for (let i = 0; i < LH_CHALLENGE_SLOTS && i < shuffled.length; i++) {
      challengePicked.push({ card: shuffled[i].c, lapses: 0, synthetic: true });
      usedIdx.add(shuffled[i].c.idx);
    }
  }

  // Shuffle combined roster so the challenge card isn't always in the same slot.
  const combined = [...knownPicked, ...challengePicked]
    .map(x => ({ x, k: Math.random() }))
    .sort((a, b) => a.k - b.k)
    .map(y => y.x);

  return combined.map((raw, i) => ({
    id: `leech-${i}`,
    card: raw.card,
    lapses: raw.lapses,
    status: 'pending', // pending | active | purged | weakened | survived
    cleansed: 0,
    firstTry: true,
    synthetic: raw.synthetic,
  }));
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
      <button className="run-quit" onClick={onQuit}>‹ ABORT</button>
      <span className="run-lbl lh-lbl">▸ HUNT // 狩猟</span>
    </div>
    <div className="lh-top-r">
      <span className="lh-pill lh-pill-purged">⊘ {purged}/{total}</span>
      <span className={`lh-pill lh-pill-miss${misses >= missCap ? ' is-danger' : misses >= missCap-1 ? ' is-warn' : ''}`}>
        × {misses}/{missCap === 99 ? '∞' : missCap} BLEED
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
  const [xpGained, setXpGained] = React.useState(0);
  const [hotTier, setHotTier] = React.useState(null);
  const [confirmQuit, setConfirmQuit] = React.useState(false);
  const lockRef = React.useRef(false);
  const finishedRef = React.useRef(false);
  // Ref (not state) so the ready-phase countdown effect doesn't restart when
  // card_states finish loading — the hunt only reads it at roster-build time.
  const cardStatesRef = React.useRef([]);
  const seenSetRef = React.useRef(new Set());
  // Cached near-user pool used for synthetic padding + distractors. Computed
  // once per hunt (in the ready countdown) so dealStage stays cheap.
  const nearPoolRef = React.useRef(null);

  React.useEffect(() => {
    if (!window.DB) return;
    window.DB.open()
      .then(() => window.DB.getAllCardStates())
      .then(s => {
        cardStatesRef.current = s || [];
        seenSetRef.current = (window.Daily?.seenIdxSet || (() => new Set()))(cardStatesRef.current);
      })
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    document.body.dataset.scanlines = tweaks.scanlines;
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
      const tierAtSave = window.Daily ? window.Daily.hotTier('leech') : null;
      const mult       = window.Daily ? window.Daily.hotMultiplier('leech') : 1;
      // Per-leech pay + completion/PB bonuses to make full sweeps feel earned.
      const base = 30 + purged * 10;
      const completeBonus = res === 'complete' ? 20 : 0;
      const pbBonus = (purged > pb) ? 20 : 0;
      const earned = Math.round((base + completeBonus + pbBonus) * mult);
      setXpGained(earned);
      setHotTier(tierAtSave);
      // Burn the gold synchronously — claim is just a localStorage write and
      // must not depend on the IDB chain below resolving (iOS PWA can suspend
      // or navigate away before saveSession/grantXp finish, leaving the flag
      // unwritten and every run stuck on gold).
      if (tierAtSave && window.Daily) window.Daily.claimHot('leech');
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
    setXpGained(0);
    setHotTier(null);
    finishedRef.current = false;
    lockRef.current = false;
    setPhase('ready');
  };
  const goHome = () => { window.location.href = 'Home.html'; };
  const quit = () => {
    if (phase === 'dossier' || phase === 'hunt') { setConfirmQuit(true); return; }
    goHome();
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
      <div className="run-shell lh-shell variant-game" data-phase={phase}>
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
              isUnseen={!seenSetRef.current.has(roster[activeIdx].card.idx)}
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
              xpGained={xpGained}
              hotTier={hotTier}
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

      <ConfirmModal
        open={confirmQuit}
        title="ABORT CONTRACT?"
        body="Marks remain at large · progress lost."
        confirmLabel="ABORT"
        cancelLabel="STAY"
        onConfirm={goHome}
        onCancel={() => setConfirmQuit(false)}
      />
    </>
  );
};

Object.assign(window, { LeechHuntApp });
