// Lightweight detail popovers — opened when user taps a Home pane. All
// share the same .kb-pop-scrim + .kb-pop shell defined in home.css; ESC
// and scrim-click dismiss. No mutations — pure read.

const usePopKeys = (onClose) => {
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
};

const PopShell = ({ title, onClose, className = '', children, footer }) => {
  usePopKeys(onClose);
  return (
    <div className="kb-pop-scrim" onClick={onClose}>
      <div className={`kb-pop ${className}`} onClick={e => e.stopPropagation()}>
        <header className="kb-pop-top">
          <span>▸ {title}</span>
          <button className="kb-pop-x" onClick={onClose} aria-label="dismiss">╳</button>
        </header>
        {children}
        {footer || (
          <button className="kb-pop-ack" onClick={onClose}>▸ CLOSE</button>
        )}
      </div>
    </div>
  );
};

// ── B1 — Forecast 30-day grid ──────────────────────────────────────
const ForecastDetailPopover = ({ byDay, onClose }) => {
  const DAYS = 30;
  const cells = [];
  let max = 0;
  for (let d = 1; d <= DAYS; d++) {
    const v = (byDay && byDay.get && byDay.get(d)) || 0;
    cells.push(v);
    if (v > max) max = v;
  }
  const total = cells.reduce((a, b) => a + b, 0);
  const avg = Math.round(total / DAYS);
  const peakIdx = cells.reduce((bi, v, i, a) => v > a[bi] ? i : bi, 0);
  const peakOffset = peakIdx + 1;
  const fmt = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  return (
    <PopShell title="FORECAST · NEXT 30 DAYS" className="kb-pop-forecast" onClose={onClose}>
      <div className="kb-pop-stats">
        <div><span>{total}</span><em>total reviews</em></div>
        <div><span>{avg}</span><em>per-day avg</em></div>
        <div><span>{cells[peakIdx]}</span><em>peak +{peakOffset}d</em></div>
      </div>
      <div className="kb-pop-heatmap" role="img" aria-label={`${total} reviews over the next 30 days`}>
        {cells.map((v, i) => {
          const ratio = max > 0 ? v / max : 0;
          const isPeak = i === peakIdx && v > 0;
          const tone = v === 0 ? 'is-empty' : ratio >= 0.66 ? 'is-hot' : ratio >= 0.33 ? 'is-warm' : 'is-cool';
          return (
            <div
              key={i}
              className={`kb-pop-heatmap-cell ${tone}${isPeak ? ' is-peak' : ''}`}
              title={`+${i + 1}d · ${fmt(i + 1)} · ${v} review${v === 1 ? '' : 's'}`}
            >
              <span className="kb-pop-heatmap-day">{i + 1}</span>
              <span className="kb-pop-heatmap-bar" style={{ height: `${Math.max(8, Math.round(ratio * 100))}%` }} />
            </div>
          );
        })}
      </div>
      <div className="kb-pop-legend">
        <span><i className="kb-pop-swatch is-empty" /> none</span>
        <span><i className="kb-pop-swatch is-cool" /> light</span>
        <span><i className="kb-pop-swatch is-warm" /> busy</span>
        <span><i className="kb-pop-swatch is-hot" /> heavy</span>
      </div>
    </PopShell>
  );
};

// ── B2 — Daily deck breakdown ──────────────────────────────────────
const DeckBreakdownPopover = ({ deck, picks, onClose }) => {
  const total = (deck && deck.total) || 0;
  const groups = [
    { key: 'new',   label: 'NEW',   tone: 'cyan'    },
    { key: 'due',   label: 'DUE',   tone: 'amber'   },
    { key: 'leech', label: 'LEECH', tone: 'magenta' },
  ];
  return (
    <PopShell title="DAILY DECK · WHAT'S QUEUED" className="kb-pop-deck" onClose={onClose}>
      <div className="kb-pop-stats">
        <div><span>{total}</span><em>cards today</em></div>
        <div><span>{(deck && deck.size) || 0}</span><em>deck size</em></div>
        <div><span>{(deck && deck.leech) || 0}</span><em>leeches</em></div>
      </div>
      {total === 0 ? (
        <div className="kb-pop-empty">✓ daily quota cleared · come back tomorrow</div>
      ) : (
        <div className="kb-pop-deck-groups">
          {groups.map(g => {
            const picksOfBucket = (picks || []).filter(p => p._bucket === g.key);
            const n = (deck && deck[g.key]) || 0;
            if (n === 0) return null;
            return (
              <div key={g.key} className={`kb-pop-deck-group tone-${g.tone}`}>
                <div className="kb-pop-deck-grouphead">
                  <span>▸ {g.label}</span>
                  <span>×{n}</span>
                </div>
                <div className="kb-pop-deck-cards">
                  {picksOfBucket.map(p => (
                    <span key={p.idx} className="kb-pop-deck-k" title={p.mean || ''}>{p.k}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PopShell>
  );
};

// ── B4 — Streak history (calendar heatmap) ─────────────────────────
const StreakHistoryPopover = ({ user, onClose }) => {
  const [days, setDays] = React.useState(null);
  // Map of recovered days from the STREAK INJECT hotfix. Cells show a pixel
  // smiley overlay so the calendar doesn't read as if those days were lost.
  const recovered = React.useMemo(() => (
    (window.StreakInject && window.StreakInject.readRecoveredDays())
      ? window.StreakInject.readRecoveredDays()
      : {}
  ), []);
  React.useEffect(() => {
    if (!window.DB || !window.DB.getSessionsByDay) { setDays([]); return; }
    window.DB.getSessionsByDay(35).then(setDays).catch(() => setDays([]));
  }, []);
  const cur = user?.current_streak || 0;
  const best = user?.best_streak || 0;
  const lastIso = user?.last_session_date;
  const lastLbl = lastIso
    ? new Date(lastIso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : '—';
  const hasAnyRecovered = days && days.some(d => !!recovered[d.date]);
  return (
    <PopShell title="STREAK · LAST 35 DAYS" className="kb-pop-streak" onClose={onClose}>
      <div className="kb-pop-stats">
        <div><span>{cur}</span><em>current</em></div>
        <div><span>{best}</span><em>personal best</em></div>
        <div><span>{lastLbl}</span><em>last session</em></div>
      </div>
      {days === null ? (
        <div className="kb-pop-empty">loading…</div>
      ) : (
        <div className="kb-pop-cal" role="img" aria-label="calendar heatmap of recent sessions">
          {days.map(d => {
            const wasRecovered = !!recovered[d.date];
            const base = d.count > 1 ? 'is-hot' : d.count === 1 ? 'is-on' : 'is-off';
            const cls = `${base}${wasRecovered ? ' is-recovered' : ''}`;
            const dt = new Date(d.date + 'T00:00:00');
            const lbl = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            const tip = wasRecovered
              ? `${lbl} · patched by streak inject`
              : `${lbl} · ${d.count} session${d.count === 1 ? '' : 's'}`;
            return (
              <span
                key={d.date}
                className={`kb-pop-cal-cell ${cls}`}
                title={tip}
              />
            );
          })}
        </div>
      )}
      <div className="kb-pop-legend">
        <span><i className="kb-pop-swatch is-off" /> nothing</span>
        <span><i className="kb-pop-swatch is-on" /> 1 session</span>
        <span><i className="kb-pop-swatch is-hot" /> multiple</span>
        {hasAnyRecovered && (
          <span><i className="kb-pop-swatch is-recovered" /> patched</span>
        )}
      </div>
    </PopShell>
  );
};

// ── B5 — Full leech list ───────────────────────────────────────────
const LeechListPopover = ({ cards, states, onClose }) => {
  const rows = React.useMemo(() => {
    if (!cards || !Array.isArray(states)) return [];
    const byIdx = new Map(cards.map(c => [c.idx, c]));
    return (states || [])
      .filter(s => (s.lapses || 0) >= 3)
      .sort((a, b) => (b.lapses || 0) - (a.lapses || 0))
      .map(s => ({ state: s, card: byIdx.get(s.idx) }))
      .filter(x => x.card);
  }, [cards, states]);
  return (
    <PopShell title={`LEECHES · ${rows.length} FLAGGED`} className="kb-pop-leech" onClose={onClose}>
      {rows.length === 0 ? (
        <div className="kb-pop-empty">✓ no card has slipped past the threshold</div>
      ) : (
        <div className="kb-pop-leech-list">
          {rows.map(({ card, state }) => {
            const first = (card.mean || '').split(',')[0].trim();
            const interval = state.interval_days || 0;
            const nextLbl = interval > 0 ? `${interval}d` : (state.last_reviewed ? 'relearn' : '—');
            return (
              <div key={card.idx} className="kb-pop-leech-row" title={card.mean || ''}>
                <span className="kb-pop-leech-k">{card.k}</span>
                <span className="kb-pop-leech-meta">
                  <span className="kb-pop-leech-m">{first || '—'}</span>
                  <span className="kb-pop-leech-tags">
                    <span>×{state.lapses || 0} lapses</span>
                    <span className="kb-pop-leech-sep">·</span>
                    <span>next {nextLbl}</span>
                    <span className="kb-pop-leech-sep">·</span>
                    <span>JLPT N{card.jlpt || '—'}</span>
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </PopShell>
  );
};

// ── B6 — Hero kanji deep card (stroke order + full examples) ──────
const HeroDetailPopover = ({ card, onClose }) => {
  if (!card) return null;
  const exs = (card.ex || []);
  const on = card.on || [];
  const kun = card.kun || [];
  const romaji = (s) => (window.Romaji ? window.Romaji.toRomaji(s) : '');
  return (
    <PopShell title={`KANJI · ${card.k} · DETAIL`} className="kb-pop-hero" onClose={onClose}>
      <div className="kb-pop-hero-top">
        <div className="kb-pop-hero-glyph">{card.k}</div>
        <div className="kb-pop-hero-meta">
          <div className="kb-pop-hero-mean">"{card.mean || '—'}"</div>
          <div className="kb-pop-hero-tag">
            JLPT N{card.jlpt || '—'} · {card.strokes || '?'} {card.strokes === 1 ? 'stroke' : 'strokes'}
          </div>
        </div>
      </div>
      {card.svg && (
        <div className="kb-pop-hero-svg" dangerouslySetInnerHTML={{ __html: card.svg }} aria-label={`stroke order for ${card.k}`} />
      )}
      <div className="kb-pop-hero-readings">
        {on.map((r, i) => (
          <div key={'on' + i} className="kb-pop-hero-r">
            <span className="tag">ON</span>
            <span>{r.r}</span>
            <em>{romaji(r.r)}</em>
            {r.gloss && <span className="gloss">· {r.gloss}</span>}
          </div>
        ))}
        {kun.map((r, i) => (
          <div key={'kun' + i} className="kb-pop-hero-r">
            <span className="tag">KUN</span>
            <span>{r.r}</span>
            <em>{romaji(r.r)}</em>
            {r.gloss && <span className="gloss">· {r.gloss}</span>}
          </div>
        ))}
      </div>
      {exs.length > 0 && (
        <div className="kb-pop-hero-ex">
          <div className="kb-pop-hero-exhead">▸ EXAMPLES</div>
          {exs.map((e, i) => (
            <div key={i} className="kb-pop-hero-exrow">
              <span className="w">{e.w}</span>
              <span className="r">{e.r}</span>
              <span className="m">{e.m}</span>
            </div>
          ))}
        </div>
      )}
    </PopShell>
  );
};

// ── B7 — Jōyō ladder tier breakdown ────────────────────────────────
const LadderTierPopover = ({ tier, cards, states, onClose }) => {
  if (!tier) return null;
  const rows = React.useMemo(() => {
    if (!cards || !Array.isArray(states)) return [];
    const stateByIdx = new Map((states || []).map(s => [s.idx, s]));
    const inTier = (c) => tier.label === '+' ? !([5,4,3,2,1].includes(c.jlpt)) : c.jlpt === tier.jlpt;
    const all = cards.filter(inTier);
    return all.map(c => ({ card: c, state: stateByIdx.get(c.idx) }));
  }, [tier, cards, states]);
  const done = rows.filter(r => (r.state?.reviews || 0) >= 1);
  const remaining = rows.filter(r => !((r.state?.reviews || 0) >= 1));
  const pct = rows.length > 0 ? Math.round((done.length / rows.length) * 100) : 0;
  return (
    <PopShell title={`JŌYŌ LADDER · ${tier.label} · ${pct}%`} className={`kb-pop-tier tier-${tier.color}`} onClose={onClose}>
      <div className="kb-pop-stats">
        <div><span>{done.length}</span><em>learned</em></div>
        <div><span>{remaining.length}</span><em>remaining</em></div>
        <div><span>{rows.length}</span><em>total</em></div>
      </div>
      <div className="kb-pop-tier-section">
        <div className="kb-pop-tier-head">▸ NEXT UP · {Math.min(40, remaining.length)}</div>
        <div className="kb-pop-tier-grid">
          {remaining.slice(0, 40).map(r => (
            <span key={r.card.idx} className="kb-pop-tier-k" title={r.card.mean || ''}>{r.card.k}</span>
          ))}
        </div>
      </div>
      {done.length > 0 && (
        <div className="kb-pop-tier-section">
          <div className="kb-pop-tier-head">▸ LEARNED · sample {Math.min(40, done.length)}</div>
          <div className="kb-pop-tier-grid is-dim">
            {done.slice(0, 40).map(r => (
              <span key={r.card.idx} className="kb-pop-tier-k" title={r.card.mean || ''}>{r.card.k}</span>
            ))}
          </div>
        </div>
      )}
    </PopShell>
  );
};

// ── C8 — Changelog ────────────────────────────────────────────────
const ChangelogPopover = ({ onClose }) => {
  const [data, setData] = React.useState(null);
  React.useEffect(() => {
    fetch('./data/changelog.json', { cache: 'no-store' })
      .then(r => r.json())
      .then(setData)
      .catch(() => setData({ entries: [] }));
  }, []);
  const entries = (data && data.entries) || [];
  return (
    <PopShell title="CHANGELOG" className="kb-pop-changelog" onClose={onClose}>
      {data === null ? (
        <div className="kb-pop-empty">loading…</div>
      ) : entries.length === 0 ? (
        <div className="kb-pop-empty">no changelog entries yet</div>
      ) : (
        <ul className="kb-pop-changelog-list">
          {entries.map((e, i) => (
            <li key={i}>
              <div className="kb-pop-changelog-head">
                <b>{e.title}</b>
                <em>{e.date}{e.v && e.v !== 'current' ? ` · ${e.v}` : ''}</em>
              </div>
              {Array.isArray(e.notes) && (
                <ul>
                  {e.notes.map((n, j) => <li key={j}>{n}</li>)}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </PopShell>
  );
};

Object.assign(window, {
  ForecastDetailPopover,
  DeckBreakdownPopover,
  StreakHistoryPopover,
  LeechListPopover,
  HeroDetailPopover,
  LadderTierPopover,
  ChangelogPopover,
});
