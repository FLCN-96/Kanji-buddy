// Diagnostics — terminal-style dump of operator metrics, streak state,
// card-state aggregates, and STREAK INJECT internals. The inject section
// is the heaviest because most users will land here trying to figure out
// why the tile is/isn't appearing.

const fmtIso = (iso) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${hh}:${mm}`;
  } catch (e) { return iso; }
};

const fmtDayKey = (d) => {
  const x = d ? new Date(d) : new Date();
  if (isNaN(x.getTime())) return '—';
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const dd = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / 86400000);

// One row in a terminal-style readout. `k` is the label, `v` is the
// value (string), `tone` shades the value (ok|warn|fail|dim).
const Row = ({ k, v, tone, hint }) => (
  <div className="dx-row">
    <span className="dx-row-k">{k}</span>
    <span className={`dx-row-v${tone ? ' tone-' + tone : ''}`}>{v}</span>
    {hint && <span className="dx-row-hint">{hint}</span>}
  </div>
);

const Section = ({ title, children, status }) => (
  <section className="dx-sec">
    <div className="dx-sec-head">
      <span className="dx-sec-title">▸ {title}</span>
      {status && <span className={`dx-sec-status tone-${status.tone || 'dim'}`}>{status.label}</span>}
    </div>
    <div className="dx-sec-body">{children}</div>
  </section>
);

const Pass = ({ ok, msg }) => (
  <span className={`dx-pass ${ok ? 'is-ok' : 'is-fail'}`}>
    <span className="dx-pass-glyph">{ok ? '✓' : '✕'}</span>
    <span>{msg}</span>
  </span>
);

const Diagnostics = () => {
  const [user, setUser] = React.useState(null);
  const [cardStates, setCardStates] = React.useState([]);
  const [sessions, setSessions] = React.useState([]);
  const [sessionsByDay, setSessionsByDay] = React.useState([]);
  const [scores, setScores] = React.useState([]);
  const [loaded, setLoaded] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  const [repairResult, setRepairResult] = React.useState(null);

  const refresh = React.useCallback(async () => {
    try {
      if (!window.DB) return;
      await window.DB.open();
      const u = await window.DB.getUser();
      const cs = await window.DB.getAllCardStates();
      // Pull a long window so recalcStreakFromHistory can see the full
      // chain — a user with a 60-day streak shouldn't be capped by the
      // diagnostics fetch.
      const sd = window.DB.getSessionsByDay
        ? await window.DB.getSessionsByDay(120).catch(() => [])
        : [];
      // Pull raw sessions list for mode breakdown.
      const ss = await new Promise((resolve) => {
        try {
          window.DB.open().then(db => {
            const t = db.transaction('sessions', 'readonly');
            const req = t.objectStore('sessions').getAll();
            req.onsuccess = (e) => resolve(e.target.result || []);
            req.onerror = () => resolve([]);
          });
        } catch (e) { resolve([]); }
      });
      const sc = await new Promise((resolve) => {
        try {
          window.DB.open().then(db => {
            const t = db.transaction('scores', 'readonly');
            const req = t.objectStore('scores').getAll();
            req.onsuccess = (e) => resolve(e.target.result || []);
            req.onerror = () => resolve([]);
          });
        } catch (e) { resolve([]); }
      });
      setUser(u || null);
      setCardStates(cs || []);
      setSessions(ss || []);
      setSessionsByDay(sd || []);
      setScores(sc || []);
      setLoaded(true);
    } catch (e) {
      setLoaded(true);
    }
  }, []);

  React.useEffect(() => { refresh(); }, [refresh, tick]);

  // ── Computed views ────────────────────────────────────────────────
  const now = new Date();
  const todayKey = fmtDayKey(now);

  const accountAgeDays = user && user.created_at
    ? Math.max(0, daysBetween(user.created_at, now))
    : null;
  const lastSessionGap = user && user.last_session_date
    ? daysBetween(user.last_session_date, now)
    : null;

  const todaySessions = sessions.filter(s => {
    if (!s || !s.date) return false;
    return fmtDayKey(s.date) === todayKey;
  });
  const todaySessionsByMode = todaySessions.reduce((acc, s) => {
    const m = s.mode || 'unknown';
    acc[m] = (acc[m] || 0) + 1;
    return acc;
  }, {});

  // Reviewed-today (matches App.jsx gating)
  const reviewedToday = cardStates.filter(s =>
    s.last_reviewed && fmtDayKey(s.last_reviewed) === todayKey
  ).length;
  const deckSize = window.Daily ? window.Daily.resolveDeckSize(user) : 5;
  const dailyDone = reviewedToday >= deckSize;

  // Card-state aggregates
  const totalSeen   = cardStates.length;
  const dueNowCount = cardStates.filter(s =>
    s.due_date && s.due_date <= now.toISOString() &&
    (!s.last_reviewed || fmtDayKey(s.last_reviewed) !== todayKey)
  ).length;
  const leechCount = cardStates.filter(s => (s.lapses || 0) >= 3).length;
  const matureCount = cardStates.filter(s => (s.interval_days || 0) >= 21).length;
  const youngCount = cardStates.filter(s => (s.interval_days || 0) < 21 && (s.reviews || 0) >= 1).length;
  const newButTouched = cardStates.filter(s => (s.reviews || 0) === 0).length;

  // STREAK INJECT — read everything off the namespace
  const SI = window.StreakInject || null;
  const snap = SI ? SI.getActiveSnapshot() : null;
  const passesGates = SI ? SI.passesNewUserGates(user) : false;
  const minAge = SI ? SI.MIN_ACCOUNT_AGE_DAYS : 7;
  const minBest = SI ? SI.MIN_BEST_STREAK : 3;
  const ageOk = accountAgeDays != null && accountAgeDays >= minAge;
  const bestOk = (user?.best_streak || 0) >= minBest;
  const odds = SI && snap ? SI.currentOdds(snap) : null;
  const attemptsLeft = SI ? SI.attemptsLeftToday(snap) : null;
  const spentToday = SI ? SI.getSpentToday() : 0;
  const recoveredMap = SI ? SI.readRecoveredDays() : {};
  const recoveredCount = Object.keys(recoveredMap).length;
  const detectFromUser = SI ? SI.detectRecoverable(user) : null;
  // Two probes: one with the recoveredDays overlay (what the live code uses)
  // and one raw (no overlay) so we can see if session history still exposes
  // the gap even after a successful inject.
  const detectFromHistory = SI && sessionsByDay.length
    ? SI.detectFromSessions(sessionsByDay, recoveredMap)
    : null;
  const detectFromHistoryRaw = SI && sessionsByDay.length
    ? SI.detectFromSessions(sessionsByDay)
    : null;
  const canShow = SI ? SI.canInjectNow(user) : false;

  // Gap day analysis — build a day-by-day table for the active gap window.
  // Uses the snapshot's lostDate if available, else the detect result.
  const gapSource = snap || detectFromHistoryRaw || detectFromUser;
  const gapDays = (() => {
    if (!gapSource || !gapSource.lostDate) return [];
    const start = new Date(gapSource.lostDate);
    if (isNaN(start.getTime())) return [];
    start.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const rows = [];
    let d = new Date(start.getTime() + 86400000);
    while (d.getTime() < today.getTime() && rows.length < 60) {
      const y = d.getFullYear(), mo = d.getMonth() + 1, dy = d.getDate();
      const key = `${y}-${String(mo).padStart(2,'0')}-${String(dy).padStart(2,'0')}`;
      const sbd = sessionsByDay.find(s => s.date === key);
      rows.push({
        date: key,
        sessions: sbd ? sbd.count : 0,
        recovered: !!recoveredMap[key],
      });
      d = new Date(d.getTime() + 86400000);
    }
    return rows;
  })();

  // Days that are flagged as patched but ALSO have a real session — these
  // should never have been marked. Fixing them is the calendar half of
  // the inject patch.
  const sessionDaySet = new Set(
    sessionsByDay.filter(d => d && d.count > 0).map(d => d.date)
  );
  const recoveredOverlap = Object.keys(recoveredMap).filter(k => sessionDaySet.has(k));
  // Recompute what the streak SHOULD be from sessions + recovered-day map.
  // If this is higher than the live current_streak, the user's chain was
  // under-restored by a buggy inject and the repair should bump it up.
  const recalcStreak = SI && typeof SI.recalcStreakFromHistory === 'function' && sessionsByDay.length
    ? SI.recalcStreakFromHistory(sessionsByDay, recoveredMap)
    : null;
  const liveStreak = user?.current_streak || 0;
  const streakMismatch = recalcStreak != null && recalcStreak !== liveStreak;
  const hasRepairFns = SI && typeof SI.repairRecoveredDays === 'function' && typeof SI.recalcStreakFromHistory === 'function';
  const needsRepair = hasRepairFns && (recoveredOverlap.length > 0 || (streakMismatch && recalcStreak > liveStreak));

  const onRepair = async () => {
    if (!SI || !window.DB || typeof SI.repairRecoveredDays !== 'function' || typeof SI.recalcStreakFromHistory !== 'function') return;
    const fixedMap = SI.repairRecoveredDays(sessionsByDay);
    // Recalculate against the freshly-cleaned map.
    const newRec = SI.readRecoveredDays();
    const correctStreak = SI.recalcStreakFromHistory(sessionsByDay, newRec);
    const before = (user && user.current_streak) || 0;
    let streakChanged = false;
    if (correctStreak > before) {
      try { await window.DB.restoreStreakTo(correctStreak); streakChanged = true; } catch (e) {}
    }
    setRepairResult({
      removed: fixedMap.removed,
      kept: fixedMap.kept,
      streakBefore: before,
      streakAfter: streakChanged ? correctStreak : before,
      streakChanged,
    });
    setTick(t => t + 1);
  };

  // Why is/isn't it showing? Build a list of pass/fail checks.
  const tileChecks = [];
  tileChecks.push({ ok: !!SI, msg: 'StreakInject namespace loaded' });
  tileChecks.push({ ok: !!user, msg: 'user record exists' });
  tileChecks.push({ ok: ageOk, msg: `account age ≥ ${minAge}d (have ${accountAgeDays ?? '—'}d)` });
  tileChecks.push({ ok: bestOk, msg: `best_streak ≥ ${minBest} (have ${user?.best_streak ?? 0})` });
  tileChecks.push({
    ok: !!(snap || detectFromUser || detectFromHistory),
    msg: snap ? 'live snapshot in storage'
       : detectFromUser ? 'detect-from-stale-date hits'
       : detectFromHistory ? 'detect-from-sessions hits'
       : 'no recoverable state detected',
  });
  tileChecks.push({
    ok: (attemptsLeft || 0) > 0,
    msg: `attempts left today: ${attemptsLeft ?? '—'}/${SI ? SI.ATTEMPTS_DAY : 3}`,
  });
  // Daily-run gate (Modes.jsx requires state === 'clear')
  tileChecks.push({
    ok: dailyDone,
    msg: `daily run complete (${reviewedToday}/${deckSize})`,
  });

  const allTilePass = tileChecks.every(c => c.ok);

  // Storage keys to dump
  const lsKeys = [
    'kb-streak-recoverable',
    'kb-streak-recovered-days',
    `kb-streak-inject-spent:${todayKey}`,
    'kb-tweaks',
    'kb-greeted',
    `kb-hot-claimed:${todayKey}`,
    'kb-promotion-pending',
    'kb-streak-broken-pending',
    'kb-streak-continued-pending',
    'kb-streak-best-pending',
    'kb-streak-milestone-pending',
  ];
  const lsDump = lsKeys.map(k => {
    let v = null;
    try { v = localStorage.getItem(k); } catch (e) {}
    return { k, v };
  });

  // Session-by-day mini calendar (last 14)
  const last14 = sessionsByDay.slice(-14);

  if (!loaded) {
    return (
      <div className="kb-shell variant-game">
        <main className="kb-main">
          <div className="dx-loading">▸ booting diagnostic shell…</div>
        </main>
      </div>
    );
  }

  return (
    <div className="kb-shell variant-game">
      <main className="kb-main dx-main" data-screen-label="diagnostics">
        <div className="dx-head">
          <a href="Settings.html" className="kb-set-back">◂ settings</a>
          <span className="dx-head-title">▸ DIAGNOSTICS // operator readout</span>
          <button className="dx-head-refresh" onClick={() => setTick(t => t + 1)}>↻ refresh</button>
        </div>

        <div className="dx-banner">
          <span className="dx-banner-prompt">$</span>
          <span>kb --diag --verbose</span>
          <span className="dx-banner-cursor" />
        </div>

        {/* INJECT decision summary up top because that's why most people are here */}
        <Section
          title="STREAK INJECT // tile decision"
          status={{
            label: allTilePass ? 'WILL SHOW' : 'WILL HIDE',
            tone: allTilePass ? 'ok' : 'fail',
          }}
        >
          <div className="dx-checks">
            {tileChecks.map((c, i) => (
              <div key={i} className="dx-check-row"><Pass ok={c.ok} msg={c.msg} /></div>
            ))}
          </div>
          {!allTilePass && (
            <div className="dx-note">
              ▸ tile renders only when ALL checks pass. The first failing line above is the proximate cause.
            </div>
          )}
        </Section>

        <Section title="OPERATOR">
          <Row k="display_name"      v={user?.display_name || '—'} />
          <Row k="created_at"        v={fmtIso(user?.created_at)} />
          <Row k="account age"       v={`${accountAgeDays ?? '—'}d`} tone={ageOk ? 'ok' : 'warn'} />
          <Row k="total_xp"          v={String(user?.total_xp ?? 0)} />
          <Row k="rank"              v={(window.Rank ? (window.Rank.getRankForXp(user?.total_xp || 0) || {}).label || '—' : '—')} />
        </Section>

        <Section title="TODAY">
          <Row k="local date"         v={todayKey} />
          <Row k="now"                v={fmtIso(now.toISOString())} />
          <Row k="reviewed today"     v={`${reviewedToday}/${deckSize}`} tone={dailyDone ? 'ok' : 'warn'} />
          <Row k="daily run done?"    v={dailyDone ? 'YES' : 'NO'} tone={dailyDone ? 'ok' : 'warn'} />
          <Row k="sessions today"     v={String(todaySessions.length)} />
          {Object.entries(todaySessionsByMode).map(([m, n]) => (
            <Row key={m} k={`  · ${m}`} v={String(n)} tone="dim" />
          ))}
          <Row k="hot challenge"      v={(window.Daily ? window.Daily.hotChallengeId() : '—') + ' · ' + (window.Daily ? (window.Daily.hotTier(window.Daily.hotChallengeId()) || 'none') : '—')} />
          <Row k="inject spent today" v={`${spentToday}/${SI ? SI.ATTEMPTS_DAY : 3}`} tone={spentToday >= 3 ? 'fail' : 'ok'} />
        </Section>

        <Section title="STREAK">
          <Row k="current_streak"     v={String(user?.current_streak ?? 0)} />
          <Row k="best_streak"        v={String(user?.best_streak ?? 0)} tone={bestOk ? 'ok' : 'warn'} />
          <Row k="last_session_date"  v={fmtIso(user?.last_session_date)} />
          <Row k="gap to today"       v={`${lastSessionGap ?? '—'}d`} />
        </Section>

        <Section title="CARD STATES">
          <Row k="total seen"         v={String(totalSeen)} />
          <Row k="due now"            v={String(dueNowCount)} />
          <Row k="leeches (≥3 lapses)" v={String(leechCount)} tone={leechCount > 0 ? 'warn' : 'ok'} />
          <Row k="mature (≥21d)"      v={String(matureCount)} />
          <Row k="young (<21d)"       v={String(youngCount)} />
          <Row k="states w/ 0 reviews" v={String(newButTouched)} tone="dim" />
        </Section>

        <Section title="STREAK INJECT // gates">
          <Row k="passesNewUserGates" v={passesGates ? 'YES' : 'NO'} tone={passesGates ? 'ok' : 'fail'} />
          <Row k="MIN_ACCOUNT_AGE_DAYS" v={String(minAge)} tone="dim" />
          <Row k="  · account age"      v={`${accountAgeDays ?? '—'}d`} tone={ageOk ? 'ok' : 'fail'} />
          <Row k="MIN_BEST_STREAK"      v={String(minBest)} tone="dim" />
          <Row k="  · best_streak"      v={String(user?.best_streak ?? 0)} tone={bestOk ? 'ok' : 'fail'} />
        </Section>

        <Section title="STREAK INJECT // snapshot">
          {snap ? (
            <>
              <Row k="lostStreak"     v={`${snap.lostStreak}d`}
                tone={(user && snap.lostStreak < (user.current_streak || 0)) ? 'warn' : 'ok'}
                hint={(user && snap.lostStreak < (user.current_streak || 0))
                  ? `current streak (${user.current_streak}d) already exceeds lostStreak — snapshot is stale`
                  : null} />
              <Row k="lostDate"       v={fmtIso(snap.lostDate)} />
              <Row k="asOf"           v={fmtIso(snap.asOf)} />
              <Row k="days since lost" v={`${Math.max(0, daysBetween(snap.lostDate, now))}d`} />
              <Row k="window remaining" v={`${Math.max(0, (SI?.WINDOW_DAYS || 14) - daysBetween(snap.lostDate, now))}d`} />
              <Row k="current odds"   v={`${Math.round((odds || 0) * 100)}%`} tone="ok" />
              <Row k="attempts left today" v={`${attemptsLeft}/${SI ? SI.ATTEMPTS_DAY : 3}`} tone={attemptsLeft > 0 ? 'ok' : 'fail'} />
              <Row k="attempts (all)" v={String((snap.attempts || []).length)} />
              {(snap.attempts || []).length > 0 && (
                <div className="dx-block">
                  {(snap.attempts || []).map((a, i) => (
                    <div key={i} className="dx-block-row">
                      <span className={`dx-block-k${a.success ? '' : ' tone-warn'}`}>
                        {a.success ? '✓' : '✕'} {a.day}
                      </span>
                      <span className="dx-block-v">{fmtIso(a.at)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="dx-actions">
                <button className="dx-btn-repair" onClick={() => {
                  if (SI) { try { SI.clearSnapshot(); } catch(e) {} }
                  setTick(t => t + 1);
                }}>▸ CLEAR SNAPSHOT</button>
                <span className="dx-actions-hint">removes kb-streak-recoverable · tile will hide if no new break detected</span>
              </div>
            </>
          ) : (
            <Row k="snapshot" v="(none)" tone="dim" />
          )}
        </Section>

        <Section title="STREAK INJECT // detection probes">
          <Row k="detect-from-stale-date"
               v={detectFromUser ? `lost ${detectFromUser.lostStreak}d, gap ${detectFromUser.gapDays}d` : '(no match)'}
               tone={detectFromUser ? 'ok' : 'dim'} />
          <Row k="detect-from-sessions (filtered)"
               v={detectFromHistory ? `lost ${detectFromHistory.lostStreak}d, gap ${detectFromHistory.gapDays}d` : '(no match)'}
               tone={detectFromHistory ? 'warn' : 'ok'}
               hint={detectFromHistory ? 'gap still detected after applying recoveredDays overlay' : 'gap suppressed by recoveredDays — correct'} />
          <Row k="detect-from-sessions (raw)"
               v={detectFromHistoryRaw ? `lost ${detectFromHistoryRaw.lostStreak}d, gap ${detectFromHistoryRaw.gapDays}d` : '(no match)'}
               tone={detectFromHistoryRaw ? 'warn' : 'dim'}
               hint={detectFromHistoryRaw ? 'IDB session history alone still shows a gap' : null} />
          <Row k="canInjectNow(user)"
               v={canShow ? 'YES' : 'NO'}
               tone={canShow ? 'warn' : 'ok'} />
        </Section>

        <Section title="STREAK INJECT // gap analysis">
          {gapSource ? (
            <>
              <Row k="source" v={snap ? 'live snapshot' : detectFromHistoryRaw ? 'raw session scan' : 'stale-date detect'} tone="dim" />
              <Row k="lostDate" v={fmtIso(gapSource.lostDate)} />
              <Row k="gap days total" v={String(gapDays.length)} />
              <Row k="covered by sessions" v={String(gapDays.filter(d => d.sessions > 0).length)} tone={gapDays.every(d => d.sessions > 0) ? 'ok' : 'dim'} />
              <Row k="covered by recoveredDays" v={String(gapDays.filter(d => d.recovered).length)} tone={gapDays.every(d => d.recovered) ? 'ok' : 'warn'} />
              <Row k="still empty (neither)" v={String(gapDays.filter(d => !d.sessions && !d.recovered).length)} tone={gapDays.some(d => !d.sessions && !d.recovered) ? 'fail' : 'ok'} />
              {gapDays.length > 0 && (
                <div className="dx-block">
                  {gapDays.map(d => {
                    const status = d.sessions > 0 ? 'session' : d.recovered ? 'recovered' : 'EMPTY';
                    const tone = d.sessions > 0 ? '' : d.recovered ? '' : ' tone-fail';
                    return (
                      <div key={d.date} className="dx-block-row">
                        <span className={`dx-block-k${tone}`}>{d.date}</span>
                        <span className={`dx-block-v${tone}`}>
                          {d.sessions > 0 ? `${d.sessions} session${d.sessions > 1 ? 's' : ''}` : d.recovered ? '✓ patched' : '✕ empty gap'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <Row k="gap" v="no gap detected" tone="ok" />
          )}
        </Section>

        <Section title="STREAK INJECT // recovered map">
          <Row k="entries" v={String(recoveredCount)} />
          <Row
            k="overlap with real sessions"
            v={String(recoveredOverlap.length)}
            tone={recoveredOverlap.length > 0 ? 'warn' : 'ok'}
            hint={recoveredOverlap.length > 0 ? 'days flagged as patched that actually had a session' : null}
          />
          <Row
            k="recalculated streak"
            v={recalcStreak == null ? '—' : `${recalcStreak}d`}
            tone={recalcStreak == null ? 'dim' : (streakMismatch ? 'warn' : 'ok')}
            hint={streakMismatch
              ? `live current_streak is ${liveStreak}d — repair will ${recalcStreak > liveStreak ? 'raise to ' + recalcStreak + 'd' : 'leave alone (won\'t reduce)'}`
              : null}
          />
          {recoveredCount > 0 && (
            <div className="dx-block">
              {Object.keys(recoveredMap).sort().map(d => {
                const overlap = sessionDaySet.has(d);
                return (
                  <div key={d} className="dx-block-row">
                    <span className={`dx-block-k${overlap ? ' tone-warn' : ''}`}>
                      {overlap ? '⚠ ' : ''}{d}
                    </span>
                    <span className="dx-block-v">{fmtIso(recoveredMap[d])}{overlap ? ' · real session' : ''}</span>
                  </div>
                );
              })}
            </div>
          )}
          {needsRepair && (
            <div className="dx-actions">
              <button className="dx-btn-repair" onClick={onRepair}>▸ REPAIR</button>
              <span className="dx-actions-hint">
                {recoveredOverlap.length > 0 && `clears ${recoveredOverlap.length} bad mark${recoveredOverlap.length === 1 ? '' : 's'}`}
                {recoveredOverlap.length > 0 && streakMismatch && recalcStreak > liveStreak && ' · '}
                {streakMismatch && recalcStreak > liveStreak && `raises streak ${liveStreak}d→${recalcStreak}d`}
              </span>
            </div>
          )}
          {repairResult && (
            <div className="dx-note tone-ok">
              ▸ repair complete · removed {repairResult.removed.length} · kept {repairResult.kept.length}
              {repairResult.streakChanged && ` · streak ${repairResult.streakBefore}d → ${repairResult.streakAfter}d`}
            </div>
          )}
        </Section>

        <Section title="SESSIONS // last 14 days">
          <div className="dx-cal">
            {last14.map(d => {
              const cls = d.count > 1 ? 'is-hot' : d.count === 1 ? 'is-on' : 'is-off';
              const rec = !!recoveredMap[d.date];
              return (
                <div key={d.date} className="dx-cal-cell" title={`${d.date} · ${d.count}`}>
                  <span className={`dx-cal-pip ${cls}${rec ? ' is-recovered' : ''}`} />
                  <span className="dx-cal-lbl">{d.date.slice(5)}</span>
                  <span className="dx-cal-n">{d.count}</span>
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="LIFETIME">
          <Row k="sessions saved"     v={String(sessions.length)} />
          <Row k="scores saved"       v={String(scores.length)} />
          {Object.entries(
            sessions.reduce((acc, s) => {
              const m = s.mode || 'unknown';
              acc[m] = (acc[m] || 0) + 1;
              return acc;
            }, {})
          ).sort(([,a],[,b]) => b - a).map(([m, n]) => (
            <Row key={m} k={`  · ${m}`} v={String(n)} tone="dim" />
          ))}
        </Section>

        <Section title="LOCAL STORAGE">
          <div className="dx-block">
            {lsDump.map(({ k, v }) => (
              <div key={k} className="dx-block-row">
                <span className="dx-block-k">{k}</span>
                <span className={`dx-block-v${v == null ? ' tone-dim' : ''}`}>
                  {v == null ? '(null)' : (v.length > 80 ? v.slice(0, 80) + '…' : v)}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="VERSION">
          <Row k="KBVersion.version"  v={(window.KBVersion && window.KBVersion.version) || '—'} />
          <Row k="KBVersion.servedSha" v={(window.KBVersion && window.KBVersion.servedSha) || '—'} />
        </Section>

        <div className="dx-foot">
          <span className="dx-banner-prompt">$</span>
          <span>tail -f /var/log/kanji-buddy/operator.log</span>
          <span className="dx-banner-cursor" />
        </div>
      </main>
    </div>
  );
};

// Render-time error boundary — function components can't catch their own
// render exceptions, so wrap Diagnostics in this so a thrown invariant
// surfaces as a readable terminal panel instead of an empty body.
class DiagnosticsBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { try { console.error('[diagnostics]', err, info); } catch(e) {} }
  render() {
    if (this.state.err) {
      const e = this.state.err;
      const detail = (e && e.stack) || (e && e.message) || String(e);
      return (
        <div className="kb-shell variant-game">
          <main className="kb-main dx-main" data-screen-label="diagnostics-error">
            <div className="dx-head">
              <a href="Settings.html" className="kb-set-back">◂ settings</a>
              <span className="dx-head-title">▸ DIAGNOSTICS // render exception</span>
              <button className="dx-head-refresh" onClick={() => this.setState({ err: null })}>↻ retry</button>
            </div>
            <div className="dx-banner">
              <span className="dx-banner-prompt">$</span>
              <span>kb --diag --trace</span>
              <span className="dx-banner-cursor" />
            </div>
            <section className="dx-sec">
              <div className="dx-sec-head"><span className="dx-sec-title">▸ exception</span></div>
              <div className="dx-sec-body">
                <pre style={{whiteSpace:'pre-wrap', color:'var(--fg-1)', font:'12px/1.5 var(--font-mono)', margin:0}}>
                  {detail}
                </pre>
              </div>
            </section>
          </main>
        </div>
      );
    }
    return this.props.children;
  }
}

const DiagnosticsRoot = () => (
  <DiagnosticsBoundary>
    <Diagnostics />
  </DiagnosticsBoundary>
);

Object.assign(window, { Diagnostics, DiagnosticsRoot, DiagnosticsBoundary });
