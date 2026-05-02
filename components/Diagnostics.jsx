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

  const refresh = React.useCallback(async () => {
    try {
      if (!window.DB) return;
      await window.DB.open();
      const u = await window.DB.getUser();
      const cs = await window.DB.getAllCardStates();
      const sd = window.DB.getSessionsByDay
        ? await window.DB.getSessionsByDay(20).catch(() => [])
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
  const detectFromHistory = SI && sessionsByDay.length
    ? SI.detectFromSessions(sessionsByDay)
    : null;
  const canShow = SI ? SI.canInjectNow(user) : false;

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
          <Row k="rank"              v={(window.Rank ? window.Rank.fromXp(user?.total_xp || 0).label : '—')} />
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
              <Row k="lostStreak"     v={`${snap.lostStreak}d`} tone="ok" />
              <Row k="lostDate"       v={fmtIso(snap.lostDate)} />
              <Row k="asOf"           v={fmtIso(snap.asOf)} />
              <Row k="attempts (all)" v={String((snap.attempts || []).length)} />
              <Row k="fails (this snap)" v={String((snap.attempts || []).filter(a => !a.success).length)} />
              <Row k="current odds"   v={`${Math.round((odds || 0) * 100)}%`} tone="ok" />
              <Row k="attempts left today" v={`${attemptsLeft}/${SI ? SI.ATTEMPTS_DAY : 3}`} tone={attemptsLeft > 0 ? 'ok' : 'fail'} />
              <Row k="window remaining" v={`${Math.max(0, (SI?.WINDOW_DAYS || 14) - daysBetween(snap.lostDate, now))}d`} />
            </>
          ) : (
            <Row k="snapshot" v="(none)" tone="dim" />
          )}
        </Section>

        <Section title="STREAK INJECT // detection probes">
          <Row k="detect-from-stale-date"
               v={detectFromUser ? `lost ${detectFromUser.lostStreak}d, gap ${detectFromUser.gapDays}d` : '(no match)'}
               tone={detectFromUser ? 'ok' : 'dim'} />
          <Row k="detect-from-sessions"
               v={detectFromHistory ? `lost ${detectFromHistory.lostStreak}d, gap ${detectFromHistory.gapDays}d` : '(no match)'}
               tone={detectFromHistory ? 'ok' : 'dim'} />
          <Row k="canInjectNow(user)"
               v={canShow ? 'YES' : 'NO'}
               tone={canShow ? 'ok' : 'fail'} />
        </Section>

        <Section title="STREAK INJECT // recovered map">
          <Row k="entries" v={String(recoveredCount)} />
          {recoveredCount > 0 && (
            <div className="dx-block">
              {Object.keys(recoveredMap).sort().map(d => (
                <div key={d} className="dx-block-row">
                  <span className="dx-block-k">{d}</span>
                  <span className="dx-block-v">{fmtIso(recoveredMap[d])}</span>
                </div>
              ))}
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

Object.assign(window, { Diagnostics });
