// Hero + Stats components

const heroRomaji = (s) => {
  if (!window.Romaji || !s || s === '—') return '';
  return window.Romaji.toRomaji(s);
};

// C4: a subtle parallax push on the magenta ghost shadow that follows the
// cursor over the hero. Sets CSS custom properties --p-x / --p-y on the
// wrap; home.css uses them to nudge the ::before ghost in the opposite
// direction so the glyph and shadow pull apart slightly. Disabled on
// touch devices and when reduced-motion is on.
const useHeroParallax = () => {
  const wrapRef = React.useRef(null);
  React.useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    if (window.matchMedia && window.matchMedia('(hover: none)').matches) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const onMove = (e) => {
      const r = wrap.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width  - 0.5;
      const py = (e.clientY - r.top)  / r.height - 0.5;
      const dx = Math.max(-4, Math.min(4, px * 8));
      const dy = Math.max(-4, Math.min(4, py * 8));
      wrap.style.setProperty('--p-x', `${dx}px`);
      wrap.style.setProperty('--p-y', `${dy}px`);
    };
    const onLeave = () => {
      wrap.style.setProperty('--p-x', '0px');
      wrap.style.setProperty('--p-y', '0px');
    };
    wrap.addEventListener('mousemove', onMove);
    wrap.addEventListener('mouseleave', onLeave);
    return () => {
      wrap.removeEventListener('mousemove', onMove);
      wrap.removeEventListener('mouseleave', onLeave);
    };
  }, []);
  return { wrapRef };
};

const Hero = ({ kanji }) => {
  // `kanji` comes from cards.json: { k, mainOn, mainKun, mean, jlpt, strokes, ... }
  const { wrapRef } = useHeroParallax();
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
    <section className="kb-hero" data-screen-label="hero-kanji" ref={wrapRef}>
      <div className="kb-hero-strip">
        <span>▸ KANJI // today</span>
        <span className="mag">「{kun}」</span>
      </div>
      <div className="kb-hero-body">
        <div className="kb-hero-meta">
          <div className="kb-hero-reading">
            <span className="on">ON</span>
            <span className="r-stack">
              <span>{on}</span>
              <span className="r-romaji">{heroRomaji(on)}</span>
            </span>
          </div>
          <div className="kb-hero-reading">
            <span className="on">KUN</span>
            <span className="r-stack">
              <span>{kun}</span>
              <span className="r-romaji">{heroRomaji(kun)}</span>
            </span>
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

const DECK_DEFAULT = (typeof window !== 'undefined' && window.Daily?.DECK_SIZE) || 5;

const composeSub = (deck) => {
  const parts = [];
  if (deck.new)   parts.push(`new ${deck.new}`);
  if (deck.due)   parts.push(`review ${deck.due}`);
  if (deck.leech) parts.push(`leech ${deck.leech}`);
  return parts.join(' · ');
};

// Build the queue cells: one slot per planned card today (deckMax). Cells
// already reviewed render as filled-cyan ("done"); the rest carry their
// bucket colour (new=cyan-dim, due=amber, leech=magenta) in the order the
// Run flow plays them. So the bar fills left→right as the user progresses.
const buildDueCells = (deck, reviewedToday, deckMax) => {
  const cells = [];
  const done = Math.min(deckMax, reviewedToday);
  for (let i = 0; i < done; i++) cells.push('done');
  let remaining = deckMax - done;
  const push = (bucket, n) => {
    const k = Math.min(n, remaining);
    for (let i = 0; i < k; i++) cells.push(bucket);
    remaining -= k;
  };
  push('new',   deck.new);
  push('due',   deck.due);
  push('leech', deck.leech);
  // Defensive: pad with neutral if composition is short of the deck size
  // (shouldn't happen with cascade-fill, but guards transient mid-load states).
  while (cells.length < deckMax) cells.push('pending');
  return cells;
};

// DuePanel owns one question: "what's queued today and what's in it?"
// The midnight timer lives in <Countdown> right below — don't duplicate it here.
const DuePanel = ({ state, deck, reviewedToday = 0 }) => {
  const deckMax = (deck && deck.size) || DECK_DEFAULT;
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
          {Array.from({length: deckMax}).map((_, i) => <div key={i} className="kb-due-seg-s" />)}
        </div>
      </div>
    );
  }

  const total = deck.total;
  const isClear = total === 0;
  const cls = isClear ? 'dim' : 'cyan';
  const sub = isClear ? '✓ all caught up' : composeSub(deck);
  // Cleared state: fill every slot — the satisfying "all done" look.
  const cells = isClear
    ? Array(deckMax).fill('done')
    : buildDueCells(deck, reviewedToday, deckMax);

  return (
    <div className="kb-due" data-screen-label="due-panel">
      <div className="kb-due-head">
        <span className="kb-due-lbl">▸ DAILY QUEUE</span>
        <span className="kb-due-lbl">{isClear ? 'cleared' : `${Math.min(deckMax, reviewedToday)} / ${deckMax}`}</span>
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

// ─────────────────────────────────────────────────────────────
// LeechPanel — top-3 cards by lapse count, plus the aggregate
// count of everything at/above the leech threshold. Answers
// "which kanji keep biting me?" without making the user launch
// LeechHunt. If no cards qualify, the panel shows a clean-state
// ack so it doesn't just disappear (hiding an empty pane makes
// the layout jump every time it populates).
// ─────────────────────────────────────────────────────────────
const LEECH_THRESHOLD_DEFAULT = (typeof window !== 'undefined' && window.Daily?.LEECH_LAPSES) || 3;

const LeechPanel = ({ cards, states }) => {
  const { top, total } = React.useMemo(() => {
    if (!cards || !cards.length || !Array.isArray(states)) {
      return { top: null, total: 0 };
    }
    const byIdx = new Map(cards.map(c => [c.idx, c]));
    const ranked = (states || [])
      .filter(s => (s.lapses || 0) >= LEECH_THRESHOLD_DEFAULT)
      .sort((a, b) => (b.lapses || 0) - (a.lapses || 0));
    const topRows = ranked
      .slice(0, 3)
      .map(s => ({ state: s, card: byIdx.get(s.idx) }))
      .filter(x => x.card);
    return { top: topRows, total: ranked.length };
  }, [cards, states]);

  if (top === null) {
    return (
      <div className="kb-leech" data-screen-label="leech-panel">
        <div className="kb-leech-head">
          <span className="kb-leech-lbl">▸ LEECHES</span>
          <span className="kb-leech-meta is-dim">loading…</span>
        </div>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="kb-leech is-clean" data-screen-label="leech-panel">
        <div className="kb-leech-head">
          <span className="kb-leech-lbl">▸ LEECHES</span>
          <span className="kb-leech-meta">none · tight deck</span>
        </div>
        <div className="kb-leech-empty">✓ no card has slipped past the threshold yet</div>
      </div>
    );
  }

  return (
    <div className="kb-leech" data-screen-label="leech-panel">
      <div className="kb-leech-head">
        <span className="kb-leech-lbl">▸ LEECHES</span>
        <span className="kb-leech-meta">
          <b>{total}</b> flagged · top {top.length}
        </span>
      </div>
      <div className="kb-leech-list">
        {top.map(({ card, state }) => {
          const first = (card.mean || '').split(',')[0].trim();
          const interval = state.interval_days || 0;
          const nextLbl = interval > 0
            ? `${interval}d`
            : state.last_reviewed ? 'relearn' : '—';
          return (
            <div key={card.idx} className="kb-leech-row" title={card.mean || ''}>
              <span className="kb-leech-k">{card.k}</span>
              <span className="kb-leech-body">
                <span className="kb-leech-m">{first || '—'}</span>
                <span className="kb-leech-stats">
                  <span className="kb-leech-lap">×{state.lapses || 0} lapses</span>
                  <span className="kb-leech-sep">·</span>
                  <span className="kb-leech-int">{nextLbl}</span>
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Forecast panel — what's coming at you on the SRS calendar.
// Rotates through three framings of near-future review load: tomorrow's
// intake, the 7-day rolling total, and the heaviest single day in the
// next 30. The ladder story has moved to <LadderBar> below the challenge
// grid; this slot now answers "what did I just sign up for?" — the
// question overachievers actually care about post-grind.
// A 7-day sparkline replaces the old ring so the shape of the week is
// readable at a glance; colour tone tracks tomorrow's load severity
// (cyan = quiet, amber = busy, magenta = slammed).

// Per-tier accent shared by ForecastPanel's tone mapping AND LadderBar's
// per-tier segment colours. Cyan = easiest, magenta = hardest, mirroring
// the rank-ladder cyan→amber→magenta progression so the colour language
// stays consistent with XpBar.
const JLPT_TIER_META = {
  5: { label: 'N5', color: 'cyan'    },
  4: { label: 'N4', color: 'cyan'    },
  3: { label: 'N3', color: 'amber'   },
  2: { label: 'N2', color: 'magenta' },
  1: { label: 'N1', color: 'magenta' },
};

function computeTierProgress(cards, states) {
  if (!cards || !cards.length) {
    return { tiers: [], total: 0, done: 0, nextTier: null, extras: { total: 0, done: 0 } };
  }
  // "Done" = seen at least once in Run (reviews ≥ 1). Survives SM-2
  // lapse resets (which zero interval_days) — a card you've engaged
  // with is still progress, even if it's since slipped.
  const doneIdx = new Set();
  for (const s of (states || [])) {
    if ((s.reviews || 0) >= 1) doneIdx.add(s.idx);
  }
  const counts = { 5:{t:0,d:0}, 4:{t:0,d:0}, 3:{t:0,d:0}, 2:{t:0,d:0}, 1:{t:0,d:0} };
  // Jōyō kanji that aren't in any JLPT tier (cards.json marks them jlpt=0).
  // 163 such cards in the current deck — they're real, you study them via
  // Run like any other card, so they have to count toward the overall
  // total/done. Without this they were silently dropped, capping the
  // denominator at 1973 instead of the deck's actual 2136.
  const extras = { total: 0, done: 0 };
  for (const c of cards) {
    const j = c.jlpt;
    if (counts[j]) {
      counts[j].t += 1;
      if (doneIdx.has(c.idx)) counts[j].d += 1;
    } else {
      extras.total += 1;
      if (doneIdx.has(c.idx)) extras.done += 1;
    }
  }
  const tiers = [5,4,3,2,1].map(j => ({
    jlpt:  j,
    label: JLPT_TIER_META[j].label,
    color: JLPT_TIER_META[j].color,
    total: counts[j].t,
    done:  counts[j].d,
  }));
  const total = tiers.reduce((a,t)=>a+t.total,0) + extras.total;
  const done  = tiers.reduce((a,t)=>a+t.done,0)  + extras.done;
  // Next tier = easiest not-yet-complete JLPT tier (N5 first, N1 last).
  // Extras aren't a "next tier" — they're a post-JLPT flat group, surfaced
  // separately by the panel when JLPT is fully cleared.
  const nextTier = tiers.find(t => t.total > 0 && t.done < t.total) || null;
  return { tiers, total, done, nextTier, extras };
}

// ─────────────────────────────────────────────────────────────
// Forecast computation — buckets card_states due_dates by
// calendar-day offset from today for the next 30 days, then
// pulls out the summary metrics the rotating panel surfaces.
// Offset 1 = tomorrow, 7 = one week out, etc. Overdue / today
// are intentionally excluded (the DuePanel already owns those).
// ─────────────────────────────────────────────────────────────
const FORECAST_HORIZON = 30;
const FORECAST_WEEK    = 7;

function computeForecast(states, now) {
  const today = new Date(now || new Date());
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const byDay = new Map();
  let hasFuture = false;

  for (const s of (states || [])) {
    if (!s || !s.due_date) continue;
    const due = new Date(s.due_date);
    due.setHours(0, 0, 0, 0);
    const offset = Math.round((due.getTime() - todayMs) / 86400000);
    if (offset < 1 || offset > FORECAST_HORIZON) continue;
    byDay.set(offset, (byDay.get(offset) || 0) + 1);
    hasFuture = true;
  }

  let week = 0;
  for (let d = 1; d <= FORECAST_WEEK; d++) week += byDay.get(d) || 0;

  let peakOffset = null, peakCount = 0;
  for (const [off, cnt] of byDay) {
    if (cnt > peakCount) { peakCount = cnt; peakOffset = off; }
  }

  let nextDueOffset = null;
  for (let d = 1; d <= FORECAST_HORIZON; d++) {
    if (byDay.has(d)) { nextDueOffset = d; break; }
  }

  return {
    byDay,
    tomorrow: byDay.get(1) || 0,
    week,
    peakOffset,
    peakCount,
    nextDueOffset,
    hasFuture,
  };
}

function formatFutureLabel(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const wk = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
  return `${wk} +${offset}d`;
}

// Sparkline sitting in the ring slot — 7 vertical bars, index 0 =
// tomorrow. Heights normalised to the busiest day in the window so a
// light week still reads. Zero-load days render as a flat pip so the
// axis is always visible.
const ForecastSpark = ({ byDay }) => {
  const DAYS = 7;
  const vals = [];
  let max = 0;
  for (let d = 1; d <= DAYS; d++) {
    const v = byDay.get(d) || 0;
    vals.push(v);
    if (v > max) max = v;
  }
  const W = 52, H = 40;
  const bw = 4, gap = 4;
  const totalW = DAYS * bw + (DAYS - 1) * gap;
  const x0 = Math.floor((W - totalW) / 2);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="kb-forecast-spark" aria-hidden="true">
      <line x1="0" y1={H - 0.5} x2={W} y2={H - 0.5} className="kb-forecast-spark-base" />
      {vals.map((v, i) => {
        const ratio = max > 0 ? v / max : 0;
        const h = v > 0 ? Math.max(3, Math.round(ratio * (H - 4))) : 1;
        const x = x0 + i * (bw + gap);
        const y = H - h - 0.5;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={bw}
            height={h}
            className={v === 0 ? 'kb-forecast-spark-bar is-empty' : 'kb-forecast-spark-bar'}
          />
        );
      })}
    </svg>
  );
};

const ProgressPanel = ({ cards, states }) => {
  // Component name kept so App.jsx / shared imports don't have to
  // renumber. Conceptually this is now a "forecast" panel — see the
  // header comment above JLPT_TIER_META.
  const forecast = React.useMemo(
    () => computeForecast(states, new Date()),
    [states]
  );
  const { byDay, tomorrow, week, peakOffset, peakCount, nextDueOffset, hasFuture } = forecast;
  const loaded = Array.isArray(states);

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

  const frameCount = hasFuture ? 3 : 1;
  React.useEffect(() => {
    if (paused || reducedMotion || frameCount <= 1) return;
    const id = setInterval(() => setFrame(f => (f + 1) % frameCount), 4000);
    return () => clearInterval(id);
  }, [paused, reducedMotion, frameCount]);

  // Keep frame pointer in range when frameCount shrinks (e.g. deck
  // goes from scheduled → empty mid-session).
  React.useEffect(() => {
    if (frame >= frameCount) setFrame(0);
  }, [frameCount, frame]);

  // Tone tracks tomorrow's load severity so the whole panel reads at
  // a glance: cyan-quiet up to 10, amber-busy through 25, magenta
  // above. These thresholds are deliberately gentle — the idea is to
  // reassure a new user, not scream at an overachiever.
  const tone = tomorrow >= 26 ? 'magenta' : tomorrow >= 11 ? 'amber' : 'cyan';

  let head, headUnit, sub;
  if (!loaded) {
    head = '—'; headUnit = null; sub = 'loading schedule…';
  } else if (!hasFuture) {
    head = '0'; headUnit = 'queued'; sub = 'calendar clear · no reviews in next 30d';
  } else if (frame === 0) {
    head = `${tomorrow}`;
    headUnit = tomorrow === 1 ? 'due +1d' : 'due +1d';
    if (tomorrow === 0) {
      const nd = nextDueOffset || 1;
      sub = `quiet morning · next wave builds +${nd}d out`;
    } else if (tomorrow >= 26) {
      sub = 'heavy inbox · pace yourself';
    } else if (tomorrow >= 11) {
      sub = 'steady wave incoming';
    } else {
      sub = `light load after today's run`;
    }
  } else if (frame === 1) {
    head = `${week}`;
    headUnit = 'next 7d';
    const avg = Math.round(week / FORECAST_WEEK);
    sub = week === 0
      ? 'rolling week clear'
      : `rolling week · avg ${avg} / day`;
  } else {
    head = peakCount > 0 ? `${peakCount}` : '—';
    headUnit = peakOffset ? `peak +${peakOffset}d` : 'peak';
    sub = peakOffset
      ? `biggest day in next 30 · ${formatFutureLabel(peakOffset)}`
      : 'no future concentration';
  }

  return (
    <div
      className={`kb-progress is-forecast tier-${tone}`}
      data-screen-label="forecast-panel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="kb-progress-ring-wrap is-forecast">
        <ForecastSpark byDay={byDay} />
      </div>
      <div className="kb-progress-lbl">▸ FORECAST</div>
      <div className="kb-forecast-slide" key={frame}>
        <div className="kb-progress-val">
          {head}
          {headUnit && <span className="unit">{headUnit}</span>}
        </div>
        <div className="kb-progress-sub">{sub}</div>
      </div>
      {/* C3: tone ribbon — animates width on tier change so the tone shift
          is felt, not just colored. */}
      <div className={`kb-progress-ribbon tier-${tone}`} aria-hidden="true" key={`r-${tone}`} />
      {frameCount > 1 && (
        <div className="kb-progress-dots" aria-hidden="true">
          {Array.from({ length: frameCount }).map((_, i) => (
            <span key={i} className={i === frame ? 'is-on' : ''} />
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// LadderBar — segmented jōyō progress bar, rendered below the
// challenge grid. Each segment's flex-grow is proportional to its
// tier population so the bar visually encodes deck composition
// (N1 is more than half the deck). Per-segment fill shows
// done/total with that tier's colour. Jōyō-but-not-JLPT cards
// appear as a final "+" segment when any exist, so the 163
// extras aren't silently dropped.
// ─────────────────────────────────────────────────────────────
const LadderBar = ({ cards, states, onTierTap }) => {
  const { tiers, total, done, extras } = React.useMemo(
    () => computeTierProgress(cards, states),
    [cards, states]
  );
  const loaded = !!cards && !!cards.length;

  if (!loaded || !total) {
    return (
      <div className="kb-ladder" data-screen-label="ladder-bar">
        <div className="kb-ladder-head">
          <span className="kb-ladder-lbl">▸ JŌYŌ LADDER</span>
          <span className="kb-ladder-meta is-dim">loading…</span>
        </div>
        <div className="kb-ladder-bar" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="kb-ladder-seg is-loading" style={{ flex: 1 }} />
          ))}
        </div>
      </div>
    );
  }

  const showExtras = extras.total > 0;
  const segments = showExtras
    ? [...tiers, { label: '+', color: 'extra', total: extras.total, done: extras.done }]
    : tiers;

  const overallPct = Math.floor((done / total) * 100);
  const cleared = done >= total;

  return (
    <div className={`kb-ladder${cleared ? ' is-max' : ''}`} data-screen-label="ladder-bar">
      <div className="kb-ladder-head">
        <span className="kb-ladder-lbl">▸ JŌYŌ LADDER</span>
        <span className="kb-ladder-meta">
          <b className="kb-ladder-done">{done.toLocaleString()}</b>
          <span className="kb-ladder-sep">/</span>
          <span className="kb-ladder-total">{total.toLocaleString()}</span>
          <span className="kb-ladder-pct">· {overallPct}%</span>
        </span>
      </div>
      <div
        className="kb-ladder-bar"
        role="img"
        aria-label={`${done} of ${total} jōyō kanji learned, ${overallPct} percent`}
      >
        {segments.map(t => {
          const pct = t.total > 0 ? Math.min(100, Math.round((t.done / t.total) * 100)) : 0;
          const full = pct >= 100 && t.total > 0;
          // Pull the original tier object (carries jlpt for filtering) when
          // available; the "+" extras segment is detected by label.
          const original = tiers.find(x => x.label === t.label) || t;
          const handleClick = (e) => {
            if (!onTierTap) return;
            e.stopPropagation();
            onTierTap({ ...t, jlpt: original.jlpt, label: t.label, color: t.color });
          };
          return (
            <div
              key={t.label}
              className={`kb-ladder-seg tier-${t.color}${full ? ' is-full' : ''}${onTierTap ? ' is-tappable' : ''}`}
              style={{ flexGrow: t.total, flexShrink: 0, flexBasis: 0 }}
              title={`${t.label} · ${t.done.toLocaleString()} / ${t.total.toLocaleString()} (${pct}%) · tap for breakdown`}
              onClick={handleClick}
              role={onTierTap ? 'button' : undefined}
              tabIndex={onTierTap ? 0 : undefined}
            >
              <div className="kb-ladder-seg-fill" style={{ width: `${pct}%` }} />
            </div>
          );
        })}
      </div>
      <div className="kb-ladder-legend">
        {segments.map(t => (
          <div key={t.label} className={`kb-ladder-legend-item tier-${t.color}`}>
            <span className="kb-ladder-legend-dot" aria-hidden="true" />
            <span className="kb-ladder-legend-lbl">{t.label}</span>
            <span className="kb-ladder-legend-val">
              {t.done.toLocaleString()}/{t.total.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Rank table and rankFor() live in data/rank.js (loaded in every HTML).

const XpBar = ({ xp = 0 }) => {
  const R = window.Rank;
  const { cur, next, into, window: span, pct } = R
    ? R.getRankProgress(xp)
    : { cur: { label: 'RANK —', color: 'cyan', glyph: '·', threshold: 0 }, next: null, into: 0, window: 1, pct: 0 };
  // C2: fill animates from 0 → pct on first paint so recent gains are felt
  // visually. Subsequent xp bumps animate via CSS width transition baked
  // into .variant-xp-fill.
  const [shown, setShown] = React.useState(0);
  React.useEffect(() => {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(pct);
      return;
    }
    const id = requestAnimationFrame(() => setShown(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);
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
      <div className="variant-xp-bar"><div className="variant-xp-fill" style={{width:`${shown}%`}} /></div>
      <div className="variant-xp-meta">
        {next
          ? <><span>next: <b>{next.label}</b></span><span>{into.toLocaleString()} / {span.toLocaleString()} XP</span></>
          : <><span>— MAX RANK —</span><span>{xp.toLocaleString()} XP</span></>}
      </div>
    </div>
  );
};

Object.assign(window, { Hero, Countdown, DuePanel, LeechPanel, ProgressPanel, LadderBar, XpBar, formatCountdown, secondsUntilMidnight, computeForecast });
