// DECIPHER — key the word. Build the target word kanji-by-kanji from a 9-tile
// bank. 5 lives, infinite depth. As depth rises, the word pool tips from the
// operator's mature kanji toward new/unknown ones (driven by card_state).
//
// Word source: data/kanji-words.json (JMdict-derived, ranked by `pri`).
// Distractor source: same-JLPT-tier kanji from cards.json, preferring ones
// the operator has already seen so the bank reads as familiar territory.

const TWEAK_DEFAULTS_DC = {
  scanlines: 'off',
  countdown: 'dissolve',
};

const PB_KEY_DC = 'kb-dc-pb';

// XP — tuned to sit between Match (clean ~80) and Survival (depth-12 ~150).
// See plan file for sanity-check math; keep these tweaks in sync with the
// matching constants in DCScreens.jsx so the end-screen breakdown adds up
// to the actually-granted amount.
const DC_XP_PER_WORD   = 6;
const DC_XP_DEPTH_STEP = 2;
const DC_XP_LIVES_KEEP = 8;
const DC_XP_PB         = 30;
const DC_XP_FLAWLESS   = 20;

const DC_LIVES_MAX     = 5;
const DC_MATURE_DAYS   = 21; // mirrors data/srs.js MATURE_DAYS

// ────────────────────────────────────────────────────────────────────
// Word pool helpers
// ────────────────────────────────────────────────────────────────────

// Build a flat, deduped, decomposable word pool from the kanji-words JSON.
// Skips entries with kana-only chunks or kanji not in cards.json (a JMdict
// word can reference a glyph our deck doesn't carry).
function buildWordPool(cards, kanjiWords) {
  const kanjiToCard = new Map();
  for (const c of cards) kanjiToCard.set(c.k, c);

  const pool = [];
  const seenWord = new Set();
  for (const idxStr of Object.keys(kanjiWords)) {
    const entries = kanjiWords[idxStr];
    if (!entries) continue;
    for (const e of entries) {
      if (!e || !e.w) continue;
      if (seenWord.has(e.w)) continue;
      seenWord.add(e.w);
      const idxs = [];
      let ok = true;
      for (const ch of e.w) {
        const card = kanjiToCard.get(ch);
        if (!card) { ok = false; break; }
        idxs.push(card.idx);
      }
      if (!ok) continue;
      if (idxs.length < 2 || idxs.length > 4) continue;
      pool.push({
        w: e.w,
        r: e.r || '',
        m: e.m || '',
        pri: e.pri || 0,
        idxs,
        length: idxs.length,
      });
    }
  }
  return pool;
}

// Per-word difficulty score. Mature kanji = 0, learning = 1, never-seen = 3.
// Sum across the word; higher = harder. Same idea as Survival's depth scaler
// but at word granularity.
function scoreWord(word, statesMap) {
  let s = 0;
  for (const idx of word.idxs) {
    const st = statesMap.get(idx);
    if (!st) { s += 3; continue; }
    if ((st.interval_days || 0) >= DC_MATURE_DAYS) s += 0;
    else s += 1;
  }
  return s;
}

// Group the word pool by difficulty score; within each bucket, sort by JMdict
// frequency descending so we hand out the most recognizable words first.
function bucketPoolByScore(pool, statesMap) {
  const buckets = new Map(); // score → words[]
  for (const w of pool) {
    const s = scoreWord(w, statesMap);
    if (!buckets.has(s)) buckets.set(s, []);
    buckets.get(s).push(w);
  }
  for (const arr of buckets.values()) {
    arr.sort((a, b) => (b.pri || 0) - (a.pri || 0));
  }
  return buckets;
}

// Pick the next word for a given depth. Target score grows with depth so the
// pool drifts from all-mature kanji toward unknown ones. Widens the window
// when the chosen bucket is exhausted so a long run never starves.
function pickWordForDepth(buckets, depth, usedWords) {
  const target = Math.min(9, Math.floor(depth / 3));
  // Try in order: [target, target-1, target+1, target-2, target+2, ...]
  const order = [target];
  for (let i = 1; i <= 12; i++) {
    if (target - i >= 0) order.push(target - i);
    order.push(target + i);
  }
  for (const s of order) {
    const arr = buckets.get(s);
    if (!arr || !arr.length) continue;
    const fresh = arr.filter(w => !usedWords.has(w.w));
    if (!fresh.length) continue;
    // Sample from a generous window so back-to-back runs don't loop on the
    // same dozen top-pri words. The window is at least 80 entries (or the
    // whole bucket if smaller), and a soft top-bias keeps common words more
    // likely without locking out the long tail — `Math.random()²` skews
    // toward 0, so ≈50% of picks land in the top 1/4 of the window while
    // every position is still reachable.
    const window = Math.min(fresh.length, Math.max(80, Math.floor(fresh.length * 0.4)));
    const skew = Math.random() * Math.random();
    return fresh[Math.floor(skew * window)];
  }
  // Last-ditch fallback: any unused word, anywhere.
  for (const arr of buckets.values()) {
    for (const w of arr) {
      if (!usedWords.has(w.w)) return w;
    }
  }
  return null;
}

// Build a 9-tile bank: N answer kanji + (9 - N) distractors. Prefer
// same-JLPT-tier kanji the operator has seen (so the bank reads as
// familiar); fall back to same-tier unseen, then any kanji from the deck.
function buildBank(word, cards, statesMap) {
  const answerIdxs = new Set(word.idxs);
  const answerCards = word.idxs.map(i => cards[i - 1]).filter(Boolean);
  const need = 9 - answerCards.length;
  const tiers = new Set(answerCards.map(c => c.jlpt));

  const sameTier = cards.filter(c =>
    !answerIdxs.has(c.idx) && tiers.has(c.jlpt) && c.k
  );
  const seen = sameTier.filter(c => {
    const st = statesMap.get(c.idx);
    return st && (st.reviews || 0) > 0;
  });
  const unseen = sameTier.filter(c => {
    const st = statesMap.get(c.idx);
    return !st || (st.reviews || 0) === 0;
  });

  const shuffle = (arr) => {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  const pool = [];
  pool.push(...shuffle(seen));
  pool.push(...shuffle(unseen));
  // Last-resort fallback: anything in the deck so we never under-fill.
  if (pool.length < need) {
    pool.push(...shuffle(cards.filter(c =>
      !answerIdxs.has(c.idx) && !pool.includes(c) && c.k
    )));
  }

  const seenK = new Set(answerCards.map(c => c.k));
  const distractors = [];
  for (const c of pool) {
    if (distractors.length >= need) break;
    if (seenK.has(c.k)) continue;
    seenK.add(c.k);
    distractors.push(c);
  }

  return shuffle([...answerCards, ...distractors]);
}

// Wordle-style classification. For each pick position, returns 'green' (right
// kanji, right slot), 'yellow' (kanji is in the word, but not at this slot),
// or 'gray' (kanji is not in the word at all). Implements the standard
// duplicate-aware pass: greens consume their targets first, then yellows
// only count each remaining target instance once. Matters for words like
// 佐々木 where 々 appears once but a user could pick it twice.
function classifyPicks(picks, bank, word) {
  const status = new Array(picks.length).fill('gray');
  const remaining = word.idxs.slice();
  const pickIdxs = picks.map(p => bank[p].idx);
  for (let i = 0; i < picks.length; i++) {
    if (pickIdxs[i] === remaining[i]) {
      status[i] = 'green';
      remaining[i] = null;
    }
  }
  for (let i = 0; i < picks.length; i++) {
    if (status[i] !== 'gray') continue;
    const j = remaining.indexOf(pickIdxs[i]);
    if (j !== -1) {
      status[i] = 'yellow';
      remaining[j] = null;
    }
  }
  return status;
}

// First non-locked, non-filled slot — i.e., the next blank the operator's
// pick will land in. Returns -1 when every blank is either locked or already
// holds a pick (i.e., the round is ready for auto-check).
function nextOpenSlot(picks, locks) {
  for (let i = 0; i < picks.length; i++) {
    if (locks.has(i)) continue;
    if (picks[i] == null) return i;
  }
  return -1;
}

// ────────────────────────────────────────────────────────────────────
// Topbar — abort · DECIPHER label · lives · depth
// ────────────────────────────────────────────────────────────────────

const DCTopbar = ({ phase, lives, depth, best, onQuit }) => {
  const playing = phase === 'play';
  return (
    <header className={`run-top dc-top${playing ? ' is-play' : ''}`}>
      <div className="run-top-l">
        <button className="run-quit dc-quit" onClick={onQuit} aria-label="abort decode">
          {playing ? '[ABORT]' : '‹ abort'}
        </button>
        {!playing && <span className="run-lbl dc-lbl">// DECIPHER</span>}
      </div>
      <div className="dc-top-mid" aria-hidden>
        {playing && (
          <div className="dc-top-lives" aria-label={`${lives} lives remaining`}>
            {Array.from({ length: DC_LIVES_MAX }).map((_, i) => (
              <span
                key={i}
                className={`dc-life${i < lives ? '' : ' is-out'}`}
                aria-hidden
              >
                {i < lives ? '♥' : '✖'}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="run-top-r">
        {playing
          ? <span className="dc-top-depth">DEPTH · <b>{String(depth).padStart(3, '0')}</b></span>
          : <span className="dc-top-best">DEEPEST · <b>{String(best).padStart(3, '0')}</b></span>}
      </div>
    </header>
  );
};

// ────────────────────────────────────────────────────────────────────
// Orchestrator
// ────────────────────────────────────────────────────────────────────

const DecipherApp = ({ cards, words }) => {
  const [tweaks, setTweaks] = React.useState(() => {
    try {
      const shared = JSON.parse(localStorage.getItem('kb-tweaks') || '{}');
      return { ...TWEAK_DEFAULTS_DC, ...shared };
    } catch (e) { return { ...TWEAK_DEFAULTS_DC }; }
  });

  const [phase, setPhase] = React.useState('pre'); // pre | ready | play | end
  const [countdown, setCountdown] = React.useState(3);

  const [lives, setLives] = React.useState(DC_LIVES_MAX);
  const [depth, setDepth] = React.useState(0);
  const [round, setRound] = React.useState(null); // { word, bank, picks, feedback }
  const [usedWords, setUsedWords] = React.useState(() => new Set());
  const [history, setHistory] = React.useState([]); // {word, ok, lives, depth}

  const [pb, setPb] = React.useState(() => {
    try { return parseInt(localStorage.getItem(PB_KEY_DC) || '0', 10) || 0; }
    catch (e) { return 0; }
  });
  const [beatPb, setBeatPb] = React.useState(false);
  const [xpGained, setXpGained] = React.useState(0);
  const [hotTier, setHotTier] = React.useState(null);
  const [confirmQuit, setConfirmQuit] = React.useState(false);

  // Refs: card_states for difficulty scoring + distractor selection.
  // Ref (not state) so loading card_states mid-mount doesn't re-trigger the
  // ready-phase countdown effect — Decipher reads it at deal-time only.
  const cardStatesRef = React.useRef([]);
  const statesMapRef  = React.useRef(new Map());
  const wordPoolRef   = React.useRef([]);
  const bucketsRef    = React.useRef(new Map());
  const finishedRef   = React.useRef(false);
  const lockedRef     = React.useRef(false); // blocks taps during correct/wrong delay

  React.useEffect(() => {
    if (!window.DB) return;
    window.DB.recordModeStart('decipher').catch(() => {});
    window.DB.open()
      .then(() => window.DB.getAllCardStates())
      .then(s => {
        cardStatesRef.current = s || [];
        const m = new Map();
        for (const st of cardStatesRef.current) {
          if (st && st.idx != null) m.set(st.idx, st);
        }
        statesMapRef.current = m;
      })
      .catch(() => {});
  }, []);

  // Build the word pool once (cheap-ish; ~5k words after filtering).
  React.useEffect(() => {
    if (!cards || !cards.length || !words) return;
    wordPoolRef.current = buildWordPool(cards, words);
    // Buckets get rebuilt at ready-phase so the freshest card_states drive
    // difficulty (the IDB read above may resolve after this effect runs).
  }, [cards, words]);

  React.useEffect(() => {
    document.body.dataset.scanlines = tweaks.scanlines;
  }, [tweaks]);

  const dealRound = React.useCallback((nextDepth, used) => {
    const buckets = bucketsRef.current;
    const word = pickWordForDepth(buckets, nextDepth, used);
    if (!word) return null; // run out of words — treated as game-over upstream
    const bank = buildBank(word, cards, statesMapRef.current);
    return {
      word, bank,
      // Slot-indexed: picks[i] is the bank idx chosen for slot i, or null.
      picks:      new Array(word.length).fill(null),
      locks:      new Set(),  // slot indices the operator has already nailed
      eliminated: new Set(),  // bank tile idxs ruled out (dummy in last commit)
      status:     null,       // per-slot Wordle status during 'bad' feedback
      feedback:   null,
    };
  }, [cards]);

  // 3-2-1 countdown → first round
  React.useEffect(() => {
    if (phase !== 'ready') return;
    setCountdown(3);
    let n = 3;
    const tick = () => {
      n -= 1;
      if (n <= 0) {
        setCountdown(0);
        // Rebuild buckets from the latest card_states so difficulty is fresh.
        bucketsRef.current = bucketPoolByScore(wordPoolRef.current, statesMapRef.current);
        const used = new Set();
        setUsedWords(used);
        setDepth(0);
        setLives(DC_LIVES_MAX);
        setHistory([]);
        setBeatPb(false);
        setXpGained(0);
        setHotTier(null);
        finishedRef.current = false;
        lockedRef.current = false;
        const r = dealRound(0, used);
        setRound(r);
        setPhase('play');
      } else {
        setCountdown(n);
        setTimeout(tick, 700);
      }
    };
    const t = setTimeout(tick, 700);
    return () => clearTimeout(t);
  }, [phase, dealRound]);

  // End-of-game save. Lives inside an effect so the closure captures the
  // final depth/lives rather than the post-reset zero values.
  React.useEffect(() => {
    if (phase !== 'end' || !window.DB) return;
    if (finishedRef.current) return;
    if (depth === 0 && lives === DC_LIVES_MAX) return; // no real play occurred
    finishedRef.current = true;

    const tierAtSave = window.Daily ? window.Daily.hotTier('decipher') : null;
    const mult       = window.Daily ? window.Daily.hotMultiplier('decipher') : 1;

    const newBeatPb = depth > pb;
    if (newBeatPb) {
      setBeatPb(true);
      try { localStorage.setItem(PB_KEY_DC, String(depth)); } catch (e) {}
      setPb(depth);
    }

    const wordsSolved = depth;
    const livesKept = lives; // 0 if you bottomed out
    const flawless = livesKept === DC_LIVES_MAX && depth >= 10 ? DC_XP_FLAWLESS : 0;
    const base = Math.max(0,
      wordsSolved * DC_XP_PER_WORD
      + depth * DC_XP_DEPTH_STEP
      + livesKept * DC_XP_LIVES_KEEP
      + (newBeatPb ? DC_XP_PB : 0)
      + flawless
    );
    const earned = Math.round(base * mult);
    setXpGained(earned);
    setHotTier(tierAtSave);

    // Burn the gold synchronously — claim is just a localStorage write and
    // must not depend on the IDB chain below resolving (iOS PWA can suspend
    // or navigate away before saveSession/grantXp finish, leaving the flag
    // unwritten and every run stuck on gold). Matches the Match/TA pattern.
    if (tierAtSave && window.Daily) window.Daily.claimHot('decipher');

    window.DB.saveScore({ mode: 'decipher', score: depth }).catch(() => {});
    window.DB.saveSession({
      mode: 'decipher',
      duration_s: 0,
      cards_reviewed: wordsSolved,
      hits: wordsSolved,
      misses: DC_LIVES_MAX - livesKept,
      hard: 0,
      xp_earned: earned,
    })
      .then(() => window.DB.grantXp(earned))
      .then(() => window.DB.recordSessionStreak())
      .catch(() => {});
  }, [phase, depth, lives, pb]);

  // Tile pick: drop into the next open (non-locked, empty) slot. If every
  // slot is now occupied, auto-check. Refuses re-picks (the same bank tile
  // already in `picks`) and eliminated tiles (ruled out by a prior commit).
  const onPickTile = (tileIdx) => {
    if (phase !== 'play' || !round || lockedRef.current) return;
    if (round.feedback) return;
    if (round.eliminated.has(tileIdx)) return;
    if (round.picks.includes(tileIdx)) return;
    const slot = nextOpenSlot(round.picks, round.locks);
    if (slot === -1) return;

    const nextPicks = round.picks.slice();
    nextPicks[slot] = tileIdx;
    const allFilled = nextPicks.every(p => p != null);

    if (!allFilled) {
      setRound({ ...round, picks: nextPicks });
      return;
    }

    // Auto-check on last blank fill.
    const guessKanji = nextPicks.map(i => round.bank[i].k).join('');
    const ok = guessKanji === round.word.w;
    lockedRef.current = true;

    if (ok) {
      setRound({ ...round, picks: nextPicks, feedback: 'ok' });
      const nextDepth = depth + 1;
      setDepth(nextDepth);
      setHistory(h => [...h, {
        w: round.word.w, r: round.word.r, m: round.word.m,
        ok: true, lives, depth: nextDepth,
      }]);
      // Decipher operates on multi-kanji words — log one 'hit' per kanji
      // in the committed word so the evidence log captures word-spelling
      // wins at the kanji level.
      if (window.DB && Array.isArray(round.word.idxs)) {
        for (const kIdx of round.word.idxs) {
          window.DB.recordCardEvent({
            idx: kIdx, mode: 'decipher', outcome: 'hit',
            meta: { word: round.word.w, depth: nextDepth },
          }).catch(() => {});
        }
      }
      const newUsed = new Set(usedWords); newUsed.add(round.word.w);
      setUsedWords(newUsed);
      setTimeout(() => {
        const next = dealRound(nextDepth, newUsed);
        if (!next) {
          // Word library exhausted — end the run as a clean clear.
          setPhase('end');
          return;
        }
        setRound(next);
        lockedRef.current = false;
      }, 620);
    } else {
      // Wordle-style triage: greens lock into their slots permanently,
      // yellow tiles flash and clear (kanji is somewhere else), grays get
      // pulled from the bank (kanji isn't in the word at all).
      const status = classifyPicks(nextPicks, round.bank, round.word);
      const newLocks = new Set(round.locks);
      const newEliminated = new Set(round.eliminated);
      for (let i = 0; i < status.length; i++) {
        if (status[i] === 'green') newLocks.add(i);
        else if (status[i] === 'gray') newEliminated.add(nextPicks[i]);
      }

      const nextLives = lives - 1;
      setHistory(h => [...h, {
        w: round.word.w, r: round.word.r, m: round.word.m,
        ok: false, lives: nextLives, depth,
      }]);
      // Wrong commit — log a 'miss' per kanji in the word. Same level of
      // detail as the ok branch so per-kanji hit-rates compute symmetrically.
      if (window.DB && Array.isArray(round.word.idxs)) {
        for (const kIdx of round.word.idxs) {
          window.DB.recordCardEvent({
            idx: kIdx, mode: 'decipher', outcome: 'miss',
            meta: { word: round.word.w, depth },
          }).catch(() => {});
        }
      }
      setLives(nextLives);
      setRound({
        ...round,
        picks: nextPicks,
        feedback: 'bad',
        status,
        locks: newLocks,
        eliminated: newEliminated,
      });

      setTimeout(() => {
        if (nextLives <= 0) { setPhase('end'); return; }
        // Drop non-locked picks so the operator gets another swing with the
        // locked greens already in place and the dummies removed from the
        // bank. Locks/eliminated persist across attempts on the same word.
        setRound(r => {
          if (!r) return r;
          const cleared = r.picks.map((p, i) => newLocks.has(i) ? p : null);
          return { ...r, picks: cleared, feedback: null, status: null };
        });
        lockedRef.current = false;
      }, 1100);
    }
  };

  const onClear = () => {
    if (phase !== 'play' || !round || lockedRef.current) return;
    if (round.feedback) return;
    const cleared = round.picks.map((p, i) => round.locks.has(i) ? p : null);
    // Bail if there's nothing to clear (everything is either empty or locked).
    if (cleared.every((p, i) => p === round.picks[i])) return;
    setRound({ ...round, picks: cleared });
  };

  // Skip current word — burns a life. Gives the operator an out when a word
  // is just unparseable rather than forcing 5 wrong commits to advance.
  const onSkip = () => {
    if (phase !== 'play' || !round || lockedRef.current) return;
    if (round.feedback) return;
    lockedRef.current = true;
    const nextLives = lives - 1;
    setHistory(h => [...h, {
      w: round.word.w, r: round.word.r, m: round.word.m,
      ok: false, lives: nextLives, depth, skipped: true,
    }]);
    setLives(nextLives);
    const newUsed = new Set(usedWords); newUsed.add(round.word.w);
    setUsedWords(newUsed);
    setTimeout(() => {
      if (nextLives <= 0) { setPhase('end'); return; }
      const next = dealRound(depth, newUsed);
      if (!next) { setPhase('end'); return; }
      setRound(next);
      lockedRef.current = false;
    }, 420);
  };

  const start = () => setPhase('ready');
  const restart = () => {
    setLives(DC_LIVES_MAX); setDepth(0); setRound(null); setUsedWords(new Set());
    setHistory([]); setBeatPb(false); setXpGained(0); setHotTier(null);
    finishedRef.current = false;
    setPhase('ready');
  };
  const goHome = () => { window.location.href = 'Home.html'; };
  const quit = () => {
    if (phase === 'play') { setConfirmQuit(true); return; }
    goHome();
  };

  // Keyboard: 1-9 tile pick, U/Backspace clear, Esc abort.
  React.useEffect(() => {
    const onKey = (e) => {
      if (phase === 'pre') {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); start(); }
      } else if (phase === 'play') {
        if (e.key >= '1' && e.key <= '9') {
          onPickTile(Number(e.key) - 1);
        } else if (e.key === 'Backspace' || e.key === 'u' || e.key === 'U') {
          onClear();
        } else if (e.key === 'Escape') {
          quit();
        }
      } else if (phase === 'end') {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); restart(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <>
      <div className="run-shell dc-shell variant-game" data-phase={phase}>
        <DCTopbar
          phase={phase}
          lives={lives}
          depth={depth}
          best={pb}
          onQuit={quit}
        />

        <main className="run-main dc-main" data-screen-label={`dc-${phase}`}>
          {phase === 'pre' && <DCPre pb={pb} onStart={start} />}
          {phase === 'ready' && <TAReady n={countdown} variant={tweaks.countdown} />}
          {phase === 'play' && round && (
            <DCPlay
              word={round.word}
              bank={round.bank}
              picks={round.picks}
              locks={round.locks}
              eliminated={round.eliminated}
              status={round.status}
              feedback={round.feedback}
              depth={depth}
              lives={lives}
              onPick={onPickTile}
              onClear={onClear}
              onSkip={onSkip}
            />
          )}
          {phase === 'end' && (
            <DCEnd
              depth={depth}
              livesKept={lives}
              history={history}
              beatPb={beatPb}
              pb={pb}
              xpGained={xpGained}
              hotTier={hotTier}
              onAgain={restart}
              onHome={goHome}
            />
          )}
        </main>
      </div>

      <ConfirmModal
        open={confirmQuit}
        title="ABORT DECODE?"
        body="Connection drops here · depth won't save."
        confirmLabel="BURN SESSION"
        cancelLabel="STAY HOT"
        onConfirm={goHome}
        onCancel={() => setConfirmQuit(false)}
      />
    </>
  );
};

Object.assign(window, {
  DecipherApp,
  buildWordPool, scoreWord, bucketPoolByScore, pickWordForDepth, buildBank,
  classifyPicks, nextOpenSlot,
});
