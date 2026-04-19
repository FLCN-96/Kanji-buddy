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

const TAPlay = ({ q, onPick, feedback, clockMs, totalMs, danger, penaltyTick, combo, comboBurst, isUnseen }) => {
  const barTotal = totalMs > 0 ? totalMs : 60_000;
  const barPct = Math.max(0, Math.min(100, (clockMs / barTotal) * 100));

  return (
    <div className="ta-play" data-screen-label="ta-play">
      <div className={`ta-clock-bar${danger ? ' is-danger' : ''}${penaltyTick ? ' is-penalty' : ''}`}>
        <div className="ta-clock-bar-fill" style={{ width: `${barPct}%` }} />
        <div className="ta-clock-ticks">
          {[...Array(12)].map((_, i) => <span key={i} />)}
        </div>
      </div>
      {penaltyTick && <div className="ta-penalty-fx">−3s</div>}

      <div className={`ta-card${feedback ? (feedback.ok ? ' is-hit' : ' is-miss') : ''}${isUnseen ? ' is-unseen-frame' : ''}`}>
        <div className="ta-card-meta">
          <span>JLPT N{q.card.jlpt}</span>
          <span className="ta-card-prompt">{isUnseen ? 'first sighting · what does this mean?' : 'what does this mean?'}</span>
          <span>idx {String(q.card.idx).padStart(4,'0')}</span>
        </div>
        <div className="ta-card-glyph-wrap">
          <div className={`ta-card-glyph${isUnseen ? ' is-unseen-glyph' : ''}`}>{q.card.k}</div>
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
