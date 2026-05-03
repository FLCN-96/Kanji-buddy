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
  // Hot-spotlight multiplier system.
  //
  // The daily HOT challenge gives a bonus on the first run of the day —
  // GOLD (3×). Every subsequent run that day downgrades to SILVER (1.5×).
  // We track the claim per local date in localStorage; the key is intentionally
  // namespaced so ad-hoc clears don't nuke other progress.
  //
  // Mode pages must:
  //   1. Capture the tier *before* writing XP via `Daily.hotTier(modeId)`
  //      (so the end screen shows what was actually applied).
  //   2. Apply `Daily.hotMultiplier(modeId)` to the base XP.
  //   3. Call `Daily.claimHot(modeId)` synchronously, before the IDB save
  //      chain. The claim is just a localStorage write and must NOT be
  //      gated on saveSession/grantXp — iOS PWAs can suspend or navigate
  //      away before that promise chain resolves, leaving the flag
  //      unwritten and every run stuck on gold.
  // ──────────────────────────────────────────────────────────────
  const HOT_GOLD = 3;
  const HOT_SILVER = 1.5;
  const HOT_CLAIM_PREFIX = 'kb-hot-claimed:';

  function localDateKey(d) {
    const date = d || new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function isHotClaimed(d) {
    try { return localStorage.getItem(HOT_CLAIM_PREFIX + localDateKey(d)) === '1'; }
    catch (e) { return false; }
  }

  function claimHot(modeId, d) {
    // Only claim if this mode is actually today's hot pick — guards against
    // accidentally burning gold from a non-hot mode call site.
    if (modeId && hotChallengeId(d) !== modeId) return;
    try { localStorage.setItem(HOT_CLAIM_PREFIX + localDateKey(d), '1'); } catch (e) {}
  }

  function hotTier(modeId, d) {
    if (hotChallengeId(d) !== modeId) return null;
    return isHotClaimed(d) ? 'silver' : 'gold';
  }

  function hotMultiplier(modeId, d) {
    const tier = hotTier(modeId, d);
    if (tier === 'gold') return HOT_GOLD;
    if (tier === 'silver') return HOT_SILVER;
    return 1;
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
  const DECK_SIZES  = [3, 5, 7, 10];

  // Proportional budget split — NEW 40%, DUE 40%, LEECH 20% (with a floor of
  // 1 each). Cascade-fill below absorbs any shortfall when a bucket is empty.
  function defaultBudgets(size) {
    const s = size || DECK_SIZE;
    const n = Math.max(1, Math.round(s * 0.4));
    const d = Math.max(1, Math.round(s * 0.4));
    const l = Math.max(1, s - n - d);
    return { new: n, due: d, leech: l };
  }

  // Resolve the user's configured deck size (persisted in user.settings.deckSize).
  // Falls back to the system default when not set or out of range.
  function resolveDeckSize(user) {
    const raw = user && user.settings && user.settings.deckSize;
    const n = parseInt(raw, 10);
    return DECK_SIZES.includes(n) ? n : DECK_SIZE;
  }

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
    const b = defaultBudgets(size);
    let budgets = {
      new:   Math.min(b.new,   newCards.length),
      due:   Math.min(b.due,   dueStates.length),
      leech: Math.min(b.leech, leechStates.length),
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

  // ──────────────────────────────────────────────────────────────
  // nearUserPool — shared "level-appropriate cards" filter for the
  // challenge modes. Without this, brand-new operators would face the
  // full ~2200-card library on day one (e.g. JLPT-1 kanji as a Match
  // pair, or as a TimeAttack distractor).
  //
  // Composition (in priority order):
  //   1. Discovered cards — anything in card_states (the user has seen
  //      it at least once via Run).
  //   2. Frontier — the next FRONTIER_DEFAULT cards by idx that share a
  //      JLPT tier with what the user already knows. Lets the pool
  //      grow with the user without sudden tier jumps.
  //   3. Floor pad — if the pool is still under MIN_POOL_DEFAULT, pad
  //      from the start of cards.json (which is roughly easy → hard).
  //
  // Brand-new users (no card_states): just the first MIN_POOL_DEFAULT
  // cards, so games still have enough material to deal a question.
  //
  // Pool sizing: defaults are tuned so a fast 120s TimeAttack (≈100
  // questions at 1.2s/each) doesn't exhaust the pool and start
  // repeating cards. Match and Survival benefit from the headroom too.
  //
  // Options:
  //   minPool      floor for the returned pool (default 150)
  //   frontier     upcoming-new cards to include (default 80)
  //   jlpt         restrict the result to a specific JLPT tier (used
  //                by Survival's depth scaffolding)
  // ──────────────────────────────────────────────────────────────

  const MIN_POOL_DEFAULT = 150;
  const FRONTIER_DEFAULT = 80;

  function nearUserPool(cards, cardStates, opts) {
    const o = opts || {};
    const minPool = o.minPool || MIN_POOL_DEFAULT;
    const frontier = o.frontier == null ? FRONTIER_DEFAULT : o.frontier;
    const jlpt = o.jlpt;

    if (!cards || !cards.length) return [];

    const seenIdx = new Set();
    for (const s of (cardStates || [])) {
      if (s && s.idx != null) seenIdx.add(s.idx);
    }

    let result;
    if (seenIdx.size === 0) {
      // Brand-new operator: hand them the first slice of the deck.
      // cards.json is roughly ordered easy → hard, so this is JLPT-5-ish.
      result = cards.slice(0, Math.max(minPool, 1));
    } else {
      const seen = cards.filter(c => seenIdx.has(c.idx));
      const seenJlpts = new Set(seen.map(c => c.jlpt));
      const upcoming = cards
        .filter(c => !seenIdx.has(c.idx) && seenJlpts.has(c.jlpt))
        .sort((a, b) => a.idx - b.idx)
        .slice(0, frontier);
      result = [...seen, ...upcoming];

      if (result.length < minPool) {
        const haveIdx = new Set(result.map(c => c.idx));
        const pad = cards
          .filter(c => !haveIdx.has(c.idx))
          .sort((a, b) => a.idx - b.idx)
          .slice(0, minPool - result.length);
        result = [...result, ...pad];
      }
    }

    if (jlpt != null) {
      const tiered = result.filter(c => c.jlpt === jlpt);
      // Don't return an unusable pool — fall back to the full near-user
      // pool if the requested tier is empty/too small. Caller can still
      // inspect length to decide whether to deal.
      if (tiered.length >= 4) return tiered;
    }
    return result;
  }

  // O(1) lookup for "has this card been encountered through Run?". Challenge
  // modes draw from nearUserPool, which can include cards the user has never
  // actually studied — those should be flagged in-play so the user knows the
  // attempt is a guess (and that the result isn't graded into SRS, since
  // challenges don't touch card_states regardless).
  function seenIdxSet(cardStates) {
    return new Set((cardStates || []).map(s => s.idx));
  }

  window.Daily = {
    daySeed,
    hotChallengeId,
    HOT_GOLD,
    HOT_SILVER,
    // Legacy alias — pre-tiered code paths assumed a single 3× multiplier.
    // Kept so any straggler reference still resolves to the gold value.
    HOT_MULTIPLIER: HOT_GOLD,
    isHotClaimed,
    claimHot,
    hotTier,
    hotMultiplier,
    selectDailyDeck,
    resolveDeckSize,
    DECK_SIZE,
    DECK_SIZES,
    LEECH_LAPSES,
    nearUserPool,
    seenIdxSet,
    MIN_POOL_DEFAULT,
    FRONTIER_DEFAULT,
  };
})();
