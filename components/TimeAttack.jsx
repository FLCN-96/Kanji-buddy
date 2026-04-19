// TimeAttack orchestrator — phase machine, scoring, timer, deck dealer

const TWEAK_DEFAULTS_TA = {
  scanlines: 'off',
  density: 'comfortable',
  duration: 60,
  countdown: 'dissolve',
};

// XP balance for Time Attack. Base hit/miss pay drives the floor;
// single-highest combo tier keeps late-run combos meaningful without
// stacking. PB and clean-sweep are completion rewards.
const TA_XP_HIT = 4;
const TA_XP_MISS = -2;
const TA_XP_PB = 30;
const TA_XP_CLEAN = 25;
const TA_MISS_PENALTY_MS = 3000;
const taComboTier = (maxCombo) =>
  maxCombo >= 20 ? 40 :
  maxCombo >= 15 ? 25 :
  maxCombo >= 10 ? 15 :
  maxCombo >= 5  ? 5  : 0;

const DURATION_OPTS = [
  { id: 30, label: '30s' },
  { id: 60, label: '60s' },
  { id: 120, label: '2m' },
];

const PB_KEY = 'kb-ta-pb';

const TIER_TABLE = [
  { id: 'DIAMOND', min: 40, color: '#b8f1ff' },
  { id: 'GOLD',    min: 25, color: '#f5a524' },
  { id: 'SILVER',  min: 15, color: '#c9d6e2' },
  { id: 'BRONZE',  min: 0,  color: '#c68b5a' },
];

const pickTier = (score) => TIER_TABLE.find(t => score >= t.min) || TIER_TABLE[3];

// Deal a question: pick a card, then pull 3 distractor meanings from other cards
function dealQuestion(nearPool, used) {
  const pool = nearPool.filter(c => !used.has(c.idx));
  const card = pool[Math.floor(Math.random() * pool.length)] || nearPool[Math.floor(Math.random()*nearPool.length)];
  const jlpt = card.jlpt;
  // distractors — prefer same jlpt within the near-user pool, fall back to the rest of the pool
  const candidates = nearPool.filter(c => c.idx !== card.idx);
  const sameTier = candidates.filter(c => c.jlpt === jlpt);
  const distractors = [];
  const sourcePool = sameTier.length >= 3 ? sameTier : candidates;
  const seenMeans = new Set([card.mean.split(',')[0].trim().toLowerCase()]);
  while (distractors.length < 3 && sourcePool.length > 0) {
    const pick = sourcePool[Math.floor(Math.random() * sourcePool.length)];
    const m = pick.mean.split(',')[0].trim();
    const key = m.toLowerCase();
    if (seenMeans.has(key)) continue;
    seenMeans.add(key);
    distractors.push(m);
  }
  const correct = card.mean.split(',')[0].trim();
  const tiles = [...distractors, correct]
    .map((t, i) => ({ t, k: Math.random() }))
    .sort((a,b) => a.k - b.k)
    .map(x => x.t);
  return { card, tiles, correctIdx: tiles.indexOf(correct) };
}

const TATopbar = ({ phase, clockMs, score, onQuit }) => {
  const s = Math.max(0, Math.ceil(clockMs / 1000));
  const mm = String(Math.floor(s/60)).padStart(2,'0');
  const ss = String(s%60).padStart(2,'0');
  const danger = phase === 'play' && clockMs <= 10_000 && clockMs > 0;
  return (
    <header className="run-top ta-top">
      <div className="run-top-l">
        <button className="run-quit" onClick={onQuit}>‹ quit</button>
        <span className="run-lbl ta-lbl">▸ TIME ATTACK</span>
      </div>
      <div className={`ta-top-clock${danger ? ' is-danger' : ''}`}>
        {phase === 'play' ? `${mm}:${ss}` : phase === 'pre' ? 'PRE-FLIGHT' : phase === 'ready' ? 'STAND BY' : 'TIME UP'}
      </div>
      <div className="run-top-r">
        <span className="ta-top-score">{phase === 'end' ? 'FINAL' : 'SCORE'} · <b>{score}</b></span>
      </div>
    </header>
  );
};

const TimeAttackApp = ({ cards }) => {
  const [tweaks, setTweaks] = React.useState(() => {
    try {
      const shared = JSON.parse(localStorage.getItem('kb-tweaks') || '{}');
      return { ...TWEAK_DEFAULTS_TA, ...shared };
    } catch(e) { return { ...TWEAK_DEFAULTS_TA }; }
  });

  const [phase, setPhase] = React.useState('pre'); // pre | ready | play | end
  const [countdown, setCountdown] = React.useState(3); // 3-2-1-GO
  const [question, setQuestion] = React.useState(null);
  const [usedIdx, setUsedIdx] = React.useState(() => new Set());
  const [score, setScore] = React.useState(0);
  const [hits, setHits] = React.useState(0);
  const [misses, setMisses] = React.useState(0);
  const [combo, setCombo] = React.useState(0);
  const [maxCombo, setMaxCombo] = React.useState(0);
  const [perfectStreak, setPerfectStreak] = React.useState(false); // completed run w/o miss
  const [clockMs, setClockMs] = React.useState(60_000);
  const [endAt, setEndAt] = React.useState(null);
  const [history, setHistory] = React.useState([]); // [{card, ok, ms}]
  const [tileFeedback, setTileFeedback] = React.useState(null); // {picked, correct}
  const [glitch, setGlitch] = React.useState(false);
  const [comboBurst, setComboBurst] = React.useState(null);
  const [pb, setPb] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem(PB_KEY) || '{}'); } catch(e) { return {}; }
  });
  const [beatPb, setBeatPb] = React.useState(false);
  const [xpGained, setXpGained] = React.useState(0);
  const [confirmQuit, setConfirmQuit] = React.useState(false);
  const questionStart = React.useRef(null);
  const lockedRef = React.useRef(false);
  // Ref (not state) so the ready-phase countdown effect doesn't restart when
  // card_states finish loading — pool is read at game-start time only.
  const cardStatesRef = React.useRef([]);
  const poolRef = React.useRef(null);

  React.useEffect(() => {
    if (!window.DB) return;
    window.DB.open()
      .then(() => window.DB.getAllCardStates())
      .then(s => { cardStatesRef.current = s || []; })
      .catch(() => {});
  }, []);

  // save score + session + XP to DB when game ends
  React.useEffect(() => {
    if (phase !== 'end' || !window.DB) return;
    if (hits + misses === 0) return; // didn't actually play
    const isHot = window.Daily && window.Daily.hotChallengeId() === 'time';
    const cleanBonus = misses === 0 ? TA_XP_CLEAN : 0;
    const pbBonus    = beatPb ? TA_XP_PB : 0;
    const base = Math.max(0,
      hits * TA_XP_HIT + misses * TA_XP_MISS + taComboTier(maxCombo) + cleanBonus + pbBonus
    );
    const earned = Math.round(base * (isHot ? window.Daily.HOT_MULTIPLIER : 1));
    setXpGained(earned);
    window.DB.saveScore({
      mode: 'time_attack',
      score,
      tier: pickTier(score).id,
      duration_s: tweaks.duration,
    }).catch(() => {});
    window.DB.saveSession({
      mode: 'time_attack',
      duration_s: tweaks.duration,
      cards_reviewed: hits + misses,
      hits,
      misses,
      hard: 0,
      xp_earned: earned,
    })
      .then(() => window.DB.grantXp(earned))
      .then(() => window.DB.recordSessionStreak())
      .catch(() => {});
  }, [phase]);

  // apply visual tweaks to body (read-only; settings controls them)
  React.useEffect(() => {
    document.body.dataset.scanlines = tweaks.scanlines;
    document.body.dataset.density = tweaks.density;
  }, [tweaks]);

  const setTweak = (k, v) => setTweaks(t => ({ ...t, [k]: v }));

  const dealNext = React.useCallback((usedSet, pool) => {
    const p = pool || poolRef.current || cards;
    // Pool drained — wipe `used` so the next lap is a clean reshuffle
    // rather than dealQuestion's silent same-card fallback.
    const u = (usedSet && usedSet.size >= p.length) ? new Set() : usedSet;
    if (u !== usedSet) setUsedIdx(u);
    const q = dealQuestion(p, u);
    setQuestion(q);
    setTileFeedback(null);
    lockedRef.current = false;
    questionStart.current = performance.now();
    return q;
  }, [cards]);

  // 3-2-1-GO countdown
  React.useEffect(() => {
    if (phase !== 'ready') return;
    setCountdown(3);
    let n = 3;
    const tick = () => {
      n -= 1;
      if (n <= 0) {
        setCountdown(0);
        // start play
        const end = performance.now() + tweaks.duration * 1000;
        setEndAt(end);
        setClockMs(tweaks.duration * 1000);
        const used = new Set();
        setUsedIdx(used);
        const pool = (window.Daily && window.Daily.nearUserPool)
          ? window.Daily.nearUserPool(cards, cardStatesRef.current)
          : cards;
        poolRef.current = pool;
        dealNext(used, pool);
        setPhase('play');
      } else {
        setCountdown(n);
        setTimeout(tick, 700);
      }
    };
    const t = setTimeout(tick, 700);
    return () => clearTimeout(t);
  }, [phase, tweaks.duration, dealNext]);

  // play clock
  React.useEffect(() => {
    if (phase !== 'play' || endAt == null) return;
    let raf;
    const loop = () => {
      const remaining = endAt - performance.now();
      if (remaining <= 0) {
        setClockMs(0);
        finish(false);
        return;
      }
      setClockMs(remaining);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, endAt]);

  const finish = (perfectFlag) => {
    if (phase === 'end') return;
    setPhase('end');
    setPerfectStreak(perfectFlag);
    // personal best for this duration
    try {
      const prev = pb[tweaks.duration] || 0;
      const next = { ...pb, [tweaks.duration]: Math.max(prev, score) };
      setBeatPb(score > prev && score > 0);
      localStorage.setItem(PB_KEY, JSON.stringify(next));
      setPb(next);
    } catch(e) {}
  };

  const onTilePick = (tileIdx) => {
    if (phase !== 'play' || !question || lockedRef.current) return;
    lockedRef.current = true;
    const ok = tileIdx === question.correctIdx;
    const answerMs = Math.round(performance.now() - questionStart.current);
    setTileFeedback({ picked: tileIdx, correct: question.correctIdx, ok });
    setHistory(h => [...h, { card: question.card, ok, ms: answerMs }]);

    if (ok) {
      // speed bonus: full 3 pts up to 1s, scales down to 1 pt at 3s+
      const base = 1;
      const speed = answerMs <= 1000 ? 2 : answerMs <= 2000 ? 1 : 0;
      const gain = base + speed;
      setScore(s => s + gain);
      setHits(h => h + 1);
      const nc = combo + 1;
      setCombo(nc);
      setMaxCombo(m => Math.max(m, nc));
      if (nc > 0 && nc % 3 === 0) setComboBurst({ n: nc, t: Date.now() });
    } else {
      setMisses(m => m + 1);
      setCombo(0);
      setGlitch(true);
      setTimeout(() => setGlitch(false), 360);
      setEndAt(e => e == null ? e : e - TA_MISS_PENALTY_MS);
    }

    // advance after short reveal
    setTimeout(() => {
      const nextUsed = new Set(usedIdx);
      nextUsed.add(question.card.idx);
      setUsedIdx(nextUsed);
      if (endAt != null && performance.now() >= endAt) return; // clock loop will finish
      dealNext(nextUsed);
    }, ok ? 260 : 420);
  };

  const start = () => { setPhase('ready'); };
  const restart = () => {
    setScore(0); setHits(0); setMisses(0); setCombo(0); setMaxCombo(0);
    setHistory([]); setUsedIdx(new Set()); setBeatPb(false); setQuestion(null);
    setXpGained(0);
    setPhase('ready');
  };
  const goHome = () => { window.location.href = 'Home.html'; };
  const quit = () => {
    if (phase === 'play') { setConfirmQuit(true); return; }
    goHome();
  };

  // keyboard
  React.useEffect(() => {
    const onKey = (e) => {
      if (phase === 'pre') {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); start(); }
      } else if (phase === 'play') {
        if (['1','2','3','4'].includes(e.key)) {
          const i = Number(e.key) - 1;
          onTilePick(i);
        } else if (e.key === 'Escape') { quit(); }
      } else if (phase === 'end') {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); restart(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const shellCls = `run-shell ta-shell variant-game${glitch ? ' is-glitching' : ''}`;
  const tier = React.useMemo(() => pickTier(score), [score]);
  const prevPb = pb[tweaks.duration] || 0;

  return (
    <>
      <div className={shellCls} data-phase={phase}>
        <TATopbar phase={phase} clockMs={clockMs} score={score} onQuit={quit} />

        <main className="run-main ta-main" data-screen-label={`ta-${phase}`}>
          {phase === 'pre' && (
            <TAPre
              duration={tweaks.duration}
              onDuration={(d) => setTweak('duration', d)}
              onStart={start}
              pb={prevPb}
            />
          )}
          {phase === 'ready' && <TAReady n={countdown} variant={tweaks.countdown} />}
          {phase === 'play' && question && (
            <TAPlay
              q={question}
              onPick={onTilePick}
              feedback={tileFeedback}
              clockMs={clockMs}
              totalMs={tweaks.duration * 1000}
              danger={clockMs <= 10_000}
              combo={combo}
              comboBurst={comboBurst}
            />
          )}
          {phase === 'end' && (
            <TAEnd
              score={score}
              hits={hits}
              misses={misses}
              maxCombo={maxCombo}
              duration={tweaks.duration}
              tier={tier}
              prevPb={prevPb}
              beatPb={beatPb}
              xpGained={xpGained}
              history={history}
              timedOut={clockMs <= 0}
              onAgain={restart}
              onHome={() => window.location.href = 'Home.html'}
            />
          )}
        </main>

        {phase === 'play' && <TAHud hits={hits} misses={misses} combo={combo} />}
      </div>

      <ConfirmModal
        open={confirmQuit}
        title="QUIT TIME ATTACK?"
        body="Progress will be lost · score won't save."
        confirmLabel="QUIT"
        cancelLabel="STAY"
        onConfirm={goHome}
        onCancel={() => setConfirmQuit(false)}
      />
    </>
  );
};

Object.assign(window, { TimeAttackApp, pickTier, TIER_TABLE });
