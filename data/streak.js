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
})();
