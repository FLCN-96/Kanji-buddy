// MasteryDossier — RPG-codex style stack of per-kanji dossier cards.
//
// Filter and sort bars at the top. Each card is a vertically-stacked
// instrument readout for one kanji: glyph, meaning, JLPT/strokes, dates,
// interval, events strip. Only renders cards with at least 1 review.

const FILTERS = [
  { id: 'all',     lbl: 'all',     test: (r) => r.tier !== 'untouched' },
  { id: 'stable',  lbl: 'stable',  test: (r) => r.tier === 'stable' || r.tier === 'elite' },
  { id: 'mature',  lbl: 'mature',  test: (r) => r.tier === 'mature' || r.tier === 'stable' || r.tier === 'elite' },
  { id: 'rising',  lbl: 'rising',  test: (r) => r.tier === 'cleared' },
  { id: 'leech',   lbl: 'leech',   test: (r) => (r.state?.lapses || 0) >= 3 },
];

const SORTS = [
  { id: 'recent',   lbl: 'recent',     cmp: (a, b) => (b.state?.last_reviewed || '').localeCompare(a.state?.last_reviewed || '') },
  { id: 'mastery',  lbl: 'mastery ↑',  cmp: (a, b) => (b.state?.interval_days || 0) - (a.state?.interval_days || 0) },
  { id: 'az',       lbl: 'a → z',      cmp: (a, b) => (a.card.k || '').localeCompare(b.card.k || '') },
];

const fmtDate = (iso) => iso ? new Date(iso).toISOString().slice(5, 10) : '—';
const fmtInt  = (d) => d >= 365 ? `${Math.round(d/365*10)/10}y`
                    : d >= 30  ? `${Math.round(d/30)}mo`
                    : d > 0    ? `${d}d` : '—';

const Dossier = ({ row, recentEvents }) => {
  const { card, state, tier } = row;
  const mean = (card.mean || '').split(',')[0].trim();
  const ivl  = state?.interval_days || 0;
  const lapses = Math.floor(state?.lapses || 0);
  // Events strip: latest up-to-6 outcomes across modes. Falls back to a
  // synthesized strip from state.reviews if no card_events have been
  // captured yet — better than rendering an empty placeholder.
  const strip = (recentEvents || []).slice(0, 6).map(e => {
    const tone = ['hit','ok','easy'].includes(e.outcome) ? 'ok'
               : e.outcome === 'hard' ? 'meh'
               : 'bad';
    return { tone, mode: e.mode };
  });

  return (
    <article className={`md-dossier tier-${tier}`}>
      <header className="md-dossier-head">
        <span className="md-dossier-tier">[{tier.toUpperCase()}]</span>
        <span className="md-dossier-tag">N{card.jlpt || '+'} · {card.strokes || '—'}s</span>
      </header>
      <div className="md-dossier-k">{card.k}</div>
      <div className="md-dossier-mean">"{mean || '—'}"</div>
      <hr className="md-dossier-sep" />
      <dl className="md-dossier-stats">
        <div><dt>cleared</dt><dd>{fmtDate(state?.first_correct_at)}</dd></div>
        <div><dt>mature</dt><dd>{fmtDate(state?.first_mature_at)}</dd></div>
        <div><dt>interval</dt><dd>{fmtInt(ivl)}</dd></div>
        <div><dt>lapses</dt><dd>{lapses || '—'}</dd></div>
      </dl>
      <div className="md-dossier-events">
        <span className="md-dossier-events-lbl">events</span>
        {strip.length === 0
          ? <span className="md-dossier-events-empty">no cross-mode events yet</span>
          : strip.map((s, i) => (
              <span key={i} className={`md-dossier-event tone-${s.tone}`} title={s.mode}>
                {s.tone === 'ok' ? '✓' : s.tone === 'meh' ? '~' : '✗'}
              </span>
            ))
        }
      </div>
    </article>
  );
};

const MasteryDossier = ({ roster }) => {
  const [filterId, setFilterId] = React.useState('all');
  const [sortId,   setSortId]   = React.useState('recent');
  // Lazy-load card_events per dossier on hover/render. To stay cheap we
  // batch-fetch the visible set's events in one pass.
  const [eventsByIdx, setEventsByIdx] = React.useState(() => new Map());

  const filter = FILTERS.find(f => f.id === filterId) || FILTERS[0];
  const sort   = SORTS.find(s => s.id === sortId) || SORTS[0];

  const filtered = React.useMemo(() => {
    return (roster || []).filter(filter.test).sort(sort.cmp);
  }, [roster, filter, sort]);

  // Pull cross-mode events for the visible window (cap to first 60 to keep
  // the IDB chatter bounded). Re-runs when the filter or sort changes.
  React.useEffect(() => {
    if (!window.DB || !window.DB.getCardEvents) return;
    const window60 = filtered.slice(0, 60);
    let cancelled = false;
    Promise.all(window60.map(r =>
      window.DB.getCardEvents(r.card.idx, 8).then(evts => [r.card.idx, evts]).catch(() => [r.card.idx, []])
    )).then(pairs => {
      if (cancelled) return;
      const m = new Map();
      for (const [k, v] of pairs) m.set(k, (v || []).reverse());
      setEventsByIdx(m);
    });
    return () => { cancelled = true; };
  }, [filtered]);

  if (!roster || !roster.length) {
    return <div className="md-shell md-shell-loading" data-screen-label="mastery-dossier">▸ syncing…</div>;
  }

  return (
    <div className="md-shell" data-screen-label="mastery-dossier">
      <header className="md-controls">
        <div className="md-controls-group">
          <span className="md-controls-lbl">filter</span>
          {FILTERS.map(f => (
            <button
              key={f.id}
              type="button"
              className={`md-control${filterId === f.id ? ' is-on' : ''}`}
              onClick={() => setFilterId(f.id)}
            >{f.lbl}</button>
          ))}
        </div>
        <div className="md-controls-group">
          <span className="md-controls-lbl">sort</span>
          {SORTS.map(s => (
            <button
              key={s.id}
              type="button"
              className={`md-control${sortId === s.id ? ' is-on' : ''}`}
              onClick={() => setSortId(s.id)}
            >{s.lbl}</button>
          ))}
        </div>
        <div className="md-controls-count">{filtered.length} dossiers</div>
      </header>

      {filtered.length === 0 ? (
        <div className="md-empty">▸ no dossiers match — try a different filter</div>
      ) : (
        <div className="md-grid">
          {filtered.slice(0, 200).map(r => (
            <Dossier
              key={r.card.idx}
              row={r}
              recentEvents={eventsByIdx.get(r.card.idx)}
            />
          ))}
        </div>
      )}

      {filtered.length > 200 && (
        <div className="md-truncated">▸ showing first 200 of {filtered.length} · narrow the filter to see more</div>
      )}
    </div>
  );
};

Object.assign(window, { MasteryDossier });
