// MasterySummary — Home panel, 4-cell strip. Taps through to Mastery.html.
//
// Slots above LeechPanel. Cells map to the mastery ladder:
//   CLEARED  cards reviewed >= 1
//   MATURE   first_mature_at set (sticky)
//   STABLE   current interval >= 90d
//   LONGEST  max interval ever seen (single-card record)
//
// When the user has zero data, renders a quieter "no readings yet" state so
// new operators don't see four zeros yelling at them.

const MasterySummary = ({ cards, states, onTap }) => {
  const summary = React.useMemo(() => {
    if (!window.Mastery || !Array.isArray(states)) return null;
    return window.Mastery.computeMastery(cards, states);
  }, [cards, states]);

  if (!summary) {
    return (
      <button type="button" className="kb-mastery-strip is-loading" onClick={onTap} disabled>
        <div className="kb-mastery-strip-lbl">▸ MASTERY</div>
        <div className="kb-mastery-strip-sub">loading…</div>
      </button>
    );
  }

  const empty = summary.cleared === 0;
  if (empty) {
    return (
      <button type="button" className="kb-mastery-strip is-empty" onClick={onTap}>
        <div className="kb-mastery-strip-head">
          <span className="kb-mastery-strip-lbl">▸ MASTERY</span>
          <span className="kb-mastery-strip-cta">tap ›</span>
        </div>
        <div className="kb-mastery-strip-sub">no readings yet · finish a daily run to seed it</div>
      </button>
    );
  }

  const longestLbl = summary.longest >= 365
    ? `${Math.round(summary.longest / 365 * 10) / 10}y`
    : summary.longest >= 30
      ? `${Math.round(summary.longest / 30)}mo`
      : `${summary.longest}d`;

  const cells = [
    { lbl: 'cleared', val: summary.cleared.toLocaleString(),  tier: 'cleared' },
    { lbl: 'mature',  val: summary.mature.toLocaleString(),   tier: 'mature'  },
    { lbl: 'stable',  val: summary.stable.toLocaleString(),   tier: 'stable'  },
    { lbl: 'longest', val: longestLbl,                        tier: 'elite'   },
  ];

  return (
    <button
      type="button"
      className="kb-mastery-strip"
      data-screen-label="mastery-summary"
      onClick={onTap}
      title="tap to open the mastery readout"
    >
      <div className="kb-mastery-strip-head">
        <span className="kb-mastery-strip-lbl">▸ MASTERY</span>
        <span className="kb-mastery-strip-cta">tap ›</span>
      </div>
      <div className="kb-mastery-strip-cells">
        {cells.map((c, i) => (
          <div key={c.lbl} className={`kb-mastery-strip-cell tier-${c.tier}`}>
            <span className="kb-mastery-strip-val">{c.val}</span>
            <span className="kb-mastery-strip-lbl-sm">{c.lbl}</span>
            {i < cells.length - 1 && <span className="kb-mastery-strip-sep" aria-hidden>│</span>}
          </div>
        ))}
      </div>
    </button>
  );
};

Object.assign(window, { MasterySummary });
