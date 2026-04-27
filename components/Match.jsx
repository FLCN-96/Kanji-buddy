// MATCH — 60s lane match. Pair kanji ↔ meaning OR kanji ↔ reading.
// Wrong pair → -2s penalty. Speed bonus per match.
//
// Rounds: the board deals N pairs at once; the player must clear all of
// them before the next set arrives. (The previous one-at-a-time refill
// made new tiles trivial to identify by their entry animation — a giant
// hint that "this is the new one to look at".)

const TWEAK_DEFAULTS_MT = {
  scanlines: 'off',
  countdown: 'dissolve',
  boardSize: 6,
  axis: 'mix',
  duration: 60,
};

const PB_KEY_MT = 'kb-mt-pb';

const MT_XP_BASE  = 15;
const MT_XP_HIT   = 5;
const MT_XP_MISS  = -3;
const MT_XP_CLEAN = 25;
const MT_XP_PB    = 30;
const mtComboTier = (c) =>
  c >= 25 ? 40 : c >= 18 ? 25 : c >= 12 ? 15 : c >= 6 ? 5 : 0;

const HIRA = ['あ','い','う','え','お','か','き','く','け','こ','さ','し','す','せ','そ','た','ち','つ','て','と','な','に','ぬ','ね','の','は','ひ','ふ','へ','ほ','ま','み','む','め','も','や','ゆ','よ','ら','り','る','れ','ろ','わ','を','ん','が','ぎ','ぐ','げ','ご','ざ','じ','ず','ぜ','ぞ','だ','ぢ','づ','で','ど','ば','び','ぶ','べ','ぼ','ぱ','ぴ','ぷ','ぺ','ぽ'];

// Convert katakana reading to hiragana (cleaner for display)
function toHira(s) {
  if (!s) return s;
  return s.replace(/[\u30A1-\u30F6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60)).replace(/\./g, '');
}

// Pick a reading for a card — prefer kun, then on
function pickReading(card) {
  const kuns = (card.kun || []).map(r => r.r).filter(Boolean);
  if (kuns.length) return toHira(kuns[0]);
  const ons = (card.on || []).map(r => r.r).filter(Boolean);
  if (ons.length) return toHira(ons[0]);
  return null;
}

// Build one round of N pair entries. Each entry = { id, card, side, value }.
// `sourcePool` is the near-user-frontier slice from Daily.nearUserPool.
// `seenSet` is the set of card idxs the user has encountered via Run; if
// it has any overlap with the pool, we lead with one familiar card so the
// round always contains an anchor the user knows — prevents "all 6 are
// brand-new" rounds that happen when the frontier slice dominates the pool.
// `roundId` is woven into pair IDs so React remounts every tile between
// rounds and the slide-in animation fires fresh.
function buildRound(sourcePool, n, axis, seenSet, roundId) {
  const pool = (sourcePool || []).filter(c => c.k && c.mean);
  const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
  const familiar = (seenSet && seenSet.size)
    ? shuffle(pool.filter(c => seenSet.has(c.idx)))
    : [];

  // Lead the candidate list with one familiar card (if we have any) so
  // the guarantee holds even when later candidates get skipped for
  // duplicate-value collisions. The leader itself can't collide because
  // usedValues is empty when it's considered.
  const leaderIdx = familiar.length ? familiar[0].idx : null;
  const rest = shuffle(pool.filter(c => c.idx !== leaderIdx));
  const ordered = leaderIdx != null ? [familiar[0], ...rest] : rest;

  const pairs = [];
  const usedValues = new Set();
  const usedCards = new Set();

  for (const c of ordered) {
    if (pairs.length >= n) break;
    if (usedCards.has(c.idx)) continue;
    let side = axis;
    if (axis === 'mix') side = Math.random() < 0.5 ? 'mean' : 'read';
    let value;
    if (side === 'mean') {
      value = c.mean.split(',')[0].trim();
    } else {
      value = pickReading(c);
      if (!value) {
        // fall back to meaning if no reading
        side = 'mean';
        value = c.mean.split(',')[0].trim();
      }
    }
    const key = `${side}:${value}`;
    if (usedValues.has(key)) continue;
    usedValues.add(key);
    usedCards.add(c.idx);
    pairs.push({
      id: `p-${roundId}-${c.idx}-${pairs.length}`,
      card: c,
      side,
      value,
    });
  }
  return pairs;
}

// Topbar — one instrument cluster: abort · timer · mult/combo/score readout.
// The `▸ MATCH` label that used to live between abort and timer is dropped
// in-game: the player just came from the MATCH pre-screen, so repeating the
// mode name is visual noise. Multiplier, combo and score share a single
// bordered module so they read as one readout rather than three floaters.
const MTTopbar = ({ timeLeft, total, score, multiplier, combo, penaltyTick, onQuit }) => {
  const sec = Math.max(0, timeLeft / 1000);
  const ss = Math.floor(sec).toString().padStart(2,'0');
  const ms = Math.floor((sec % 1) * 10);
  const pct = Math.max(0, Math.min(1, timeLeft / total));
  const danger = timeLeft < 10000;
  const hotMult = multiplier > 1;
  const hotCombo = combo >= 5;
  return (
    <header className={`run-top mt-top${penaltyTick ? ' is-penalty' : ''}${danger ? ' is-danger' : ''}`}>
      <div className="run-top-l">
        <button className="run-quit" onClick={onQuit}>‹ abort</button>
      </div>
      <div className="mt-top-clock-wrap">
        <div className="mt-top-clock">
          <span className="mt-clk-ss">{ss}</span>
          <span className="mt-clk-dot">.</span>
          <span className="mt-clk-ms">{ms}</span>
          <span className="mt-clk-unit">s</span>
        </div>
        <div className="mt-top-bar">
          <span className="mt-top-bar-fill" style={{width: `${pct*100}%`}} />
        </div>
      </div>
      <div className="mt-top-r">
        <div className={`mt-hud-cluster${hotMult ? ' is-hot' : ''}${hotCombo ? ' is-combo-hot' : ''}`}>
          <span className="mt-hud-cell mt-hud-mult">×{multiplier.toFixed(1)}</span>
          <span className="mt-hud-cell mt-hud-combo"><span className="mt-hud-cell-lbl">C</span>{combo}</span>
          <span className="mt-hud-cell mt-hud-score">{score.toString().padStart(4,'0')}</span>
        </div>
      </div>
    </header>
  );
};

const MatchApp = ({ cards }) => {
  const [tweaks, setTweaks] = React.useState(() => {
    try {
      const shared = JSON.parse(localStorage.getItem('kb-tweaks') || '{}');
      return { ...TWEAK_DEFAULTS_MT, ...shared };
    } catch(e) { return { ...TWEAK_DEFAULTS_MT }; }
  });
  const setTweak = (k, v) => setTweaks(t => ({ ...t, [k]: v }));

  const [phase, setPhase] = React.useState('pre'); // pre | ready | play | end
  const [countdown, setCountdown] = React.useState(3);
  const [pairs, setPairs] = React.useState([]); // [{id, card, side, value}]
  const [resolved, setResolved] = React.useState({}); // id -> 'matched'
  const [selected, setSelected] = React.useState(null); // {col:'k'|'v', id}
  const [shake, setShake] = React.useState(null); // {kId, vId, until}
  const [pop, setPop] = React.useState([]); // [{id, x, y, t, color}]

  const [timeLeft, setTimeLeft] = React.useState(tweaks.duration * 1000);
  const [matches, setMatches] = React.useState(0);
  const [misses, setMisses] = React.useState(0);
  const [score, setScore] = React.useState(0);
  const [combo, setCombo] = React.useState(0);
  const [bestCombo, setBestCombo] = React.useState(0);
  const [penaltyTick, setPenaltyTick] = React.useState(false);
  const [matchHistory, setMatchHistory] = React.useState([]); // {kanji, value, side, timeMs, score}

  const [pb, setPb] = React.useState(() => {
    try { return parseInt(localStorage.getItem(PB_KEY_MT) || '0', 10) || 0; } catch(e) { return 0; }
  });
  const [beatPb, setBeatPb] = React.useState(false);
  const [xpGained, setXpGained] = React.useState(0);
  const [hotTier, setHotTier] = React.useState(null);
  const [confirmQuit, setConfirmQuit] = React.useState(false);

  const lastMatchAtRef = React.useRef(0);
  const startedAtRef = React.useRef(0);
  const rafRef = React.useRef(0);
  const penaltyAccumRef = React.useRef(0);
  // Guards the end-of-game save effect against re-firing when it sets state
  // (pb, beatPb, xpGained) during its own run.
  const finishedRef = React.useRef(false);
  // Ref (not state) so the ready-phase countdown effect doesn't restart when
  // card_states finish loading — Match only reads it at pool-build time.
  const cardStatesRef = React.useRef([]);
  const seenSetRef = React.useRef(new Set());
  // Cached near-user pool for the current play session — avoids recomputing
  // the helper every round.
  const nearPoolRef = React.useRef(null);
  // Monotonic round counter. Woven into pair IDs so React remounts every
  // tile between rounds and the slide-in animation fires fresh.
  const roundRef = React.useRef(0);

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

  // Countdown ready phase
  React.useEffect(() => {
    if (phase !== 'ready') return;
    setCountdown(3);
    let n = 3;
    const tick = () => {
      n -= 1;
      if (n <= 0) {
        setCountdown(0);
        // Build the first round from the user's frontier slice.
        const nearPool = (window.Daily && window.Daily.nearUserPool)
          ? window.Daily.nearUserPool(cards, cardStatesRef.current)
          : cards;
        nearPoolRef.current = nearPool;
        roundRef.current = 1;
        const initial = buildRound(
          nearPool, tweaks.boardSize, tweaks.axis,
          seenSetRef.current, roundRef.current,
        );
        setPairs(initial);
        setResolved({});
        setSelected(null);
        setMatches(0); setMisses(0); setScore(0); setCombo(0); setBestCombo(0);
        setMatchHistory([]); setPenaltyTick(false);
        setTimeLeft(tweaks.duration * 1000);
        setBeatPb(false);
        setXpGained(0);
        setHotTier(null);
        startedAtRef.current = performance.now();
        lastMatchAtRef.current = performance.now();
        setPhase('play');
      } else { setCountdown(n); setTimeout(tick, 700); }
    };
    const t = setTimeout(tick, 700);
    return () => clearTimeout(t);
  }, [phase, cards, tweaks.boardSize, tweaks.axis, tweaks.duration]);

  // Clock
  React.useEffect(() => {
    if (phase !== 'play') return;
    const startTime = startedAtRef.current;
    const total = tweaks.duration * 1000;
    const loop = (now) => {
      const elapsed = now - startTime;
      const remain = total - elapsed - penaltyAccumRef.current;
      if (remain <= 0) {
        setTimeLeft(0);
        setPhase('end');
        return;
      }
      setTimeLeft(remain);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, tweaks.duration]);

  // End-of-game save. Must live here rather than in the clock loop so the
  // closure captures the final score/matches/misses rather than the zeros
  // they were reset to when phase became 'play'.
  React.useEffect(() => {
    if (phase !== 'end' || !window.DB) return;
    if (finishedRef.current) return;
    if (matches + misses === 0) return;
    finishedRef.current = true;
    const tierAtSave = window.Daily ? window.Daily.hotTier('match') : null;
    const mult       = window.Daily ? window.Daily.hotMultiplier('match') : 1;
    const newBeatPb = score > pb;
    if (newBeatPb) {
      setBeatPb(true);
      try { localStorage.setItem(PB_KEY_MT, String(score)); } catch(e) {}
      setPb(score);
    }
    // Per-pair constants + combo/clean/PB bonuses — same shape as TimeAttack
    // so Match can't dominate the XP economy via runaway score scaling.
    // Mix axis pays +50% (harder — both meaning AND reading must be primed).
    const isMix = tweaks.axis === 'mix';
    const base = Math.max(0,
      MT_XP_BASE
      + matches * MT_XP_HIT
      + misses  * MT_XP_MISS
      + mtComboTier(bestCombo)
      + (misses === 0 && matches > 0 ? MT_XP_CLEAN : 0)
      + (newBeatPb ? MT_XP_PB : 0)
    );
    const withMix = isMix ? Math.round(base * 1.5) : base;
    const earned = Math.round(withMix * mult);
    setXpGained(earned);
    setHotTier(tierAtSave);
    window.DB.saveScore({ mode: 'match', score, duration_s: tweaks.duration }).catch(() => {});
    window.DB.saveSession({
      mode: 'match',
      duration_s: tweaks.duration,
      cards_reviewed: matches + misses,
      hits: matches,
      misses,
      hard: 0,
      xp_earned: earned,
    })
      .then(() => window.DB.grantXp(earned))
      .then(() => { if (tierAtSave && window.Daily) window.Daily.claimHot('match'); })
      .then(() => window.DB.recordSessionStreak())
      .catch(() => {});
  }, [phase]);

  // Round advance: when every pair on the board is matched, wait for the
  // fade-out animation to land (.36s) then deal a fresh round. Delay is a
  // ref rather than magic in the match handler so the effect cleans up
  // correctly if the phase changes (e.g. clock expires) mid-transition.
  React.useEffect(() => {
    if (phase !== 'play') return;
    if (!pairs.length) return;
    const allResolved = pairs.every(p => resolved[p.id]);
    if (!allResolved) return;
    const t = setTimeout(() => {
      const src = nearPoolRef.current || cards;
      roundRef.current += 1;
      const next = buildRound(
        src, tweaks.boardSize, tweaks.axis,
        seenSetRef.current, roundRef.current,
      );
      setPairs(next);
      setResolved({});
      // Reset the speed-bonus clock so the first match of the new round
      // isn't penalized for the round-swap + reading-in time.
      lastMatchAtRef.current = performance.now();
    }, 520);
    return () => clearTimeout(t);
  }, [pairs, resolved, phase, tweaks.boardSize, tweaks.axis, cards]);

  const popAt = (rect, color) => {
    const x = rect.left + rect.width/2;
    const y = rect.top + rect.height/2;
    const id = Math.random().toString(36).slice(2);
    setPop(p => [...p, { id, x, y, color, t: Date.now() }]);
    setTimeout(() => setPop(p => p.filter(x => x.id !== id)), 900);
  };

  const tryMatch = (col, id) => {
    if (phase !== 'play') return;
    if (resolved[id]) return;

    if (!selected) { setSelected({ col, id }); return; }
    if (selected.col === col && selected.id === id) { setSelected(null); return; }
    if (selected.col === col) {
      // clicked same column twice → switch selection
      setSelected({ col, id });
      return;
    }

    // we have one of each column
    const kSel = col === 'k' ? id : selected.id;
    const vSel = col === 'v' ? id : selected.id;
    const kPair = pairs.find(p => p.id === kSel);
    const vPair = pairs.find(p => p.id === vSel);

    if (!kPair || !vPair) { setSelected(null); return; }

    const isMatch = kPair.id === vPair.id; // same entry — but we draw kanji from k-col, value from v-col, matched when same id
    // Actually each pair entry produces both a kanji tile AND a value tile. The id is the same.
    // So a match is simply: kSel === vSel ? Already handled. Real pairs are by entry id.

    const ok = kSel === vSel;
    if (ok) {
      // MATCH
      const now = performance.now();
      const dt = now - lastMatchAtRef.current;
      lastMatchAtRef.current = now;
      const speedSec = Math.max(0.3, dt / 1000);
      // Speed bonus: 100 base + bonus inversely proportional to time. Capped.
      const speedBonus = Math.max(0, Math.round(120 - speedSec * 25));
      const newCombo = combo + 1;
      const mult = 1 + Math.min(2, (newCombo - 1) * 0.1); // +10% per consecutive, cap at 3x
      const gained = Math.round((100 + speedBonus) * mult);
      setScore(s => s + gained);
      setCombo(newCombo);
      setBestCombo(b => Math.max(b, newCombo));
      setMatches(m => m + 1);
      setMatchHistory(h => [...h, {
        kanji: kPair.card.k,
        value: kPair.value,
        side: kPair.side,
        speedSec,
        gained,
        mult,
      }]);
      setResolved(r => ({ ...r, [kSel]: 'matched' }));
      setSelected(null);

      // pop fx
      const kEl = document.querySelector(`[data-tile-id="${kSel}"][data-col="k"]`);
      const vEl = document.querySelector(`[data-tile-id="${kSel}"][data-col="v"]`);
      const colorK = newCombo >= 5 ? 'magenta' : 'cyan';
      if (kEl) popAt(kEl.getBoundingClientRect(), colorK);
      if (vEl) popAt(vEl.getBoundingClientRect(), colorK);
    } else {
      // WRONG
      setMisses(m => m + 1);
      setCombo(0);
      penaltyAccumRef.current += 2000; // -2s
      setPenaltyTick(true);
      setTimeout(() => setPenaltyTick(false), 600);
      setShake({ kId: kSel, vId: vSel, until: Date.now() + 420 });
      setSelected(null);
      setTimeout(() => setShake(null), 440);
    }
  };

  const start = () => setPhase('ready');
  const restart = () => {
    setPhase('ready');
    penaltyAccumRef.current = 0;
    finishedRef.current = false;
    roundRef.current = 0;
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
        if (e.key === 'Escape') { setSelected(null); }
      } else if (phase === 'end') {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); restart(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const multiplier = 1 + Math.min(2, Math.max(0, combo - 1) * 0.1);

  return (
    <>
      <div className="run-shell mt-shell variant-game" data-phase={phase}>
        <MTTopbar
          timeLeft={timeLeft}
          total={tweaks.duration * 1000}
          score={score}
          multiplier={multiplier}
          combo={combo}
          penaltyTick={penaltyTick}
          onQuit={quit}
        />

        <main className="run-main mt-main" data-screen-label={`mt-${phase}`}>
          {phase === 'pre' && <MTPre pb={pb} tweaks={tweaks} onStart={start} onAxis={(v) => setTweak('axis', v)} />}
          {phase === 'ready' && <TAReady n={countdown} variant={tweaks.countdown} />}
          {phase === 'play' && (
            <MTLanes
              pairs={pairs}
              resolved={resolved}
              selected={selected}
              shake={shake}
              axis={tweaks.axis}
              onPick={tryMatch}
              seenSet={seenSetRef.current}
            />
          )}
          {phase === 'end' && (
            <MTEnd
              score={score}
              matches={matches}
              misses={misses}
              bestCombo={bestCombo}
              history={matchHistory}
              beatPb={beatPb}
              pb={pb}
              duration={tweaks.duration}
              axis={tweaks.axis}
              xpGained={xpGained}
              hotTier={hotTier}
              onAgain={restart}
              onHome={() => window.location.href = 'Home.html'}
            />
          )}

          {/* Penalty floater */}
          {penaltyTick && phase === 'play' && (
            <div className="mt-penalty-fx">−2s</div>
          )}

          {/* Pop particles */}
          {pop.map(p => (
            <div
              key={p.id}
              className={`mt-pop mt-pop-${p.color}`}
              style={{left: p.x, top: p.y}}
            >
              {Array.from({length: 8}).map((_, i) => (
                <span key={i} className="mt-pop-shard" style={{'--a': `${i * 45}deg`}} />
              ))}
            </div>
          ))}
        </main>
      </div>

      <ConfirmModal
        open={confirmQuit}
        title="ABORT MATCH?"
        body="Score won't save."
        confirmLabel="ABORT"
        cancelLabel="STAY"
        onConfirm={goHome}
        onCancel={() => setConfirmQuit(false)}
      />
    </>
  );
};

Object.assign(window, { MatchApp });
