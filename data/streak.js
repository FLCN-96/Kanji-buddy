// Shared streak milestone + one-shot event helpers. Mirrors data/rank.js.
// Loaded on every page so DB.recordSessionStreak can flag events from any
// mode that completes a session, and Home.html can consume them on next mount.

(function() {
  // Milestone tiers — crossing one of these on the way up fires the
  // StreakMilestoneModal. Glyph + label are picked by the modal.
  const MILESTONES = [
    { n: 7,    glyph: '七',   label: 'ONE WEEK',     gloss: 'shichi-nichi' },
    { n: 10,   glyph: '拾',   label: 'TEN DAYS',     gloss: 'jū-nichi' },
    { n: 30,   glyph: '丗',   label: 'THIRTY DAYS',  gloss: 'sanjū-nichi' },
    { n: 50,   glyph: '半百', label: 'FIFTY DAYS',   gloss: 'go-jū-nichi' },
    { n: 100,  glyph: '百',   label: 'CENTURY',      gloss: 'hyaku-nichi' },
    { n: 200,  glyph: '貳百', label: 'TWO HUNDRED',  gloss: 'ni-hyaku-nichi' },
    { n: 365,  glyph: '年',   label: 'ONE YEAR',     gloss: 'ichi-nen' },
    { n: 500,  glyph: '伍百', label: 'FIVE HUNDRED', gloss: 'go-hyaku-nichi' },
    { n: 1000, glyph: '千',   label: 'ONE THOUSAND', gloss: 'sen-nichi' },
  ];

  // Three independent one-shot keys — Home consumes each on mount.
  // CONTINUED fires the small ember puff (A1) after any non-milestone, non-broken pass.
  // BROKEN fires the red dust shake (A2) when a prior streak just got reset to 1.
  // BEST fires the magenta twinkle (A4) when current_streak ties or exceeds prior best.
  // MILESTONE fires the StreakMilestoneModal (A3) when a tier is crossed.
  const KEYS = {
    CONTINUED: 'kb-streak-continued-pending',
    BROKEN:    'kb-streak-broken-pending',
    BEST:      'kb-streak-best-pending',
    MILESTONE: 'kb-streak-milestone-pending',
  };

  const milestoneFor = (days) => {
    let hit = null;
    for (const m of MILESTONES) { if (m.n === days) { hit = m; break; } }
    return hit;
  };

  // Called by DB.recordSessionStreak after writing the new streak fields.
  // prevStreak / newStreak are integer day counts; bestPriorStreak is the
  // best_streak BEFORE today's session was recorded.
  const flagEvents = ({ prevStreak = 0, newStreak = 0, prevLastDate = null, bestPriorStreak = 0 }) => {
    if (newStreak === prevStreak) return; // already recorded today, nothing to flag
    const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {} };

    const broke = prevStreak >= 2 && newStreak === 1;
    if (broke) {
      set(KEYS.BROKEN, { prevStreak, at: Date.now() });
      // Capture the recoverable-streak snapshot HERE so it survives the
      // user completing today's daily run (which sets last_session_date
      // to today and would otherwise hide the gap from detectRecoverable).
      // Detection on Home is still useful for the "broke chain but hasn't
      // run today yet" case — both paths converge through ensureSnapshot.
      try {
        if (window.StreakInject && window.StreakInject._captureFromBreak) {
          window.StreakInject._captureFromBreak(prevStreak, prevLastDate);
        }
      } catch(e) {}
    } else if (newStreak >= 2) {
      // Quiet "you kept it" puff — only when there was a prior chain and
      // it advanced (avoids firing on day-2 of a brand-new chain). prevStreak
      // is included so the chip can roll the count from old→new on mount.
      set(KEYS.CONTINUED, { prevStreak, newStreak, at: Date.now() });
    }

    const milestone = milestoneFor(newStreak);
    if (milestone && !broke) {
      set(KEYS.MILESTONE, { milestone, at: Date.now() });
    }

    // Best-ever burst: only fire on a true new high (not on tie-with-self
    // when you're already extending the same chain).
    if (newStreak > bestPriorStreak && newStreak >= 2) {
      set(KEYS.BEST, { newStreak, prevBest: bestPriorStreak, at: Date.now() });
    }
  };

  const consume = (key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      localStorage.removeItem(key);
      return JSON.parse(raw);
    } catch(e) { return null; }
  };

  const consumeContinued = () => consume(KEYS.CONTINUED);
  const consumeBroken    = () => consume(KEYS.BROKEN);
  const consumeBest      = () => consume(KEYS.BEST);
  const consumeMilestone = () => {
    const o = consume(KEYS.MILESTONE);
    if (!o || !o.milestone) return null;
    // Re-resolve the canonical record (so a later milestones table edit
    // doesn't strand consumers on stale labels).
    const m = milestoneFor(o.milestone.n) || o.milestone;
    return { ...o, milestone: m };
  };

  window.Streak = {
    MILESTONES, KEYS,
    milestoneFor,
    flagEvents,
    consumeContinued, consumeBroken, consumeBest, consumeMilestone,
  };

  // ─────────────────────────────────────────────────────────────────────
  // STREAK INJECT — recoverable-streak snapshot + attempt economy.
  //
  // When the user misses 1–7 days but had a real chain (≥2), Home offers
  // STREAK INJECT in place of OVERCLOCK. The snapshot captures what the
  // chain WAS at the moment of loss, persists across the recovery window
  // independent of subsequent runs, and tracks attempts for the rising-
  // odds curve. Only the LAST loss is captured — successful recovery or
  // window-expiry clears the snapshot before the next loss can write a
  // new one.
  //
  // Storage: localStorage `kb-streak-recoverable` = {
  //   lostStreak: int,        // current_streak at moment of loss
  //   lostDate:   ISO,        // last_session_date that became stale
  //   asOf:       ISO,        // when the snapshot was first written
  //   attempts:   [{ day: 'YYYY-MM-DD', success: bool, at: ISO }, ...]
  // }
  // ─────────────────────────────────────────────────────────────────────
  const SNAPSHOT_KEY      = 'kb-streak-recoverable';
  // Per-day attempt counter — keyed by local date so it survives snapshot
  // turnover (a successful recovery clears the snapshot, but the day's
  // budget should NOT reset just because a fresh chain became recoverable).
  // Odds, by contrast, ARE per-snapshot and so reset on a new snapshot.
  const SPENT_KEY_PREFIX  = 'kb-streak-inject-spent:';
  const WINDOW_DAYS   = 14;
  const ATTEMPTS_DAY  = 3;
  const BASE_ODDS     = 0.20;
  const ODDS_STEP     = 0.05;
  const MAX_ODDS      = 0.50;
  // Brand-new operators must not see this tile — it would read as a punitive
  // glitch before they understand what a streak even is. Two complementary
  // gates: account age (proxies "established user") and a best_streak floor
  // (proxies "actually built a chain at least once"). Both must pass.
  const MIN_ACCOUNT_AGE_DAYS = 7;
  const MIN_BEST_STREAK      = 3;

  const dayKey = (d) => {
    const x = d ? new Date(d) : new Date();
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const day = String(x.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / 86400000);

  // Returns recoverable info if user.last_session_date is 1–7 days stale
  // AND the broken chain was at least 2 AND the account is established
  // enough that surfacing the corrupt tile won't confuse a brand-new
  // operator. Does NOT touch storage.
  const detectRecoverable = (user) => {
    if (!user) return null;
    const lostStreak = user.current_streak || 0;
    if (lostStreak < 2) return null;
    if (!user.last_session_date) return null;
    // New-operator safeguards — both must pass.
    if (!user.created_at) return null;
    const accountAge = daysBetween(user.created_at, new Date());
    if (accountAge < MIN_ACCOUNT_AGE_DAYS) return null;
    if ((user.best_streak || 0) < MIN_BEST_STREAK) return null;

    const gap = daysBetween(user.last_session_date, new Date());
    if (gap < 1 || gap > WINDOW_DAYS) return null;
    return { lostStreak, lostDate: user.last_session_date, gapDays: gap };
  };

  const readSnapshot = () => {
    try {
      const raw = localStorage.getItem(SNAPSHOT_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || typeof o.lostStreak !== 'number' || !o.lostDate) return null;
      o.attempts = Array.isArray(o.attempts) ? o.attempts : [];
      return o;
    } catch (e) { return null; }
  };

  const writeSnapshot = (snap) => {
    try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap)); } catch (e) {}
  };

  const clearSnapshot = () => {
    try { localStorage.removeItem(SNAPSHOT_KEY); } catch (e) {}
  };

  // True once the recovery window has elapsed. The snapshot is dropped
  // on next read so Home can quietly recreate one if a new loss happens.
  const isExpired = (snap) => {
    if (!snap || !snap.lostDate) return true;
    return daysBetween(snap.lostDate, new Date()) > WINDOW_DAYS;
  };

  // Live snapshot getter — returns null if expired (and clears it).
  const getActiveSnapshot = () => {
    const snap = readSnapshot();
    if (!snap) return null;
    if (isExpired(snap)) { clearSnapshot(); return null; }
    return snap;
  };

  // Idempotent: creates a snapshot if one is needed and doesn't yet exist.
  // Returns the active snapshot (existing or freshly-written) or null when
  // the user has nothing recoverable. Synchronous: only consults the user
  // record's last_session_date — for the post-run case use ensureSnapshotAsync.
  const ensureSnapshot = (user) => {
    const existing = getActiveSnapshot();
    if (existing) return existing;
    const r = detectRecoverable(user);
    if (!r) return null;
    const snap = {
      lostStreak: r.lostStreak,
      lostDate:   r.lostDate,
      asOf:       new Date().toISOString(),
      attempts:   [],
    };
    writeSnapshot(snap);
    return snap;
  };

  // Scan a sessions-by-day array (oldest → newest, from DB.getSessionsByDay)
  // for the most recent broken chain pattern: a chain of ≥2 consecutive
  // session days, followed by a gap of 1..WINDOW_DAYS empty days, followed
  // by today's session. Used as the fallback path when the user has
  // already run today (so detectRecoverable can't see the stale-date
  // signal) but no snapshot was captured at break time.
  const detectFromSessions = (sessionsByDay) => {
    const arr = Array.isArray(sessionsByDay) ? sessionsByDay : [];
    if (arr.length < 3) return null;
    // Walk from end: skip the current chain (consecutive session days
    // ending today). i lands on the last gap-day of the most recent gap.
    let i = arr.length - 1;
    while (i >= 0 && arr[i].count >= 1) i--;
    if (i < 0) return null;
    const gapEnd = i;
    while (i >= 0 && arr[i].count === 0) i--;
    const gapStart = i + 1;
    const gapLen = gapEnd - gapStart + 1;
    if (gapLen < 1 || gapLen > WINDOW_DAYS) return null;
    // Walk back through the broken chain.
    let chainLen = 0;
    while (i >= 0 && arr[i].count >= 1) { chainLen++; i--; }
    if (chainLen < 2) return null;
    // lostDate = the last day of the broken chain (day before the gap).
    // Convert YYYY-MM-DD to a midnight-local ISO so daysBetween agrees
    // with the rest of the codebase.
    const dStr = arr[gapStart - 1].date;
    const lostDateIso = new Date(dStr + 'T00:00:00').toISOString();
    return { lostStreak: chainLen, lostDate: lostDateIso, gapDays: gapLen };
  };

  // Async ensureSnapshot: tries the sync paths first (existing snapshot,
  // detect-from-stale-date), then falls back to scanning session history
  // via DB.getSessionsByDay. Useful when the user has already run today
  // (last_session_date == today) but a recent break is reconstructible
  // from the calendar. Returns a Promise that resolves to a snapshot or
  // null.
  const ensureSnapshotAsync = (user) => {
    const sync = ensureSnapshot(user);
    if (sync) return Promise.resolve(sync);
    if (!window.DB || !window.DB.getSessionsByDay) return Promise.resolve(null);
    // Pull a few extra days beyond the window so the chain length on the
    // far edge isn't truncated.
    return window.DB.getSessionsByDay(WINDOW_DAYS + 14).then(arr => {
      const det = detectFromSessions(arr || []);
      if (!det) return null;
      const snap = {
        lostStreak: det.lostStreak,
        lostDate:   det.lostDate,
        asOf:       new Date().toISOString(),
        attempts:   [],
      };
      writeSnapshot(snap);
      return snap;
    }).catch(() => null);
  };

  const totalAttempts = (snap) => (snap && snap.attempts ? snap.attempts.length : 0);
  const totalFails    = (snap) => (snap && snap.attempts ? snap.attempts.filter(a => !a.success).length : 0);

  // Per-day spent counter — persists across snapshot turnover so a fresh
  // recoverable chain doesn't grant fresh attempts on the same day.
  const spentTodayKey = () => SPENT_KEY_PREFIX + dayKey();
  const getSpentToday = () => {
    try {
      const raw = localStorage.getItem(spentTodayKey());
      const n = parseInt(raw, 10);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch (e) { return 0; }
  };
  const incSpentToday = () => {
    try {
      localStorage.setItem(spentTodayKey(), String(getSpentToday() + 1));
    } catch (e) {}
  };

  // attemptsToday/attemptsLeftToday now read the day-keyed counter and
  // ignore the snap argument (kept in the signature for API stability).
  // Odds, by design, still derive from the SNAPSHOT's fail history so a
  // newly-formed snapshot resets to BASE_ODDS regardless of the day's
  // prior spend.
  const attemptsToday = (_snap) => getSpentToday();
  const attemptsLeftToday = (_snap) => Math.max(0, ATTEMPTS_DAY - getSpentToday());
  const currentOdds = (snap) => Math.min(MAX_ODDS, BASE_ODDS + ODDS_STEP * totalFails(snap));

  // Brand-new operator gates — applied at the READ layer (canInjectNow,
  // App.jsx refreshInject) rather than the write layer, so a snapshot
  // captured by _captureFromBreak doesn't surface a tile until the user
  // has crossed the safeguards. Once passed, gates stay passed (account
  // age only goes up; best_streak is monotonic).
  const passesNewUserGates = (user) => {
    if (!user || !user.created_at) return false;
    if (daysBetween(user.created_at, new Date()) < MIN_ACCOUNT_AGE_DAYS) return false;
    if ((user.best_streak || 0) < MIN_BEST_STREAK) return false;
    return true;
  };

  // Internal — called by Streak.flagEvents on a BROKEN event so the
  // snapshot is captured BEFORE the user's last_session_date gets
  // refreshed by today's session. Overwrites any prior live snapshot
  // (the freshest break is the most relevant context to recover).
  const _captureFromBreak = (prevStreak, prevLastDate) => {
    if (!prevStreak || prevStreak < 2 || !prevLastDate) return;
    const snap = {
      lostStreak: prevStreak,
      lostDate:   prevLastDate,
      asOf:       new Date().toISOString(),
      attempts:   [],
    };
    writeSnapshot(snap);
  };

  // True if the tile should appear on Home: snapshot exists AND user
  // passes new-operator gates AND has at least one attempt left today.
  const canInjectNow = (user) => {
    if (!passesNewUserGates(user)) return false;
    const snap = getActiveSnapshot() || (user ? ensureSnapshot(user) : null);
    if (!snap) return false;
    return attemptsLeftToday(snap) > 0;
  };

  // Append an attempt. Always bumps the per-day spent counter (so the
  // 3/day cap is enforced across snapshot turnover). Successful attempts
  // also clear the snapshot since the recovery has been consumed.
  const recordAttempt = (success) => {
    const snap = getActiveSnapshot();
    incSpentToday(); // unconditional — quitting/aborting also bumps via callers
    if (!snap) return null;
    snap.attempts.push({ day: dayKey(), success: !!success, at: new Date().toISOString() });
    if (success) {
      clearSnapshot();
      return { ...snap, _cleared: true };
    }
    writeSnapshot(snap);
    return snap;
  };

  // ─────────────────────────────────────────────────────────────────────
  // RECOVERED-GAP TRACKING
  //
  // After a successful inject, the calendar would still render the
  // missed days as empty cells — visually misleading because the chain
  // says they don't count anymore. Persist a per-day map of patched
  // gap days so the calendar can mark them with the smiley overlay.
  //
  // Storage: localStorage `kb-streak-recovered-days` =
  //   { 'YYYY-MM-DD': ISO_recovery_at, ... }
  // No size cap — entries are tiny and survive across deploys. We don't
  // prune; the calendar only renders the last 35 days anyway, and the
  // map is harmless beyond that.
  // ─────────────────────────────────────────────────────────────────────
  const RECOVERED_KEY = 'kb-streak-recovered-days';

  const readRecoveredDays = () => {
    try {
      const raw = localStorage.getItem(RECOVERED_KEY);
      if (!raw) return {};
      const o = JSON.parse(raw);
      return (o && typeof o === 'object') ? o : {};
    } catch (e) { return {}; }
  };

  const writeRecoveredDays = (map) => {
    try { localStorage.setItem(RECOVERED_KEY, JSON.stringify(map)); } catch (e) {}
  };

  // Mark every day strictly between lostDate and today as recovered.
  // (lostDate itself was a real session day; today gets a fresh
  // last_session_date via DB.restoreStreakTo so it's a real session day
  // too — only the in-between gap needs patching on the calendar.)
  const markGapRecovered = (lostDateIso) => {
    if (!lostDateIso) return;
    const start = new Date(lostDateIso); if (isNaN(start.getTime())) return;
    start.setHours(0,0,0,0);
    const today = new Date(); today.setHours(0,0,0,0);
    const map = readRecoveredDays();
    const at  = new Date().toISOString();
    let d = new Date(start.getTime() + 86400000); // first gap day
    let added = 0;
    while (d.getTime() < today.getTime() && added < 60) { // belt-and-suspenders cap
      map[dayKey(d)] = at;
      d = new Date(d.getTime() + 86400000);
      added += 1;
    }
    writeRecoveredDays(map);
  };

  const isRecoveredDay = (key) => !!readRecoveredDays()[key];

  const clearRecoveredDays = () => {
    try { localStorage.removeItem(RECOVERED_KEY); } catch (e) {}
  };

  window.StreakInject = {
    SNAPSHOT_KEY, SPENT_KEY_PREFIX,
    WINDOW_DAYS, ATTEMPTS_DAY,
    BASE_ODDS, ODDS_STEP, MAX_ODDS,
    MIN_ACCOUNT_AGE_DAYS, MIN_BEST_STREAK,
    getSpentToday,
    detectRecoverable,
    detectFromSessions,
    getActiveSnapshot,
    ensureSnapshot,
    ensureSnapshotAsync,
    readSnapshot, writeSnapshot, clearSnapshot,
    totalAttempts, totalFails,
    attemptsToday, attemptsLeftToday,
    currentOdds,
    canInjectNow,
    passesNewUserGates,
    _captureFromBreak,
    recordAttempt,
    // recovered-day map (calendar overlay)
    RECOVERED_KEY,
    readRecoveredDays,
    isRecoveredDay,
    markGapRecovered,
    clearRecoveredDays,
  };
})();
