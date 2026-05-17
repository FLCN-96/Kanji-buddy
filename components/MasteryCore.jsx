// MasteryCore — the "living kanji wall" view of Mastery.
//
// Every kanji the user has touched (or hasn't) is rendered as its glyph in
// JLPT-banded rows. Glyph treatment encodes mastery tier via CSS classes:
//   tier-untouched   dim/dotted, semi-transparent
//   tier-cleared     cyan glow
//   tier-mature      amber glow
//   tier-stable      magenta glow
//   tier-elite       void / chromatic distortion
//
// The wall fills in as the user matures cards — the page IS the progress.
// Below the wall: a recent-milestones strip and the 6-metric HUD lives at
// the top via MasteryHud (rendered by the orchestrator).

const TIER_LEGEND = [
  { id: 'cleared',  lbl: 'cleared',  cls: 'tier-cleared'  },
  { id: 'mature',   lbl: 'mature',   cls: 'tier-mature'   },
  { id: 'stable',   lbl: 'stable',   cls: 'tier-stable'   },
  { id: 'elite',    lbl: 'elite',    cls: 'tier-elite'    },
];

const CoreBand = ({ band, roster, onTap }) => {
  // Filter the roster down to this band's cards. Stable order — the
  // cards.json index ordering is roughly frequency / JLPT so the wall
  // reads in a sensible sequence without extra sorting.
  const cells = React.useMemo(() => {
    return roster.filter(r => {
      const j = r.card.jlpt || 0;
      return band.jlpt === 0 ? !j : j === band.jlpt;
    });
  }, [roster, band.jlpt]);

  const matureCells = band.mature + (band.cleared - band.mature); // any glow
  const pct = band.total > 0 ? Math.round((band.cleared / band.total) * 100) : 0;
  const lblTxt = band.jlpt === 0 ? '+' : `N${band.jlpt}`;
  const bandTone = band.jlpt === 0 ? 'extra'
    : band.jlpt >= 4 ? 'cyan'
    : band.jlpt === 3 ? 'amber'
    : 'magenta';

  return (
    <section className={`mc-band tone-${bandTone}`}>
      <header className="mc-band-head">
        <span className="mc-band-lbl">{lblTxt}</span>
        <span className="mc-band-meta">
          <b>{band.cleared.toLocaleString()}</b> / {band.total.toLocaleString()}
          <span className="mc-band-pct">·  {pct}%</span>
          {band.mature > 0 && <span className="mc-band-mature">·  {band.mature} mature</span>}
          {band.stable > 0 && <span className="mc-band-stable">·  {band.stable} stable</span>}
        </span>
      </header>
      <div className="mc-band-grid">
        {cells.map(r => (
          <button
            key={r.card.idx}
            type="button"
            className={`mc-cell tier-${r.tier}`}
            onClick={() => onTap && onTap(r)}
            title={`${r.card.k} · ${(r.card.mean || '').split(',')[0].trim()} · ${r.tier}`}
            aria-label={`${r.card.k} ${r.tier}`}
          >
            <span className="mc-cell-k">{r.card.k}</span>
          </button>
        ))}
      </div>
    </section>
  );
};

const CoreMilestoneStrip = ({ milestones }) => {
  if (!milestones || !milestones.length) return null;
  const fmt = (iso) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return `${d.getMonth()+1}/${String(d.getDate()).padStart(2,'0')}`;
  };
  return (
    <section className="mc-milestones">
      <header className="mc-milestones-head">▸ recent milestones</header>
      <ul className="mc-milestones-list">
        {milestones.map((m, i) => (
          <li key={i} className={`mc-milestone kind-${m.kind}`}>
            <span className="mc-milestone-date">{fmt(m.date)}</span>
            <span className="mc-milestone-k">{m.k}</span>
            <span className="mc-milestone-kind">
              {m.kind === 'mature' ? 'reached MATURE' : 'first CLEARED'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
};

const CoreLegend = () => (
  <div className="mc-legend">
    {TIER_LEGEND.map(t => (
      <span key={t.id} className={`mc-legend-cell ${t.cls}`}>
        <span className="mc-legend-dot" aria-hidden>●</span>
        <span className="mc-legend-lbl">{t.lbl}</span>
      </span>
    ))}
    <span className="mc-legend-cell tier-untouched">
      <span className="mc-legend-dot" aria-hidden>·</span>
      <span className="mc-legend-lbl">untouched</span>
    </span>
  </div>
);

const MasteryCore = ({ roster, breakdown, milestones, onCardTap }) => {
  return (
    <div className="mc-shell" data-screen-label="mastery-core">
      <CoreLegend />
      <div className="mc-bands">
        {(breakdown || []).map(b => (
          <CoreBand key={b.jlpt} band={b} roster={roster} onTap={onCardTap} />
        ))}
      </div>
      <CoreMilestoneStrip milestones={milestones} />
    </div>
  );
};

Object.assign(window, { MasteryCore });
