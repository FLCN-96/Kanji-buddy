// TimeAttack — in-play card + tiles + HUD

const TAHud = ({ hits, misses, combo }) => (
  <div className="ta-hud">
    <div className="ta-hud-col">
      <div className="ta-hud-lbl">HITS</div>
      <div className="ta-hud-val ok">{hits}</div>
    </div>
    <div className="ta-hud-col">
      <div className="ta-hud-lbl">MISS</div>
      <div className="ta-hud-val miss">{misses}</div>
    </div>
    <div className="ta-hud-col">
      <div className="ta-hud-lbl">×</div>
      <div className={`ta-hud-val mag${combo >= 3 ? ' is-hot' : ''}`}>{combo}</div>
    </div>
  </div>
);

const TAPlay = ({ q, onPick, feedback, clockMs, danger, combo, comboBurst }) => {
  // clock bar pct
  // We don't know total duration here; use a ref-free approach: pass relative via prop? Keep simple: use 60s bar capped visually
  // We'll compute a pct externally via data attribute in parent. For now, width by clockMs ratio vs 60s is misleading for 30s/120s.
  // Parent doesn't pass durationMs, so infer: clamp to known ranges by looking at env — pass through props.
  // Simpler: include an inline bar showing danger ≤10s.

  return (
    <div className="ta-play" data-screen-label="ta-play">
      <div className={`ta-clock-bar${danger ? ' is-danger' : ''}`}>
        <div className="ta-clock-bar-fill" style={{ width: `${Math.max(0, Math.min(100, (clockMs / 60_000) * 100))}%` }} />
        <div className="ta-clock-ticks">
          {[...Array(12)].map((_, i) => <span key={i} />)}
        </div>
      </div>

      <div className={`ta-card${feedback ? (feedback.ok ? ' is-hit' : ' is-miss') : ''}`}>
        <div className="ta-card-meta">
          <span>JLPT N{q.card.jlpt}</span>
          <span className="ta-card-prompt">what does this mean?</span>
          <span>idx {String(q.card.idx).padStart(4,'0')}</span>
        </div>
        <div className="ta-card-glyph-wrap">
          <div className="ta-card-glyph">{q.card.k}</div>
          <div className="ta-card-glyph-ghost" aria-hidden="true">{q.card.k}</div>
        </div>
      </div>

      <div className="ta-tiles">
        {q.tiles.map((t, i) => {
          let state = '';
          if (feedback) {
            if (i === feedback.correct) state = ' is-correct';
            else if (i === feedback.picked) state = ' is-wrong';
            else state = ' is-dim';
          }
          return (
            <button
              key={i + t}
              className={`ta-tile${state}`}
              onClick={() => onPick(i)}
              disabled={!!feedback}
            >
              <span className="ta-tile-key">{i+1}</span>
              <span className="ta-tile-text">{t}</span>
            </button>
          );
        })}
      </div>

      {comboBurst && (
        <div key={comboBurst.t} className="ta-combo-burst">
          ×{comboBurst.n}
          <span className="ta-combo-burst-sub">combo</span>
        </div>
      )}
    </div>
  );
};

Object.assign(window, { TAPlay, TAHud });
