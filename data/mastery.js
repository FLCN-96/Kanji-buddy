// Mastery compute layer — exposed as window.Mastery.
//
// Builds the metric counts, milestone log, and roster the four Mastery views
// (Core / Constellation / Instrument / Dossier) and the Home summary panel
// all read from. Pure derives over card_states + sessions — no new captures.
//
// Tier ladder (each cell on the Home summary + headline on the Mastery page):
//   cleared  reviews >= 1  (card has been seen in a Run)
//   mature   first_mature_at set  (interval crossed 21d at some point)
//   stable   current interval_days >= 90
//   elite    current interval_days >= 365
//
// Once a card is mature it stays counted as mature even if it later lapses —
// the breadcrumb is sticky. "Stable" / "elite" describe present state and
// can move down if the card slips. Mirrors the way `first_correct_at` is
// sticky on card_states.

(function () {
  const MATURE_DAYS = 21;
  const STABLE_DAYS = 90;
  const ELITE_DAYS  = 365;

  // Returns 'untouched' | 'cleared' | 'mature' | 'stable' | 'elite'.
  // Driven off both the sticky breadcrumb (first_mature_at) and the current
  // interval so a once-mature card that's slipped reads as 'mature' rather
  // than dropping back to 'cleared'.
  function getMasteryTier(state) {
    if (!state) return 'untouched';
    const ivl = state.interval_days || 0;
    if (ivl >= ELITE_DAYS)  return 'elite';
    if (ivl >= STABLE_DAYS) return 'stable';
    if (state.first_mature_at) return 'mature';
    if ((state.reviews || 0) >= 1 || state.first_correct_at) return 'cleared';
    return 'untouched';
  }

  // Build the top-line metric counts. `sessions` is optional — if absent the
  // hoursStudied field is null rather than zero so the UI can tell the
  // difference between "no data loaded yet" and "no time logged".
  function computeMastery(cards, states, sessions) {
    const total = (cards && cards.length) || 0;
    let cleared = 0, mature = 0, stable = 0, elite = 0, longest = 0;
    for (const s of (states || [])) {
      const tier = getMasteryTier(s);
      if (tier === 'untouched') continue;
      cleared += 1;
      if (tier === 'mature' || tier === 'stable' || tier === 'elite') mature += 1;
      if (tier === 'stable' || tier === 'elite') stable += 1;
      if (tier === 'elite') elite += 1;
      if ((s.interval_days || 0) > longest) longest = s.interval_days || 0;
    }
    const hoursStudied = Array.isArray(sessions)
      ? Math.round(sessions.reduce((a, s) => a + (s.duration_s || 0), 0) / 360) / 10
      : null;
    return { cleared, mature, stable, elite, longest, hoursStudied, total };
  }

  // Recent milestones — pulls mature + cleared first-events from card_states,
  // sorts newest first. Used by the milestone strip in Core / Instrument and
  // the "recent dossiers" filter. Maturation events get priority since they
  // carry more weight emotionally; cleared events fill in the rest.
  function getRecentMilestones(cards, states, n) {
    const limit = n || 10;
    const byIdx = new Map((cards || []).map(c => [c.idx, c]));
    const rows = [];
    for (const s of (states || [])) {
      const card = byIdx.get(s.idx);
      if (!card) continue;
      if (s.first_mature_at) {
        rows.push({ idx: s.idx, k: card.k, kind: 'mature', date: s.first_mature_at });
      }
      if (s.first_correct_at) {
        rows.push({ idx: s.idx, k: card.k, kind: 'cleared', date: s.first_correct_at });
      }
    }
    rows.sort((a, b) => b.date.localeCompare(a.date));
    return rows.slice(0, limit);
  }

  // Maturation calendar: per-local-day count of cards whose first_mature_at
  // falls on that day, over the trailing `days` window. Feeds the heatmap in
  // the Instrument view. Mirrors DB.getSessionsByDay's date-key shape.
  function getMaturationCalendar(states, days) {
    const win = days || 60;
    const counts = new Map();
    for (const s of (states || [])) {
      if (!s.first_mature_at) continue;
      const d = new Date(s.first_mature_at);
      if (isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const out = [];
    const today = new Date(); today.setHours(0,0,0,0);
    for (let i = win - 1; i >= 0; i--) {
      const day = new Date(today.getTime() - i * 86400000);
      const key = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
      out.push({ date: key, count: counts.get(key) || 0 });
    }
    return out;
  }

  // XP velocity: per-local-day XP totals from sessions over the trailing
  // window. Returns array of { date, xp } oldest → newest. Drives the
  // sparkline in the Instrument view. Pure derive on existing sessions.
  function getXpVelocity(sessions, days) {
    const win = days || 30;
    const totals = new Map();
    for (const s of (sessions || [])) {
      if (!s.date) continue;
      const d = new Date(s.date);
      if (isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      totals.set(key, (totals.get(key) || 0) + (s.xp_earned || 0));
    }
    const out = [];
    const today = new Date(); today.setHours(0,0,0,0);
    for (let i = win - 1; i >= 0; i--) {
      const day = new Date(today.getTime() - i * 86400000);
      const key = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
      out.push({ date: key, xp: totals.get(key) || 0 });
    }
    return out;
  }

  // Full kanji roster augmented with mastery tier. Used by the Dossier and
  // Core views (Core renders all kanji, Dossier filters/sorts). Skips cards
  // missing a glyph defensively.
  function getMasteryRoster(cards, states) {
    const statesByIdx = new Map((states || []).map(s => [s.idx, s]));
    const rows = [];
    for (const c of (cards || [])) {
      if (!c || !c.k) continue;
      const s = statesByIdx.get(c.idx) || null;
      rows.push({ card: c, state: s, tier: getMasteryTier(s) });
    }
    return rows;
  }

  // JLPT tier breakdown of mastery — used by the Core view's band headers and
  // available to the summary panel if we ever want a 5th cell. Groups rows by
  // jlpt (5..1 + extras=0) and counts tier per band.
  function getJlptBreakdown(roster) {
    const bands = { 5:{}, 4:{}, 3:{}, 2:{}, 1:{}, 0:{} };
    for (const j of Object.keys(bands)) {
      bands[j] = { jlpt: +j, total: 0, cleared: 0, mature: 0, stable: 0, elite: 0 };
    }
    for (const r of (roster || [])) {
      const j = bands[r.card.jlpt] ? r.card.jlpt : 0;
      bands[j].total += 1;
      if (r.tier === 'untouched') continue;
      bands[j].cleared += 1;
      if (r.tier === 'mature' || r.tier === 'stable' || r.tier === 'elite') bands[j].mature += 1;
      if (r.tier === 'stable' || r.tier === 'elite') bands[j].stable += 1;
      if (r.tier === 'elite') bands[j].elite += 1;
    }
    return [5,4,3,2,1,0].map(j => bands[j]).filter(b => b.total > 0);
  }

  window.Mastery = {
    MATURE_DAYS, STABLE_DAYS, ELITE_DAYS,
    getMasteryTier,
    computeMastery,
    getRecentMilestones,
    getMaturationCalendar,
    getXpVelocity,
    getMasteryRoster,
    getJlptBreakdown,
  };
})();
