// IndexedDB persistence layer — exposed as window.DB

const DB_NAME = 'kanji-buddy-db';
// v4 (2026-05-17): added `card_events` (per-card evidence log written by
// every mode, not just Run) and `mode_starts` (mode-entry funnel for
// abandon-vs-complete diagnostics). Also a new `hour` column written by
// saveSession for hour-of-day retention analysis. No data migration needed —
// existing card_states / sessions / scores records remain readable.
const DB_VERSION = 4;

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains('user_profile')) {
        db.createObjectStore('user_profile', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('card_states')) {
        const cs = db.createObjectStore('card_states', { keyPath: 'idx' });
        cs.createIndex('due_date', 'due_date', { unique: false });
      }

      if (!db.objectStoreNames.contains('sessions')) {
        const ss = db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
        ss.createIndex('date', 'date', { unique: false });
      }

      if (!db.objectStoreNames.contains('scores')) {
        const sc = db.createObjectStore('scores', { keyPath: 'id', autoIncrement: true });
        sc.createIndex('mode_score', ['mode', 'score'], { unique: false });
      }

      if (db.objectStoreNames.contains('imported_cards')) {
        db.deleteObjectStore('imported_cards');
      }

      // v4: per-card evidence log. All modes append here — decoupled from
      // SM-2 scheduling (which stays Run-only on card_states). Indexes on
      // `idx` (per-kanji lookup), `mode`, and `date` for the obvious slices.
      if (!db.objectStoreNames.contains('card_events')) {
        const ce = db.createObjectStore('card_events', { keyPath: 'id', autoIncrement: true });
        ce.createIndex('idx',  'idx',  { unique: false });
        ce.createIndex('mode', 'mode', { unique: false });
        ce.createIndex('date', 'date', { unique: false });
      }

      // v4: mode-entry funnel. One row per mode page mount, lets us compare
      // start vs. complete (sessions table) to spot abandonment hotspots.
      if (!db.objectStoreNames.contains('mode_starts')) {
        const ms = db.createObjectStore('mode_starts', { keyPath: 'id', autoIncrement: true });
        ms.createIndex('mode', 'mode', { unique: false });
        ms.createIndex('date', 'date', { unique: false });
      }
    };

    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror  = (e) => reject(e.target.error);
  });
}

function rw(store, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t   = db.transaction(store, mode);
    const s   = t.objectStore(store);
    const req = fn(s);
    if (req) {
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = (e) => reject(e.target.error);
    } else {
      t.oncomplete = () => resolve();
      t.onerror    = (e) => reject(e.target.error);
    }
  }));
}

const DB = {
  open: openDB,

  close() {
    if (_db) {
      try { _db.close(); } catch(e) {}
      _db = null;
    }
  },

  // ── user ──────────────────────────────────────────────────────────

  getUser() {
    return rw('user_profile', 'readonly', s => s.get(1)).then(u => {
      if (u) window._kbUserCache = u;
      return u;
    });
  },

  createUser(display_name) {
    const user = {
      id: 1,
      display_name: display_name || 'Operator',
      created_at: new Date().toISOString(),
      total_xp: 0,
      current_streak: 0,
      best_streak: 0,
      last_session_date: null,
      settings: {}
    };
    return rw('user_profile', 'readwrite', s => s.put(user)).then(() => user);
  },

  updateUser(patch) {
    return DB.getUser().then(user => {
      if (!user) return null;
      const next = { ...user, ...patch };
      return rw('user_profile', 'readwrite', s => s.put(next)).then(() => {
        window._kbUserCache = next;
        return next;
      });
    });
  },

  // ── SRS queue ─────────────────────────────────────────────────────

  getDueCards(limit = 200) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const today = new Date().toISOString();
      const t     = db.transaction('card_states', 'readonly');
      const idx   = t.objectStore('card_states').index('due_date');
      const req   = idx.getAll(IDBKeyRange.upperBound(today), limit);
      req.onsuccess = (e) => {
        // Cards reviewed earlier today are "handled" — miss/hard re-queue them
        // with a same-day due_date, but Home shouldn't count that as owed.
        const todayStr = new Date().toDateString();
        resolve(e.target.result.filter(s =>
          !s.last_reviewed ||
          new Date(s.last_reviewed).toDateString() !== todayStr
        ));
      };
      req.onerror   = (e) => reject(e.target.error);
    }));
  },

  getCardState(idx) {
    return rw('card_states', 'readonly', s => s.get(idx));
  },

  getAllCardStates() {
    return rw('card_states', 'readonly', s => s.getAll());
  },

  upsertCardState(state) {
    return rw('card_states', 'readwrite', s => s.put(state));
  },

  // Top-N cards sorted by lapse count — feeds the Home leech panel.
  // Threshold mirrors Daily.LEECH_LAPSES (default 3) so what's called a
  // leech on Home matches the buckets in daily-deck selection.
  // window.Daily isn't available at db.js load time (it loads after this
  // file), so we resolve it inside the function body at call time.
  getLeeches(limit = 3, threshold) {
    const t = threshold ?? ((typeof window !== 'undefined' && window.Daily?.LEECH_LAPSES) ?? 3);
    return DB.getAllCardStates().then(states =>
      (states || [])
        .filter(s => (s.lapses || 0) >= t)
        .sort((a, b) => (b.lapses || 0) - (a.lapses || 0))
        .slice(0, limit)
    );
  },

  // ── settings (operator preferences, stored on user.settings) ──────

  getSettings() {
    return DB.getUser().then(user => (user && user.settings) || {});
  },

  updateSettings(patch) {
    return DB.getUser().then(user => {
      if (!user) return null;
      const nextSettings = { ...(user.settings || {}), ...patch };
      return DB.updateUser({ settings: nextSettings });
    });
  },

  // ── sessions ──────────────────────────────────────────────────────

  saveSession(session) {
    const date = session.date || new Date().toISOString();
    // Hour-of-day (local) — feeds retention-vs-time-of-day analyses without
    // re-parsing every date downstream. Callers can override by passing hour.
    const hour = (typeof session.hour === 'number') ? session.hour : new Date(date).getHours();
    const record = { ...session, date, hour };
    return rw('sessions', 'readwrite', s => s.add(record));
  },

  getRecentSessions(n = 10) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const req = db.transaction('sessions', 'readonly').objectStore('sessions').getAll();
      req.onsuccess = (e) => resolve(
        e.target.result.sort((a, b) => b.date.localeCompare(a.date)).slice(0, n)
      );
      req.onerror = (e) => reject(e.target.error);
    }));
  },

  // ── scores ────────────────────────────────────────────────────────

  saveScore(score) {
    const record = { ...score, date: score.date || new Date().toISOString() };
    return rw('scores', 'readwrite', s => s.add(record));
  },

  getBest(mode) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const req = db.transaction('scores', 'readonly').objectStore('scores').getAll();
      req.onsuccess = (e) => resolve(
        e.target.result
          .filter(s => s.mode === mode)
          .reduce((max, s) => (s.score > max ? s.score : max), 0)
      );
      req.onerror = (e) => reject(e.target.error);
    }));
  },

  getScoreHistory(mode) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const req = db.transaction('scores', 'readonly').objectStore('scores').getAll();
      req.onsuccess = (e) => resolve(
        e.target.result
          .filter(s => s.mode === mode)
          .sort((a, b) => b.date.localeCompare(a.date))
      );
      req.onerror = (e) => reject(e.target.error);
    }));
  },

  // ── card events (cross-mode evidence log) ────────────────────────
  //
  // Every mode writes one row per per-card interaction here. This is
  // *evidence*, not *scheduling* — SM-2 still only reacts to Run. Lets
  // downstream views (Home stat tiles, future adaptive sequencing) treat
  // a Match hit and a Run "ok" as both being signal that the user knows
  // the card, without needing to touch card_states from every mode.
  //
  // Shape: { idx, mode, outcome, date, meta? }
  //   idx     — card index (matches card_states.idx and cards.json idx)
  //   mode    — same mode string the sessions table uses ('run', 'match', …)
  //   outcome — 'hit' | 'miss' | 'hard' | 'easy' | 'skip'
  //   meta    — optional bag for mode-specific extras (response_ms, tier, …)

  recordCardEvent(evt) {
    if (!evt || evt.idx == null || !evt.mode || !evt.outcome) return Promise.resolve(null);
    const record = {
      idx:     evt.idx,
      mode:    evt.mode,
      outcome: evt.outcome,
      date:    evt.date || new Date().toISOString(),
      meta:    evt.meta || null,
    };
    return rw('card_events', 'readwrite', s => s.add(record));
  },

  getCardEvents(idx, limit = 100) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const t = db.transaction('card_events', 'readonly');
      const i = t.objectStore('card_events').index('idx');
      const req = i.getAll(idx, limit);
      req.onsuccess = (e) => resolve(e.target.result || []);
      req.onerror   = (e) => reject(e.target.error);
    }));
  },

  // All card_events on/after `sinceIso` (uses the `date` index). One bulk read
  // so callers can build a cross-mode evidence map without N per-card queries
  // (used by the daily deleveling sweep). Omit sinceIso to read the whole log.
  getRecentCardEvents(sinceIso) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const t = db.transaction('card_events', 'readonly');
      const i = t.objectStore('card_events').index('date');
      const range = sinceIso ? IDBKeyRange.lowerBound(sinceIso) : undefined;
      const req = i.getAll(range);
      req.onsuccess = (e) => resolve(e.target.result || []);
      req.onerror   = (e) => reject(e.target.error);
    }));
  },

  // ── mode-entry funnel ─────────────────────────────────────────────

  recordModeStart(mode) {
    if (!mode) return Promise.resolve(null);
    const record = { mode, date: new Date().toISOString() };
    return rw('mode_starts', 'readwrite', s => s.add(record));
  },

  // Start vs complete funnel for the last n days. Returns map keyed by mode:
  // { run: { starts, completes }, time_attack: {…}, … }. Modes without
  // either signal are omitted. Used by future Home diagnostics tiles.
  getModeFunnel(days = 7) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const cutoff = Date.now() - days * 86400000;
      const t = db.transaction(['mode_starts', 'sessions'], 'readonly');
      const startsReq = t.objectStore('mode_starts').getAll();
      const sessReq   = t.objectStore('sessions').getAll();
      let starts, sess;
      const done = () => {
        if (starts === undefined || sess === undefined) return;
        const acc = {};
        const ensure = (m) => (acc[m] = acc[m] || { starts: 0, completes: 0 });
        for (const r of starts) {
          if (!r.date || new Date(r.date).getTime() < cutoff) continue;
          ensure(r.mode).starts++;
        }
        for (const r of sess) {
          if (!r.date || new Date(r.date).getTime() < cutoff) continue;
          ensure(r.mode).completes++;
        }
        resolve(acc);
      };
      startsReq.onsuccess = (e) => { starts = e.target.result || []; done(); };
      sessReq.onsuccess   = (e) => { sess   = e.target.result || []; done(); };
      t.onerror = (e) => reject(e.target.error);
    }));
  },

  // Inter-session gap distribution (D-bucket UI helper). Returns the
  // distribution of consecutive-session gaps in days. Pure derive over
  // existing `sessions` records — no new capture.
  getSessionGaps() {
    return openDB().then(db => new Promise((resolve, reject) => {
      const req = db.transaction('sessions', 'readonly').objectStore('sessions').getAll();
      req.onsuccess = (e) => {
        const sessions = (e.target.result || [])
          .filter(s => s && s.date)
          .sort((a, b) => a.date.localeCompare(b.date));
        const gaps = [];
        for (let i = 1; i < sessions.length; i++) {
          const a = new Date(sessions[i - 1].date);
          const b = new Date(sessions[i].date);
          if (isNaN(a.getTime()) || isNaN(b.getTime())) continue;
          gaps.push((b.getTime() - a.getTime()) / 86400000);
        }
        resolve(gaps);
      };
      req.onerror = (e) => reject(e.target.error);
    }));
  },

  // ── XP ────────────────────────────────────────────────────────────

  grantXp(amount) {
    if (!amount || amount <= 0) return Promise.resolve(null);
    return DB.getUser().then(user => {
      if (!user) return null;
      const prev = user.total_xp || 0;
      const total = prev + amount;
      // Record a one-shot promotion marker if a rank was crossed; Home.html
      // consumes it on next mount and fires the RankUpModal.
      if (window.Rank && typeof window.Rank.flagPromotion === 'function') {
        try { window.Rank.flagPromotion(prev, total); } catch(e) {}
      }
      return DB.updateUser({ total_xp: total });
    });
  },

  // ── full reset ────────────────────────────────────────────────────

  resetAllData() {
    return openDB().then(db => new Promise((resolve, reject) => {
      const stores = ['user_profile', 'card_states', 'sessions', 'scores', 'card_events', 'mode_starts'];
      const t = db.transaction(stores, 'readwrite');
      stores.forEach(s => t.objectStore(s).clear());
      t.oncomplete = () => resolve();
      t.onerror    = (e) => reject(e.target.error);
    }));
  },

  // ── streak helpers ────────────────────────────────────────────────

  recordSessionStreak() {
    return DB.getUser().then(user => {
      if (!user) return;
      const today     = new Date().toDateString();
      const lastDate  = user.last_session_date ? new Date(user.last_session_date).toDateString() : null;
      const yesterday = new Date(Date.now() - 86400000).toDateString();

      const prevStreak     = user.current_streak || 0;
      const bestPrior      = user.best_streak || 0;
      const prevLastDate   = user.last_session_date || null;

      let { current_streak, best_streak } = user;
      if (lastDate === today) return user; // already counted today
      current_streak = lastDate === yesterday ? current_streak + 1 : 1;
      best_streak    = Math.max(best_streak, current_streak);

      // Flag one-shot Home celebration events (continued / broken / best /
      // milestone). Same pattern as Rank.flagPromotion — Home consumes on
      // next mount via window.Streak.consumeXxx().
      if (window.Streak && typeof window.Streak.flagEvents === 'function') {
        try {
          window.Streak.flagEvents({
            prevStreak,
            newStreak: current_streak,
            prevLastDate,
            bestPriorStreak: bestPrior,
          });
        } catch(e) {}
      }

      return DB.updateUser({
        current_streak,
        best_streak,
        last_session_date: new Date().toISOString()
      });
    });
  },

  // Force-restore the streak to a specific value. Used by STREAK INJECT after
  // a successful recovery roll — bypasses the normal lastDate→yesterday math
  // because the chain didn't actually continue, it was patched. Skips
  // Streak.flagEvents on purpose: this isn't a session, it's a hotfix, and
  // the inject end screen is its own celebration.
  restoreStreakTo(n) {
    return DB.getUser().then(user => {
      if (!user) return null;
      const target = Math.max(1, Math.floor(n) || 1);
      const best = Math.max(user.best_streak || 0, target);
      return DB.updateUser({
        current_streak:    target,
        best_streak:       best,
        last_session_date: new Date().toISOString(),
      });
    });
  },

  // Per-day session presence over the last n days — feeds the streak chip
  // popover heatmap (B4). Returns array of { date: 'YYYY-MM-DD', count }
  // ordered oldest → newest, length n. Days without sessions are zero-count.
  getSessionsByDay(n = 30) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const req = db.transaction('sessions', 'readonly').objectStore('sessions').getAll();
      req.onerror = (e) => reject(e.target.error);
      req.onsuccess = (e) => {
        const sessions = e.target.result || [];
        const counts = new Map();
        for (const s of sessions) {
          if (!s || !s.date) continue;
          const d = new Date(s.date);
          if (isNaN(d.getTime())) continue;
          // Use local date so calendar slots match the user's timezone.
          const y = d.getFullYear(), mo = d.getMonth() + 1, dy = d.getDate();
          const key = `${y}-${String(mo).padStart(2,'0')}-${String(dy).padStart(2,'0')}`;
          counts.set(key, (counts.get(key) || 0) + 1);
        }
        const out = [];
        const today = new Date(); today.setHours(0,0,0,0);
        for (let i = n - 1; i >= 0; i--) {
          const day = new Date(today.getTime() - i * 86400000);
          const y = day.getFullYear(), mo = day.getMonth() + 1, dy = day.getDate();
          const key = `${y}-${String(mo).padStart(2,'0')}-${String(dy).padStart(2,'0')}`;
          out.push({ date: key, count: counts.get(key) || 0 });
        }
        resolve(out);
      };
    }));
  },
};

window.DB = DB;
