// MATCH — 60s lane match. Pair kanji ↔ meaning OR kanji ↔ reading.
// Wrong pair → -2s penalty. Speed bonus per match.

const TWEAK_DEFAULTS_MT = {
  variant: 'game',
  accent: 'cyan',
  scanlines: 'off',
  density: 'comfortable',
  countdown: 'dissolve',
  boardSize: 7,
  axis: 'mix',
  duration: 60,
};

const PB_KEY_MT = 'kb-mt-pb';

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

// Build N pair entries. Each entry = { id, kanji, side (mean|read), value }
// All values must be unique within the board. `sourcePool` is the
// near-user-frontier slice supplied by the caller (see Daily.nearUserPool).
function buildPairs(sourcePool, n, axis) {
  const pool = (sourcePool || []).filter(c => c.k && c.mean);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const pairs = [];
  const usedValues = new Set();

  for (const c of shuffled) {
    if (pairs.length >= n) break;
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
    pairs.push({ id: `p-${c.idx}-${pairs.length}`, card: c, side, value });
  }
  return pairs;
}

// Topbar — clock + score + penalty pulse
const MTTopbar = ({ timeLeft, total, score, multiplier, penaltyTick, onQuit }) => {
  const sec = Math.max(0, timeLeft / 1000);
  const ss = Math.floor(sec).toString().padStart(2,'0');
  const ms = Math.floor((sec % 1) * 10);
  const pct = Math.max(0, Math.min(1, timeLeft / total));
  const danger = timeLeft < 10000;
  return (
    <header className={`run-top mt-top${penaltyTick ? ' is-penalty' : ''}${danger ? ' is-danger' : ''}`}>
      <div className="run-top-l">
        <button className="run-quit" onClick={onQuit}>‹ abort</button>
        <span className="run-lbl mt-lbl">▸ MATCH</span>
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
        <span className={`mt-pill mt-pill-mult${multiplier > 1 ? ' is-hot' : ''}`}>×{multiplier.toFixed(1)}</span>
        <span className="mt-pill mt-pill-score">{score.toString().padStart(4,'0')}</span>
      </div>
    </header>
  );
};

const MatchApp = ({ cards }) => {
  const [tweaks] = React.useState(() => {
    try {
      const shared = JSON.parse(localStorage.getItem('kb-tweaks') || '{}');
      return { ...TWEAK_DEFAULTS_MT, ...shared };
    } catch(e) { return { ...TWEAK_DEFAULTS_MT }; }
  });

  const [phase, setPhase] = React.useState('pre'); // pre | ready | play | end
  const [countdown, setCountdown] = React.useState(3);
  const [pairs, setPairs] = React.useState([]); // [{id, card, side, value}]
  const [resolved, setResolved] = React.useState({}); // id -> 'matched'
  const [selected, setSelected] = React.useState(null); // {col:'k'|'v', id}
  const [shake, setShake] = React.useState(null); // {kId, vId, until}
  const [pop, setPop] = React.useState([]); // [{id, x, y, t, color}]
  const [poolIdx, setPoolIdx] = React.useState(0); // refill pointer
  const [shufflePool, setShufflePool] = React.useState([]);

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

  const lastMatchAtRef = React.useRef(0);
  const startedAtRef = React.useRef(0);
  const rafRef = React.useRef(0);
  // Ref (not state) so the ready-phase countdown effect doesn't restart when
  // card_states finish loading — Match only reads it at pool-build time.
  const cardStatesRef = React.useRef([]);
  // Cached near-user pool for the current play session — avoids recomputing
  // the helper every shuffle-pool refill.
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

  // Countdown ready phase
  React.useEffect(() => {
    if (phase !== 'ready') return;
    setCountdown(3);
    let n = 3;
    const tick = () => {
      n -= 1;
      if (n <= 0) {
        setCountdown(0);
        // build initial board + pool from the user's frontier slice
        const nearPool = (window.Daily && window.Daily.nearUserPool)
          ? window.Daily.nearUserPool(cards, cardStatesRef.current)
          : cards;
        nearPoolRef.current = nearPool;
        const totalNeeded = Math.min(nearPool.length, Math.max(tweaks.boardSize * 4, 28));
        const pool = buildPairs(nearPool, totalNeeded, tweaks.axis);
        const initial = pool.slice(0, tweaks.boardSize);
        setPairs(initial);
        setShufflePool(pool);
        setPoolIdx(tweaks.boardSize);
        setResolved({});
        setSelected(null);
        setMatches(0); setMisses(0); setScore(0); setCombo(0); setBestCombo(0);
        setMatchHistory([]); setPenaltyTick(false);
        setTimeLeft(tweaks.duration * 1000);
        setBeatPb(false);
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
    let penaltyMs = 0;
    const loop = (now) => {
      const elapsed = now - startTime;
      const remain = total - elapsed - penaltyAccumRef.current;
      if (remain <= 0) {
        setTimeLeft(0);
        endRun('time');
        return;
      }
      setTimeLeft(remain);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, tweaks.duration]);

  const penaltyAccumRef = React.useRef(0);

  const endRun = (reason) => {
    setPhase('end');
    cancelAnimationFrame(rafRef.current);
    if (score > pb) {
      setBeatPb(true);
      try { localStorage.setItem(PB_KEY_MT, String(score)); } catch(e) {}
      setPb(score);
    }
    if (window.DB && matches + misses > 0) {
      const isHot = window.Daily && window.Daily.hotChallengeId() === 'match';
      // Score-scaled base + PB bonus — strong play should be obviously rewarded.
      const base = 20 + score * 2;
      const pbBonus = (score > pb) ? 20 : 0;
      const earned = Math.round((base + pbBonus) * (isHot ? window.Daily.HOT_MULTIPLIER : 1));
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
        .then(() => window.DB.recordSessionStreak())
        .catch(() => {});
    }
  };

  // Refill: when a pair is matched, remove both tiles and pull next from pool
  const replaceWithNext = (matchedIds) => {
    setPairs(prev => {
      let next = [...prev];
      let pIdx = poolIdx;
      let pool = shufflePool;
      const replaced = [];
      for (const id of matchedIds) {
        const slot = next.findIndex(p => p.id === id);
        if (slot >= 0) {
          const src = nearPoolRef.current || cards;
          if (pIdx >= pool.length) {
            // regenerate pool
            const fresh = buildPairs(src, Math.max(tweaks.boardSize * 4, 28), tweaks.axis);
            pool = fresh;
            pIdx = 0;
            setShufflePool(fresh);
          }
          // ensure no value collision with remaining tiles
          let candidate = pool[pIdx++];
          let safety = 0;
          while (safety < 40 && next.some(p => !matchedIds.includes(p.id) && p.value === candidate.value && p.side === candidate.side)) {
            if (pIdx >= pool.length) {
              const fresh = buildPairs(src, Math.max(tweaks.boardSize * 4, 28), tweaks.axis);
              pool = fresh;
              pIdx = 0;
              setShufflePool(fresh);
            }
            candidate = pool[pIdx++];
            safety++;
          }
          next[slot] = candidate;
          replaced.push(candidate);
        }
      }
      setPoolIdx(pIdx);
      return next;
    });
  };

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

      // remove + refill after pop animation
      setTimeout(() => replaceWithNext([kSel]), 360);
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
  };
  const quit = () => {
    if (phase === 'play' && !confirm('Abort match? Score will not save.')) return;
    window.location.href = 'Home.html';
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
      <div className={`run-shell mt-shell variant-${tweaks.variant}`} data-phase={phase}>
        <MTTopbar
          timeLeft={timeLeft}
          total={tweaks.duration * 1000}
          score={score}
          multiplier={multiplier}
          penaltyTick={penaltyTick}
          onQuit={quit}
        />

        <main className="run-main mt-main" data-screen-label={`mt-${phase}`}>
          {phase === 'pre' && <MTPre pb={pb} tweaks={tweaks} onStart={start} />}
          {phase === 'ready' && <TAReady n={countdown} variant={tweaks.countdown} />}
          {phase === 'play' && (
            <MTLanes
              pairs={pairs}
              resolved={resolved}
              selected={selected}
              shake={shake}
              combo={combo}
              onPick={tryMatch}
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

    </>
  );
};

Object.assign(window, { MatchApp });
