// Hero + dashboard tiles (DailyStrip, LeechPanel, ladder, XP).
// The daily-run launch lives in <DailyStrip>; <Countdown> + <DuePanel> +
// the RunPrimary daily-mode were collapsed into it during the Home reorg.

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

const secondsUntilMidnight = () => {
  const now = new Date();
  const mid = new Date(now);
  mid.setHours(24, 0, 0, 0);
  return Math.max(0, Math.floor((mid - now) / 1000));
};

// ─────────────────────────────────────────────────────────────
// DailyStrip — the daily-run launcher and status line. Two
// states share the strip:
//   • READY: icon cross-fades between ○ and today's hero kanji,
//            label "DAILY · READY", N empty cells coloured by
//            bucket (new/due/leech) plus any cells already done.
//            Tapping fires onRun.
//   • DONE:  ✓ glyph, label "NEXT IN HH:MM" (ticks every second),
//            all cells filled, tap is a no-op.
// Replaces the old Countdown + DuePanel + RunPrimary daily-mode
// triad — one tap-target, one row, one story.
// ─────────────────────────────────────────────────────────────
const DECK_DEFAULT = (typeof window !== 'undefined' && window.Daily?.DECK_SIZE) || 5;

const buildStripCells = (deck, reviewedToday, deckMax) => {
  const cells = [];
  const done = Math.min(deckMax, reviewedToday);
  for (let i = 0; i < done; i++) cells.push('done');
  let remaining = deckMax - done;
  const push = (bucket, n) => {
    const k = Math.min(n, remaining);
    for (let i = 0; i < k; i++) cells.push(bucket);
    remaining -= k;
  };
  push('new',   deck.new || 0);
  push('due',   deck.due || 0);
  push('leech', deck.leech || 0);
  while (cells.length < deckMax) cells.push('pending');
  return cells;
};

const DailyStrip = ({ state, deck, reviewedToday = 0, todayKanji, onRun }) => {
  const loading = state === 'loading' || !deck;
  const clear   = state === 'clear';
  const deckMax = (deck && deck.size) || DECK_DEFAULT;

  // Live midnight tick only while DONE — the timer is only shown then,
  // and Home re-mounts on date change so a perpetual interval would burn
  // cycles for nothing in the READY case.
  const [sec, setSec] = React.useState(secondsUntilMidnight);
  React.useEffect(() => {
    if (!clear) return;
    const t = setInterval(() => setSec(secondsUntilMidnight()), 1000);
    setSec(secondsUntilMidnight());
    return () => clearInterval(t);
  }, [clear]);

  let cells;
  if (loading) {
    cells = Array(deckMax).fill('pending');
  } else if (clear) {
    cells = Array(deckMax).fill('done');
  } else {
    cells = buildStripCells(deck, reviewedToday, deckMax);
  }

  const label = loading
    ? 'DAILY · syncing…'
    : clear
      ? `NEXT IN ${formatCountdown(sec)}`
      : 'DAILY · READY';

  const sub = loading
    ? 'loading deck…'
    : clear
      ? '✓ quota cleared · review any time'
      : `${deck.total} ${deck.total === 1 ? 'card' : 'cards'} queued`;

  const cls = `kb-daily-strip`
    + (loading ? ' is-loading' : '')
    + (clear   ? ' is-done'    : '');

  const handleClick = (loading || clear) ? undefined : onRun;
  const Tag = handleClick ? 'button' : 'div';
  const tagProps = handleClick
    ? { type: 'button', onClick: handleClick }
    : { 'aria-disabled': 'true' };

  return (
    <Tag
      {...tagProps}
      className={cls}
      data-screen-label={clear ? 'daily-strip-done' : 'daily-strip-ready'}
    >
      <div className="kb-daily-strip-icon" aria-hidden>
        {clear ? (
          <span className="kb-daily-strip-icon-check">✓</span>
        ) : (
          <>
            <span className="kb-daily-strip-icon-circle">○</span>
            <span className="kb-daily-strip-icon-k" lang="ja">{todayKanji?.k || '·'}</span>
          </>
        )}
      </div>
      <div className="kb-daily-strip-body">
        <div className="kb-daily-strip-label">{label}</div>
        <div className="kb-daily-strip-sub">{sub}</div>
        <div className="kb-daily-strip-cells">
          {cells.map((bucket, i) => (
            <span key={i} className={`kb-daily-strip-cell is-${bucket}`} />
          ))}
        </div>
      </div>
      {!clear && !loading && (
        <span className="kb-daily-strip-arrow" aria-hidden>▸</span>
      )}
    </Tag>
  );
};

// ─────────────────────────────────────────────────────────────
// LeechPanel — top-3 cards by lapse count, plus the aggregate
// count of everything at/above the leech threshold. Renders
// nothing when the leech list is empty (Home gates it on the
// caller side so the spacing collapses cleanly).
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

  if (total === 0) return null;

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
                  <span className="kb-leech-lap">×{Math.floor(state.lapses || 0)} lapses</span>
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

// Per-tier accent shared by LadderBar's per-tier segment colours.
// Cyan = easiest, magenta = hardest, mirroring the rank-ladder
// cyan→amber→magenta progression so the colour language stays
// consistent with XpBar.
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
  const nextTier = tiers.find(t => t.total > 0 && t.done < t.total) || null;
  return { tiers, total, done, nextTier, extras };
}

// ─────────────────────────────────────────────────────────────
// LadderBar — segmented jōyō progress bar. Each segment's
// flex-grow is proportional to its tier population so the bar
// visually encodes deck composition (N1 is more than half the
// deck). Decorative only — tap targets live in <LadderChips>
// below the bar, since thin tiers (N5 ≈ 5% width) were
// effectively unreachable as click targets.
// ─────────────────────────────────────────────────────────────
const LadderBar = ({ cards, states }) => {
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
          return (
            <div
              key={t.label}
              className={`kb-ladder-seg tier-${t.color}${full ? ' is-full' : ''}`}
              style={{ flexGrow: t.total, flexShrink: 0, flexBasis: 0 }}
              title={`${t.label} · ${t.done.toLocaleString()} / ${t.total.toLocaleString()} (${pct}%)`}
            >
              <div className="kb-ladder-seg-fill" style={{ width: `${pct}%` }} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Chip row below LadderBar — guaranteed-size tap targets per tier,
// fixing the issue where N5's bar segment was only a few pixels wide
// and effectively impossible to tap. Tap → onTierTap(tier) opens the
// LadderTierPopover.
const LadderChips = ({ cards, states, onTierTap }) => {
  const { tiers, extras } = React.useMemo(
    () => computeTierProgress(cards, states),
    [cards, states]
  );
  const loaded = !!cards && !!cards.length;
  if (!loaded) return null;

  const chips = extras.total > 0
    ? [...tiers, { jlpt: 0, label: '+', color: 'extra', total: extras.total, done: extras.done }]
    : tiers;

  return (
    <div className="kb-ladder-chips" data-screen-label="ladder-chips">
      {chips.map(t => {
        const pct = t.total > 0 ? Math.round((t.done / t.total) * 100) : 0;
        const full = pct >= 100 && t.total > 0;
        return (
          <button
            key={t.label}
            type="button"
            className={`kb-ladder-chip tier-${t.color}${full ? ' is-full' : ''}`}
            onClick={() => onTierTap && onTierTap({ ...t })}
            title={`${t.label} · ${t.done.toLocaleString()} / ${t.total.toLocaleString()} (${pct}%) · tap for breakdown`}
          >
            <span className="kb-ladder-chip-lbl">{t.label}</span>
            <span className="kb-ladder-chip-pct">{pct}%</span>
          </button>
        );
      })}
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

Object.assign(window, { Hero, DailyStrip, LeechPanel, LadderBar, LadderChips, XpBar, formatCountdown, secondsUntilMidnight });
