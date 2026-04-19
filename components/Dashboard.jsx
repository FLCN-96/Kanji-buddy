// Hero + Stats components

const Hero = ({ kanji }) => {
  // `kanji` comes from cards.json: { k, mainOn, mainKun, mean, jlpt, strokes, ... }
  if (!kanji) {
    return (
      <section className="kb-hero" data-screen-label="hero-kanji">
        <div className="kb-hero-strip">
          <span>▸ KANJI // today</span>
          <span className="mag">「—」</span>
        </div>
        <div className="kb-hero-body">
          <div className="kb-hero-meta"><div className="kb-hero-tag">loading…</div></div>
          <div className="kb-hero-kanji">·</div>
        </div>
      </section>
    );
  }
  const on = kanji.mainOn || '—';
  const kun = kanji.mainKun || '—';
  const mean = kanji.mean ? `"${kanji.mean}"` : '';
  const jlptLbl = kanji.jlpt ? `JLPT N${kanji.jlpt}` : 'JLPT —';
  const strokeLbl = kanji.strokes ? `${kanji.strokes} ${kanji.strokes === 1 ? 'stroke' : 'strokes'}` : '';
  const tag = [jlptLbl, strokeLbl].filter(Boolean).join(' · ');
  return (
    <section className="kb-hero" data-screen-label="hero-kanji">
      <div className="kb-hero-strip">
        <span>▸ KANJI // today</span>
        <span className="mag">「{kun}」</span>
      </div>
      <div className="kb-hero-body">
        <div className="kb-hero-meta">
          <div className="kb-hero-reading">
            <span className="on">ON</span>{on}
          </div>
          <div className="kb-hero-reading">
            <span className="on">KUN</span>{kun}
          </div>
          {mean && <div className="kb-hero-mean">{mean}</div>}
          <div className="kb-hero-tag">{tag}</div>
        </div>
        <div className="kb-hero-kanji" data-k={kanji.k}>{kanji.k}</div>
      </div>
    </section>
  );
};

const formatCountdown = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
};

// Seconds until next local midnight — "daily drop" time.
const secondsUntilMidnight = () => {
  const now = new Date();
  const mid = new Date(now);
  mid.setHours(24, 0, 0, 0);
  return Math.max(0, Math.floor((mid - now) / 1000));
};

const Countdown = ({ state }) => {
  const [sec, setSec] = React.useState(secondsUntilMidnight);
  React.useEffect(() => {
    const t = setInterval(() => setSec(secondsUntilMidnight()), 1000);
    return () => clearInterval(t);
  }, []);
  let lbl, val, cls = '';
  if (state === 'clear') {
    lbl = 'NEXT DROP // in'; val = 'queue clear · review any time';
    cls = 'is-clear';
  } else {
    lbl = 'NEXT DROP // in'; val = 'new reviews unlock at 00:00';
  }
  return (
    <div className={`kb-countdown ${cls}`}>
      <div className="kb-countdown-l">
        <div className="kb-countdown-lbl">{lbl}</div>
        <div className="kb-countdown-val">{val}</div>
      </div>
      <div className="kb-countdown-time">{formatCountdown(sec)}</div>
    </div>
  );
};

const DECK_MAX = (typeof window !== 'undefined' && window.Daily?.DECK_SIZE) || 5;

const composeSub = (deck) => {
  const parts = [];
  if (deck.new)   parts.push(`new ${deck.new}`);
  if (deck.due)   parts.push(`review ${deck.due}`);
  if (deck.leech) parts.push(`leech ${deck.leech}`);
  return parts.join(' · ');
};

// Build the queue cells: one slot per planned card today (DECK_MAX). Cells
// already reviewed render as filled-cyan ("done"); the rest carry their
// bucket colour (new=cyan-dim, due=amber, leech=magenta) in the order the
// Run flow plays them. So the bar fills left→right as the user progresses.
const buildDueCells = (deck, reviewedToday) => {
  const cells = [];
  const done = Math.min(DECK_MAX, reviewedToday);
  for (let i = 0; i < done; i++) cells.push('done');
  let remaining = DECK_MAX - done;
  const push = (bucket, n) => {
    const k = Math.min(n, remaining);
    for (let i = 0; i < k; i++) cells.push(bucket);
    remaining -= k;
  };
  push('new',   deck.new);
  push('due',   deck.due);
  push('leech', deck.leech);
  // Defensive: if the deck composition is short of remaining slots (shouldn't
  // happen with cascade-fill but guards against transient mid-load states),
  // pad with neutral so the bar still renders 5 cells.
  while (cells.length < DECK_MAX) cells.push('pending');
  return cells;
};

// DuePanel owns one question: "what's queued today and what's in it?"
// The midnight timer lives in <Countdown> right below — don't duplicate it here.
const DuePanel = ({ state, deck, reviewedToday = 0 }) => {
  if (state === 'loading' || !deck) {
    return (
      <div className="kb-due" data-screen-label="due-panel">
        <div className="kb-due-head">
          <span className="kb-due-lbl">▸ DAILY QUEUE</span>
          <span className="kb-due-lbl">—</span>
        </div>
        <div className="kb-due-count dim">—<span className="unit">queued today</span></div>
        <div className="kb-due-sub">loading…</div>
        <div className="kb-due-seg">
          {Array.from({length: DECK_MAX}).map((_, i) => <div key={i} className="kb-due-seg-s" />)}
        </div>
      </div>
    );
  }

  const total = deck.total;
  const isClear = total === 0;
  const cls = isClear ? 'dim' : 'cyan';
  const sub = isClear ? '✓ all caught up' : composeSub(deck);
  // When the daily is cleared, show all 5 cells filled — the satisfying
  // "all done" look. Otherwise, render the in-progress mix.
  const cells = isClear
    ? Array(DECK_MAX).fill('done')
    : buildDueCells(deck, reviewedToday);

  return (
    <div className="kb-due" data-screen-label="due-panel">
      <div className="kb-due-head">
        <span className="kb-due-lbl">▸ DAILY QUEUE</span>
        <span className="kb-due-lbl">{isClear ? 'cleared' : `${Math.min(DECK_MAX, reviewedToday)} / ${DECK_MAX}`}</span>
      </div>
      <div className={`kb-due-count ${cls}`}>
        {total}<span className="unit">queued today</span>
      </div>
      <div className="kb-due-sub">{sub}</div>
      <div className="kb-due-seg">
        {cells.map((bucket, i) => (
          <div key={i} className={`kb-due-seg-s is-${bucket}`} />
        ))}
      </div>
    </div>
  );
};

// Progress panel — your position on the JLPT ladder.
// Rotates through four framings of the same truth so players can read
// their position as a tier name, a percentage, or a distance-remaining.
// Arc colour tracks the tier you're currently working on, so even a
// glance at the ring tells you where you are on the ladder.

// Per-tier accent for ring colour + headline glow. Cyan = easiest,
// magenta = hardest, mirroring the rank-ladder cyan→magenta→amber
// progression so the colour language stays consistent with XpBar.
const JLPT_TIER_META = {
  5: { label: 'N5', color: 'cyan'    },
  4: { label: 'N4', color: 'cyan'    },
  3: { label: 'N3', color: 'amber'   },
  2: { label: 'N2', color: 'magenta' },
  1: { label: 'N1', color: 'magenta' },
};

function computeTierProgress(cards, states) {
  if (!cards || !cards.length) {
    return { tiers: [], total: 0, done: 0, nextTier: null };
  }
  // "Done" = seen at least once in Run (reviews ≥ 1). Survives SM-2
  // lapse resets (which zero interval_days) — a card you've engaged
  // with is still progress, even if it's since slipped.
  const doneIdx = new Set();
  for (const s of (states || [])) {
    if ((s.reviews || 0) >= 1) doneIdx.add(s.idx);
  }
  const counts = { 5:{t:0,d:0}, 4:{t:0,d:0}, 3:{t:0,d:0}, 2:{t:0,d:0}, 1:{t:0,d:0} };
  for (const c of cards) {
    const j = c.jlpt;
    if (!counts[j]) continue;
    counts[j].t += 1;
    if (doneIdx.has(c.idx)) counts[j].d += 1;
  }
  const tiers = [5,4,3,2,1].map(j => ({
    jlpt:  j,
    label: JLPT_TIER_META[j].label,
    color: JLPT_TIER_META[j].color,
    total: counts[j].t,
    done:  counts[j].d,
  }));
  const total = tiers.reduce((a,t)=>a+t.total,0);
  const done  = tiers.reduce((a,t)=>a+t.done,0);
  // Next tier = easiest not-yet-complete tier (N5 first, N1 last).
  const nextTier = tiers.find(t => t.total > 0 && t.done < t.total) || null;
  return { tiers, total, done, nextTier };
}

const ProgressRing = ({ pct, color }) => {
  const r = 18;
  const circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct || 0));
  const offset = circ * (1 - p / 100);
  return (
    <svg className={`kb-progress-ring tier-${color}`} viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
      <circle cx="24" cy="24" r={r} className="kb-progress-ring-track" />
      <circle
        cx="24" cy="24" r={r}
        className="kb-progress-ring-arc"
        style={{ strokeDasharray: circ, strokeDashoffset: offset }}
        transform="rotate(-90 24 24)"
      />
    </svg>
  );
};

const ProgressPanel = ({ cards, states }) => {
  const progress = React.useMemo(
    () => computeTierProgress(cards, states),
    [cards, states]
  );
  const { total, done, nextTier } = progress;

  const [frame, setFrame] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const [reducedMotion, setReducedMotion] = React.useState(false);

  React.useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReducedMotion(!!mq.matches);
    apply();
    if (mq.addEventListener) mq.addEventListener('change', apply);
    else if (mq.addListener) mq.addListener(apply);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', apply);
      else if (mq.removeListener) mq.removeListener(apply);
    };
  }, []);

  React.useEffect(() => {
    if (paused || reducedMotion || !nextTier) return;
    const id = setInterval(() => setFrame(f => (f + 1) % 4), 4000);
    return () => clearInterval(id);
  }, [paused, reducedMotion, nextTier]);

  const overallPct = total > 0 ? Math.floor((done / total) * 100) : 0;
  const tierRemaining = nextTier ? Math.max(0, nextTier.total - nextTier.done) : 0;
  const tierPct = nextTier && nextTier.total > 0
    ? Math.floor((nextTier.done / nextTier.total) * 100)
    : 100;
  const tierColor = nextTier ? nextTier.color : 'cyan';

  let head, headUnit, sub, ringPct;
  if (!nextTier && total === 0) {
    // Cards haven't loaded yet (or DB is empty) — neutral placeholder
    // so we don't flash "MAX" during the first paint.
    head = '—';
    headUnit = null;
    sub = 'loading ladder…';
    ringPct = 0;
  } else if (!nextTier) {
    head = 'MAX';
    headUnit = null;
    sub = 'ladder complete · all tiers cleared';
    ringPct = 100;
  } else if (frame === 0) {
    head = nextTier.label;
    headUnit = 'next tier';
    sub = `${tierRemaining} ${tierRemaining === 1 ? 'card' : 'cards'} til clear`;
    ringPct = overallPct;
  } else if (frame === 1) {
    head = `${overallPct}`;
    headUnit = '% overall';
    sub = `${done.toLocaleString()} / ${total.toLocaleString()} learned`;
    ringPct = overallPct;
  } else if (frame === 2) {
    head = `${tierPct}`;
    headUnit = `% ${nextTier.label}`;
    sub = `${nextTier.done} / ${nextTier.total} in ${nextTier.label}`;
    ringPct = tierPct;
  } else {
    head = `${tierRemaining}`;
    headUnit = `til ${nextTier.label}`;
    sub = `${nextTier.done} / ${nextTier.total} in ${nextTier.label}`;
    ringPct = tierPct;
  }

  return (
    <div
      className={`kb-progress tier-${tierColor}`}
      data-screen-label="progress-panel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="kb-progress-ring-wrap">
        <ProgressRing pct={ringPct} color={tierColor} />
      </div>
      <div className="kb-progress-lbl">▸ PROGRESS</div>
      <div className="kb-progress-val">
        {head}
        {headUnit && <span className="unit">{headUnit}</span>}
      </div>
      <div className="kb-progress-sub">{sub}</div>
      {nextTier && (
        <div className="kb-progress-dots" aria-hidden="true">
          {[0,1,2,3].map(i => (
            <span key={i} className={i === frame ? 'is-on' : ''} />
          ))}
        </div>
      )}
    </div>
  );
};

// Rank table and rankFor() live in data/rank.js (loaded in every HTML).

const XpBar = ({ xp = 0 }) => {
  const R = window.Rank;
  const { cur, next, into, window: span, pct } = R
    ? R.getRankProgress(xp)
    : { cur: { label: 'RANK —', color: 'cyan', glyph: '·', threshold: 0 }, next: null, into: 0, window: 1, pct: 0 };
  return (
    <div className={`variant-xp tier-${cur.color}`} data-screen-label="xp-bar">
      <div className="variant-xp-head">
        <span>
          ▸ OPERATOR // <span className="rank">
            <span className="variant-xp-rank-glyph">{cur.glyph}</span>
            {cur.label}
          </span>
        </span>
        <span style={{color:'var(--accent-cyan)'}}>LIFETIME · {xp.toLocaleString()} XP</span>
      </div>
      <div className="variant-xp-bar"><div className="variant-xp-fill" style={{width:`${pct}%`}} /></div>
      <div className="variant-xp-meta">
        {next
          ? <><span>next: <b>{next.label}</b></span><span>{into.toLocaleString()} / {span.toLocaleString()} XP</span></>
          : <><span>— MAX RANK —</span><span>{xp.toLocaleString()} XP</span></>}
      </div>
    </div>
  );
};

Object.assign(window, { Hero, Countdown, DuePanel, ProgressPanel, XpBar, formatCountdown, secondsUntilMidnight });
