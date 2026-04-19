// Shared daily-rotation helpers. Used by Home + each challenge mode so that
// the daily HOT pick (and its 3× XP multiplier) agree across screens.

(function () {
  const CHALLENGE_ORDER = ['time', 'survival', 'streak', 'leech', 'match'];

  function daySeed(d) {
    const date = d || new Date();
    const y = date.getFullYear();
    const m = date.getMonth();
    const day = date.getDate();
    let h = y * 1469598 + m * 8707 + day * 257 + 0x9e3779b1;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    return Math.abs(h | 0);
  }

  function hotChallengeId(d) {
    return CHALLENGE_ORDER[daySeed(d) % CHALLENGE_ORDER.length];
  }

  // ──────────────────────────────────────────────────────────────
  // Weighted deck selection for the Daily Run.
  //
  // Budget for a small deck (5 cards by default):
  //   - 2 NEW     (cards the operator has never reviewed)
  //   - 2 DUE     (card_states whose due_date ≤ now, lowest lapses first)
  //   - 1 LEECH   (card_states with lapses ≥ LEECH_LAPSES)
  //
  // Empty slots cascade: leech → due → new (or the reverse) so we always
  // deliver the full deck size when the library supports it.
  //
  // Returns an array of card objects (from cards.json) augmented with an
  // internal `_bucket` field ('new' | 'due' | 'leech'). The UI uses this to
  // decide whether a card goes through the intro phase.
  // ──────────────────────────────────────────────────────────────

  const LEECH_LAPSES = 3;
  const DECK_SIZE   = 5;
  const NEW_BUDGET   = 2;
  const DUE_BUDGET   = 2;
  const LEECH_BUDGET = 1;

  function selectDailyDeck(cards, cardStates, size = DECK_SIZE, now = new Date()) {
    if (!cards || !cards.length) return [];
    const byIdx = new Map(cards.map(c => [c.idx, c]));
    const states = cardStates || [];
    const nowIso = now.toISOString();

    const leechStates = [];
    const dueStates = [];
    const reviewedIdx = new Set();
    const todayStr = now.toDateString();
    for (const s of states) {
      reviewedIdx.add(s.idx);
      if ((s.lapses || 0) >= LEECH_LAPSES) leechStates.push(s);
      else if (
        s.due_date && s.due_date <= nowIso &&
        (!s.last_reviewed || new Date(s.last_reviewed).toDateString() !== todayStr)
      ) dueStates.push(s);
    }
    leechStates.sort((a, b) => (b.lapses || 0) - (a.lapses || 0));
    dueStates.sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));

    const newCards = cards.filter(c => !reviewedIdx.has(c.idx));
    // stable new-card priority: by idx (cards.json is roughly freq/JLPT ordered)
    newCards.sort((a, b) => a.idx - b.idx);

    // initial budgets
    let budgets = {
      new:   Math.min(NEW_BUDGET,   newCards.length),
      due:   Math.min(DUE_BUDGET,   dueStates.length),
      leech: Math.min(LEECH_BUDGET, leechStates.length),
    };

    // cascade remaining capacity: leech → due → new
    let remaining = size - budgets.new - budgets.due - budgets.leech;
    while (remaining > 0) {
      const before = remaining;
      if (dueStates.length > budgets.due)   { budgets.due++;   remaining--; }
      if (remaining > 0 && newCards.length  > budgets.new)   { budgets.new++;   remaining--; }
      if (remaining > 0 && leechStates.length > budgets.leech) { budgets.leech++; remaining--; }
      if (remaining === before) break; // nothing to take anywhere
    }

    const take = (list, n, bucket) =>
      list.slice(0, n).map(s => {
        const c = s.idx !== undefined && byIdx.has(s.idx) ? byIdx.get(s.idx) : s;
        return c ? { ...c, _bucket: bucket, _state: s.idx !== undefined ? s : null } : null;
      }).filter(Boolean);

    const newSel   = take(newCards,    budgets.new,   'new');
    const dueSel   = take(dueStates,   budgets.due,   'due');
    const leechSel = take(leechStates, budgets.leech, 'leech');

    // NEW first so the intro walkthrough introduces them before the quiz
    return [...newSel, ...dueSel, ...leechSel];
  }

  window.Daily = {
    daySeed,
    hotChallengeId,
    HOT_MULTIPLIER: 3,
    selectDailyDeck,
    DECK_SIZE,
  };
})();
