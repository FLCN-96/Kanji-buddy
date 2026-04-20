// SM-2 scheduler — exposed as window.Srs.
//
// Verdict → quality mapping (SM-2 grades 0–5):
//   miss → 1 (lapse: forgot but recognized once shown)
//   hard → 3 (correct but effortful)
//   ok   → 4 (correct with hesitation)
//   easy → 5 (perfect recall)
//
// Lapse path (q < 3): interval resets, reviews counter resets to 0,
// lapses++, next due ~6h later (same-day relearn). Ease still decreases.
//
// Pass path (q ≥ 3): interval grows by ease factor, with fixed graduation
// steps for first two reviews (1d, then 6d). Easy (q=5) adds a 1.3× bonus.
//
// Ease factor update: EF' = EF + (0.1 − (5−q)(0.08 + (5−q)·0.02))
// Clamped at 1.3 per the original SM-2 spec.
//
// Interval fuzz: intervals ≥ FUZZ_THRESHOLD get ±~15% jitter (min ±1d)
// so same-day cohorts don't clump forever on every future review cycle.
// Applied after the easy bonus so `easy` still wins in expectation.
// The 1-day graduation step is never fuzzed — that's the learning check.

(function () {
  const QUALITY        = { miss: 1, hard: 3, ok: 4, easy: 5 };
  const MIN_EASE       = 1.3;
  const INITIAL_EASE   = 2.5;
  const LAPSE_HOURS    = 6;
  const EASY_BONUS     = 1.3;
  const FUZZ_THRESHOLD = 4;
  const FUZZ_RATIO     = 0.15;

  function fuzzInterval(interval) {
    if (interval < FUZZ_THRESHOLD) return interval;
    const spread = Math.max(1, Math.round(interval * FUZZ_RATIO));
    const delta = Math.floor(Math.random() * (2 * spread + 1)) - spread;
    return Math.max(1, interval + delta);
  }

  function schedule(state, verdict) {
    const q  = QUALITY[verdict] ?? 3;
    const ef = (state && state.ease_factor) || INITIAL_EASE;

    const efDelta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
    const nextEf  = Math.max(MIN_EASE, ef + efDelta);

    const prevInterval = (state && state.interval_days) || 0;
    const prevReviews  = (state && state.reviews)       || 0;
    const prevLapses   = (state && state.lapses)        || 0;

    let nextInterval, nextReviews, nextLapses;

    if (q < 3) {
      nextInterval = 0;                // same-day relearn
      nextReviews  = 0;                // reset the graduation ladder
      nextLapses   = prevLapses + 1;
    } else {
      nextReviews = prevReviews + 1;
      nextLapses  = prevLapses;
      if (nextReviews === 1)       nextInterval = 1;
      else if (nextReviews === 2)  nextInterval = 6;
      else                         nextInterval = Math.max(1, Math.round(prevInterval * nextEf));
      if (q === 5) nextInterval = Math.max(nextInterval + 1, Math.round(nextInterval * EASY_BONUS));
      nextInterval = fuzzInterval(nextInterval);
    }

    const now = new Date();
    const due = new Date(now);
    if (nextInterval === 0) due.setTime(due.getTime() + LAPSE_HOURS * 3600 * 1000);
    else                    due.setDate(due.getDate() + nextInterval);

    return {
      interval_days: nextInterval,
      ease_factor:   nextEf,
      reviews:       nextReviews,
      lapses:        nextLapses,
      due_date:      due.toISOString(),
      last_reviewed: now.toISOString(),
    };
  }

  window.Srs = { schedule, QUALITY, MIN_EASE, INITIAL_EASE };
})();
