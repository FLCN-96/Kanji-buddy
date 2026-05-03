// STREAK INJECT — recover a lost streak via 15-card flashcard gauntlet.
// Hits ≥ ACC_THRESHOLD trigger an RNG roll for actual recovery; everything
// else is a hard fail. Does NOT touch card_states (no SRS writes) and does
// NOT call recordSessionStreak — DB.restoreStreakTo handles the patch
// directly. Consolation XP is paid for accuracy success even when the
// roll rejects, so 12 of 15 isn't pure waste.

const INJECT_SIZE        = 15;
const ACC_THRESHOLD      = 12;       // 80% of INJECT_SIZE
const CONSOLATION_XP     = 60;       // accuracy met but RNG rejected
const SUCCESS_XP         = 0;        // streak itself is the prize on win

const TWEAK_DEFAULTS_INJ = {
  scanlines: 'off',
  romaji:    'off',
};

const SCRAMBLE_GLYPHS = '#@%&$*?!§¥+=<>/\\|×01';
const randGlyph = () => SCRAMBLE_GLYPHS[Math.floor(Math.random() * SCRAMBLE_GLYPHS.length)];

// Build a 15-card review pool. Priority: due → leech → recently-reviewed
// mature filler from nearUserPool. Never pure-new: gambling a streak on a
// kanji you've literally never seen would be cruel even by this mode's
// standards. Falls back to nearUserPool slice when due+leech are too thin.
const buildInjectDeck = (cards, states, n) => {
  const size = n || INJECT_SIZE;
  const byIdx = new Map(cards.map(c => [c.idx, c]));
  const seenStates = (states || []).filter(s => s && s.idx != null && byIdx.has(s.idx));
  const nowIso = new Date().toISOString();

  const leech = [];
  const due   = [];
  const seen  = [];
  for (const s of seenStates) {
    seen.push(s);
    if ((s.lapses || 0) >= 3) leech.push(s);
    else if (s.due_date && s.due_date <= nowIso) due.push(s);
  }
  due.sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
  leech.sort((a, b) => (b.lapses || 0) - (a.lapses || 0));

  const used = new Set();
  const take = (list, max) => {
    const out = [];
    for (const s of list) {
      if (out.length >= max) break;
      if (used.has(s.idx)) continue;
      used.add(s.idx);
      out.push(byIdx.get(s.idx));
    }
    return out;
  };

  const dueSel   = take(due,   Math.ceil(size * 0.5));
  const leechSel = take(leech, Math.ceil(size * 0.3));
  const seenSel  = take(seen,  size);

  let pool = [...dueSel, ...leechSel, ...seenSel];
  if (pool.length < size && window.Daily) {
    const near = window.Daily.nearUserPool(cards, states, { minPool: 200 });
    for (const c of near) {
      if (pool.length >= size) break;
      if (used.has(c.idx)) continue;
      used.add(c.idx);
      pool.push(c);
    }
  }
  pool = pool.slice(0, size);

  // Shuffle so the order doesn't telegraph difficulty (leech-heavy stretch
  // would feel rigged).
  return pool.map(c => ({ c, k: Math.random() }))
    .sort((a, b) => a.k - b.k)
    .map(x => x.c);
};

const InjectTopbar = ({ phase, idx, total, onQuit }) => {
  const lblByPhase = {
    pre:   'INJECT · pre-flight',
    quiz:  `${String(Math.min(idx + 1, total)).padStart(2,'0')} / ${String(total).padStart(2,'0')}`,
    splash:'INJECTING…',
    end:   'COMPLETE',
  };
  return (
    <header className="run-top inj-top">
      <div className="run-top-l">
        <button className="run-quit" onClick={onQuit}>‹ quit</button>
        <span className="run-lbl inj-lbl">▸ STREAK INJECT</span>
      </div>
      <div className="run-timer inj-timer">{lblByPhase[phase] || ''}</div>
      <div className="run-top-r">
        <span className="inj-live-dot" aria-hidden />
        <span className="inj-live-lbl">RISK</span>
      </div>
    </header>
  );
};

const InjectPre = ({ snap, oddsPct, attemptsLeft, attemptsMax, onStart }) => (
  <section className="inj-pre" data-screen-label="inj-pre">
    <div className="inj-pre-frame">
      <div className="inj-pre-banner">
        <span className="inj-pre-banner-skull" aria-hidden>☠</span>
        <span className="inj-pre-banner-txt">CHAIN @ {snap.lostStreak}d · CORRUPTED</span>
        <span className="inj-pre-banner-skull" aria-hidden>☠</span>
      </div>
      <div className="inj-pre-grid">
        <div className="inj-pre-stat">
          <div className="inj-pre-stat-k">SIZE</div>
          <div className="inj-pre-stat-v">{INJECT_SIZE}</div>
          <div className="inj-pre-stat-s">cards</div>
        </div>
        <div className="inj-pre-stat">
          <div className="inj-pre-stat-k">PASS</div>
          <div className="inj-pre-stat-v">{ACC_THRESHOLD}/{INJECT_SIZE}</div>
          <div className="inj-pre-stat-s">≥ 80%</div>
        </div>
        <div className="inj-pre-stat is-odds">
          <div className="inj-pre-stat-k">RECOVER</div>
          <div className="inj-pre-stat-v">{oddsPct}%</div>
          <div className="inj-pre-stat-s">on pass</div>
        </div>
        <div className="inj-pre-stat">
          <div className="inj-pre-stat-k">ATTEMPTS</div>
          <div className="inj-pre-stat-v">{attemptsLeft}/{attemptsMax}</div>
          <div className="inj-pre-stat-s">today</div>
        </div>
      </div>
      <div className="inj-pre-warn">
        <div className="inj-pre-warn-row">▸ no SRS writes · review only</div>
        <div className="inj-pre-warn-row">▸ pass + roll fail → +{CONSOLATION_XP} XP consolation</div>
        <div className="inj-pre-warn-row">▸ each failed attempt bumps recover odds +5% (cap 50%)</div>
      </div>
      <button className="inj-pre-go" onClick={onStart}>
        <span className="inj-pre-go-txt">▸ INJECT</span>
        <span className="inj-pre-go-sub">space · enter</span>
      </button>
    </div>
  </section>
);

// Reveal-first card — same affordance as Run, but verdict is binary
// (MISS / GOT IT). Keeping it simple because there is no SRS to grade
// into; HARD/EASY would just be flavor here.
const InjectCard = ({ card, revealed, onReveal, idx, total }) => {
  if (!card) return null;
  const handleClick = () => { if (!revealed) onReveal(); };
  return (
    <div
      className={`run-card inj-card${revealed ? ' revealed' : ' is-tap'}`}
      data-screen-label="inj-card"
      onClick={handleClick}
      role={!revealed ? 'button' : undefined}
      tabIndex={!revealed ? 0 : undefined}
    >
      <div className="run-card-strip inj-strip">
        <span>▸ INJECT · <b>#{String(card.idx).padStart(4,'0')}</b></span>
        <span className="run-card-strip-r">
          <span>JLPT N{card.jlpt}</span>
          <span>{idx + 1}/{total}</span>
        </span>
      </div>
      <div className="run-card-body">
        <div style={{position:'relative'}}>
          <div className="run-kanji-ghost" aria-hidden="true">{card.k}</div>
          <div className="run-kanji">{card.k}</div>
        </div>
        {!revealed && (
          <div className="run-reveal-hint" aria-hidden="true">tap anywhere to reveal ▾</div>
        )}
        <div className="run-k-meta">
          <CardReadings card={card} />
          <div className="run-mean">"{card.mean}"</div>
          <CardExamples card={card} />
        </div>
      </div>
    </div>
  );
};

const InjectVerdict = ({ enabled, onPick }) => (
  <div className={`inj-verdict${enabled ? '' : ' is-hidden'}`}>
    <button
      className="inj-vbtn miss"
      disabled={!enabled}
      onClick={() => onPick('miss')}
    >
      <span className="v-key">1</span>
      <span className="v-label">MISS</span>
      <span className="v-int">drop</span>
    </button>
    <button
      className="inj-vbtn hit"
      disabled={!enabled}
      onClick={() => onPick('hit')}
    >
      <span className="v-key">2</span>
      <span className="v-label">GOT IT</span>
      <span className="v-int">retain</span>
    </button>
  </div>
);

// "INJECTING STREAK" terminal splash. Cycles a fake compile log, runs a
// progress bar, then commits to the outcome by flipping the parent's
// phase to 'end' with a verdict already resolved by the caller.
const InjectSplash = ({ onDone }) => {
  const [pct, setPct] = React.useState(0);
  const [logIdx, setLogIdx] = React.useState(0);
  const [scram, setScram] = React.useState('░░░░░░░░░░░░░░░░');

  const LINES = [
    '> probing chain integrity…',
    '> scraping cached sessions…',
    '> reconstructing parity table…',
    '> compiling streak.patch…',
    '> calling kernel.recover()…',
    '> injecting…',
  ];

  React.useEffect(() => {
    let alive = true;
    let p = 0;
    const startedAt = performance.now();
    const TOTAL_MS = 2400;
    const tick = () => {
      if (!alive) return;
      const t = performance.now() - startedAt;
      p = Math.min(100, Math.round((t / TOTAL_MS) * 100));
      setPct(p);
      const cellsFilled = Math.round((p / 100) * 16);
      let s = '';
      for (let i = 0; i < 16; i++) s += i < cellsFilled ? randGlyph() : '░';
      setScram(s);
      const linePos = Math.floor((p / 100) * LINES.length);
      setLogIdx(Math.min(LINES.length - 1, linePos));
      if (p >= 100) {
        setTimeout(() => onDone && onDone(), 220);
        return;
      }
      requestAnimationFrame(tick);
    };
    const id = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(id); };
  }, []);

  return (
    <section className="inj-splash" data-screen-label="inj-splash">
      <div className="inj-splash-frame">
        <div className="inj-splash-skulls" aria-hidden>
          <span>☠</span><span>☠</span><span>☠</span>
        </div>
        <div className="inj-splash-title">▸ INJECTING STREAK</div>
        <div className="inj-splash-log">
          {LINES.slice(0, logIdx + 1).map((l, i) => (
            <div
              key={i}
              className={`inj-splash-log-row${i === logIdx ? ' is-current' : ''}`}
            >{l}</div>
          ))}
        </div>
        <div className="inj-splash-bar">
          <div className="inj-splash-bar-fill" style={{ width: `${pct}%` }} />
          <div className="inj-splash-bar-track" />
        </div>
        <div className="inj-splash-meter">
          <span className="inj-splash-meter-glyphs">{scram}</span>
          <span className="inj-splash-meter-pct">{String(pct).padStart(2,'0')}%</span>
        </div>
      </div>
    </section>
  );
};

const InjectEnd = ({ outcome, hits, total, oddsPct, restoredTo, xpGained, snapAfter, onAgain, onHome }) => {
  // outcome: 'recovered' | 'rejected' | 'failed'
  const isWin    = outcome === 'recovered';
  const isReject = outcome === 'rejected';
  const isFail   = outcome === 'failed';

  const headline =
    isWin    ? 'STREAK RESTORED'
    : isReject ? 'PACKET DROPPED'
    : 'COMPILE FAILED';

  const subline =
    isWin    ? `chain patched to ${restoredTo}d · last_session set`
    : isReject ? `accuracy held @ ${hits}/${total} · roll missed (${oddsPct}%)`
    : `${hits}/${total} correct · need ≥${ACC_THRESHOLD} to roll`;

  const cls = `inj-end ${isWin ? 'is-win' : isReject ? 'is-reject' : 'is-fail'}`;

  return (
    <section className={cls} data-screen-label={`inj-end-${outcome}`}>
      <div className="inj-end-frame">
        <div className="inj-end-glyph" aria-hidden>
          {isWin ? '✓' : '☠'}
        </div>
        <div className="inj-end-headline" data-text={headline}>{headline}</div>
        <div className="inj-end-sub">{subline}</div>
        {!isWin && snapAfter && (
          <div className="inj-end-meta">
            <div>next attempt odds → <b>{Math.round((snapAfter.nextOdds || 0) * 100)}%</b></div>
            <div>attempts left today → <b>{snapAfter.attemptsLeft}/{snapAfter.attemptsMax}</b></div>
          </div>
        )}
        {xpGained > 0 && (
          <div className="inj-end-xp">+{xpGained} XP · consolation</div>
        )}
        <div className="inj-end-actions">
          {!isWin && snapAfter && snapAfter.attemptsLeft > 0 && (
            <button className="inj-end-btn again" onClick={onAgain}>▸ TRY AGAIN</button>
          )}
          <button className="inj-end-btn home" onClick={onHome}>▸ HOME</button>
        </div>
      </div>
    </section>
  );
};

const StreakInjectApp = ({ cards }) => {
  const [tweaks] = React.useState(() => {
    try {
      const shared = JSON.parse(localStorage.getItem('kb-tweaks') || '{}');
      return { ...TWEAK_DEFAULTS_INJ, ...shared };
    } catch (e) { return { ...TWEAK_DEFAULTS_INJ }; }
  });

  // Capture the snapshot at mount. If somehow we landed here without one
  // (e.g. user typed the URL directly), bounce home.
  const [snap, setSnap] = React.useState(() =>
    window.StreakInject ? window.StreakInject.getActiveSnapshot() : null
  );
  // Live odds + attempts-left for the pre screen. Init from snapshot so the
  // bounce-home effect below doesn't fire on first render against default
  // zeros (would redirect even when a valid snapshot is in storage).
  const [oddsPct, setOddsPct] = React.useState(() => {
    if (!window.StreakInject) return 0;
    const live = window.StreakInject.getActiveSnapshot();
    return live ? Math.round(window.StreakInject.currentOdds(live) * 100) : 0;
  });
  const [attemptsLeft, setAttemptsLeft] = React.useState(() => {
    if (!window.StreakInject) return 0;
    const live = window.StreakInject.getActiveSnapshot();
    return live ? window.StreakInject.attemptsLeftToday(live) : 0;
  });
  const attemptsMax = window.StreakInject ? window.StreakInject.ATTEMPTS_DAY : 3;

  const [phase, setPhase]     = React.useState('pre'); // pre | quiz | splash | end
  const [deck, setDeck]       = React.useState([]);
  const [idx, setIdx]         = React.useState(0);
  const [revealed, setRevealed] = React.useState(false);
  const [results, setResults] = React.useState([]); // 'hit' | 'miss'
  const [outcome, setOutcome] = React.useState(null);
  const [restoredTo, setRestoredTo] = React.useState(null);
  const [xpGained, setXpGained]     = React.useState(0);
  const [snapAfter, setSnapAfter]   = React.useState(null);
  const [confirmQuit, setConfirmQuit] = React.useState(false);
  const startedAtRef = React.useRef(null);
  const cardStatesRef = React.useRef([]);
  const finishedRef = React.useRef(false);

  React.useEffect(() => {
    document.body.dataset.scanlines = tweaks.scanlines;
    document.body.dataset.romaji = tweaks.romaji;
  }, [tweaks]);

  // Refresh odds + attempts on mount and whenever snap changes.
  const refreshSnapView = React.useCallback(() => {
    if (!window.StreakInject) return;
    const live = window.StreakInject.getActiveSnapshot();
    if (!live) {
      setOddsPct(0);
      setAttemptsLeft(0);
      return;
    }
    setOddsPct(Math.round(window.StreakInject.currentOdds(live) * 100));
    setAttemptsLeft(window.StreakInject.attemptsLeftToday(live));
  }, []);
  React.useEffect(refreshSnapView, [snap, refreshSnapView]);

  // Load card states + bounce out if no snapshot or out of attempts.
  React.useEffect(() => {
    if (!window.DB) return;
    window.DB.open()
      .then(() => window.DB.getAllCardStates())
      .then(s => { cardStatesRef.current = s || []; })
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    if (!snap || attemptsLeft === 0) {
      // No active snapshot or out of attempts — kick back to Home so the
      // tile decision is recomputed there.
      const t = setTimeout(() => { window.location.href = 'Home.html'; }, 50);
      return () => clearTimeout(t);
    }
  }, [snap, attemptsLeft]);

  const startQuiz = () => {
    const built = buildInjectDeck(cards, cardStatesRef.current, INJECT_SIZE);
    if (!built.length) { window.location.href = 'Home.html'; return; }
    setDeck(built);
    setIdx(0);
    setResults([]);
    setRevealed(false);
    finishedRef.current = false;
    startedAtRef.current = Date.now();
    setPhase('quiz');
  };

  const reveal = () => setRevealed(true);

  const verdict = (v) => {
    if (!revealed) return;
    const next = [...results, v];
    setResults(next);
    setTimeout(() => {
      if (idx + 1 >= deck.length) {
        // Deck done → resolve the run.
        resolveRun(next);
      } else {
        setIdx(i => i + 1);
        setRevealed(false);
      }
    }, v === 'miss' ? 280 : 200);
  };

  // End-of-deck: compute hits, decide outcome, write XP + snapshot, and
  // either splash → success or jump straight to fail screens.
  const resolveRun = async (finalResults) => {
    if (finishedRef.current) return;
    finishedRef.current = true;

    const hits = finalResults.filter(v => v === 'hit').length;
    const accuracyMet = hits >= ACC_THRESHOLD;

    if (!accuracyMet) {
      // Hard fail — no roll, no XP. Burn one attempt.
      const after = window.StreakInject.recordAttempt(false);
      const live  = window.StreakInject.getActiveSnapshot();
      setSnapAfter({
        nextOdds:     live ? window.StreakInject.currentOdds(live) : 0,
        attemptsLeft: live ? window.StreakInject.attemptsLeftToday(live) : 0,
        attemptsMax,
      });
      try {
        await window.DB.saveSession({
          mode: 'streak_inject',
          duration_s: Math.round((Date.now() - (startedAtRef.current || Date.now())) / 1000),
          cards_reviewed: deck.length,
          hits,
          misses: deck.length - hits,
          hard: 0,
          xp_earned: 0,
        });
      } catch (e) {}
      setOutcome('failed');
      setPhase('end');
      return;
    }

    // Accuracy met — roll for actual recovery using the odds at the
    // START of this attempt (before recordAttempt bumps the fail counter).
    const liveBefore = window.StreakInject.getActiveSnapshot();
    const odds = liveBefore ? window.StreakInject.currentOdds(liveBefore) : 0;
    const rolled = Math.random() < odds;

    // Splash first, then commit. The splash is the same regardless of
    // outcome — the reveal is the kicker.
    setPhase('splash');

    // Save XP + snapshot updates AFTER splash. Stash decision so the
    // splash callback can finalize.
    const finalize = async () => {
      if (rolled) {
        // Patching the gap means every day from lostDate forward now
        // counts as a session day, so the recovered streak is the
        // pre-break chain plus *every* day since (the patched gap days
        // + today's session). Previously this added a flat +1 which
        // under-counted multi-day gaps (a 9-day chain that broke 3
        // days ago should recover to 12, not 10).
        const lostStreak = snap.lostStreak || 1;
        const lostMs = new Date(snap.lostDate).getTime();
        const lostDay = isNaN(lostMs) ? null : new Date(lostMs);
        const today = new Date();
        if (lostDay) { lostDay.setHours(0,0,0,0); }
        today.setHours(0,0,0,0);
        const daysSinceLost = lostDay
          ? Math.max(1, Math.round((today - lostDay) / 86400000))
          : 1;
        const target = lostStreak + daysSinceLost;
        try { await window.DB.restoreStreakTo(target); } catch (e) {}
        // Mark the missed days as recovered so the calendar can render the
        // checkmark overlay instead of empty cells. Done BEFORE recordAttempt
        // since that clears the snapshot we read lostDate from.
        try { window.StreakInject.markGapRecovered(snap.lostDate); } catch (e) {}
        setRestoredTo(target);
        const after = window.StreakInject.recordAttempt(true);
        setSnapAfter(null);
        try {
          await window.DB.saveSession({
            mode: 'streak_inject',
            duration_s: Math.round((Date.now() - (startedAtRef.current || Date.now())) / 1000),
            cards_reviewed: deck.length,
            hits,
            misses: deck.length - hits,
            hard: 0,
            xp_earned: SUCCESS_XP,
          });
        } catch (e) {}
        setXpGained(SUCCESS_XP);
        setOutcome('recovered');
      } else {
        const after = window.StreakInject.recordAttempt(false);
        const live  = window.StreakInject.getActiveSnapshot();
        setSnapAfter({
          nextOdds:     live ? window.StreakInject.currentOdds(live) : 0,
          attemptsLeft: live ? window.StreakInject.attemptsLeftToday(live) : 0,
          attemptsMax,
        });
        try {
          await window.DB.saveSession({
            mode: 'streak_inject',
            duration_s: Math.round((Date.now() - (startedAtRef.current || Date.now())) / 1000),
            cards_reviewed: deck.length,
            hits,
            misses: deck.length - hits,
            hard: 0,
            xp_earned: CONSOLATION_XP,
          });
          await window.DB.grantXp(CONSOLATION_XP);
        } catch (e) {}
        setXpGained(CONSOLATION_XP);
        setOutcome('rejected');
      }
      setPhase('end');
    };

    // Pin the finalize fn into a ref the splash can fire on completion.
    finalizeRef.current = finalize;
  };

  const finalizeRef = React.useRef(null);

  const onSplashDone = () => {
    if (finalizeRef.current) finalizeRef.current();
  };

  const tryAgain = () => {
    // Re-resolve snapshot — recordAttempt may have cleared it on success
    // (won't happen here since 'again' is only available on fail outcomes,
    // but guard anyway).
    const live = window.StreakInject.getActiveSnapshot();
    if (!live || window.StreakInject.attemptsLeftToday(live) <= 0) {
      window.location.href = 'Home.html';
      return;
    }
    setSnap(live);
    refreshSnapView();
    setOutcome(null);
    setRestoredTo(null);
    setXpGained(0);
    setSnapAfter(null);
    setPhase('pre');
  };

  const goHome = () => { window.location.href = 'Home.html'; };
  const quit = () => {
    if (phase === 'quiz' || phase === 'splash') { setConfirmQuit(true); return; }
    goHome();
  };

  React.useEffect(() => {
    const onKey = (e) => {
      if (phase === 'pre') {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); startQuiz(); }
      } else if (phase === 'quiz') {
        if (!revealed) {
          if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); reveal(); }
        } else {
          if (e.key === '1') verdict('miss');
          else if (e.key === '2' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); verdict('hit'); }
        }
        if (e.key === 'Escape') quit();
      } else if (phase === 'end') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (snapAfter && snapAfter.attemptsLeft > 0) tryAgain();
          else goHome();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!snap) return null;

  return (
    <>
      <div className="run-shell inj-shell variant-game" data-phase={phase}>
        <InjectTopbar phase={phase} idx={idx} total={deck.length || INJECT_SIZE} onQuit={quit} />
        <main className="run-main inj-main" data-screen-label={`inj-${phase}`}>
          {phase === 'pre' && (
            <InjectPre
              snap={snap}
              oddsPct={oddsPct}
              attemptsLeft={attemptsLeft}
              attemptsMax={attemptsMax}
              onStart={startQuiz}
            />
          )}
          {phase === 'quiz' && (
            <>
              <InjectCard
                card={deck[idx]}
                revealed={revealed}
                onReveal={reveal}
                idx={idx}
                total={deck.length}
              />
              <InjectVerdict enabled={revealed} onPick={verdict} />
            </>
          )}
          {phase === 'splash' && <InjectSplash onDone={onSplashDone} />}
          {phase === 'end' && (
            <InjectEnd
              outcome={outcome}
              hits={results.filter(v => v === 'hit').length}
              total={deck.length}
              oddsPct={oddsPct}
              restoredTo={restoredTo}
              xpGained={xpGained}
              snapAfter={snapAfter}
              onAgain={tryAgain}
              onHome={goHome}
            />
          )}
        </main>
      </div>

      <ConfirmModal
        open={confirmQuit}
        title="ABORT INJECT?"
        body="You'll burn this attempt · streak stays corrupted."
        confirmLabel="ABORT"
        cancelLabel="STAY"
        onConfirm={() => {
          // Burn the attempt on quit during quiz/splash so users can't
          // farm odds-bumps by quitting failing runs.
          if (window.StreakInject) window.StreakInject.recordAttempt(false);
          goHome();
        }}
        onCancel={() => setConfirmQuit(false)}
      />
    </>
  );
};

Object.assign(window, { StreakInjectApp, buildInjectDeck });
