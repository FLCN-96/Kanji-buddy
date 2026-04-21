// Survival orchestrator — single life, depth ladder

const TWEAK_DEFAULTS_SV = {
  scanlines: 'off',
  countdown: 'dissolve',
  promptMode: 'rotate',
};

const PB_KEY_SV = 'kb-sv-pb';

const DEPTH_TIERS = [
  { id: 'LEGEND',  min: 40, color: '#b8f1ff' },
  { id: 'ABYSS',   min: 25, color: '#ff3dff' },
  { id: 'DEEP',    min: 15, color: '#f5a524' },
  { id: 'SHALLOW', min: 0,  color: '#c9d6e2' },
];
const pickDepthTier = (d) => DEPTH_TIERS.find(t => d >= t.min) || DEPTH_TIERS[3];

const jlptForDepth = (d) => {
  if (d < 10) return 5;
  if (d < 20) return 4;
  if (d < 30) return 3;
  if (d < 40) return 2;
  return 1;
};

const PROMPT_MODES = ['mean2k', 'read2k', 'k2mean'];

function dealSurvQuestion(cards, cardStates, used, depth, mode) {
  const targetJlpt = jlptForDepth(depth);
  // Near-user pool keeps brand-new operators away from the full ~80-card
  // JLPT-5 deck; helper handles the "no card_states yet" cold start.
  const tierPool = window.Daily.nearUserPool(cards, cardStates, { jlpt: targetJlpt });
  const nearPool = window.Daily.nearUserPool(cards, cardStates);
  const pool = tierPool.filter(c => !used.has(c.idx));
  const fallback = nearPool.filter(c => !used.has(c.idx));
  // Deep runs may exhaust both filtered pools — relax `used` rather than crash.
  const src = pool.length >= 4
    ? pool
    : (fallback.length >= 4
        ? fallback
        : (tierPool.length ? tierPool : (nearPool.length ? nearPool : cards)));
  const card = src[Math.floor(Math.random() * src.length)];

  const candidates = nearPool.filter(c => c.idx !== card.idx && c.jlpt === card.jlpt);
  const dsrc = candidates.length >= 3 ? candidates : nearPool.filter(c => c.idx !== card.idx);

  let prompt, correct, tilesRaw;
  if (mode === 'mean2k') {
    // show meaning + reading, pick the kanji
    prompt = { kind: 'mean', mean: card.mean.split(',')[0].trim(), reading: (card.kun[0] || card.on[0])?.r || '' };
    correct = card.k;
    const seen = new Set([card.k]);
    const dis = [];
    while (dis.length < 3 && dsrc.length) {
      const p = dsrc[Math.floor(Math.random() * dsrc.length)];
      if (seen.has(p.k)) continue;
      seen.add(p.k); dis.push(p.k);
    }
    tilesRaw = [correct, ...dis];
  } else if (mode === 'read2k') {
    // show reading only, pick the kanji
    const r = (card.kun[0]?.r || card.on[0]?.r || '').replace(/\./g, '');
    prompt = { kind: 'read', reading: r, meaning: null };
    correct = card.k;
    const seen = new Set([card.k]);
    const dis = [];
    while (dis.length < 3 && dsrc.length) {
      const p = dsrc[Math.floor(Math.random() * dsrc.length)];
      if (seen.has(p.k)) continue;
      seen.add(p.k); dis.push(p.k);
    }
    tilesRaw = [correct, ...dis];
  } else {
    // k2mean — show kanji, pick meaning
    prompt = { kind: 'kanji', kanji: card.k };
    correct = card.mean.split(',')[0].trim();
    const seen = new Set([correct.toLowerCase()]);
    const dis = [];
    while (dis.length < 3 && dsrc.length) {
      const p = dsrc[Math.floor(Math.random() * dsrc.length)];
      const m = p.mean.split(',')[0].trim();
      if (seen.has(m.toLowerCase())) continue;
      seen.add(m.toLowerCase()); dis.push(m);
    }
    tilesRaw = [correct, ...dis];
  }
  const tiles = tilesRaw.map(t => ({ t, k: Math.random() })).sort((a,b) => a.k - b.k).map(x => x.t);
  return { card, prompt, tiles, correct, correctIdx: tiles.indexOf(correct) };
}

const SVTopbar = ({ phase, best, onQuit }) => {
  // During play, the layer counter and biometric live inside the play column.
  // The topbar collapses to a hairline strip with the abort affordance only —
  // depth/PB are not part of the negotiation while the trace is running.
  const playing = phase === 'play';
  return (
    <header className={`run-top sv-top${playing ? ' is-play' : ''}`}>
      <div className="run-top-l">
        <button className="run-quit sv-quit" onClick={onQuit} aria-label="abort trace">
          {playing ? '[ABORT]' : '‹ abort'}
        </button>
        {!playing && <span className="run-lbl sv-lbl">// TRACE</span>}
      </div>
      <div className="sv-top-mid" aria-hidden>
        {playing && <span className="sv-top-link">LINK ACTIVE</span>}
      </div>
      <div className="run-top-r">
        {!playing && <span className="sv-top-best">DEEPEST · <b>{String(best).padStart(3,'0')}</b></span>}
      </div>
    </header>
  );
};

const SurvivalApp = ({ cards }) => {
  const [tweaks] = React.useState(() => {
    try {
      const shared = JSON.parse(localStorage.getItem('kb-tweaks') || '{}');
      return { ...TWEAK_DEFAULTS_SV, ...shared };
    } catch(e) { return { ...TWEAK_DEFAULTS_SV }; }
  });

  const [phase, setPhase] = React.useState('pre'); // pre | ready | play | end
  const [countdown, setCountdown] = React.useState(3);
  const [depth, setDepth] = React.useState(0);
  const [question, setQuestion] = React.useState(null);
  const [used, setUsed] = React.useState(() => new Set());
  const [history, setHistory] = React.useState([]);
  const [feedback, setFeedback] = React.useState(null);
  const [heartBreak, setHeartBreak] = React.useState(false);
  const [sectorFlash, setSectorFlash] = React.useState(null);
  const [pb, setPb] = React.useState(() => {
    try { return parseInt(localStorage.getItem(PB_KEY_SV) || '0', 10) || 0; } catch(e) { return 0; }
  });
  const [beatPb, setBeatPb] = React.useState(false);
  const [xpGained, setXpGained] = React.useState(0);
  const [confirmQuit, setConfirmQuit] = React.useState(false);
  const [modeIdx, setModeIdx] = React.useState(0); // for rotate
  // EYES: phone-friendly hesitation tracker. Each second past a depth-scaled
  // threshold (4s at depth 0, ~1.5s at depth 40) ticks eyes by 1. Resets per
  // question. Drives a magenta edge-noise on the prompt at eyes >= 3 — pure
  // cosmetic menace, no gameplay effect.
  const [eyes, setEyes] = React.useState(0);
  const lockedRef = React.useRef(false);
  const qStart = React.useRef(null);
  // Ref (not state) so loading card_states mid-mount doesn't re-trigger the
  // ready-phase countdown effect. Survival reads it at deal-time only.
  const cardStatesRef = React.useRef([]);
  const seenSetRef = React.useRef(new Set());

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

  const pickMode = React.useCallback((d) => {
    if (tweaks.promptMode === 'rotate') {
      return PROMPT_MODES[d % PROMPT_MODES.length];
    }
    return tweaks.promptMode;
  }, [tweaks.promptMode]);

  const dealNext = React.useCallback((usedSet, d) => {
    const mode = pickMode(d);
    const q = dealSurvQuestion(cards, cardStatesRef.current, usedSet, d, mode);
    setQuestion(q);
    setFeedback(null);
    setEyes(0);
    lockedRef.current = false;
    qStart.current = performance.now();
    return q;
  }, [cards, pickMode]);

  // Stall-time → EYES ticker. Threshold shrinks with depth: at depth 0 the
  // system gives 4s before noticing; by depth 40 it's ~1.5s. Ticks every 1s
  // past the threshold while the question is unanswered.
  React.useEffect(() => {
    if (phase !== 'play' || !question || feedback) return;
    const threshold = Math.max(1.5, 4 - (depth / 40) * 2.5) * 1000;
    let ticked = 0;
    const id = setInterval(() => {
      const elapsed = performance.now() - (qStart.current || 0);
      if (elapsed > threshold) {
        ticked += 1;
        setEyes(e => e + 1);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [phase, question, feedback, depth]);

  // 3-2-1 countdown
  React.useEffect(() => {
    if (phase !== 'ready') return;
    setCountdown(3);
    let n = 3;
    const tick = () => {
      n -= 1;
      if (n <= 0) {
        setCountdown(0);
        setDepth(0);
        setHistory([]);
        const u = new Set();
        setUsed(u);
        dealNext(u, 0);
        setPhase('play');
      } else { setCountdown(n); setTimeout(tick, 700); }
    };
    const t = setTimeout(tick, 700);
    return () => clearTimeout(t);
  }, [phase, dealNext]);

  const finish = (depthAtDeath, killer) => {
    setPhase('end');
    try {
      const prev = pb;
      if (depthAtDeath > prev) {
        setBeatPb(true);
        localStorage.setItem(PB_KEY_SV, String(depthAtDeath));
        setPb(depthAtDeath);
      }
    } catch(e) {}
    if (window.DB && depthAtDeath > 0) {
      const isHot = window.Daily && window.Daily.hotChallengeId() === 'survival';
      // Depth-scaled so deeper runs pay more; PB bonus rewards records.
      const base = 40 + depthAtDeath * 3;
      const pbBonus = (depthAtDeath > pb) ? 30 : 0;
      const earned = Math.round((base + pbBonus) * (isHot ? window.Daily.HOT_MULTIPLIER : 1));
      setXpGained(earned);
      window.DB.saveScore({ mode: 'survival', score: depthAtDeath, tier: pickDepthTier(depthAtDeath).id })
        .catch(() => {});
      window.DB.saveSession({
        mode: 'survival',
        duration_s: 0,
        cards_reviewed: depthAtDeath,
        hits: depthAtDeath,
        misses: 1,
        hard: 0,
        xp_earned: earned,
      })
        .then(() => window.DB.grantXp(earned))
        .then(() => window.DB.recordSessionStreak())
        .catch(() => {});
    }
  };

  const onTilePick = (tileIdx) => {
    if (phase !== 'play' || !question || lockedRef.current) return;
    lockedRef.current = true;
    const ok = tileIdx === question.correctIdx;
    const ms = Math.round(performance.now() - qStart.current);
    const entry = { card: question.card, prompt: question.prompt, correct: question.correct, picked: question.tiles[tileIdx], ok, ms };
    setFeedback({ picked: tileIdx, correct: question.correctIdx, ok });
    setHistory(h => [...h, entry]);

    if (ok) {
      const nextDepth = depth + 1;
      setDepth(nextDepth);
      // layer breach (every 10 depth) — JLPT escalates here too
      if (nextDepth > 0 && nextDepth % 10 === 0) {
        const newJlpt = jlptForDepth(nextDepth);
        const oldJlpt = jlptForDepth(nextDepth - 1);
        setSectorFlash({
          depth: nextDepth,
          sector: Math.floor(nextDepth / 10),
          jlpt: newJlpt,
          escalated: newJlpt !== oldJlpt,
          t: Date.now(),
        });
        setTimeout(() => setSectorFlash(null), 1100);
      }
      setTimeout(() => {
        const nu = new Set(used); nu.add(question.card.idx);
        setUsed(nu);
        dealNext(nu, nextDepth);
      }, nextDepth % 10 === 0 ? 900 : 280);
    } else {
      setHeartBreak(true);
      setTimeout(() => finish(depth, question.card), 1400);
    }
  };

  const start = () => { setPhase('ready'); };
  const restart = () => {
    setDepth(0); setUsed(new Set()); setHistory([]);
    setFeedback(null); setHeartBreak(false); setBeatPb(false); setQuestion(null);
    setXpGained(0); setEyes(0);
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
        if (['1','2','3','4'].includes(e.key)) { onTilePick(Number(e.key) - 1); }
        else if (e.key === 'Escape') { quit(); }
      } else if (phase === 'end') {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); restart(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const shellCls = `run-shell sv-shell variant-game${heartBreak ? ' is-breaking' : ''}`;
  const pressure = Math.min(1, depth / 40); // 0..1 dread
  const tier = pickDepthTier(depth);
  const lastEight = history.slice(-8);
  // Pressure bands — drives escalation cosmetics in CSS via data-band.
  // 0: connected (calm). 1: active trace (depth 10+). 2: red alert (depth 25+).
  // 3: breach imminent (depth 40+).
  const band = depth >= 40 ? 3 : depth >= 25 ? 2 : depth >= 10 ? 1 : 0;

  return (
    <>
      <div className={shellCls} data-phase={phase} data-band={band} style={{'--dread': pressure}}>
        <SVTopbar phase={phase} best={pb} onQuit={quit} />

        <main className="run-main sv-main" data-screen-label={`sv-${phase}`}>
          {phase === 'pre' && <SVPre pb={pb} onStart={start} promptMode={tweaks.promptMode} />}
          {phase === 'ready' && <TAReady n={countdown} variant={tweaks.countdown} />}
          {phase === 'play' && question && (
            <SVPlay
              q={question}
              depth={depth}
              jlpt={jlptForDepth(depth)}
              onPick={onTilePick}
              feedback={feedback}
              heartBreak={heartBreak}
              pressure={pressure}
              band={band}
              eyes={eyes}
              sectorFlash={sectorFlash}
              isUnseen={!seenSetRef.current.has(question.card.idx)}
            />
          )}
          {phase === 'end' && (
            <SVEnd
              depth={depth}
              tier={tier}
              beatPb={beatPb}
              prevPb={pb - (beatPb ? depth - pb : 0)}
              killer={history[history.length - 1]?.card}
              history={lastEight}
              xpGained={xpGained}
              onAgain={restart}
              onHome={() => window.location.href = 'Home.html'}
            />
          )}
        </main>

        {/* Dread vignette — intensifies with depth */}
        {phase === 'play' && <div className="sv-vignette" aria-hidden />}
      </div>

      <ConfirmModal
        open={confirmQuit}
        title="ABORT TRACE?"
        body="Connection drops here · layer progress won't save."
        confirmLabel="BURN SESSION"
        cancelLabel="STAY HOT"
        onConfirm={goHome}
        onCancel={() => setConfirmQuit(false)}
      />
    </>
  );
};

Object.assign(window, { SurvivalApp, pickDepthTier, DEPTH_TIERS, jlptForDepth });
