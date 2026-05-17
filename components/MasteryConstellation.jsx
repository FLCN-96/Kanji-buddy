// MasteryConstellation — SVG scatter plot of every learned kanji.
//
// X axis: when the card was first cleared (first_correct_at).
// Y axis: current interval, log-scaled so 1d → 1y reads smoothly.
// Color : JLPT tier (cyan for N5/N4, amber for N3, magenta for N2/N1).
// Pulse : cards that matured in the last 7 days twinkle.
//
// The chart is the artifact — no axes-with-numbers, no tooltips on hover by
// default. Tap a star to surface its detail in a side rail. Filter by tier.

const JLPT_COLOR = {
  5: 'var(--accent-cyan)',
  4: 'var(--accent-cyan)',
  3: 'var(--accent-amber, #f5a524)',
  2: 'var(--accent-magenta)',
  1: 'var(--accent-magenta)',
  0: 'var(--fg-2)',
};

const PLOT_PAD = { l: 28, r: 18, t: 18, b: 36 };
const PLOT_W   = 920;
const PLOT_H   = 460;

// Log scale 1d → 365d. Anything past 1y caps at the top edge.
function yForInterval(ivl) {
  const v = Math.max(1, Math.min(ivl || 0, 730));
  const t = Math.log(v) / Math.log(730);
  return (PLOT_H - PLOT_PAD.b) - t * (PLOT_H - PLOT_PAD.t - PLOT_PAD.b);
}

function xForDate(iso, range) {
  if (!iso || !range) return PLOT_PAD.l;
  const t = new Date(iso).getTime();
  if (isNaN(t) || range.span <= 0) return PLOT_PAD.l;
  const ratio = (t - range.min) / range.span;
  return PLOT_PAD.l + ratio * (PLOT_W - PLOT_PAD.l - PLOT_PAD.r);
}

const Star = ({ row, x, y, recent, onTap, focused }) => {
  const color = JLPT_COLOR[row.card.jlpt || 0] || JLPT_COLOR[0];
  const r = row.tier === 'elite'   ? 6.5
          : row.tier === 'stable'  ? 5.5
          : row.tier === 'mature'  ? 4.5
          :                          3.5;
  return (
    <g
      className={`mx-star tier-${row.tier}${recent ? ' is-recent' : ''}${focused ? ' is-focused' : ''}`}
      transform={`translate(${x},${y})`}
      onClick={() => onTap && onTap(row)}
    >
      {recent && (
        <circle r={r * 2.2} className="mx-star-halo" fill={color} opacity="0.12" />
      )}
      <circle r={r} fill={color} className="mx-star-core" />
      {row.tier === 'elite' && (
        <circle r={r + 2} className="mx-star-ring" stroke={color} fill="none" strokeWidth="0.7" />
      )}
    </g>
  );
};

const FilterChips = ({ active, onToggle }) => {
  const tiers = [
    { id: 5, lbl: 'N5' },
    { id: 4, lbl: 'N4' },
    { id: 3, lbl: 'N3' },
    { id: 2, lbl: 'N2' },
    { id: 1, lbl: 'N1' },
    { id: 0, lbl: '+'  },
  ];
  return (
    <div className="mx-filters">
      {tiers.map(t => (
        <button
          key={t.id}
          type="button"
          className={`mx-filter${active.has(t.id) ? ' is-on' : ''}`}
          onClick={() => onToggle(t.id)}
        >{t.lbl}</button>
      ))}
    </div>
  );
};

const DetailRail = ({ row, onClose }) => {
  if (!row) {
    return (
      <aside className="mx-rail is-empty">
        <div className="mx-rail-empty">▸ tap a star to inspect</div>
      </aside>
    );
  }
  const s = row.state || {};
  const mean = (row.card.mean || '').split(',')[0].trim();
  const fmt = (iso) => iso ? new Date(iso).toLocaleDateString() : '—';
  return (
    <aside className="mx-rail">
      <button className="mx-rail-close" onClick={onClose}>✕</button>
      <div className={`mx-rail-k tier-${row.tier}`}>{row.card.k}</div>
      <div className="mx-rail-mean">"{mean || '—'}"</div>
      <div className="mx-rail-tag">JLPT {row.card.jlpt ? `N${row.card.jlpt}` : '+'} · {row.card.strokes || '—'} strokes</div>
      <dl className="mx-rail-stats">
        <div><dt>tier</dt><dd>{row.tier}</dd></div>
        <div><dt>interval</dt><dd>{s.interval_days || 0}d</dd></div>
        <div><dt>reviews</dt><dd>{s.reviews || 0}</dd></div>
        <div><dt>lapses</dt><dd>{Math.floor(s.lapses || 0)}</dd></div>
        <div><dt>cleared</dt><dd>{fmt(s.first_correct_at)}</dd></div>
        <div><dt>matured</dt><dd>{fmt(s.first_mature_at)}</dd></div>
      </dl>
    </aside>
  );
};

const MasteryConstellation = ({ roster }) => {
  const [activeTiers, setActiveTiers] = React.useState(() => new Set([5,4,3,2,1,0]));
  const [focused, setFocused] = React.useState(null);

  const plotted = React.useMemo(() => {
    return (roster || [])
      .filter(r => r.state && r.state.first_correct_at)
      .filter(r => activeTiers.has(r.card.jlpt || 0));
  }, [roster, activeTiers]);

  const range = React.useMemo(() => {
    let min = Infinity, max = -Infinity;
    for (const r of plotted) {
      const t = new Date(r.state.first_correct_at).getTime();
      if (isNaN(t)) continue;
      if (t < min) min = t;
      if (t > max) max = t;
    }
    if (!isFinite(min)) return null;
    return { min, max, span: Math.max(1, max - min) };
  }, [plotted]);

  // Recent = matured within the trailing 7 days.
  const recentCutoff = Date.now() - 7 * 86400000;
  const isRecent = (r) => r.state.first_mature_at && new Date(r.state.first_mature_at).getTime() >= recentCutoff;

  const toggleTier = (id) => {
    setActiveTiers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      // Don't allow zero-filters — silently re-add if user emptied the set.
      if (next.size === 0) return new Set([5,4,3,2,1,0]);
      return next;
    });
  };

  const burning = plotted.filter(r => r.tier === 'mature' || r.tier === 'stable' || r.tier === 'elite').length;
  const supernova = plotted.filter(r => r.tier === 'stable' || r.tier === 'elite').length;
  const elite = plotted.filter(r => r.tier === 'elite').length;

  return (
    <div className="mx-shell" data-screen-label="mastery-constellation">
      <header className="mx-head">
        <span className="mx-head-l">
          <b>{plotted.length}</b> stars
          <span className="mx-head-sep">·</span>
          <b>{burning}</b> burning
          <span className="mx-head-sep">·</span>
          <b>{supernova}</b> fixed
          <span className="mx-head-sep">·</span>
          <b>{elite}</b> supernova
        </span>
        <FilterChips active={activeTiers} onToggle={toggleTier} />
      </header>

      <div className="mx-body">
        <div className="mx-plot-wrap">
          <svg className="mx-plot" viewBox={`0 0 ${PLOT_W} ${PLOT_H}`} preserveAspectRatio="xMidYMid meet">
            {/* Axis guides — log-interval gridlines. No numbers; the levels speak for themselves. */}
            {[1, 6, 21, 90, 365].map(ivl => (
              <g key={ivl} className="mx-grid">
                <line
                  x1={PLOT_PAD.l} x2={PLOT_W - PLOT_PAD.r}
                  y1={yForInterval(ivl)} y2={yForInterval(ivl)}
                />
                <text x={PLOT_PAD.l - 4} y={yForInterval(ivl) + 3} className="mx-grid-lbl" textAnchor="end">
                  {ivl >= 365 ? '1y' : ivl >= 30 ? `${Math.round(ivl/30)}mo` : `${ivl}d`}
                </text>
              </g>
            ))}

            {/* Time axis baseline */}
            <line
              x1={PLOT_PAD.l} x2={PLOT_W - PLOT_PAD.r}
              y1={PLOT_H - PLOT_PAD.b} y2={PLOT_H - PLOT_PAD.b}
              className="mx-axis"
            />
            <text x={PLOT_PAD.l} y={PLOT_H - 8} className="mx-axis-lbl">
              first cleared →
            </text>

            {/* Stars */}
            {range && plotted.map(r => (
              <Star
                key={r.card.idx}
                row={r}
                x={xForDate(r.state.first_correct_at, range)}
                y={yForInterval(r.state.interval_days)}
                recent={isRecent(r)}
                focused={focused && focused.card.idx === r.card.idx}
                onTap={setFocused}
              />
            ))}

            {!range && (
              <text x={PLOT_W / 2} y={PLOT_H / 2} className="mx-empty" textAnchor="middle">
                ▸ NO STARS YET · clear a card in Daily Run to seed the chart
              </text>
            )}
          </svg>
        </div>
        <DetailRail row={focused} onClose={() => setFocused(null)} />
      </div>
    </div>
  );
};

Object.assign(window, { MasteryConstellation });
