// SM-2-derived scheduler — exposed as window.Srs.
//
// Verdict → quality mapping (SM-2 grades 0–5):
//   miss → 1 (lapse: forgot but recognized once shown)
//   hard → 3 (correct but effortful)
//   ok   → 4 (correct with hesitation)
//   easy → 5 (perfect recall)
//
// Changes vs textbook SM-2 (rationale in comments below):
//   • HARD uses a fixed 1.2× growth factor instead of prev × ease. Classic
//     SM-2 grows hard and ok at the same rate (both use EF), which makes
//     the hard button cosmetic. Modern schedulers (Anki v2/FSRS) split
//     them — hard genuinely slows the card.
//   • MISS drops ease linearly by 0.20 instead of SM-2's quadratic drop
//     (which craters ease by ~0.54 on a single miss). A single slip
//     should not halve a card's growth rate.
//   • MATURE-CARD LAPSE RECOVERY: when a card with interval ≥ 21 days
//     lapses, we remember its pre-lapse interval in `lapsed_from_interval`.
//     The first pass after the lapse recovers to 25% of that rather than
//     flat-resetting to 1d graduation — so a 60d card that slipped and
//     is immediately recalled comes back in ~15 days, not 1. Preserves
//     the "cost already paid" on stable cards without ignoring the slip.
//
// Lapse path (q < 3): interval resets to 0 (6h same-day relearn),
// reviews counter resets to 0, lapses++, ease decreases.
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
  const HARD_FACTOR    = 1.2;
  const FUZZ_THRESHOLD = 4;
  const FUZZ_RATIO     = 0.15;
  const MATURE_DAYS    = 21;
  const RECOVER_RATIO  = 0.25;
  const MISS_EASE_DROP = 0.20;
  const HARD_EASE_DROP = 0.15;
  const EASY_EASE_GAIN = 0.15;

  function fuzzInterval(interval) {
    if (interval < FUZZ_THRESHOLD) return interval;
    const spread = Math.max(1, Math.round(interval * FUZZ_RATIO));
    const delta = Math.floor(Math.random() * (2 * spread + 1)) - spread;
    return Math.max(1, interval + delta);
  }

  function schedule(state, verdict) {
    const q  = QUALITY[verdict] ?? 3;
    const ef = (state && state.ease_factor) || INITIAL_EASE;

    // Ease delta — linear, so a single slip doesn't cripple a card.
    let nextEf;
    if (q === 1)      nextEf = Math.max(MIN_EASE, ef - MISS_EASE_DROP);
    else if (q === 3) nextEf = Math.max(MIN_EASE, ef - HARD_EASE_DROP);
    else if (q === 4) nextEf = ef;
    else              nextEf = ef + EASY_EASE_GAIN;

    const prevInterval = (state && state.interval_days) || 0;
    const prevReviews  = (state && state.reviews)       || 0;
    const prevLapses   = (state && state.lapses)        || 0;
    const lapsedFrom   = (state && state.lapsed_from_interval) || 0;

    let nextInterval, nextReviews, nextLapses;
    let nextLapsedFrom = lapsedFrom;

    if (q < 3) {
      nextInterval = 0;
      nextReviews  = 0;
      nextLapses   = prevLapses + 1;
      // Only mature cards leave a recovery marker — for young cards the
      // lost progress wasn't worth much anyway and 1d graduation is correct.
      nextLapsedFrom = prevInterval >= MATURE_DAYS ? prevInterval : 0;
    } else {
      nextReviews = prevReviews + 1;
      nextLapses  = prevLapses;

      if (nextReviews === 1 && lapsedFrom >= MATURE_DAYS) {
        // Post-lapse recovery — reinstate a meaningful interval instead
        // of flat-resetting a hard-earned card to 1d.
        nextInterval = Math.max(1, Math.round(lapsedFrom * RECOVER_RATIO));
        nextLapsedFrom = 0;
      } else if (nextReviews === 1) {
        nextInterval = 1;
      } else if (nextReviews === 2) {
        nextInterval = 6;
      } else if (q === 3) {
        // Hard: genuinely slower than OK. prev+1 floor so it always moves.
        nextInterval = Math.max(prevInterval + 1, Math.round(prevInterval * HARD_FACTOR));
      } else {
        nextInterval = Math.max(1, Math.round(prevInterval * nextEf));
        if (q === 5) nextInterval = Math.max(nextInterval + 1, Math.round(nextInterval * EASY_BONUS));
      }
      nextInterval = fuzzInterval(nextInterval);
    }

    const now = new Date();
    const due = new Date(now);
    if (nextInterval === 0) due.setTime(due.getTime() + LAPSE_HOURS * 3600 * 1000);
    else                    due.setDate(due.getDate() + nextInterval);

    return {
      interval_days:         nextInterval,
      ease_factor:           nextEf,
      reviews:               nextReviews,
      lapses:                nextLapses,
      due_date:              due.toISOString(),
      last_reviewed:         now.toISOString(),
      lapsed_from_interval:  nextLapsedFrom,
    };
  }

  // Peek without writing — used by the UI to label verdict buttons with
  // the interval the user is about to lock in. Pure function of (state, v).
  function preview(state, verdict) {
    return schedule(state, verdict);
  }

  // Short label for a card's next interval after a verdict.
  function labelInterval(days) {
    if (!days || days <= 0) return '6h';
    if (days === 1)         return '1d';
    if (days < 30)          return `${days}d`;
    if (days < 365)         return `${Math.round(days / 30)}mo`;
    return `${Math.round(days / 365)}y`;
  }

  window.Srs = { schedule, preview, labelInterval, QUALITY, MIN_EASE, INITIAL_EASE };
})();
