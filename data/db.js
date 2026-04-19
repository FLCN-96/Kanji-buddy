// IndexedDB persistence layer — exposed as window.DB

const DB_NAME = 'kanji-buddy-db';
const DB_VERSION = 2;

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

      if (!db.objectStoreNames.contains('imported_cards')) {
        const ic = db.createObjectStore('imported_cards', { keyPath: 'idx' });
        ic.createIndex('jlpt', 'jlpt', { unique: false });
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
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = (e) => reject(e.target.error);
    }));
  },

  getCardState(idx) {
    return rw('card_states', 'readonly', s => s.get(idx));
  },

  upsertCardState(state) {
    return rw('card_states', 'readwrite', s => s.put(state));
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

  // ── imported cards ────────────────────────────────────────────────

  hasImportedDeck() {
    return openDB().then(db => new Promise((resolve, reject) => {
      const req = db.transaction('imported_cards', 'readonly').objectStore('imported_cards').count();
      req.onsuccess = (e) => resolve(e.target.result > 0);
      req.onerror   = (e) => reject(e.target.error);
    }));
  },

  getImportedCards() {
    return rw('imported_cards', 'readonly', s => s.getAll());
  },

  saveImportedCards(cards) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const t = db.transaction('imported_cards', 'readwrite');
      const s = t.objectStore('imported_cards');
      s.clear();
      cards.forEach(c => s.put(c));
      t.oncomplete = () => resolve(cards.length);
      t.onerror    = (e) => reject(e.target.error);
    }));
  },

  clearImportedCards() {
    return rw('imported_cards', 'readwrite', s => s.clear());
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
