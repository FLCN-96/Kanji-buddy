// IndexedDB persistence layer — exposed as window.DB

const DB_NAME = 'kanji-buddy-db';
const DB_VERSION = 3;

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
    return rw('user_profile', 'readonly', s => s.get(1));
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
      return rw('user_profile', 'readwrite', s => s.put(next)).then(() => next);
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
  getLeeches(limit = 3, threshold = 3) {
    return DB.getAllCardStates().then(states =>
      (states || [])
        .filter(s => (s.lapses || 0) >= threshold)
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
    const record = { ...session, date: session.date || new Date().toISOString() };
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
      const stores = ['user_profile', 'card_states', 'sessions', 'scores'];
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

      let { current_streak, best_streak } = user;
      if (lastDate === today) return user; // already counted today
      current_streak = lastDate === yesterday ? current_streak + 1 : 1;
      best_streak    = Math.max(best_streak, current_streak);

      return DB.updateUser({
        current_streak,
        best_streak,
        last_session_date: new Date().toISOString()
      });
    });
  },
};

window.DB = DB;
