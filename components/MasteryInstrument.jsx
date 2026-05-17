// MasteryInstrument — HUD/diagnostic-panel view of Mastery.
//
// Pure instrument-panel layout. Four oversized metric tiles up top, an XP
// velocity sparkline, a maturation calendar heatmap below it, and the same
// recent-milestones log used by Core. No novel viz — this is the view for
// users who just want to read their gauges.

const InstrumentTile = ({ label, value, sub, tier }) => (
  <div className={`mi-tile tier-${tier}`}>
    <div className="mi-tile-lbl">{label}</div>
    <div className="mi-tile-val">{value}</div>
    {sub && <div className="mi-tile-sub">{sub}</div>}
  </div>
);

const Sparkline = ({ data, w = 540, h = 60 }) => {
  if (!data || !data.length) return null;
  const max = Math.max(1, ...data.map(d => d.xp || 0));
  const stepX = w / Math.max(1, data.length - 1);
  // Build a single d-string with stepped baseline for a tape-deck VU look.
  let d = `M 0 ${h - (data[0].xp / max) * h}`;
  for (let i = 1; i < data.length; i++) {
    d += ` L ${i * stepX} ${h - (data[i].xp / max) * h}`;
  }
  const total = data.reduce((a, d) => a + (d.xp || 0), 0);
  return (
    <div className="mi-spark-wrap">
      <div className="mi-spark-head">
        <span className="mi-spark-lbl">▸ XP VELOCITY · {data.length}d</span>
        <span className="mi-spark-tot">{total.toLocaleString()} XP</span>
      </div>
      <svg className="mi-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <path d={`${d} L ${w} ${h} L 0 ${h} Z`} className="mi-spark-fill" />
        <path d={d} className="mi-spark-line" />
      </svg>
    </div>
  );
};

const CalendarHeatmap = ({ data }) => {
  if (!data || !data.length) return null;
  // 7 cols (Sun→Sat), N rows aligned so the most recent day sits at the
  // bottom-right. Pad the start so day-of-week alignment is honoured.
  const firstDate = new Date(data[0].date);
  const pad = firstDate.getDay(); // 0..6
  const padded = [];
  for (let i = 0; i < pad; i++) padded.push({ date: null, count: 0, blank: true });
  for (const d of data) padded.push(d);
  const max = Math.max(1, ...data.map(d => d.count || 0));
  const intensity = (c) => c === 0 ? 0
    : c >= max ? 4
    : c / max >= 0.66 ? 3
    : c / max >= 0.33 ? 2
    : 1;
  const totalMatured = data.reduce((a, d) => a + (d.count || 0), 0);
  return (
    <div className="mi-cal-wrap">
      <div className="mi-cal-head">
        <span className="mi-cal-lbl">▸ MATURATION CALENDAR · {data.length}d</span>
        <span className="mi-cal-tot">{totalMatured} cards matured</span>
      </div>
      <div className="mi-cal-grid">
        {padded.map((d, i) => (
          <span
            key={i}
            className={`mi-cal-cell ${d.blank ? 'is-blank' : `lvl-${intensity(d.count)}`}`}
            title={d.blank ? '' : `${d.date} · ${d.count} matured`}
          />
        ))}
      </div>
      <div className="mi-cal-legend">
        <span>cooler</span>
        <span className="mi-cal-cell lvl-0" />
        <span className="mi-cal-cell lvl-1" />
        <span className="mi-cal-cell lvl-2" />
        <span className="mi-cal-cell lvl-3" />
        <span className="mi-cal-cell lvl-4" />
        <span>warmer</span>
      </div>
    </div>
  );
};

const MilestoneLog = ({ milestones }) => {
  if (!milestones || !milestones.length) {
    return (
      <div className="mi-log is-empty">
        <header className="mi-log-head">▸ MILESTONES</header>
        <div className="mi-log-empty">no milestones yet</div>
      </div>
    );
  }
  return (
    <div className="mi-log">
      <header className="mi-log-head">▸ MILESTONES · latest {milestones.length}</header>
      <ul className="mi-log-list">
        {milestones.map((m, i) => (
          <li key={i} className={`mi-log-row kind-${m.kind}`}>
            <span className="mi-log-k">{m.k}</span>
            <span className="mi-log-event">
              {m.kind === 'mature' ? 'MATURE' : 'CLEARED'}
            </span>
            <span className="mi-log-date">
              {new Date(m.date).toISOString().slice(0, 10)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const MasteryInstrument = ({ summary, calendar, velocity, milestones }) => {
  if (!summary) {
    return <div className="mi-shell mi-shell-loading" data-screen-label="mastery-instrument">▸ syncing…</div>;
  }
  const longestLbl = summary.longest >= 365
    ? `${Math.round(summary.longest / 365 * 10) / 10} y`
    : summary.longest >= 30
      ? `${Math.round(summary.longest / 30)} mo`
      : `${summary.longest} d`;
  return (
    <div className="mi-shell" data-screen-label="mastery-instrument">
      <div className="mi-tiles">
        <InstrumentTile
          label="CLEARED"
          value={summary.cleared.toLocaleString()}
          sub={`of ${summary.total.toLocaleString()} deck`}
          tier="cleared"
        />
        <InstrumentTile
          label="MATURE"
          value={summary.mature.toLocaleString()}
          sub={`≥ 21d interval`}
          tier="mature"
        />
        <InstrumentTile
          label="STABLE"
          value={summary.stable.toLocaleString()}
          sub={`≥ 90d interval`}
          tier="stable"
        />
        <InstrumentTile
          label="MAX INT"
          value={longestLbl}
          sub={summary.elite > 0 ? `${summary.elite} elite` : 'single-card record'}
          tier="elite"
        />
      </div>

      <Sparkline data={velocity} />
      <CalendarHeatmap data={calendar} />
      {summary.hoursStudied != null && (
        <div className="mi-hours">
          ▸ TOTAL STUDY · <b>{summary.hoursStudied}</b> hours logged
        </div>
      )}
      <MilestoneLog milestones={milestones} />
    </div>
  );
};

Object.assign(window, { MasteryInstrument });
